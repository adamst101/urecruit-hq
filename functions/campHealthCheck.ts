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

  // Load all camps
  const camps = await base44.entities.Camp.filter({}, "source_key", 99999);

  // 1. By ingestion_status
  const byIngestionStatus = {};
  // 2. By school_match_method
  const bySchoolMatchMethod = {};
  // 3. school_id IS null
  let schoolIdNull = 0;
  // 4. ryzer_program_name IS NOT null
  let rpnNotNull = 0;
  // 6. venue_name IS NOT null
  let venueNameNotNull = 0;

  for (const c of camps) {
    const d = c.data || c;

    const is = d.ingestion_status || "(null)";
    byIngestionStatus[is] = (byIngestionStatus[is] || 0) + 1;

    const smm = d.school_match_method || "(null)";
    bySchoolMatchMethod[smm] = (bySchoolMatchMethod[smm] || 0) + 1;

    if (!d.school_id) schoolIdNull++;
    if (d.ryzer_program_name) rpnNotNull++;
    if (d.venue_name) venueNameNotNull++;
  }

  // 5. HostOrgMapping by verified
  const mappings = await base44.entities.HostOrgMapping.filter({}, "lookup_key", 99999);
  const byVerified = { true: 0, false: 0 };
  for (const m of mappings) {
    const d = m.data || m;
    if (d.verified === true) byVerified["true"]++;
    else byVerified["false"]++;
  }

  return Response.json({
    totalCamps: camps.length,
    byIngestionStatus,
    bySchoolMatchMethod,
    schoolIdNull,
    rpnNotNull,
    rpnNull: camps.length - rpnNotNull,
    venueNameNotNull,
    venueNameNull: camps.length - venueNameNotNull,
    totalHostOrgMappings: mappings.length,
    hostOrgMappingByVerified: byVerified,
  });
});