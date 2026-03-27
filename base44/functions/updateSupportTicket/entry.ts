import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== "admin") {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { ticketId, fields } = body;
  if (!ticketId || !fields) {
    return Response.json({ ok: false, error: "ticketId and fields are required" }, { status: 400 });
  }

  try {
    await base44.asServiceRole.entities.SupportTicket.update(ticketId, fields);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("updateSupportTicket error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});