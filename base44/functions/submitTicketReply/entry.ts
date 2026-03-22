import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function computeToken(ticketId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ticketId));
  // URL-safe base64: no +, /, or = that get mangled by email click trackers
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { ticketId, token, message } = body;

    if (!ticketId || !token) {
      return Response.json({ ok: false, error: "Invalid link." }, { status: 400 });
    }

    const secret = (Deno.env.get("TICKET_REPLY_SECRET") || "").trim();
    if (!secret) {
      return Response.json({ ok: false, error: "Server configuration error." }, { status: 500 });
    }

    // Verify HMAC token
    const expected = await computeToken(ticketId, secret);
    if (token !== expected) {
      return Response.json({
        ok: false,
        error: "This link is invalid or has expired.",
        _debug: {
          ticketIdReceived: ticketId,
          tokenReceived: token,
          tokenExpected: expected,
          secretFirst6: secret.slice(0, 6),
        },
      }, { status: 403 });
    }

    // Fetch ticket
    const ticket = await base44.asServiceRole.entities.SupportTicket.get(ticketId);
    if (!ticket) {
      return Response.json({ ok: false, error: "Ticket not found." }, { status: 404 });
    }

    // No message = initial page load: just return ticket info for display
    if (!message || !String(message).trim()) {
      return Response.json({
        ok: true,
        ticket: {
          ticket_number: ticket.ticket_number,
          subject: ticket.subject,
          user_name: ticket.user_name,
          status: ticket.status,
        },
      });
    }

    const msgText = String(message).trim();

    // Prepend reply to admin_notes as a timestamped log entry
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const logEntry = `[${timestamp} CT] User reply: ${msgText}`;
    const updatedNotes = ticket.admin_notes
      ? `${logEntry}\n\n${ticket.admin_notes}`
      : logEntry;

    await base44.asServiceRole.entities.SupportTicket.update(ticketId, { admin_notes: updatedNotes });

    // Notify admin
    const supportEmail = Deno.env.get("SUPPORT_EMAIL");
    if (supportEmail) {
      const msgHtml = msgText.replace(/\n/g, "<br>");
      const adminBody = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:#0B1F3B;padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">User Reply Received</h2>
    <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">#${ticket.ticket_number || ticketId} — ${ticket.subject || "Support Request"}</p>
  </div>
  <div style="padding:24px;">
    <p style="margin:0 0 12px;font-size:14px;color:#374151;"><strong>From:</strong> ${ticket.user_name || "User"} &lt;${ticket.user_email || "unknown"}&gt;</p>
    <div style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Their Reply</p>
      <p style="margin:0;font-size:14px;color:#111827;line-height:1.7;">${msgHtml}</p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This reply has been added to the ticket's admin notes.</p>
  </div>
</div>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: supportEmail,
        from_name: "URecruit HQ Support",
        subject: `[USER REPLY] #${ticket.ticket_number || ticketId} — ${ticket.subject || "Support Request"}`,
        body: adminBody,
      });
    }

    return Response.json({ ok: true, submitted: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
