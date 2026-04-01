// functions/getMyAthleteProfiles/entry.ts
//
// Returns all AthleteProfile records for the currently authenticated user.
//
// Resolution order (each falls to the next if it returns empty):
//
//   1. asServiceRole.filter({ account_id }) — fast path; works for profiles
//      created via asServiceRole (stripeWebhook, linkStripePayment, activateFreeAccess).
//
//   2. asServiceRole.list() + in-process filter — catches profiles whose
//      account_id was successfully updated via asServiceRole.update() but whose
//      filter index hasn't caught up, or where filter semantics differ from field value.
//
//   3. SchoolPreference link — the canonical fallback for FT seed profiles.
//      Admin-created seed AthleteProfiles are NOT visible to asServiceRole queries
//      because asServiceRole only sees records it created. claimSlotProfiles writes
//      a SchoolPreference record via asServiceRole storing athlete_id = seedProfileId.
//      This function reads that link and fetches the profile by ID.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let bodyAccountId = "";
  try {
    const body = await req.clone().json().catch(() => ({}));
    bodyAccountId = body?.accountId || "";
  } catch {}

  const user = await base44.auth.me().catch(() => null);
  if (!user && !bodyAccountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const accountId = user?.id || bodyAccountId;

  const _meta: Record<string, unknown> = {
    accountId,
    method: "none",
    filterCount: 0,
    listTotal: 0,
    listMatchCount: 0,
    schoolPrefAthleteId: null,
  };

  try {
    let list: unknown[] = [];

    // ── Step 1: direct filter ──
    try {
      const rows = await base44.asServiceRole.entities.AthleteProfile.filter({
        account_id: accountId,
      });
      list = Array.isArray(rows) ? rows : [];
      _meta.filterCount = list.length;
    } catch (_filterErr) {
      list = [];
    }

    if (list.length > 0) {
      _meta.method = "filter_direct";
    }

    // ── Step 2: list + in-process filter ──
    if (list.length === 0) {
      try {
        const all = await base44.asServiceRole.entities.AthleteProfile.list("-created_date", 2000);
        if (Array.isArray(all)) {
          _meta.listTotal = all.length;
          list = all.filter((r: Record<string, unknown>) => r.account_id === accountId);
          _meta.listMatchCount = list.length;
          console.log(`[getMyAthleteProfiles] list scan: ${all.length} total, ${list.length} matched account_id=${accountId}`);
        }
      } catch (listErr) {
        console.warn("[getMyAthleteProfiles] list fallback failed:", (listErr as Error).message);
      }

      if (list.length > 0) {
        _meta.method = "list_scan";
      }
    }

    // ── Step 3: SchoolPreference link (FT seed profile canonical fallback) ──
    // claimSlotProfiles writes SchoolPreference.athlete_id = seedProfileId via asServiceRole.
    // asServiceRole can read what asServiceRole wrote, so this lookup works even though
    // the athlete profile itself was admin-created (not asServiceRole-created).
    if (list.length === 0) {
      try {
        const prefs = await base44.asServiceRole.entities.SchoolPreference.filter({
          account_id: accountId,
        });

        const pref = Array.isArray(prefs) && prefs.length > 0 ? (prefs[0] as Record<string, unknown>) : null;
        const linkedAthleteId = pref?.athlete_id ? String(pref.athlete_id) : null;
        _meta.schoolPrefAthleteId = linkedAthleteId;

        if (linkedAthleteId) {
          // Fetch the AthleteProfile by ID — try direct entity get if available, else list scan
          try {
            // asServiceRole filter by matching the profile by id is not directly available
            // as a "get by id" call in all SDK versions. Use list+find as the safe path.
            const allProfiles = await base44.asServiceRole.entities.AthleteProfile.list("-created_date", 2000);
            if (Array.isArray(allProfiles)) {
              const found = allProfiles.filter(
                (r: Record<string, unknown>) =>
                  String(r.id || r._id || r.uuid || "") === linkedAthleteId
              );
              if (found.length > 0) {
                list = found;
                _meta.method = "school_pref_link";
                console.log(`[getMyAthleteProfiles] resolved via SchoolPreference link: account=${accountId} -> athlete=${linkedAthleteId}`);
              } else {
                console.warn(`[getMyAthleteProfiles] SchoolPreference points to athlete ${linkedAthleteId} but profile not found in list`);
              }
            }
          } catch (fetchErr) {
            console.warn("[getMyAthleteProfiles] SchoolPreference link fetch failed:", (fetchErr as Error).message);
          }
        }
      } catch (prefErr) {
        console.warn("[getMyAthleteProfiles] SchoolPreference lookup failed:", (prefErr as Error).message);
      }
    }

    return Response.json({
      ok: true,
      accountId,
      profiles: list,
      _meta,
    });

  } catch (e) {
    console.error("getMyAthleteProfiles error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
