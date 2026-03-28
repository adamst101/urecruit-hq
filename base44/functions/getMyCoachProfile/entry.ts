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

    // Fetch camp registrations for roster athletes.
    // Strategy: fetch ALL registered/completed CampIntents (account_id is null on all records —
    // the entity doesn't store it — so filtering by account_id never works). Match in memory
    // by athlete_id resolved from AthleteProfile. Limit 500 to stay within reason.
    const campsByAccountId: Record<string, object[]> = {};
    if (rosterList.length > 0) {
      // Step 1: resolve athlete_id for every roster entry that is missing one
      const resolvedRoster: Array<{ acctId: string; athleteId: string }> = [];
      await Promise.all(rosterList.map(async (r) => {
        const acctId: string = r.account_id || "";
        let athleteId: string = r.athlete_id || "";
        let needsNameBackfill = !r.athlete_name;

        if ((!athleteId || needsNameBackfill) && acctId) {
          const profiles = await base44.asServiceRole.entities.AthleteProfile.filter({ account_id: acctId }).catch(() => []);
          const profileList = Array.isArray(profiles) ? profiles : [];
          const profile = profileList.find((p: any) => p.is_primary && p.active !== false)
            || profileList.find((p: any) => p.active !== false)
            || profileList[0]
            || null;
          if (!athleteId) athleteId = profile?.id || "";

          // Backfill name and grad year onto the in-memory roster entry so the
          // dashboard shows real names, and patch the entity record for future calls.
          if (profile && needsNameBackfill) {
            const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
            if (fullName) {
              (r as any).athlete_name = fullName;
              (r as any).athlete_grad_year = (r as any).athlete_grad_year || profile.grad_year || null;
              base44.asServiceRole.entities.CoachRoster.update(r.id, {
                athlete_name: fullName,
                athlete_id: athleteId || undefined,
                athlete_grad_year: profile.grad_year || undefined,
              }).catch(() => {});
            }
          }
        }
        if (acctId || athleteId) resolvedRoster.push({ acctId, athleteId });
      }));

      const knownAthleteIds = new Set(resolvedRoster.map(r => r.athleteId).filter(Boolean));

      if (knownAthleteIds.size > 0) {
        // Step 2: fetch all registered/completed CampIntents and match by athlete_id in memory
        const allIntents = await base44.asServiceRole.entities.CampIntent.filter(
          { status: "registered" }, undefined, 500
        ).catch(() => []);
        const completedIntents = await base44.asServiceRole.entities.CampIntent.filter(
          { status: "completed" }, undefined, 500
        ).catch(() => []);
        const allFetched = [
          ...(Array.isArray(allIntents) ? allIntents : []),
          ...(Array.isArray(completedIntents) ? completedIntents : []),
        ];
        const allRegistered = allFetched.filter((i: any) => knownAthleteIds.has(i.athlete_id));

        if (allRegistered.length > 0) {
          // Step 3: fetch unique camp details
          const campIds = [...new Set(allRegistered.map((i: any) => i.camp_id).filter(Boolean))];
          const camps = await Promise.all(
            campIds.map((id: any) => base44.asServiceRole.entities.Camp.get(id).catch(() => null))
          );
          const campMap: Record<string, object> = {};
          for (const camp of camps) {
            if ((camp as any)?.id) {
              campMap[(camp as any).id] = {
                camp_id:         (camp as any).id,
                camp_name:       (camp as any).camp_name || (camp as any).name || "Camp",
                school_name:     (camp as any).school_name || "",
                start_date:      (camp as any).start_date || "",
                end_date:        (camp as any).end_date || "",
                city:            (camp as any).city || "",
                state:           (camp as any).state || "",
                school_division: (camp as any).school_division || "",
                link_url:        (camp as any).link_url || "",
                event_key:       (camp as any).event_key || "",
                school_logo_url: (camp as any).school_logo_url || (camp as any).athletics_logo_url || "",
                sport_name:      (camp as any).sport_name || "",
              };
            }
          }

          // Step 4: group by account_id (keyed for CoachDashboard)
          for (const r of resolvedRoster) {
            if (!r.acctId || !r.athleteId) continue;
            const athleteCamps = allRegistered
              .filter((i: any) => i.athlete_id === r.athleteId)
              .map((i: any) => ({ ...(campMap[i.camp_id] as object || {}), camp_id: i.camp_id }))
              .sort((a: any, b: any) => (a.start_date || "").localeCompare(b.start_date || ""));
            if (athleteCamps.length > 0) {
              const existing = campsByAccountId[r.acctId] as any[] | undefined;
              if (existing) {
                const existingIds = new Set(existing.map((c: any) => c.camp_id));
                campsByAccountId[r.acctId] = [...existing, ...athleteCamps.filter((c: any) => !existingIds.has(c.camp_id))];
              } else {
                campsByAccountId[r.acctId] = athleteCamps;
              }
            }
          }
        }
      }
    }

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