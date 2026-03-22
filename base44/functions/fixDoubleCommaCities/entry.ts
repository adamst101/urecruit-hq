import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;

  const camps = await base44.entities.Camp.filter({}, "source_key", 99999);

  let fixedCount = 0;
  let venueNamePopulated = 0;
  let venueNameMissing = 0;
  const fixedSamples = [];

  for (const c of camps) {
    const d = c.data || c;

    // Count venue stats
    if (d.venue_name) venueNamePopulated++;
    else venueNameMissing++;

    // Fix double-comma cities
    if (d.city && /,,/.test(d.city)) {
      const fixed = d.city.replace(/,+/g, "").trim();
      fixedCount++;
      if (fixedSamples.length < 20) {
        fixedSamples.push({ id: c.id, old_city: d.city, new_city: fixed, camp_name: d.camp_name });
      }
      if (!dryRun) {
        await base44.entities.Camp.update(c.id, { city: fixed });
      }
    }
  }

  return Response.json({
    ok: true,
    dryRun,
    totalCamps: camps.length,
    doubleCommaCitiesFixed: fixedCount,
    venueNamePopulated,
    venueNameMissing,
    fixedSamples,
  });
});