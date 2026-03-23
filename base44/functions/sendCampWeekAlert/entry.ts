import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function getResendKey() { return Deno.env.get("RESEND_API_KEY") ?? ""; }
function getFromEmail() { return Deno.env.get("RESEND_FROM_EMAIL") || "alerts@urecruithq.com"; }

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function divLabel(div: string): string {
  const map: Record<string, string> = { I: "Division I", II: "Division II", III: "Division III", NAIA: "NAIA", JUCO: "Junior College" };
  return map[div] || div || "";
}

// ── Email HTML ──────────────────────────────────────────────────────────────
const BRAND = "#c8850a";

function campRows(camps: { camp: Record<string, unknown>; athleteName: string }[], showAthlete: boolean): string {
  return camps.map(({ camp, athleteName }) => {
    const loc = [camp.city, camp.state].filter(Boolean).join(", ");
    const div = divLabel(camp.division as string);
    const meta = [div, loc].filter(Boolean).join(" · ");
    const athlete = showAthlete && athleteName
      ? `&nbsp;<span style="font-size:11px;color:#999;font-weight:400">(${athleteName})</span>`
      : "";
    return `
      <tr>
        <td style="padding:14px 16px 14px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;width:76px;white-space:nowrap">
          <span style="font-size:13px;color:#999">${formatShortDate(camp.start_date as string)}</span>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #f0f0f0;vertical-align:top">
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;line-height:1.3">${camp.camp_name || "Camp"}${athlete}</div>
          ${meta ? `<div style="font-size:13px;color:#888;margin-top:3px">${meta}</div>` : ""}
        </td>
      </tr>`;
  }).join("");
}

function checklistSection(title: string, accentColor: string, items: string[]): string {
  const rows = items.map(item => `
    <tr>
      <td style="padding:10px 12px 10px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;width:18px">
        <span style="color:${accentColor};font-size:13px;font-weight:700">✓</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;line-height:1.55">${item}</td>
    </tr>`).join("");
  return `
    <div style="margin-bottom:36px">
      <div style="border-bottom:2px solid ${accentColor};padding-bottom:10px;margin-bottom:4px">
        <span style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${accentColor}">${title}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
    </div>`;
}

