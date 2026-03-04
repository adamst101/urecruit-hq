import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function shiftDate(dateStr, targetYear, offsetDays) {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const origYear = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  if (!origYear || !month || !day) return null;

  // Shift to targetYear
  const d = new Date(Date.UTC(targetYear, month - 1, day));
  // Apply random offset
  d.setUTCDate(d.getUTCDate() + offsetDays);

  // Clamp to Apr 1 - Aug 31 of targetYear
  const minDate = new Date(Date.UTC(targetYear, 3, 1));  // Apr 1
  const maxDate = new Date(Date.UTC(targetYear, 7, 31)); // Aug 31
  if (d < minDate) return formatDate(minDate);
  if (d > maxDate) return formatDate(maxDate);
  return formatDate(d);
}

function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden" }, 403);

  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const dryRun = body.dryRun !== false && body.dryRun !== "false";
  const currentYear = new Date().getUTCFullYear();
  const targetYear = Number(body.targetYear) || (currentYear - 1);
  const clearExisting = !!body.clearExisting;
  const nowIso = new Date().toISOString();

  // Step 1: Clear existing if requested
  if (clearExisting && !dryRun) {
    try {
      const existing = await base44.entities.DemoCamp.filter(
        { demo_season_year: targetYear }, "created_date", 99999
      );
      for (let i = 0; i < existing.length; i++) {
        await base44.entities.DemoCamp.delete(String(existing[i].id));
        if (i % 20 === 19) await sleep(200);
      }
    } catch (e) { /* ignore */ }
  }

  // Step 2: Load source camps
  const sourceCamps = await base44.entities.Camp.filter(
    { active: true, ingestion_status: "active", source_platform: "footballcampsusa" },
    "start_date",
    99999
  );

  // Filter to those with start_date
  const eligible = sourceCamps.filter(c => c.start_date && c.start_date.length >= 10);

  // Step 3: Build demo records
  const demoRecords = [];
  const rng = () => Math.floor(Math.random() * 15) - 7; // -7 to +7

  for (let i = 0; i < eligible.length; i++) {
    const c = eligible[i];
    const offset = rng();

    const demoStart = shiftDate(c.start_date, targetYear, offset);
    const demoEnd = c.end_date ? shiftDate(c.end_date, targetYear, offset) : null;

    if (!demoStart) continue;

    demoRecords.push({
      camp_name: c.camp_name || "Camp",
      school_id: c.school_id || null,
      sport_id: c.sport_id || null,
      start_date: demoStart,
      end_date: demoEnd,
      city: c.city || null,
      state: c.state || null,
      price: c.price != null ? c.price : null,
      price_options: c.price_options || [],
      link_url: null,
      position_ids: c.position_ids || [],
      notes: c.notes || null,
      venue_name: c.venue_name || null,
      venue_address: c.venue_address || null,
      grades: c.grades || null,
      host_org: c.host_org || null,
      ryzer_program_name: c.ryzer_program_name || null,
      season_year: targetYear,
      source_platform: c.source_platform || "footballcampsusa",
      source_key: "demo:" + (c.source_key || c.id),
      source_url: null,
      ryzer_camp_id: null,
      active: true,
      last_seen_at: null,
      school_match_method: c.school_match_method || null,
      school_match_confidence: c.school_match_confidence || 0,
      last_ingested_at: nowIso,
      ingestion_status: "active",
      school_manually_verified: c.school_manually_verified || false,
      demo_source_id: String(c.id),
      demo_season_year: targetYear,
    });
  }

  // Compute date range
  let earliest = null;
  let latest = null;
  for (const r of demoRecords) {
    if (!earliest || r.start_date < earliest) earliest = r.start_date;
    if (!latest || r.start_date > latest) latest = r.start_date;
  }

  // Step 4: Insert in batches of 50
  let created = 0;
  if (!dryRun) {
    const batchSize = 50;
    for (let i = 0; i < demoRecords.length; i += batchSize) {
      const batch = demoRecords.slice(i, i + batchSize);
      try {
        await base44.entities.DemoCamp.bulkCreate(batch);
        created += batch.length;
      } catch (e) {
        // Fallback to individual creates
        for (const rec of batch) {
          try {
            await base44.entities.DemoCamp.create(rec);
            created++;
          } catch { /* skip */ }
        }
      }
      if (i + batchSize < demoRecords.length) await sleep(200);
    }
  }

  const sample = demoRecords.slice(0, 5).map(r => ({
    camp_name: r.camp_name,
    source_key: r.source_key,
    start_date: r.start_date,
    end_date: r.end_date,
    city: r.city,
    state: r.state,
    school_id: r.school_id,
    demo_source_id: r.demo_source_id,
    demo_season_year: r.demo_season_year,
  }));

  return json({
    ok: true,
    dryRun,
    targetYear,
    clearExisting,
    total_source_camps: eligible.length,
    demo_camps_created: dryRun ? 0 : created,
    demo_camps_would_create: demoRecords.length,
    date_range: { earliest, latest },
    sample,
  });
});