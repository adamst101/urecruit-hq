// functions/saveSchoolPreferences/entry.ts
//
// IMPORTANT — athlete_id field preservation:
//   SchoolPreference.athlete_id doubles as the canonical FT seed athlete link.
//   claimSlotProfiles writes it (via asServiceRole) to map a real account to a
//   seed AthleteProfile. getMyAthleteProfiles reads it as a Step 3 fallback.
//
//   This function MUST preserve athlete_id when not explicitly provided in the
//   incoming request, so that a user saving their school targets does not
//   accidentally clear the seed athlete linkage.
//
//   Canonical write path: base44/functions/claimSlotProfiles/entry.ts
//   Canonical read path:  base44/functions/getMyAthleteProfiles/entry.ts

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: {
    accountId?: string;
    athlete_id?: string;
    fbs_1?: string; fbs_2?: string; fbs_3?: string;
    fcs_1?: string; fcs_2?: string; fcs_3?: string;
    d2_1?: string;  d2_2?: string;  d2_3?: string;
    d3_1?: string;  d3_2?: string;  d3_3?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId && body.accountId) accountId = body.accountId;

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const fields = [
    "fbs_1", "fbs_2", "fbs_3",
    "fcs_1", "fcs_2", "fcs_3",
    "d2_1",  "d2_2",  "d2_3",
    "d3_1",  "d3_2",  "d3_3",
  ] as const;

  try {
    const existing = await base44.asServiceRole.entities.SchoolPreference
      .filter({ account_id: accountId })
      .catch(() => []);

    const existingRecord = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

    // Preserve athlete_id if already set and not explicitly provided in this request.
    // claimSlotProfiles writes athlete_id as the canonical FT seed profile link —
    // we must not overwrite it with null when the user saves school preferences.
    const incomingAthleteId = body.athlete_id?.trim() || null;
    const existingAthleteId = (existingRecord as Record<string, unknown> | null)?.athlete_id
      ? String((existingRecord as Record<string, unknown>).athlete_id)
      : null;
    const resolvedAthleteId = incomingAthleteId ?? existingAthleteId ?? null;

    const payload: Record<string, string | null> = {
      athlete_id: resolvedAthleteId,
      updated_at: new Date().toISOString(),
    };
    for (const f of fields) {
      payload[f] = (body[f] as string | undefined)?.trim() || null;
    }

    let result;
    if (existingRecord) {
      result = await base44.asServiceRole.entities.SchoolPreference.update(existingRecord.id, payload);
    } else {
      result = await base44.asServiceRole.entities.SchoolPreference.create({
        account_id: accountId,
        ...payload,
        created_at: new Date().toISOString(),
      });
    }

    console.log("SchoolPreference saved — account:", accountId);
    return Response.json({ ok: true, preferences: result });
  } catch (err) {
    console.error("saveSchoolPreferences error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