function renderAlertEmail(
  greeting: string,
  camps: { camp: Record<string, unknown>; athleteName: string }[],
  multiAthlete: boolean,
): string {
  const campCount = camps.length;
  const firstCamp = camps[0]?.camp;
  const headline = campCount === 1
    ? `You're 7 days out from <strong>${firstCamp?.camp_name || "your camp"}</strong>`
    : `You have <strong>${campCount} camps</strong> coming up in 7 days`;

  const campSection = `
    <div style="margin-bottom:36px">
      <div style="border-bottom:2px solid ${BRAND};padding-bottom:10px;margin-bottom:4px">
        <span style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BRAND}">Your Upcoming ${campCount > 1 ? "Camps" : "Camp"}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${campRows(camps, multiAthlete)}</table>
    </div>`;

  const whatToBring = checklistSection("What to Bring", "#2d7a3a", [
    "Athletic shoes (cleats if applicable) — break them in before camp day",
    "Change of clothes and extra socks — you will sweat",
    "Water bottle — at least 32oz, refillable preferred",
    "Healthy snacks — granola bars, fruit, nuts for energy between sessions",
    "Sunscreen and hat if outdoor sessions are scheduled",
    "A small notepad or use your phone notes — write down coach feedback immediately after",
    "Any required medical forms, waivers, or registration confirmation email",
    "Insurance card if required by the camp paperwork",
  ]);

  const travelTips = checklistSection("Travel & Timing", "#1a5fa8", [
    "Map the venue tonight — know exactly where you're going and where to park",
    "Plan to arrive 20–30 minutes early — late arrivals get noticed (not in a good way)",
    "Check the camp itinerary for check-in time vs. start time — they are often different",
    "Get 8+ hours of sleep the night before — performance drops significantly with fatigue",
    "Eat a real meal 2–3 hours before you arrive, not a sugar spike right before",
    "Have a contact number for the camp in case of traffic or emergency",
    "If traveling overnight, confirm your hotel checkout time won't make you rush",
  ]);

  const coachEval = checklistSection("What Coaches Are Evaluating", BRAND, [
    "<strong>Coachability</strong> — Do you listen, adjust, and apply corrections immediately?",
    "<strong>Effort level</strong> — Are you competing in every rep, or saving energy?",
    "<strong>Body language</strong> — Coaches watch how you react to mistakes and adversity",
    "<strong>Athleticism &amp; measurables</strong> — Speed, size, explosiveness relative to peers",
    "<strong>Skill execution under pressure</strong> — Can you perform your skills in a competitive setting?",
    "<strong>Interaction with teammates</strong> — Recruiting is partly about finding good teammates",
    "<strong>How you handle downtime</strong> — Are you engaged and focused between sessions?",
    "<strong>The intangibles</strong> — Energy, confidence, and presence matter as much as physical tools",
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Camp Week Alert — uRecruitHQ</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
    <tr><td align="center" style="padding:48px 24px 40px">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

        <!-- Top accent bar -->
        <tr><td style="background:${BRAND};height:4px;border-radius:2px"></td></tr>

        <!-- Header -->
        <tr><td style="padding:32px 0 24px">
          <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${BRAND};margin-bottom:10px">uRecruitHQ</div>
          <div style="font-size:30px;font-weight:700;color:#1a1a1a;line-height:1.15;letter-spacing:-0.5px">Camp Week Alert</div>
          <div style="font-size:14px;color:#999;margin-top:8px">Your camp is 7 days away — time to prepare</div>
        </td></tr>

        <!-- Divider -->
        <tr><td style="border-bottom:1px solid #eeeeee;padding-bottom:28px"></td></tr>

        <!-- Greeting -->
        <tr><td style="padding:28px 0 32px;font-size:15px;color:#444;line-height:1.75">
          Hi ${greeting},<br><br>
          ${headline}. Here's everything you need to show up prepared, confident, and ready to perform.
        </td></tr>

        <!-- Camp + checklists -->
        <tr><td>
          ${campSection}
          ${whatToBring}
          ${travelTips}
          ${coachEval}
        </td></tr>

        <!-- Closing note -->
        <tr><td style="padding:0 0 36px;border-top:2px solid ${BRAND};padding-top:20px">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BRAND};margin-bottom:14px;margin-top:12px">One Last Thing</div>
          <div style="font-size:15px;color:#333;line-height:1.8">
            Coaches remember the athletes who are prepared, present, and positive. Everything else — the measurables, the highlights — they can see on film. What they can't see on film is your character. Camp is your chance to show them.<br><br>
            Good luck. Go show them what you've got.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid #eeeeee;padding-top:24px;font-size:12px;color:#bbb;text-align:center;line-height:2.2">
          You're receiving this because you have a registered camp on your uRecruitHQ calendar.<br>
          <a href="https://urecruithq.com/Account" style="color:${BRAND};text-decoration:none">Manage preferences</a>
          &nbsp;&middot;&nbsp;
          <a href="https://urecruithq.com/Account" style="color:#bbb;text-decoration:none">Unsubscribe</a>
          &nbsp;&middot;&nbsp;
          <a href="https://urecruithq.com" style="color:${BRAND};text-decoration:none">urecruithq.com</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== "admin") return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { accountId: targetAccountId, mode = "dry_run", targetDate } = body;
  // mode: "preview" | "dry_run" | "send" | "list_subscribers"

  // Resolve the "7 days from now" date (or override for testing)
  const checkDate = targetDate
    ? new Date(targetDate + "T00:00:00Z")
    : (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 7); d.setUTCHours(0,0,0,0); return d; })();
  const checkDateStr = checkDate.toISOString().slice(0, 10);

  const RESEND_API_KEY = getResendKey();
  const FROM_EMAIL = getFromEmail();

  if (!RESEND_API_KEY && (mode === "send" || mode === "send_one")) {
    return Response.json({ ok: false, error: "RESEND_API_KEY is not set." }, { status: 400 });
  }

  // ── Batch fetch ─────────────────────────────────────────────────────────
  const [rawAthletes, rawIntents, rawCamps, rawOptOuts] = await Promise.all([
    base44.asServiceRole.entities.AthleteProfile.filter({ active: true }).catch(() => []),
    base44.asServiceRole.entities.CampIntent.filter({}).catch(() => []),
    base44.asServiceRole.entities.Camp.filter({ active: true }).catch(() => []),
    base44.asServiceRole.entities.EmailPreferences.filter({ camp_week_alert_opt_out: true }).catch(() => []),
  ]);

  const athletes:  Record<string, unknown>[] = Array.isArray(rawAthletes) ? rawAthletes : [];
  const intents:   Record<string, unknown>[] = Array.isArray(rawIntents)  ? rawIntents  : [];
  const allCamps:  Record<string, unknown>[] = Array.isArray(rawCamps)    ? rawCamps    : [];

  const optedOutIds = new Set(
    (Array.isArray(rawOptOuts) ? rawOptOuts : []).map(p => p.account_id as string).filter(Boolean)
  );

  // Camps starting on the check date
  const alertCamps = allCamps.filter(c => {
    if (!c.start_date) return false;
    return (c.start_date as string).slice(0, 10) === checkDateStr;
  });
  const alertCampIds = new Set(alertCamps.map(c => c.id as string));
  const campById = new Map(allCamps.map(c => [c.id as string, c]));

  // Find registered intents for alert camps
  const registeredIntents = intents.filter(i =>
    (i.status === "registered" || i.status === "completed") &&
    alertCampIds.has(i.camp_id as string)
  );

  // Group by athlete then by account
  const athleteById = new Map(athletes.map(a => [a.id as string, a]));
  const athletesByAccount = new Map<string, Record<string, unknown>[]>();
  for (const a of athletes) {
    const aid = a.account_id as string;
    if (!aid) continue;
    if (!athletesByAccount.has(aid)) athletesByAccount.set(aid, []);
    athletesByAccount.get(aid)!.push(a);
  }

  // Build per-account camp list
  const accountCamps = new Map<string, { camp: Record<string, unknown>; athleteName: string }[]>();
  for (const intent of registeredIntents) {
    const athlete = athleteById.get(intent.athlete_id as string);
    if (!athlete) continue;
    const accountId = athlete.account_id as string;
    if (!accountId) continue;
    const camp = campById.get(intent.camp_id as string);
    if (!camp) continue;
    if (!accountCamps.has(accountId)) accountCamps.set(accountId, []);
    const athleteName = [athlete.first_name, athlete.last_name].filter(Boolean).join(" ");
    accountCamps.get(accountId)!.push({ camp, athleteName });
  }

  const EXAMPLE_CAMP = { camp_name: "Example University Football Camp", start_date: checkDateStr, city: "Columbus", state: "OH", division: "I" };

  // Filter to target account for preview/send_one
  const targetAccounts = (mode === "preview" || mode === "send_one") && targetAccountId
    ? [targetAccountId]
    : [...accountCamps.keys()];

  // Preview/send_one with no camps — use placeholder
  if (mode === "preview" && targetAccounts.length === 0) {
    const html = renderAlertEmail("there", [{ camp: EXAMPLE_CAMP, athleteName: "" }], false);
    return Response.json({ ok: true, html, subject: "Camp Week Alert — uRecruitHQ (Example)", checkDate: checkDateStr });
  }

  const results: Record<string, unknown>[] = [];

  for (const accountId of targetAccounts) {
    let camps = accountCamps.get(accountId) || [];

    // For send_one (admin test), use example camp if no real camps on the date
    if (camps.length === 0 && mode === "send_one") {
      camps = [{ camp: EXAMPLE_CAMP, athleteName: "" }];
    } else if (camps.length === 0) {
      results.push({ accountId, status: "skipped", reason: "no registered camps on this date" });
      continue;
    }

    // Enforce opt-out for sends (not for admin send_one test)
    if (mode === "send" && optedOutIds.has(accountId)) {
      results.push({ accountId, status: "skipped", reason: "opted out" });
      continue;
    }

    // Resolve greeting
    let greeting = "";
    const acctAthletes = athletesByAccount.get(accountId) || [];
    for (const a of acctAthletes) {
      const pf = (a.parent_first_name as string)?.trim();
      const pl = (a.parent_last_name as string)?.trim();
      const af = (a.first_name as string)?.trim();
      if (pf && pl) { greeting = `${pf} ${pl}`; break; }
      if (pf) { greeting = pf; break; }
      if (af) { greeting = `${af}'s Family`; break; }
    }
    if (!greeting) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ id: accountId });
        const u = Array.isArray(users) ? users[0] : null;
        greeting = (u?.full_name as string)?.trim() || (u?.email as string) || "uRecruitHQ Subscriber";
      } catch { greeting = "uRecruitHQ Subscriber"; }
    }

    const multiAthlete = acctAthletes.length > 1;
    const html = renderAlertEmail(greeting, camps, multiAthlete);
    const campNames = camps.map(c => c.camp.camp_name || "Camp").join(", ");
    const subject = camps.length === 1
      ? `Camp Week — ${campNames} is 7 days away`
      : `Camp Week — ${camps.length} camps coming up in 7 days`;

    if (mode === "preview") {
      return Response.json({ ok: true, html, subject, checkDate: checkDateStr, camps: camps.length });
    }

    if (mode === "dry_run") {
      results.push({ accountId, status: "dry_run", camps: camps.length, campNames });
      continue;
    }

    // send or send_one — fall through to email send below

    // Send
    let userEmail = "";
    try {
      const users = await base44.asServiceRole.entities.User.filter({ id: accountId });
      userEmail = Array.isArray(users) && users[0]?.email ? users[0].email as string : "";
    } catch {
      results.push({ accountId, status: "error", reason: "could not resolve email" });
      continue;
    }
    if (!userEmail) {
      results.push({ accountId, status: "skipped", reason: "no email found" });
      continue;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_EMAIL, to: userEmail, subject, html }),
      });
      const data = await res.json();
      if (res.ok) {
        results.push({ accountId, email: userEmail, status: "sent", camps: camps.length });
      } else {
        results.push({ accountId, email: userEmail, status: "error", reason: data?.message });
      }
    } catch (e) {
      results.push({ accountId, email: userEmail, status: "error", reason: (e as Error).message });
    }
  }

  const summary = {
    sent:    results.filter(r => r.status === "sent").length,
    dry_run: results.filter(r => r.status === "dry_run").length,
    skipped: results.filter(r => r.status === "skipped").length,
    errors:  results.filter(r => r.status === "error").length,
  };

  return Response.json({ ok: true, mode, checkDate: checkDateStr, summary, results });
});
