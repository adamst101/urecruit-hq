import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function getResendKey()  { return Deno.env.get("RESEND_API_KEY") ?? ""; }
function getFromEmail()  { return Deno.env.get("RESEND_FROM_EMAIL") || "alerts@urecruithq.com"; }

const BRAND = "#c8850a";

function renderAlertEmail(
  failures: { name: string; steps: { name: string; status: string; detail: string }[] }[],
  runDate: string,
): string {
  const failRows = failures.map(j => {
    const badStep = j.steps.find(s => s.status === "fail");
    const passCount = j.steps.filter(s => s.status === "pass").length;
    const totalSteps = j.steps.length;

    const stepRows = j.steps.map(s => {
      const color = s.status === "fail" ? "#dc2626" : s.status === "pass" ? "#059669" : "#9ca3af";
      const icon  = s.status === "fail" ? "✕" : s.status === "pass" ? "✓" : "—";
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;width:18px">
            <span style="color:${color};font-size:12px;font-weight:700">${icon}</span>
          </td>
          <td style="padding:8px 0 8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:${s.status === "fail" ? "#dc2626" : "#374151"};line-height:1.5">
            <strong>${s.name}</strong>
            ${s.detail ? `<br><span style="font-size:12px;color:${s.status === "fail" ? "#dc2626" : "#6b7280"}">${s.detail}</span>` : ""}
          </td>
        </tr>`;
    }).join("");

    return `
      <div style="margin-bottom:32px">
        <div style="border-bottom:2px solid #dc2626;padding-bottom:8px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#dc2626">${j.name}</span>
          <span style="font-size:11px;color:#9ca3af">${passCount}/${totalSteps} steps passed</span>
        </div>
        ${badStep ? `<div style="font-size:13px;color:#dc2626;margin:8px 0 4px;font-weight:600">Failed at: ${badStep.name}</div>` : ""}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px">
          ${stepRows}
        </table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Health Check Alert — uRecruitHQ</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
    <tr><td align="center" style="padding:48px 24px 40px">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

        <!-- Top accent bar (red for alert) -->
        <tr><td style="background:#dc2626;height:4px;border-radius:2px"></td></tr>

        <!-- Header -->
        <tr><td style="padding:32px 0 24px">
          <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${BRAND};margin-bottom:10px">uRecruitHQ</div>
          <div style="font-size:30px;font-weight:700;color:#1a1a1a;line-height:1.15;letter-spacing:-0.5px">Health Check Alert</div>
          <div style="font-size:14px;color:#999;margin-top:8px">${failures.length} journey${failures.length !== 1 ? "s" : ""} failed · ${runDate}</div>
        </td></tr>

        <!-- Divider -->
        <tr><td style="border-bottom:1px solid #eeeeee;padding-bottom:28px"></td></tr>

        <!-- Summary -->
        <tr><td style="padding:28px 0 32px;font-size:15px;color:#444;line-height:1.75">
          The following ${failures.length === 1 ? "journey" : "journeys"} failed during an App Health Check run.
          Review the step details below and check the app for issues.
        </td></tr>

        <!-- Failures -->
        <tr><td>${failRows}</td></tr>

        <!-- CTA -->
        <tr><td style="padding:8px 0 36px">
          <a href="https://urecruithq.com/AppHealthCheck"
            style="display:inline-block;background:#0B1F3B;color:#ffffff;text-decoration:none;
            padding:12px 22px;border-radius:7px;font-size:14px;font-weight:600">
            Open Health Check →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid #eeeeee;padding-top:24px;font-size:12px;color:#bbb;text-align:center;line-height:2.2">
          Sent by uRecruitHQ App Health Check
          &nbsp;&middot;&nbsp;
          <a href="https://urecruithq.com/AppHealthCheck" style="color:${BRAND};text-decoration:none">View in app</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const RESEND_API_KEY = getResendKey();
  const FROM_EMAIL    = getFromEmail();

  if (!RESEND_API_KEY) {
    return Response.json({ ok: false, error: "RESEND_API_KEY is not set." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { toEmail, failures, runDate } = body;

  if (!toEmail) return Response.json({ ok: false, error: "toEmail required" }, { status: 400 });
  if (!Array.isArray(failures) || failures.length === 0)
    return Response.json({ ok: false, error: "No failures to report" }, { status: 400 });

  const subject = `⚠ Health Check — ${failures.length} journey${failures.length !== 1 ? "s" : ""} failed`;
  const html = renderAlertEmail(failures, runDate || new Date().toISOString().slice(0, 10));

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: toEmail, subject, html }),
    });
    const data = await res.json();
    if (res.ok) return Response.json({ ok: true, emailId: data.id });
    return Response.json({ ok: false, error: data?.message || "Resend error" }, { status: 500 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
