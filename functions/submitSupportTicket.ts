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
      const timestamp = new Date().toISOString();
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: supportEmail,
        from_name: "URecruit HQ Support",
        subject: `[${(type || "support").toUpperCase()}] #${ticketNumber} — ${subject}`,
        body: `Ticket: #${ticketNumber}\nType: ${type || "support"}\nFrom: ${userName || "Unknown"} (${userEmail})\nAccount: ${accountType || "unknown"}\nPage: ${currentPage || "N/A"}${rating ? `\nRating: ${"★".repeat(rating)}${"☆".repeat(5 - rating)}` : ""}\n\nIssue:\n${description}\n\n---\nBrowser: ${browserInfo || "N/A"}\nSubmitted: ${timestamp}`,
      });
    }

    // Send confirmation to user (non-blocking — may fail for non-app users)
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: String(userEmail).trim(),
        from_name: "URecruit HQ Support",
        subject: `URecruit HQ Support — Ticket #${ticketNumber}`,
        body: `Hi ${userName || "there"},\n\nWe received your ${type || "support request"} and will get back to you within 24-48 hours.\n\nTicket: #${ticketNumber}\nSubject: ${subject}\n\nThanks,\nURecruit HQ Support\nsupport@urecruithq.com`,
      });
    } catch (emailErr) {
      console.log("User confirmation email skipped:", emailErr.message);
    }

    return Response.json({ ok: true, ticketNumber });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});