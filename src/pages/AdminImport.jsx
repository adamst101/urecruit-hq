// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "../api/base44Client";

// Entities (make sure src/api/entities.js exports these names)
import {
  Sport,
  School,
  SchoolSportSite,
  CampDemo,
  Camp,
  Position,
} from "../api/entities";

/**
 * ----------------------------
 * Utilities (Editor-safe)
 * ----------------------------
 */

function nowIso() {
  return new Date().toISOString();
}

function safeString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function toNumber(x, fallback) {
  var n = Number(x);
  return isNaN(n) ? fallback : n;
}

function lc(x) {
  return safeString(x).toLowerCase().trim();
}

function append(setter, line) {
  setter(function (prev) {
    return prev + line + "\n";
  });
}

/**
 * ----------------------------
 * Base44 SDK compatibility layer
 * (because Base44 projects vary)
 * ----------------------------
 */

async function entityList(entity, opts) {
  opts = opts || {};
  // Try common patterns in order.
  if (entity && typeof entity.list === "function") {
    // list({ where, orderBy, limit, offset })
    return await entity.list(opts);
  }
  if (entity && typeof entity.findMany === "function") {
    // findMany({ where, orderBy, take, skip })
    return await entity.findMany(opts);
  }
  if (entity && typeof entity.select === "function") {
    // select("*")... style (less common in Base44 SDK, more supabase-like)
    // We'll do a minimal call.
    return await entity.select(opts);
  }
  throw new Error("Entity does not support list/findMany/select in this project.");
}

async function entityFindOne(entity, where) {
  // Best-effort "first row" fetch
  var rows = await entityList(entity, { where: where, limit: 1 });
  if (Array.isArray(rows) && rows.length) return rows[0];
  // Some SDKs return { data: [...] }
  if (rows && rows.data && Array.isArray(rows.data) && rows.data.length) return rows.data[0];
  return null;
}

async function entityCreate(entity, data) {
  if (entity && typeof entity.create === "function") return await entity.create(data);
  if (entity && typeof entity.insert === "function") return await entity.insert(data);
  throw new Error("Entity does not support create/insert in this project.");
}

async function entityUpdate(entity, id, data) {
  if (entity && typeof entity.update === "function") return await entity.update(id, data);
  // Some SDKs do update({ where, data })
  if (entity && typeof entity.updateMany === "function") {
    return await entity.updateMany({ where: { id: id }, data: data });
  }
  throw new Error("Entity does not support update/updateMany in this project.");
}

/**
 * Function invoker compatibility:
 * - base44.functions.invoke("name", payload)
 * - base44.functions.name(payload)
 * - base44.invokeFunction("name", payload)
 * - base44.functions.call("name", payload)
 */
async function callFn(fnName, payload) {
  // 1) base44.functions.invoke
  if (base44 && base44.functions && typeof base44.functions.invoke === "function") {
    return await base44.functions.invoke(fnName, payload);
  }
  // 2) base44.invokeFunction
  if (base44 && typeof base44.invokeFunction === "function") {
    return await base44.invokeFunction(fnName, payload);
  }
  // 3) base44.functions.call
  if (base44 && base44.functions && typeof base44.functions.call === "function") {
    return await base44.functions.call(fnName, payload);
  }
  // 4) base44.functions[fnName]
  if (base44 && base44.functions && typeof base44.functions[fnName] === "function") {
    return await base44.functions[fnName](payload);
  }

  throw new Error(
    "Could not find a Base44 function invoker. Expected base44.functions.invoke/call or base44.functions[fn]."
  );
}

/**
 * ----------------------------
 * SportsUSA Site mapping (by sport)
 * You can override in UI.
 * ----------------------------
 */
function defaultSportsUSASiteUrl(sportName) {
  var s = lc(sportName);
  if (s === "football") return "https://www.footballcampsusa.com/";
  if (s === "baseball") return "https://www.baseballcampsusa.com/";
  if (s === "softball") return "https://www.softballcampsusa.com/";
  if (s === "soccer") return "https://www.soccersportsusa.com/";
  if (s === "volleyball") return "https://www.volleyballcampsusa.com/";
  // add more if needed
  return "";
}

