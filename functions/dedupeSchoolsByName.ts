// functions/dedupeSchoolsByName.js
// Finds schools with exact same school_name, keeps the "best" one (most populated fields),
// and deletes the rest. Reassigns Camp.school_id references to the survivor.
//
// POST { dryRun: true, maxGroups: 50, cursor: null }

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

// Score a school record by how many useful fields are populated
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
  // Prefer higher confidence
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
  const maxGroups = Math.max(1, Number(body.maxGroups || 100));

  const stats = {
    totalSchools: 0,
    duplicateGroups: 0,
    duplicateRecords: 0,
    deleted: 0,
    campsReassigned: 0,
    errors: 0,
  };
  const sample = { groups: [], errors: [] };

  // Fetch all schools (sorted by name for grouping)
  const allSchools = await base44.asServiceRole.entities.School.filter({}, "school_name", 5000);
  stats.totalSchools = allSchools.length;

  // Group by exact school_name (case-sensitive)
  const groups = {};
  for (const s of allSchools) {
    const name = String(s.school_name || "").trim();
    if (!name) continue;
    if (!groups[name]) groups[name] = [];
    groups[name].push(s);
  }

  // Filter to only groups with duplicates
  const dupGroups = Object.entries(groups)
    .filter(([, arr]) => arr.length > 1)
    .slice(0, maxGroups);

  stats.duplicateGroups = dupGroups.length;

  for (const [name, schools] of dupGroups) {
    // Score each school, pick the best as survivor
    const scored = schools.map((s) => ({ school: s, score: scoreSchool(s) }));
    scored.sort((a, b) => b.score - a.score);

    const survivor = scored[0].school;
    const losers = scored.slice(1).map((x) => x.school);
    stats.duplicateRecords += losers.length;

    const groupInfo = {
      name,
      count: schools.length,
      survivorId: survivor.id,
      survivorScore: scored[0].score,
      loserIds: losers.map((l) => l.id),
      loserScores: scored.slice(1).map((x) => x.score),
      campsReassigned: 0,
    };

    if (!dryRun) {
      // Reassign camps from losers to survivor
      for (const loser of losers) {
        const camps = await base44.asServiceRole.entities.Camp.filter(
          { school_id: loser.id },
          "-created_date",
          500
        );
        for (const camp of camps) {
          try {
            await base44.asServiceRole.entities.Camp.update(camp.id, { school_id: survivor.id });
            stats.campsReassigned++;
            groupInfo.campsReassigned++;
          } catch (e) {
            stats.errors++;
            if (sample.errors.length < 10) {
              sample.errors.push({ type: "camp_reassign", campId: camp.id, error: String(e?.message || e) });
            }
          }
          await sleep(50);
        }

        // Also reassign SchoolSportSite, CampIntent targets, etc.
        // Delete the loser school
        try {
          await base44.asServiceRole.entities.School.delete(loser.id);
          stats.deleted++;
        } catch (e) {
          stats.errors++;
          if (sample.errors.length < 10) {
            sample.errors.push({ type: "delete", schoolId: loser.id, error: String(e?.message || e) });
          }
        }
        await sleep(50);
      }
    } else {
      stats.deleted += losers.length; // projected
    }

    if (sample.groups.length < 20) {
      sample.groups.push(groupInfo);
    }
  }

  return json({ ok: true, dryRun, stats, sample });
});