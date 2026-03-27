import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const tickets = await base44.asServiceRole.entities.SupportTicket.list("-created_date", 500);
    return Response.json({ ok: true, tickets: Array.isArray(tickets) ? tickets : [] });
  } catch (err) {
    console.error("listSupportTickets error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
