import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const [activities, preferences] = await Promise.all([
      base44.asServiceRole.entities.RecruitingActivity
        .filter({ account_id: accountId })
        .catch(() => []),
      base44.asServiceRole.entities.SchoolPreference
        .filter({ account_id: accountId })
        .catch(() => []),
    ]);

    const activityList = Array.isArray(activities) ? activities : [];

    // Sort newest first: prefer activity_date, fall back to created_at
    activityList.sort((a, b) => {
      const da = a.activity_date || a.created_at || "";
      const db = b.activity_date || b.created_at || "";
      return db.localeCompare(da);
    });

    return Response.json({
      ok: true,
      activities: activityList,
      preferences: Array.isArray(preferences) && preferences.length > 0
        ? preferences[0]
        : null,
    });
  } catch (err) {
    console.error("getRecruitingJourney error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
