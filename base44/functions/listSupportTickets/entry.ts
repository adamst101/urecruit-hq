import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const tickets = await base44.asServiceRole.entities.SupportTicket.list("-created_date", 500);
    return Response.json({ ok: true, tickets: Array.isArray(tickets) ? tickets : [] });
  } catch (err) {
    console.error("listSupportTickets error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});