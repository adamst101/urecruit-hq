// functions/dedupeSchoolsByName.js
// Finds schools with exact same school_name, keeps the "best" one (most populated fields),
// deletes the rest, and reassigns Camp.school_id references to the survivor.
//
// POST { dryRun: true, maxGroups: 30, startAt: 0 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

function scoreSchool(s) {
  let score = 0;
  const fields = [
    "wikipedia_url", "athletic_logo_url", "athletics_wikipedia_url",
    "athletics_nickname", "logo_url", "website_url", "unitid",
    "division", "subdivision", "conference", "city", "state",
    "athletic_logo_source", "athletic_logo_confidence",
  ];
  for (const f of fields) {
    if (s[f] != null && String(s[f]).trim() !== "") score++;
  }
  if (typeof s.athletic_logo_confidence === "number") score += s.athletic_logo_confidence;
  return score;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== "admin") return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  const maxGroups = Math.max(1, Number(body.maxGroups || 30));
  const startAt = Math.max(0, Number(body.startAt || 0));

  const stats = {
    totalSchools: 0,
    totalDuplicateGroups: 0,
    processedGroups: 0,
    deleted: 0,
    campsReassigned: 0,
    errors: 0,
  };
  const sample = { groups: [], errors: [] };

  const allSchools = await base44.asServiceRole.entities.School.filter({}, "school_name", 5000);
  stats.totalSchools = allSchools.length;

  // Group by exact school_name
  const groups = {};
  for (const s of allSchools) {
    const name = String(s.school_name || "").trim();
    if (!name) continue;
    if (!groups[name]) groups[name] = [];
    groups[name].push(s);
  }

  const dupGroups = Object.entries(groups).filter(([, arr]) => arr.length > 1);
  stats.totalDuplicateGroups = dupGroups.length;

  const batch = dupGroups.slice(startAt, startAt + maxGroups);
  const nextStartAt = startAt + batch.length;
  const done = nextStartAt >= dupGroups.length;

  for (const [name, schools] of batch) {
    const scored = schools.map((s) => ({ school: s, score: scoreSchool(s) }));
    scored.sort((a, b) => b.score - a.score);

    const survivor = scored[0].school;
    const losers = scored.slice(1).map((x) => x.school);

    const groupInfo = {
      name,
      count: schools.length,
      survivorId: survivor.id,
      loserIds: losers.map((l) => l.id),
      campsReassigned: 0,
    };

    if (!dryRun) {
      for (const loser of losers) {
        // Reassign camps
        const camps = await base44.asServiceRole.entities.Camp.filter(
          { school_id: loser.id }, "-created_date", 500
        );
        for (const camp of camps) {
          try {
            await base44.asServiceRole.entities.Camp.update(camp.id, { school_id: survivor.id });
            stats.campsReassigned++;
            groupInfo.campsReassigned++;
          } catch (e) {
            stats.errors++;
            if (sample.errors.length < 10)
              sample.errors.push({ type: "camp", campId: camp.id, err: String(e?.message || e) });
          }
          await sleep(30);
        }

        // Delete loser
        try {
          await base44.asServiceRole.entities.School.delete(loser.id);
          stats.deleted++;
        } catch (e) {
          stats.errors++;
          if (sample.errors.length < 10)
            sample.errors.push({ type: "delete", schoolId: loser.id, err: String(e?.message || e) });
        }
        await sleep(30);
      }
    } else {
      stats.deleted += losers.length;
    }

    stats.processedGroups++;
    if (sample.groups.length < 20) sample.groups.push(groupInfo);
  }

  return json({
    ok: true,
    dryRun,
    done,
    next_startAt: done ? null : nextStartAt,
    stats,
    sample,
  });
});