/**
 * ----------------------------
 * AdminImport Page
 * ----------------------------
 */
export default function AdminImport() {
  // Top selector
  var [sports, setSports] = useState([]);
  var [selectedSportId, setSelectedSportId] = useState("");
  var selectedSport = useMemo(function () {
    for (var i = 0; i < sports.length; i++) {
      if (sports[i].id === selectedSportId) return sports[i];
    }
    return null;
  }, [sports, selectedSportId]);

  // Global controls
  var [dryRun, setDryRun] = useState(true);

  // Logs (per section)
  var [logSeed, setLogSeed] = useState("");
  var [logCamps, setLogCamps] = useState("");
  var [logPositions, setLogPositions] = useState("");
  var [logPromote, setLogPromote] = useState("");

  // Seed controls
  var [seedLimit, setSeedLimit] = useState(300);
  var [sportsUSASiteUrlOverride, setSportsUSASiteUrlOverride] = useState("");

  // Camps ingest controls
  var [maxSites, setMaxSites] = useState(5);
  var [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  var [maxEvents, setMaxEvents] = useState(25);
  var [testSiteUrl, setTestSiteUrl] = useState("");
  var [testSchoolSportSiteId, setTestSchoolSportSiteId] = useState("");

  // Promote controls
  var [promoteLimit, setPromoteLimit] = useState(500);

  // Functions (change here if your function names differ)
  var FN = useMemo(function () {
    return {
      seedSchools: "sportsUSASeedSchools",
      ingestCamps: "sportsUSAIngestCamps",
      // ryzerIngest: "ryzerIngest", // if you want to re-add later
    };
  }, []);

  // Load Sports
  useEffect(function () {
    var mounted = true;

    async function loadSports() {
      try {
        // Try list/findMany with ordering
        var rows = await entityList(Sport, {
          orderBy: [{ field: "sport_name", direction: "asc" }],
          limit: 200,
        });

        // Normalize possible shapes
        var arr = rows;
        if (rows && rows.data && Array.isArray(rows.data)) arr = rows.data;
        if (!Array.isArray(arr)) arr = [];

        if (!mounted) return;
        setSports(arr);

        if (arr.length && !selectedSportId) {
          setSelectedSportId(arr[0].id);
        }
      } catch (e) {
        // If this fails, dropdown will be empty.
      }
    }

    loadSports();

    return function () {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived: SportsUSA site URL for this selected sport
  var sportsUSASiteUrl = useMemo(function () {
    if (sportsUSASiteUrlOverride && safeString(sportsUSASiteUrlOverride).trim()) {
      return safeString(sportsUSASiteUrlOverride).trim();
    }
    if (!selectedSport) return "";
    return defaultSportsUSASiteUrl(selectedSport.sport_name);
  }, [selectedSport, sportsUSASiteUrlOverride]);

  /**
   * ----------------------------
   * Seed Schools from SportsUSA
   * Writes School + SchoolSportSite
   * ----------------------------
   */
  async function runSeedSchools() {
    setLogSeed("");

    if (!selectedSportId || !selectedSport) {
      append(setLogSeed, "[SportsUSA] ERROR: Select a sport first.");
      return;
    }
    if (!sportsUSASiteUrl) {
      append(setLogSeed, '[SportsUSA] ERROR: No SportsUSA site URL. Add an override URL and try again.');
      return;
    }

    append(setLogSeed, "[SportsUSA] Starting: SportsUSA School Seed (" + selectedSport.sport_name + ") @ " + nowIso());
    append(setLogSeed, "[SportsUSA] DryRun=" + dryRun + " | Limit=" + seedLimit);
    append(setLogSeed, "[SportsUSA] SiteUrl=" + sportsUSASiteUrl);

    try {
      var payload = {
        sportId: selectedSportId,
        sportName: selectedSport.sport_name,
        siteUrl: sportsUSASiteUrl,
        limit: toNumber(seedLimit, 300),
        dryRun: true, // function is collector only; we write here
      };

      var resp = await callFn(FN.seedSchools, payload);

      // Some SDKs wrap response
      if (resp && resp.data && resp.data.stats) resp = resp.data;

      if (!resp || !resp.stats) {
        append(setLogSeed, "[SportsUSA] ERROR: Missing response.stats");
        append(setLogSeed, JSON.stringify(resp || {}, null, 2));
        return;
      }

      append(setLogSeed, "[SportsUSA] SportsUSA fetched: schools_found=" + resp.stats.schools_found + " | http=" + resp.stats.http);

      if (resp.debug && resp.debug.sample && resp.debug.sample.length) {
        append(setLogSeed, "[SportsUSA] Sample (first 3):");
        for (var i = 0; i < Math.min(3, resp.debug.sample.length); i++) {
          var s = resp.debug.sample[i];
          append(setLogSeed, '- name="' + s.school_name + '" | logo="' + s.logo_url + '" | view="' + s.view_site_url + '"');
        }
      }

      if (dryRun) {
        append(setLogSeed, "[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      var schools = (resp && resp.schools) ? resp.schools : [];
      if (!Array.isArray(schools)) schools = [];

      append(setLogSeed, "[SportsUSA] Writing " + schools.length + " rows to School + SchoolSportSite…");

      var schoolsCreated = 0;
      var schoolsUpdated = 0;
      var sitesCreated = 0;
      var sitesUpdated = 0;
      var skipped = 0;
      var errors = 0;

      for (var r = 0; r < schools.length; r++) {
        var row = schools[r];

        var schoolName = safeString(row.school_name).trim();
        var logoUrl = row.logo_url || null;
        var campSiteUrl = row.view_site_url || null;
        var sourceKey = row.source_key || null;

        if (!schoolName || !campSiteUrl) {
          skipped += 1;
          continue;
        }

        try {
          // 1) Upsert School by school_name (simple + stable)
          var existingSchool = await entityFindOne(School, { school_name: schoolName });

          var schoolId = null;
          if (!existingSchool) {
            var created = await entityCreate(School, {
              school_name: schoolName,
              active: true,
              needs_review: false,
              school_type: "College/University",
              division: "Unknown",
              conference: null,
              city: null,
              state: null,
              country: "US",
              logo_url: logoUrl,
              website_url: null,
              source_platform: "sportsusa",
              source_school_url: campSiteUrl,
              source_key: sourceKey,
              last_seen_at: nowIso(),
            });
            schoolId = created && created.id ? created.id : (created && created.data && created.data.id ? created.data.id : null);
            schoolsCreated += 1;
          } else {
            schoolId = existingSchool.id;

            await entityUpdate(School, schoolId, {
              logo_url: logoUrl || existingSchool.logo_url || null,
              source_platform: existingSchool.source_platform || "sportsusa",
              source_school_url: existingSchool.source_school_url || campSiteUrl,
              source_key: existingSchool.source_key || sourceKey,
              last_seen_at: nowIso(),
              active: true,
            });

            schoolsUpdated += 1;
          }

          if (!schoolId) {
            errors += 1;
            append(setLogSeed, "[SportsUSA] ERROR: Could not resolve schoolId for " + schoolName);
            continue;
          }

          // 2) Upsert SchoolSportSite by (school_id, sport_id)
          var existingSite = await entityFindOne(SchoolSportSite, {
            school_id: schoolId,
            sport_id: selectedSportId,
          });

          var computedSourceKey = sourceKey;
          if (!computedSourceKey) {
            computedSourceKey = "sportsusa:" + lc(selectedSport.sport_name) + ":" + lc(campSiteUrl);
          }

          if (!existingSite) {
            await entityCreate(SchoolSportSite, {
              school_id: schoolId,
              sport_id: selectedSportId,
              camp_site_url: campSiteUrl,
              logo_url: logoUrl,
              source_platform: "sportsusa",
              source_key: computedSourceKey,
              active: true,
              needs_review: false,
              last_seen_at: nowIso(),
            });
            sitesCreated += 1;
          } else {
            await entityUpdate(SchoolSportSite, existingSite.id, {
              camp_site_url: campSiteUrl,
              logo_url: logoUrl || existingSite.logo_url || null,
              source_platform: existingSite.source_platform || "sportsusa",
              source_key: existingSite.source_key || computedSourceKey,
              active: true,
              last_seen_at: nowIso(),
            });
            sitesUpdated += 1;
          }

          if ((r + 1) % 10 === 0) {
            append(
              setLogSeed,
              "[SportsUSA] Progress " +
                (r + 1) +
                "/" +
                schools.length +
                " | Schools c/u=" +
                schoolsCreated +
                "/" +
                schoolsUpdated +
                " | Sites c/u=" +
                sitesCreated +
                "/" +
                sitesUpdated +
                " | skipped=" +
                skipped +
                " errors=" +
                errors
            );
          }
        } catch (e) {
          errors += 1;
          append(setLogSeed, "[SportsUSA] ERROR row " + (r + 1) + ": " + safeString((e && e.message) || e));
        }
      }

      append(
        setLogSeed,
        "[SportsUSA] Writes done. Schools: created=" +
          schoolsCreated +
          " updated=" +
          schoolsUpdated +
          " | Sites: created=" +
          sitesCreated +
          " updated=" +
          sitesUpdated +
          " | skipped=" +
          skipped +
          " errors=" +
          errors
      );
    } catch (e2) {
      append(setLogSeed, "[SportsUSA] ERROR: " + safeString((e2 && e2.message) || e2));
    }
  }

  /**
   * ----------------------------
   * Camps ingest from SchoolSportSite -> CampDemo
   * Uses backend function sportsUSAIngestCamps
   * ----------------------------
   */
  async function runCampsIngest() {
    setLogCamps("");

    if (!selectedSportId || !selectedSport) {
      append(setLogCamps, "[Camps] ERROR: Select a sport first.");
      return;
    }

    append(setLogCamps, "[Camps] Starting: SportsUSA Camps Ingest (" + selectedSport.sport_name + ") @ " + nowIso());
    append(
      setLogCamps,
      "[Camps] DryRun=" +
        dryRun +
        " | MaxSites=" +
        maxSites +
        " | MaxRegsPerSite=" +
        maxRegsPerSite +
        " | MaxEvents=" +
        maxEvents
    );

    try {
      var sites = await entityList(SchoolSportSite, {
        where: { sport_id: selectedSportId, active: true },
        limit: 5000,
      });

      if (sites && sites.data && Array.isArray(sites.data)) sites = sites.data;
      if (!Array.isArray(sites)) sites = [];

      append(setLogCamps, "[Camps] Loaded SchoolSportSite rows: " + sites.length + " (active)");

      var siteUrls = [];
      for (var i = 0; i < sites.length; i++) {
        if (sites[i] && sites[i].camp_site_url) siteUrls.push(sites[i].camp_site_url);
      }

      var payload = {
        sportId: selectedSportId,
        sportName: selectedSport.sport_name,
        dryRun: !!dryRun,
        maxSites: toNumber(maxSites, 5),
        maxRegsPerSite: toNumber(maxRegsPerSite, 10),
        maxEvents: toNumber(maxEvents, 25),

        // Testing knobs:
        testSiteUrl: safeString(testSiteUrl).trim() ? safeString(testSiteUrl).trim() : null,
        testSchoolSportSiteId: safeString(testSchoolSportSiteId).trim() ? safeString(testSchoolSportSiteId).trim() : null,

        // Normal mode uses list
        siteUrls: safeString(testSiteUrl).trim() || safeString(testSchoolSportSiteId).trim() ? null : siteUrls,
      };

      var resp = await callFn(FN.ingestCamps, payload);
      if (resp && resp.data && (resp.data.stats || resp.data.version)) resp = resp.data;

      var version = (resp && (resp.version || (resp.debug && resp.debug.version))) || "MISSING";
      append(setLogCamps, "[Camps] Function version: " + version);

      if (resp && resp.stats) {
        append(
          setLogCamps,
          "[Camps] Function stats: processedSites=" +
            resp.stats.processedSites +
            " processedRegs=" +
            resp.stats.processedRegs +
            " accepted=" +
            resp.stats.accepted +
            " rejected=" +
            resp.stats.rejected +
            " errors=" +
            resp.stats.errors
        );
      }

      if (resp && resp.debug && resp.debug.siteDebug && resp.debug.siteDebug.length) {
        var sd = resp.debug.siteDebug[0];
        append(setLogCamps, "[Camps] Site debug (first 1):");
        append(
          setLogCamps,
          "- schoolSportSiteId=" +
            safeString(sd.schoolSportSiteId) +
            " http=" +
            safeString(sd.http) +
            " htmlType=" +
            safeString(sd.htmlType) +
            " regLinks=" +
            safeString(sd.regLinks) +
            " sample=" +
            safeString(sd.sample) +
            " notes=" +
            safeString(sd.notes)
        );
      }

      if (resp && resp.debug && resp.debug.firstSiteHtmlSnippet) {
        append(setLogCamps, "[Camps] First site HTML snippet (debug):");
        append(setLogCamps, resp.debug.firstSiteHtmlSnippet);
      }

      if (resp && resp.accepted && resp.accepted.length) {
        append(setLogCamps, "[Camps] Accepted events returned: " + resp.accepted.length);
        append(setLogCamps, "[Camps] Sample (first 3):");
        for (var j = 0; j < Math.min(3, resp.accepted.length); j++) {
          var ev = resp.accepted[j].event || resp.accepted[j];
          append(
            setLogCamps,
            '- camp="' + safeString(ev.camp_name) + '" start=' + safeString(ev.start_date || "n/a") + " url=" + safeString(ev.link_url || "")
          );
        }
      } else {
        if (resp && resp.rejected_samples && resp.rejected_samples.length) {
          append(setLogCamps, "[Camps] Rejected samples (first 5):");
          for (var k = 0; k < Math.min(5, resp.rejected_samples.length); k++) {
            var rj = resp.rejected_samples[k];
            append(
              setLogCamps,
              "- reason=" +
                safeString(rj.reason) +
                ' title="' +
                safeString(rj.title) +
                '" url=' +
                safeString(rj.registrationUrl) +
                " datesLine=" +
                safeString(rj.event_dates_line)
            );
          }
        } else {
          append(setLogCamps, "[Camps] No accepted events returned from function.");
        }
      }
    } catch (e) {
      append(setLogCamps, "[Camps] ERROR: " + safeString((e && e.message) || e));
    }
  }

  /**
   * ----------------------------
   * Positions: Auto-seed (simple starter set)
   * ----------------------------
   */
  async function autoSeedPositions() {
    setLogPositions("");
    append(setLogPositions, "[Positions] Starting auto-seed @ " + nowIso());

    // Minimal football starter set; expand later (you already have picklists elsewhere)
    var defaults = [
      { code: "QB", name: "Quarterback" },
      { code: "RB", name: "Running Back" },
      { code: "WR", name: "Wide Receiver" },
      { code: "TE", name: "Tight End" },
      { code: "OL", name: "Offensive Line" },
      { code: "DL", name: "Defensive Line" },
      { code: "LB", name: "Linebacker" },
      { code: "DB", name: "Defensive Back" },
      { code: "K", name: "Kicker" },
      { code: "P", name: "Punter" },
      { code: "LS", name: "Long Snapper" },
    ];

    var created = 0;
    var updated = 0;
    var errors = 0;

    for (var i = 0; i < defaults.length; i++) {
      try {
        var ex = await entityFindOne(Position, { code: defaults[i].code });
        if (!ex) {
          await entityCreate(Position, {
            code: defaults[i].code,
            name: defaults[i].name,
          });
          created += 1;
        } else {
          await entityUpdate(Position, ex.id, {
            name: defaults[i].name,
          });
          updated += 1;
        }
      } catch (e) {
        errors += 1;
        append(setLogPositions, "[Positions] ERROR " + defaults[i].code + ": " + safeString((e && e.message) || e));
      }
    }

    append(setLogPositions, "[Positions] Done. created=" + created + " updated=" + updated + " errors=" + errors);
  }

  /**
   * ----------------------------
   * Promote CampDemo -> Camp (upsert by event_key)
   * ----------------------------
   */
  async function runPromote() {
    setLogPromote("");

    if (!selectedSportId || !selectedSport) {
      append(setLogPromote, "[Promote] ERROR: Select a sport first.");
      return;
    }

    append(setLogPromote, "[Promote] Starting promote CampDemo -> Camp (" + selectedSport.sport_name + ") @ " + nowIso());
    append(setLogPromote, "[Promote] Limit=" + promoteLimit);

    try {
      var rows = await entityList(CampDemo, {
        where: { sport_id: selectedSportId },
        limit: toNumber(promoteLimit, 500),
      });
      if (rows && rows.data && Array.isArray(rows.data)) rows = rows.data;
      if (!Array.isArray(rows)) rows = [];

      append(setLogPromote, "[Promote] Loaded CampDemo rows: " + rows.length);

      var created = 0;
      var updated = 0;
      var skipped = 0;
      var errors = 0;

      for (var i = 0; i < rows.length; i++) {
        var d = rows[i];
        var eventKey = d.event_key;

        if (!eventKey) {
          skipped += 1;
          continue;
        }

        try {
          var existing = await entityFindOne(Camp, { event_key: eventKey });

          var payload = {
            school_id: d.school_id,
            sport_id: d.sport_id,
            camp_name: d.camp_name,
            start_date: d.start_date,
            end_date: d.end_date || null,
            city: d.city || null,
            state: d.state || null,
            position_ids: d.position_ids || [],
            price: d.price || null,
            link_url: d.link_url || null,
            notes: d.notes || null,
            season_year: d.season_year,
            program_id: d.program_id,
            event_key: d.event_key,
            source_platform: d.source_platform || "sportsusa",
            source_url: d.source_url || null,
            last_seen_at: nowIso(),
            content_hash: d.content_hash || null,
            event_dates_raw: d.event_dates_raw || null,
            grades_raw: d.grades_raw || null,
            register_by_raw: d.register_by_raw || null,
            price_raw: d.price_raw || null,
            price_min: d.price_min || null,
            price_max: d.price_max || null,
            sections_json: d.sections_json || null,
          };

          if (!existing) {
            await entityCreate(Camp, payload);
            created += 1;
          } else {
            await entityUpdate(Camp, existing.id, payload);
            updated += 1;
          }

          if ((i + 1) % 25 === 0) {
            append(setLogPromote, "[Promote] Progress " + (i + 1) + "/" + rows.length + " created=" + created + " updated=" + updated + " skipped=" + skipped + " errors=" + errors);
          }
        } catch (e) {
          errors += 1;
          append(setLogPromote, "[Promote] ERROR row " + (i + 1) + ": " + safeString((e && e.message) || e));
        }
      }

      append(setLogPromote, "[Promote] Done. created=" + created + " updated=" + updated + " skipped=" + skipped + " errors=" + errors);
    } catch (e2) {
      append(setLogPromote, "[Promote] ERROR: " + safeString((e2 && e2.message) || e2));
    }
  }

  /**
   * ----------------------------
   * UI
   * ----------------------------
   */
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Admin Import</h2>
          <div style={{ color: "#555", fontSize: 13 }}>Admin tools for seeding schools, ingesting camps, and promoting into Camp.</div>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Selected Sport (drives all tools)</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedSportId}
            onChange={(e) => setSelectedSportId(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          >
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sport_name}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry Run
          </label>
        </div>
      </div>

      {/* Seed schools */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 600 }}>Seed Schools from SportsUSA directory</div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
          Pulls school tiles from the SportsUSA directory and writes to School + SchoolSportSite.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Write limit</div>
            <input
              value={seedLimit}
              onChange={(e) => setSeedLimit(e.target.value)}
              style={{ padding: 8, width: 120 }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>SportsUSA directory URL (override optional)</div>
            <input
              value={sportsUSASiteUrlOverride}
              onChange={(e) => setSportsUSASiteUrlOverride(e.target.value)}
              placeholder={sportsUSASiteUrl || "https://www.footballcampsusa.com/"}
              style={{ padding: 8 }}
            />
            <div style={{ fontSize: 12, color: "#777" }}>
              Default for this sport: <span style={{ fontFamily: "monospace" }}>{sportsUSASiteUrl}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={runSeedSchools} style={{ padding: "10px 14px" }}>
              Run Seed
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Log</div>
          <textarea value={logSeed} readOnly style={{ width: "100%", height: 160, padding: 10, fontFamily: "monospace", fontSize: 12 }} />
        </div>
      </div>

      {/* Camps ingest */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 600 }}>Ingest Camps from SchoolSportSite</div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
          Crawls each school’s camp site URL to find registration links and writes occurrences into CampDemo.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Max sites</div>
            <input value={maxSites} onChange={(e) => setMaxSites(e.target.value)} style={{ padding: 8, width: 120 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Max regs per site</div>
            <input value={maxRegsPerSite} onChange={(e) => setMaxRegsPerSite(e.target.value)} style={{ padding: 8, width: 140 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Max events</div>
            <input value={maxEvents} onChange={(e) => setMaxEvents(e.target.value)} style={{ padding: 8, width: 120 }} />
          </div>

          <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Test Site URL (optional)</div>
            <input
              value={testSiteUrl}
              onChange={(e) => setTestSiteUrl(e.target.value)}
              placeholder="https://www.hardingfootballcamps.com/"
              style={{ padding: 8 }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Test SchoolSportSite ID (optional)</div>
            <input
              value={testSchoolSportSiteId}
              onChange={(e) => setTestSchoolSportSiteId(e.target.value)}
              placeholder="paste SchoolSportSite.id"
              style={{ padding: 8 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={runCampsIngest} style={{ padding: "10px 14px" }}>
              Run Camps Ingest
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Log</div>
          <textarea value={logCamps} readOnly style={{ width: "100%", height: 180, padding: 10, fontFamily: "monospace", fontSize: 12 }} />
        </div>
      </div>

      {/* Positions */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 600 }}>Manage Positions</div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
          Auto-seeds a minimal starter set (you can expand later).
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
          <button onClick={autoSeedPositions} style={{ padding: "10px 14px" }}>
            Auto-seed positions
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Log</div>
          <textarea value={logPositions} readOnly style={{ width: "100%", height: 120, padding: 10, fontFamily: "monospace", fontSize: 12 }} />
        </div>
      </div>

      {/* Promote */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 600 }}>Promote CampDemo → Camp</div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
          Upserts each Camp occurrence by <span style={{ fontFamily: "monospace" }}>event_key</span>.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Promote limit</div>
            <input value={promoteLimit} onChange={(e) => setPromoteLimit(e.target.value)} style={{ padding: 8, width: 120 }} />
          </div>

          <button onClick={runPromote} style={{ padding: "10px 14px" }}>
            Run Promote
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Log</div>
          <textarea value={logPromote} readOnly style={{ width: "100%", height: 160, padding: 10, fontFamily: "monospace", fontSize: 12 }} />
        </div>
      </div>

      <div style={{ marginTop: 18, color: "#666", fontSize: 12 }}>
        Tip: If a section fails, copy the full log into chat and we’ll tighten the exact SDK calls your project supports.
      </div>
    </div>
  );
}

