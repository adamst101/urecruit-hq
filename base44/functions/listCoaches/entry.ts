import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const [coaches, rosters, messages] = await Promise.all([
      base44.asServiceRole.entities.Coach.filter({}).catch(() => []),
      base44.asServiceRole.entities.CoachRoster.filter({}).catch(() => []),
      base44.asServiceRole.entities.CoachMessage.filter({}).catch(() => []),
    ]);

    return Response.json({
      ok: true,
      coaches: Array.isArray(coaches) ? coaches : [],
      rosters: Array.isArray(rosters) ? rosters : [],
      messages: Array.isArray(messages) ? messages : [],
    });
  } catch (err) {
    console.error("listCoaches error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});