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
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { ticketId, message, messageType, newStatus, appUrl } = body;

    if (!ticketId) return Response.json({ ok: false, error: "ticketId is required." }, { status: 400 });
    if (!message || !String(message).trim()) return Response.json({ ok: false, error: "Message is required." }, { status: 400 });

    // Fetch the ticket
    const ticket = await base44.asServiceRole.entities.SupportTicket.get(ticketId);
    if (!ticket) return Response.json({ ok: false, error: "Ticket not found." }, { status: 404 });

    const { user_email, user_name, ticket_number, subject, admin_notes } = ticket;
    if (!user_email) return Response.json({ ok: false, error: "Ticket has no user email." }, { status: 400 });

    const msgText = String(message).trim();
    const isInfoRequest = messageType === "info_request";
    const greeting = user_name ? `Hi ${user_name},` : "Hi there,";
    const headerLabel = isInfoRequest ? "We Need a Little More Info" : "Update on Your Support Request";
    const headerColor = isInfoRequest ? "#b45309" : "#0B1F3B";
    const msgHtml = msgText.replace(/\n/g, "<br>");

    const STATUS_LABELS: Record<string, string> = {
      open: "Open",
      in_progress: "In Progress",
      resolved: "Resolved",
      closed: "Closed",
    };

    const statusLine = newStatus && newStatus !== "no_change" && newStatus !== ticket.status
      ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">Your ticket status has been updated to <strong>${STATUS_LABELS[newStatus] || newStatus}</strong>.</p>`
      : "";

    // Generate magic-link reply button
    let replyButtonHtml = "";
    const secret = (Deno.env.get("TICKET_REPLY_SECRET") || "").trim();
    if (secret && appUrl) {
      const token = await computeToken(ticketId, secret);
      const replyUrl = `${String(appUrl).replace(/\/$/, "")}/SupportReply?ticket=${encodeURIComponent(ticketId)}&token=${encodeURIComponent(token)}`;
      replyButtonHtml = `
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;color:#374151;">Have a response or additional information for us?</p>
      <a href="${replyUrl}" style="display:inline-block;padding:12px 28px;background:#0B1F3B;color:#D4AF37;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;letter-spacing:0.5px;">Reply to This Ticket</a>
      <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">Button not working? Copy and paste this link into your browser:<br><span style="word-break:break-all;">${replyUrl}</span></p>
    </div>`;
    }

    const replyHtml = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:${headerColor};padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">${headerLabel}</h2>
    <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">Ticket #${ticket_number || ticketId}</p>
  </div>
  <div style="padding:24px;">
    <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6;">${greeting}</p>
    ${statusLine}
    <div style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${isInfoRequest ? "Information Requested" : "Message from Support"}</p>
      <p style="margin:0;font-size:14px;color:#111827;line-height:1.7;">${msgHtml}</p>
    </div>
    <div style="padding:12px 16px;background:#f3f4f6;border-radius:8px;margin-bottom:4px;">
      <p style="margin:0;font-size:12px;color:#6b7280;">Original subject: <strong style="color:#374151;">${subject || "—"}</strong></p>
    </div>
    ${replyButtonHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">— URecruit HQ Support</p>
  </div>
</div>`;

    const emailSubject = isInfoRequest
      ? `Action Needed — Ticket #${ticket_number || ticketId}: ${subject || "Your Request"}`
      : `Update on Ticket #${ticket_number || ticketId}: ${subject || "Your Request"}`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: String(user_email).trim(),
      from_name: "URecruit HQ Support",
      subject: emailSubject,
      body: replyHtml,
    });

    // Build ticket update payload
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const logEntry = `[${timestamp} CT] ${isInfoRequest ? "Info requested" : "Reply"}: ${msgText}`;
    const updatedNotes = admin_notes
      ? `${logEntry}\n\n${admin_notes}`
      : logEntry;

    const updateData: Record<string, unknown> = { admin_notes: updatedNotes };
    if (newStatus && newStatus !== "no_change" && newStatus !== ticket.status) {
      updateData.status = newStatus;
      if (newStatus === "resolved") updateData.resolved_at = now.toISOString();
    }

    await base44.asServiceRole.entities.SupportTicket.update(ticketId, updateData);

    return Response.json({ ok: true, updatedData: updateData });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
