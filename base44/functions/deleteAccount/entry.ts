// functions/deleteAccount.ts
// Deletes all data for the authenticated user's account:
//   AthleteProfile, Entitlement, CampIntent, TargetSchool, Favorite
// Requires the user to be authenticated. Called from the Account page.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.21";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

async function deleteAll(entity: any, rows: any[]) {
  let deleted = 0;
  let errors = 0;
  for (const row of rows) {
    const id = row.id || row._id;
    if (!id) { errors++; continue; }
    try {
      await entity.delete(String(id));
      deleted++;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("429") || msg.includes("rate limit")) {
        await sleep(1500);
        try { await entity.delete(String(id)); deleted++; } catch { errors++; }
      } else {
        errors++;
        console.warn("Delete failed for id", id, msg);
      }
    }
    if (deleted % 5 === 0) await sleep(80);
  }
  return { deleted, errors };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const accountId = String(user.id);
  console.log("deleteAccount requested for account:", accountId);

  const sr = base44.asServiceRole.entities;
  const summary: Record<string, { deleted: number; errors: number }> = {};

  // 1. Fetch all athlete profiles for this account
  const athletes = await sr.AthleteProfile.filter({ account_id: accountId }).catch(() => []);
  const athleteList = Array.isArray(athletes) ? athletes : [];
  const athleteIds = athleteList.map((a: any) => String(a.id || a._id)).filter(Boolean);

  console.log("Athletes to delete:", athleteIds.length);

  // 2. Delete CampIntent records for each athlete
  let intentDeleted = 0, intentErrors = 0;
  for (const aId of athleteIds) {
    const intents = await sr.CampIntent.filter({ athlete_id: aId }).catch(() => []);
    if (Array.isArray(intents) && intents.length > 0) {
      const r = await deleteAll(sr.CampIntent, intents);
      intentDeleted += r.deleted;
      intentErrors += r.errors;
    }
  }
  summary.CampIntent = { deleted: intentDeleted, errors: intentErrors };

  // 3. Delete TargetSchool records for each athlete
  let targetDeleted = 0, targetErrors = 0;
  for (const aId of athleteIds) {
    const targets = await sr.TargetSchool.filter({ athlete_id: aId }).catch(() => []);
    if (Array.isArray(targets) && targets.length > 0) {
      const r = await deleteAll(sr.TargetSchool, targets);
      targetDeleted += r.deleted;
      targetErrors += r.errors;
    }
  }
  summary.TargetSchool = { deleted: targetDeleted, errors: targetErrors };

  // 4. Delete Favorite records for each athlete (if entity exists)
  let favDeleted = 0, favErrors = 0;
  if (sr.Favorite) {
    for (const aId of athleteIds) {
      const favs = await sr.Favorite.filter({ athlete_id: aId }).catch(() => []);
      if (Array.isArray(favs) && favs.length > 0) {
        const r = await deleteAll(sr.Favorite, favs);
        favDeleted += r.deleted;
        favErrors += r.errors;
      }
    }
  }
  summary.Favorite = { deleted: favDeleted, errors: favErrors };

  // 5. Delete all AthleteProfile records
  const apResult = await deleteAll(sr.AthleteProfile, athleteList);
  summary.AthleteProfile = apResult;

  // 6. Delete all Entitlement records for the account
  const entitlements = await sr.Entitlement.filter({ account_id: accountId }).catch(() => []);
  const entResult = await deleteAll(sr.Entitlement, Array.isArray(entitlements) ? entitlements : []);
  summary.Entitlement = entResult;

  console.log("deleteAccount complete:", JSON.stringify(summary));

  return Response.json({ ok: true, accountId, summary });
});
