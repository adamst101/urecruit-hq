// functions/getMyAthleteProfiles/entry.ts
//
// ════════════════════════════════════════════════════════════════════════════
// ATHLETE IDENTITY RESOLUTION — DATA MODEL
// ════════════════════════════════════════════════════════════════════════════
// Three-step resolution, each falling to the next on empty result:
//
//   Step 1 — asServiceRole.filter({ account_id })
//     Works for profiles created via asServiceRole (Stripe webhook,
//     linkStripePayment, activateFreeAccess). Fast O(1).
//
//   Step 2 — asServiceRole.list() + in-process filter
//     Catches profiles whose account_id was updated via asServiceRole.update()
//     but whose filter index hasn't converged, or where filter semantics
//     diverge from raw field value matching.
//
//   Step 3 — SchoolPreference.athlete_id bridge (CANONICAL FT SEED PATH)
//     WHY: AthleteProfile seed records are admin-created (client-side), NOT
//     asServiceRole-created. Base44's asServiceRole can ONLY query records it
//     created. Admin-created records are permanently invisible to asServiceRole
//     queries, so Steps 1 and 2 will always return empty for them.
//
//     FIX: claimSlotProfiles writes a SchoolPreference record via asServiceRole
//     when a slot is claimed: { account_id: realAccountId, athlete_id: seedId }.
//     Because SchoolPreference is asServiceRole-created, it IS visible here.
//     We read SchoolPreference.athlete_id, fetch the AthleteProfile by ID,
//     and return it as if it were found by direct filter.
//
//     CANONICAL WRITE PATH: base44/functions/claimSlotProfiles/entry.ts
//     CANONICAL READ PATH:  this file, Step 3 below
//     GUARDED BY:           base44/functions/saveSchoolPreferences/entry.ts
//                           preserves athlete_id when not explicitly changed
//
// ════════════════════════════════════════════════════════════════════════════

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
  const sr = base44.asServiceRole;

  // _meta accumulates diagnostic state across all resolution steps
  const _meta: Record<string, unknown> = {
    accountId,
    method: "none",
    directAthleteIds: [] as string[],       // IDs found via filter_direct or list_scan
    listTotal: 0,
    listMatchCount: 0,
    schoolPrefAthleteId: null as string | null,
    finalAthleteId: null as string | null,
    directVsLinkedMatch: null as boolean | null,  // null when one side is missing
    multiplePrefWarning: false,
    missingProfileWarning: false,
    errors: [] as string[],
  };

  const metaErrors = _meta.errors as string[];

  try {
    let list: unknown[] = [];

    // ── Step 1: direct asServiceRole filter ─────────────────────────────────
    try {
      const rows = await sr.entities.AthleteProfile.filter({ account_id: accountId });
      list = Array.isArray(rows) ? rows : [];
      (_meta.directAthleteIds as string[]).push(
        ...list.map((r: any) => String(r.id || r._id || r.uuid || "")).filter(Boolean)
      );
    } catch (_e) {
      list = [];
    }

    if (list.length > 0) _meta.method = "filter_direct";

    // ── Step 2: list + in-process filter ────────────────────────────────────
    if (list.length === 0) {
      try {
        const all = await sr.entities.AthleteProfile.list("-created_date", 2000);
        if (Array.isArray(all)) {
          _meta.listTotal = all.length;
          list = all.filter((r: Record<string, unknown>) => r.account_id === accountId);
          _meta.listMatchCount = list.length;
          (_meta.directAthleteIds as string[]).push(
            ...list.map((r: any) => String(r.id || r._id || r.uuid || "")).filter(Boolean)
          );
          console.log(`[getMyAthleteProfiles] list scan: ${all.length} total, ${list.length} matched account_id=${accountId}`);
        }
      } catch (listErr) {
        metaErrors.push(`list scan failed: ${(listErr as Error).message}`);
      }

      if (list.length > 0) _meta.method = "list_scan";
    }

    // ── Step 3: SchoolPreference.athlete_id bridge ───────────────────────────
    // See module docblock — this is the canonical path for FT seed profiles.
    if (list.length === 0) {
      try {
        const prefs = await sr.entities.SchoolPreference.filter({ account_id: accountId })
          .catch(() => []) as any[];

        if (Array.isArray(prefs) && prefs.length > 1) {
          // Multiple rows: warn and pick the one with a non-null athlete_id
          _meta.multiplePrefWarning = true;
          const withAthleteId = prefs.filter((p: any) => !!p.athlete_id);
          if (withAthleteId.length > 1) {
            // Check if they all agree on athlete_id
            const ids = [...new Set(withAthleteId.map((p: any) => String(p.athlete_id)))];
            if (ids.length > 1) {
              metaErrors.push(`Multiple SchoolPreference rows with conflicting athlete_ids: ${ids.join(", ")}`);
            }
          }
        }

        const pref = Array.isArray(prefs) && prefs.length > 0
          ? (prefs.find((p: any) => !!p.athlete_id) ?? prefs[0])
          : null;

        const linkedAthleteId = pref?.athlete_id ? String(pref.athlete_id) : null;
        _meta.schoolPrefAthleteId = linkedAthleteId;

        if (linkedAthleteId) {
          // Fetch the AthleteProfile by ID via full list scan.
          // Direct filter by id is not reliably available via asServiceRole in all SDK versions.
          try {
            const allProfiles = await sr.entities.AthleteProfile.list("-created_date", 2000);
            if (Array.isArray(allProfiles)) {
              const found = allProfiles.filter((r: any) =>
                String(r.id || r._id || r.uuid || "") === linkedAthleteId
              );

              if (found.length > 0) {
                list = found;
                _meta.method = "school_pref_link";
                console.log(`[getMyAthleteProfiles] resolved via SchoolPreference: account=${accountId} -> athlete=${linkedAthleteId}`);
              } else {
                // Link exists but points to a non-existent profile
                _meta.missingProfileWarning = true;
                metaErrors.push(`SchoolPreference.athlete_id=${linkedAthleteId} points to a profile that does not exist in the list scan`);
                console.warn(`[getMyAthleteProfiles] dangling SchoolPreference link: account=${accountId} -> athlete=${linkedAthleteId} (not found)`);
              }
            }
          } catch (fetchErr) {
            metaErrors.push(`SchoolPreference link fetch: ${(fetchErr as Error).message}`);
          }
        }
      } catch (prefErr) {
        metaErrors.push(`SchoolPreference lookup: ${(prefErr as Error).message}`);
      }
    }

    // ── Finalize diagnostics ─────────────────────────────────────────────────
    const finalRecord = list.length > 0 ? (list[0] as any) : null;
    const finalAthleteId = finalRecord
      ? String(finalRecord.id || finalRecord._id || finalRecord.uuid || "")
      : null;
    _meta.finalAthleteId = finalAthleteId;

    const directIds = _meta.directAthleteIds as string[];
    const linked = _meta.schoolPrefAthleteId as string | null;
    if (directIds.length > 0 && linked) {
      _meta.directVsLinkedMatch = directIds.includes(linked);
      if (!_meta.directVsLinkedMatch) {
        metaErrors.push(`directAthleteIds ${JSON.stringify(directIds)} != schoolPrefAthleteId ${linked} — link may be stale`);
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
