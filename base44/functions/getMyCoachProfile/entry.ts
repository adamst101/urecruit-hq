import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Identify the caller
  let accountId = "";
  let env: string | undefined;
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  try { const b = await req.json(); env = b?.env; } catch {}
  const E = env === 'dev' ? { environment: 'dev' as const } : undefined;

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Use service role so entity-level read permissions don't block the coach
    const coaches = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId }, E);
    const list = Array.isArray(coaches) ? coaches : [];

    if (!list.length) {
      return Response.json({ ok: true, coach: null, roster: [], messages: [] });
    }

    const coach = list[0];

    // Fetch roster and messages in parallel
    const [roster, messages] = await Promise.all([
      base44.asServiceRole.entities.CoachRoster.filter({ coach_id: coach.id }, E).catch(() => []),
      base44.asServiceRole.entities.CoachMessage.filter({ coach_id: coach.id }, E).catch(() => []),
    ]);

    const rosterList = Array.isArray(roster) ? roster : [];

    // Fetch camp registrations for each roster athlete via their account_id
    const campsByAccountId: Record<string, { camp_id: string; camp_name: string; school_name: string; start_date: string }[]> = {};
    if (rosterList.length > 0) {
      const accountIds = [...new Set(rosterList.map(r => r.account_id).filter(Boolean))];
      await Promise.all(accountIds.map(async (accountId) => {
        try {
          // Get all CampIntent records for this account with registered/completed status
          const intents = await base44.asServiceRole.entities.CampIntent.filter({
            account_id: accountId,
          }, E).catch(() => []);
          const registered = Array.isArray(intents)
            ? intents.filter(i => i.status === "registered" || i.status === "completed")
            : [];
          if (registered.length === 0) return;

          // Batch-fetch camp details
          const campIds = [...new Set(registered.map(i => i.camp_id).filter(Boolean))];
          const camps = await Promise.all(
            campIds.map(id => base44.asServiceRole.entities.Camp.get(id, E).catch(() => null))
          );
          const campMap: Record<string, { camp_name: string; school_name: string; start_date: string }> = {};
          for (const camp of camps) {
            if (camp?.id) {
              campMap[camp.id] = {
                camp_name: camp.camp_name || camp.name || "Camp",
                school_name: camp.school_name || "",
                start_date: camp.start_date || "",
              };
            }
          }

          campsByAccountId[accountId] = registered.map(i => ({
            camp_id: i.camp_id,
            camp_name: campMap[i.camp_id]?.camp_name || "Camp",
            school_name: campMap[i.camp_id]?.school_name || "",
            start_date: campMap[i.camp_id]?.start_date || "",
          })).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
        } catch {
          // Non-critical — skip this athlete's camps on error
        }
      }));
    }

    return Response.json({
      ok: true,
      coach,
      roster: rosterList,
      messages: Array.isArray(messages) ? messages : [],
      campsByAccountId,
    });
  } catch (err) {
    console.error("getMyCoachProfile error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
