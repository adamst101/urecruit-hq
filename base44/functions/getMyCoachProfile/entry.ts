import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Accept accountId hint from the frontend session as a fallback — covers cases
  // where auth.me() in the function is inconsistent with the frontend session.
  let bodyAccountId = "";
  try {
    const body = await req.clone().json().catch(() => ({}));
    bodyAccountId = body?.accountId || "";
  } catch {}

  // Identify the caller — auth.me() is authoritative; bodyAccountId is a fallback
  let accountId = "";
  let callerEmail = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
    callerEmail = me?.email || "";
  } catch {}

  // If auth.me() failed, fall back to the client-supplied accountId
  if (!accountId && bodyAccountId) accountId = bodyAccountId;

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Use service role so entity-level read permissions don't block the coach
    let coaches = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId });
    let list = Array.isArray(coaches) ? coaches : [];

    // Fallback: if not found by account_id, try by email (handles cases where account_id
    // was not saved correctly during registration)
    if (!list.length && callerEmail) {
      const byEmail = await base44.asServiceRole.entities.Coach.filter({ email: callerEmail }).catch(() => []);
      list = Array.isArray(byEmail) ? byEmail : [];
      // Backfill the account_id so future lookups work (covers missing or wrong value)
      if (list.length && list[0].account_id !== accountId) {
        base44.asServiceRole.entities.Coach.update(list[0].id, { account_id: accountId }).catch(() => {});
      }
    }

    if (!list.length) {
      return Response.json({ ok: true, coach: null, roster: [], messages: [] });
    }

    const coach = list[0];

    // Fetch roster and messages in parallel
    const [roster, messages] = await Promise.all([
      base44.asServiceRole.entities.CoachRoster.filter({ coach_id: coach.id }).catch(() => []),
      base44.asServiceRole.entities.CoachMessage.filter({ coach_id: coach.id }).catch(() => []),
    ]);

    const rosterList = Array.isArray(roster) ? roster : [];

    console.log("[getMyCoachProfile] roster entries:", rosterList.length,
      rosterList.map(r => `acct=${r.account_id || "(empty)"} athlete=${r.athlete_id || "(empty)"} name=${r.athlete_name || "(none)"}`));

    // Fetch camp registrations for each roster athlete.
    // CampIntent records are created with athlete_id as the primary FK (and account_id as secondary).
    // Query by athlete_id first (matches what the app writes); fall back to account_id.
    // Results are keyed by account_id for CoachDashboard compatibility.
    const campsByAccountId: Record<string, object[]> = {};
    if (rosterList.length > 0) {
      await Promise.all(rosterList.map(async (r) => {
        const acctId: string = r.account_id || "";
        const athleteId: string = r.athlete_id || "";
        if (!acctId && !athleteId) return;

        try {
          // Resolve athlete_id: use roster value if present, otherwise look up from AthleteProfile
          let resolvedAthleteId: string = athleteId;
          if (!resolvedAthleteId && acctId) {
            const profiles = await base44.asServiceRole.entities.AthleteProfile.filter({
              account_id: acctId,
            }).catch(() => []);
            const profileList = Array.isArray(profiles) ? profiles : [];
            // Prefer primary+active, then active, then first
            const profile = profileList.find((p: any) => p.is_primary && p.active !== false)
              || profileList.find((p: any) => p.active !== false)
              || profileList[0]
              || null;
            resolvedAthleteId = profile?.id || "";
            console.log(`[getMyCoachProfile] resolved athlete_id from profile for acct ${acctId}: ${resolvedAthleteId || "(none)"}`);
          }

          // Query CampIntent by athlete_id (primary FK used by the app)
          let intents: object[] = [];
          if (resolvedAthleteId) {
            const byAthlete = await base44.asServiceRole.entities.CampIntent.filter({
              athlete_id: resolvedAthleteId,
            }).catch(() => []);
            intents = Array.isArray(byAthlete) ? byAthlete : [];
            console.log(`[getMyCoachProfile] athlete_id lookup (${resolvedAthleteId}): ${intents.length} intents`);
          }
          // Fall back to account_id when athlete_id lookup found nothing
          if (intents.length === 0 && acctId) {
            const byAccount = await base44.asServiceRole.entities.CampIntent.filter({
              account_id: acctId,
            }).catch(() => []);
            intents = Array.isArray(byAccount) ? byAccount : [];
            console.log(`[getMyCoachProfile] account_id fallback (${acctId}): ${intents.length} intents`);
          }

          // If still nothing found, dump a sample of ALL CampIntents (no filter) to see
          // what athlete_id / account_id values are actually stored in the database.
          if (intents.length === 0 && (resolvedAthleteId || acctId)) {
            try {
              // Fetch up to 10 most recent CampIntents regardless of owner
              const sample = await base44.asServiceRole.entities.CampIntent.filter({}, undefined, 10).catch(() => []);
              const rows = Array.isArray(sample) ? sample : [];
              console.log(`[getMyCoachProfile] DIAG — sample of all CampIntents (limit 10): ${rows.length}`,
                JSON.stringify(rows.map((i: any) => ({
                  id: i.id, status: i.status,
                  athlete_id: i.athlete_id || "(null)",
                  account_id: i.account_id || "(null)",
                }))));
            } catch (e: any) {
              console.log(`[getMyCoachProfile] DIAG — CampIntent unfiltered fetch threw: ${(e as Error).message}`);
            }
          }

          const registered = intents.filter((i: any) => i.status === "registered" || i.status === "completed");
          if (registered.length === 0) return;

          const campIds = [...new Set(registered.map((i: any) => i.camp_id).filter(Boolean))];
          const camps = await Promise.all(
            campIds.map((id: any) => base44.asServiceRole.entities.Camp.get(id).catch(() => null))
          );
          const campMap: Record<string, object> = {};
          for (const camp of camps) {
            if ((camp as any)?.id) {
              campMap[(camp as any).id] = {
                camp_name: (camp as any).camp_name || (camp as any).name || "Camp",
                school_name: (camp as any).school_name || "",
                start_date: (camp as any).start_date || "",
              };
            }
          }

          const athleteCamps = registered.map((i: any) => ({
            camp_id: i.camp_id,
            camp_name: (campMap[i.camp_id] as any)?.camp_name || "Camp",
            school_name: (campMap[i.camp_id] as any)?.school_name || "",
            start_date: (campMap[i.camp_id] as any)?.start_date || "",
          })).sort((a: any, b: any) => (a.start_date || "").localeCompare(b.start_date || ""));

          // Merge into account_id bucket (multiple athletes per account are combined)
          if (acctId) {
            const existing = campsByAccountId[acctId] as any[] | undefined;
            if (existing) {
              // Dedupe by camp_id before merging
              const existingIds = new Set(existing.map((c: any) => c.camp_id));
              campsByAccountId[acctId] = [...existing, ...athleteCamps.filter((c: any) => !existingIds.has(c.camp_id))];
            } else {
              campsByAccountId[acctId] = athleteCamps;
            }
          }
        } catch {
          // Non-critical — skip this athlete's camps on error
        }
      }));
    }

    console.log("[getMyCoachProfile] campsByAccountId keys:", Object.keys(campsByAccountId),
      "totals:", Object.entries(campsByAccountId).map(([k, v]) => `${k}:${(v as any[]).length}`));

    return Response.json({
      ok: true,
      coach,
      roster: rosterList,
      messages: Array.isArray(messages) ? messages : [],
      campsByAccountId,
    });
  } catch (err) {
    console.error("getMyCoachProfile error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});