import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const allSchools = await base44.asServiceRole.entities.School.filter({}, "school_name", 5000);
    
    const blankCityState = [];
    const hasCityState = [];
    
    for (const s of allSchools) {
      const city = (s.city || "").trim();
      const state = (s.state || "").trim();
      if (!city && !state) {
        blankCityState.push(s);
      } else {
        hasCityState.push(s);
      }
    }

    // Check which blank schools have camps linked
    const allCamps = await base44.asServiceRole.entities.Camp.filter({}, "camp_name", 10000);
    const campsBySchoolId = {};
    for (const c of allCamps) {
      if (c.school_id) {
        campsBySchoolId[c.school_id] = (campsBySchoolId[c.school_id] || 0) + 1;
      }
    }

    const blankWithCamps = [];
    const blankWithoutCamps = [];
    const bySource = {};
    const byDivision = {};

    for (const s of blankCityState) {
      const campCount = campsBySchoolId[s.id] || 0;
      const entry = {
        id: s.id,
        name: s.school_name,
        source: s.source_platform,
        division: s.division || null,
        conference: s.conference || null,
        nickname: s.athletics_nickname || null,
        hasLogo: !!(s.athletic_logo_url || s.logo_url),
        campCount,
      };
      
      if (campCount > 0) {
        blankWithCamps.push(entry);
      } else {
        blankWithoutCamps.push(entry);
      }

      const src = s.source_platform || "unknown";
      bySource[src] = (bySource[src] || 0) + 1;

      const div = s.division || "no_division";
      byDivision[div] = (byDivision[div] || 0) + 1;
    }

    // Also check if blank schools are duplicates of schools WITH city/state
    const normalizedWithCity = new Set(hasCityState.map(s => (s.normalized_name || s.school_name || "").toLowerCase().trim()));
    
    let likelyDuplicates = 0;
    let likelyUnique = 0;
    const sampleUnique = [];
    
    for (const s of blankCityState) {
      const norm = (s.normalized_name || s.school_name || "").toLowerCase().trim();
      // Check if a school with city/state has a similar name
      const hasDupe = normalizedWithCity.has(norm);
      if (hasDupe) {
        likelyDuplicates++;
      } else {
        likelyUnique++;
        if (sampleUnique.length < 30) {
          sampleUnique.push({
            id: s.id,
            name: s.school_name,
            normalized: s.normalized_name,
            source: s.source_platform,
            division: s.division,
            campCount: campsBySchoolId[s.id] || 0,
          });
        }
      }
    }

    return json({
      totalSchools: allSchools.length,
      withCityOrState: hasCityState.length,
      blankCityAndState: blankCityState.length,
      blankWithCamps: blankWithCamps.length,
      blankWithoutCamps: blankWithoutCamps.length,
      bySource,
      byDivision,
      likelyDuplicates,
      likelyUnique,
      sampleUniqueNoMatch: sampleUnique,
      sampleWithCamps: blankWithCamps.slice(0, 20),
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});