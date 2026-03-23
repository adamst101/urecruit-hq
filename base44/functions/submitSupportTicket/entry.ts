// NOTE: submitSupportTicket is intentionally unauthenticated.
// It is the public-facing support form endpoint used by anonymous, free, and paid users.
// All entity writes use asServiceRole so RLS does not apply.
// Input is validated (subject, description, email required) to prevent trivial abuse.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { type, subject, description, userEmail, userName, userId, accountType, currentPage, browserInfo, seasonYear, rating } = body;

    // Validate
    if (!subject || !String(subject).trim()) {
      return Response.json({ ok: false, error: "Subject is required." }, { status: 400 });
    }
    if (!description || !String(description).trim()) {
      return Response.json({ ok: false, error: "Description is required." }, { status: 400 });
    }
    if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(userEmail))) {
      return Response.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
    }

    // Generate ticket number
    const existing = await base44.asServiceRole.entities.SupportTicket.filter({});
    const num = String((Array.isArray(existing) ? existing.length : 0) + 1).padStart(4, '0');
    const year = new Date().getFullYear();
    const ticketNumber = `SUP-${year}-${num}`;

    // Create record
    const ticketData = {
      ticket_number: ticketNumber,
      type: type || "support",
      status: "open",
      priority: "normal",
      subject: String(subject).trim(),
      description: String(description).trim(),
      user_id: userId || null,
      user_email: String(userEmail).trim(),
      user_name: userName || null,
      account_type: accountType || "anonymous",
      current_page: currentPage || null,
      browser_info: browserInfo || null,
      season_year: seasonYear || null,
      rating: rating || null,
    };

    await base44.asServiceRole.entities.SupportTicket.create(ticketData);

    // Send notification to support
    const supportEmail = Deno.env.get("SUPPORT_EMAIL");
    if (supportEmail) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
      const descHtml = String(description).trim().replace(/\n/g, "<br>");
      const ratingHtml = rating ? `<tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Rating</td><td style="padding:8px 12px;color:#111827;">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</td></tr>` : "";

      const adminBody = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:#0B1F3B;padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">New Support Ticket</h2>
    <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">#${ticketNumber} · ${(type || "support").toUpperCase()}</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;width:100px;vertical-align:top;">From</td><td style="padding:8px 12px;color:#111827;">${userName || "Unknown"} &lt;${userEmail}&gt;</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Subject</td><td style="padding:8px 12px;color:#111827;font-weight:600;">${subject}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Account</td><td style="padding:8px 12px;color:#111827;">${accountType || "unknown"}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Page</td><td style="padding:8px 12px;color:#111827;">${currentPage || "N/A"}</td></tr>
      ${ratingHtml}
    </table>

    <div style="margin-top:20px;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Description</p>
      <p style="margin:0;font-size:14px;color:#111827;line-height:1.7;">${descHtml}</p>
    </div>

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      <p style="margin:0;">Browser: ${browserInfo || "N/A"}</p>
      <p style="margin:4px 0 0;">Submitted: ${timestamp} CT</p>
    </div>
  </div>
</div>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: supportEmail,
        from_name: "URecruit HQ Support",
        subject: `[${(type || "support").toUpperCase()}] #${ticketNumber} — ${subject}`,
        body: adminBody,
      });
    }

    // Send confirmation to user (non-blocking — may fail for non-app users)
    try {
      const userBody = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:#0B1F3B;padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">We Got Your Message</h2>
  </div>
  <div style="padding:24px;">
    <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6;">Hi ${userName || "there"},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6;">Thanks for reaching out! We received your <strong>${type || "support request"}</strong> and will get back to you within <strong>24–48 hours</strong>.</p>

    <div style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Ticket Number</p>
      <p style="margin:0;font-size:16px;color:#0B1F3B;font-weight:700;">#${ticketNumber}</p>
      <p style="margin:12px 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Subject</p>
      <p style="margin:0;font-size:14px;color:#111827;">${subject}</p>
    </div>

    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">— URecruit HQ Support</p>
  </div>
</div>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: String(userEmail).trim(),
        from_name: "URecruit HQ Support",
        subject: `URecruit HQ Support — Ticket #${ticketNumber}`,
        body: userBody,
      });
    } catch (emailErr) {
      console.log("User confirmation email skipped:", emailErr.message);
    }

    return Response.json({ ok: true, ticketNumber });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});