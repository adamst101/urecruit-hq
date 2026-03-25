import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Identify the caller
  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Use service role so entity-level read permissions don't block the coach
    const coaches = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId });
    const list = Array.isArray(coaches) ? coaches : [];

    if (!list.length) {
      return Response.json({ ok: true, coach: null, roster: [], messages: [] });
    }

    const coach = list[0];

    // Fetch roster and messages in parallel
    const [roster, messages] = await Promise.all([
      base44.asServiceRole.entities.CoachRoster.filter({ coach_id: coach.id }).catch(() => []),
      base44.asServiceRole.entities.CoachMessage.filter({ coach_id: coach.id }).catch(() => []),
    ]);

    return Response.json({
      ok: true,
      coach,
      roster: Array.isArray(roster) ? roster : [],
      messages: Array.isArray(messages) ? messages : [],
    });
  } catch (err) {
    console.error("getMyCoachProfile error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
