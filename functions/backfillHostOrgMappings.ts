// functions/backfillHostOrgMappings.js
// Creates HostOrgMapping records from existing Camp data.
// Two passes:
//   1. Verified: school_manually_verified=true + has host_org or ryzer_program_name
//   2. Suggested: school_id populated with confidence >= 0.9
// Payload: { "dryRun": true }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x).trim();
}

function normalizeHostOrgKey(raw) {
  if (!raw) return "";
  var s = safeStr(raw).toLowerCase();
  s = s.replace(/\s*-\s*football\s*$/i, "");
  s = s.replace(/\s+football\s+camps?\s*$/i, "");
  s = s.replace(/\s+football\s*$/i, "");
  s = s.replace(/\s+camps?\s*$/i, "");
  return s.replace(/\s+/g, " ").trim();
}

Deno.serve(async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }
  var dryRun = body.dryRun !== false;

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  var Camp = base44.entities.Camp;
  var HostOrgMapping = base44.entities.HostOrgMapping;
  var School = base44.entities.School;

  // Load all schools for name lookup
  var allSchools = await School.filter({}, "school_name", 99999);
  var schoolById = {};
  for (var si = 0; si < (allSchools || []).length; si++) {
    var s = allSchools[si];
    if (s && s.id) schoolById[s.id] = s;
  }

  // Load existing mappings to avoid duplicates
  var existingMappings = await HostOrgMapping.filter({}, "lookup_key", 99999);
  var existingKeys = {};
  for (var ei = 0; ei < (existingMappings || []).length; ei++) {
    var em = existingMappings[ei];
    if (em) existingKeys[safeStr(em.lookup_key) + ":" + safeStr(em.key_type)] = true;
  }

  var allCamps = await Camp.filter({}, "source_key", 99999);

  var stats = { scanned: 0, verifiedCreated: 0, suggestedCreated: 0, skippedExisting: 0, skippedNoKey: 0, errors: 0 };
  var sample = [];

  async function tryCreate(lookupKey, rawValue, keyType, schoolId, verified, confidence, source) {
    var compositeKey = lookupKey + ":" + keyType;
    if (existingKeys[compositeKey]) { stats.skippedExisting++; return; }
    if (!lookupKey || lookupKey.length < 2) { stats.skippedNoKey++; return; }

    var schoolName = schoolById[schoolId] ? schoolById[schoolId].school_name : null;

    if (!dryRun) {
      try {
        await HostOrgMapping.create({
          lookup_key: lookupKey,
          raw_value: rawValue,
          key_type: keyType,
          school_id: schoolId,
          school_name: schoolName,
          verified: verified,
          confidence: confidence,
          match_count: 1,
          source: source,
        });
      } catch (e) { stats.errors++; return; }
    }

    existingKeys[compositeKey] = true;
    if (verified) stats.verifiedCreated++;
    else stats.suggestedCreated++;
    if (sample.length < 20) {
      sample.push({ lookupKey: lookupKey, keyType: keyType, schoolId: schoolId, schoolName: schoolName, verified: verified, source: source });
    }
  }

  for (var ci = 0; ci < (allCamps || []).length; ci++) {
    var c = allCamps[ci];
    if (!c) continue;
    stats.scanned++;

    var schoolId = safeStr(c.school_id);
    if (!schoolId) continue;

    var hostOrg = safeStr(c.host_org);
    var rpn = safeStr(c.ryzer_program_name);
    var hoKey = normalizeHostOrgKey(hostOrg);
    var rpnKey = normalizeHostOrgKey(rpn);

    // Pass 1: Verified mappings from manually verified camps
    if (c.school_manually_verified) {
      if (hoKey) await tryCreate(hoKey, hostOrg, "host_org", schoolId, true, 1.0, "backfill_verified");
      if (rpnKey) await tryCreate(rpnKey, rpn, "ryzer_program_name", schoolId, true, 1.0, "backfill_verified");
    }
    // Pass 2: Suggested mappings from high-confidence matches
    else if (c.school_match_confidence >= 0.9) {
      if (hoKey) await tryCreate(hoKey, hostOrg, "host_org", schoolId, false, c.school_match_confidence, "backfill_suggested");
      if (rpnKey) await tryCreate(rpnKey, rpn, "ryzer_program_name", schoolId, false, c.school_match_confidence, "backfill_suggested");
    }
  }

  return Response.json({
    ok: true,
    dryRun: dryRun,
    stats: stats,
    sample: sample,
  });
});