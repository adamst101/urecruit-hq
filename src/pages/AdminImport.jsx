// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Inline helpers (editor-safe)
----------------------------- */
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeString(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  return s ? s : null;
}
function safeNumber(x) {
  var n = Number(x);
  return isFinite(n) ? n : null;
}
function safeObject(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return x;
}
function tryParseJson(value) {
  if (typeof value !== "string") return value;
  var s = value.trim();
  if (!s) return value;
  if (!(s.indexOf("{") === 0 || s.indexOf("[") === 0)) return value;
  try {
    return JSON.parse(s);
  } catch (e) {
    return value;
  }
}
function normalizeStringArray(value) {
  var v = tryParseJson(value);
  if (Array.isArray(v)) {
    return v
      .map(function (x) {
        if (x === null || x === undefined) return null;
        var s = String(x).trim();
        return s ? s : null;
      })
      .filter(function (x) {
        return !!x;
      });
  }
  var one = safeString(v);
  return one ? [one] : [];
}
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

// Return YYYY-MM-DD (UTC-ish) or null
function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    var s = dateInput.trim();
    var mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      var mm = String(mdy[1]).padStart(2, "0");
      var dd = String(mdy[2]).padStart(2, "0");
      var yyyy = String(mdy[3]);
      return yyyy + "-" + mm + "-" + dd;
    }
  }

  var d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  var yyyy2 = d.getUTCFullYear();
  var mm2 = String(d.getUTCMonth() + 1).padStart(2, "0");
  var dd2 = String(d.getUTCDate()).padStart(2, "0");
  return yyyy2 + "-" + mm2 + "-" + dd2;
}

// Football rollover: Feb 1 (UTC-ish)
function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  var d = new Date(startDateISO + "T00:00:00.000Z");
  if (isNaN(d.getTime())) return null;

  var y = d.getUTCFullYear();
  var feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}

// Simple stable hash (not cryptographic)
function simpleHash(obj) {
  var str = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return "h" + String(Math.abs(h));
}

function buildEventKey(opts) {
  var source_platform = opts && opts.source_platform ? opts.source_platform : "seed";
  var program_id = opts && opts.program_id ? opts.program_id : "na";
  var start_date = opts && opts.start_date ? opts.start_date : "na";
  var disc = opts && (opts.link_url || opts.source_url) ? (opts.link_url || opts.source_url) : "na";
  return source_platform + ":" + program_id + ":" + start_date + ":" + disc;
}

function seedProgramId(school_id, camp_name) {
  return "seed:" + String(school_id || "na") + ":" + slugify(camp_name || "camp");
}

async function tryDelete(Entity, id) {
  if (!Entity || !id) return false;
  var fns = ["delete", "remove", "destroy"];
  for (var i = 0; i < fns.length; i++) {
    var fn = fns[i];
    try {
      if (typeof Entity[fn] === "function") {
        await Entity[fn](String(id));
        return true;
      }
    } catch (e) {}
  }
  return false;
}

/* ----------------------------
   Routes (hardcoded)
----------------------------- */
var ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   SportsUSA directory URLs (per sport)
   You can expand as you enable more sports.
----------------------------- */
var SPORTSUSA_DIRECTORY_BY_SPORTNAME = {
  Football: "https://www.footballcampsusa.com",
  Baseball: "https://www.baseballcampsusa.com",
  Soccer: "https://www.soccercampsusa.com",
  Volleyball: "https://www.volleyballcampsusa.com",
  Softball: "https://www.softballcampsusa.com",
};

export default function AdminImport() {
  var nav = useNavigate();

  // Entities
  var SportEntity = base44 && base44.entities ? (base44.entities.Sport || base44.entities.Sports) : null;
  var PositionEntity = base44 && base44.entities ? (base44.entities.Position || base44.entities.Positions) : null;
  var SchoolEntity = base44 && base44.entities ? (base44.entities.School || base44.entities.Schools) : null;
  var SchoolSportSiteEntity =
    base44 && base44.entities ? (base44.entities.SchoolSportSite || base44.entities.SchoolSportSites) : null;
  var CampDemoEntity = base44 && base44.entities ? base44.entities.CampDemo : null;

  // Global selected sport (single selector drives all sections)
  var [sports, setSports] = useState([]);
  var [sportsLoading, setSportsLoading] = useState(false);
  var [selectedSportId, setSelectedSportId] = useState("");
  var [selectedSportName, setSelectedSportName] = useState("");

  // Positions list
  var [positions, setPositions] = useState([]);
  var [positionsLoading, setPositionsLoading] = useState(false);

  // Per-section logs (unique)
  var [sportsUSALog, setSportsUSALog] = useState("");
  var [sportsUSACampsLog, setSportsUSACampsLog] = useState("");
  var [promoteLog, setPromoteLog] = useState("");

  function appendSportsUSALog(line) {
    setSportsUSALog(function (prev) {
      return prev ? prev + "\n" + line : line;
    });
  }
  function appendSportsUSACampsLog(line) {
    setSportsUSACampsLog(function (prev) {
      return prev ? prev + "\n" + line : line;
    });
  }
  function appendPromoteLog(line) {
    setPromoteLog(function (prev) {
      return prev ? prev + "\n" + line : line;
    });
  }

  // SportsUSA seed controls
  var [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  var [sportsUSALimit, setSportsUSALimit] = useState(300);
  var [sportsUSADirectoryUrl, setSportsUSADirectoryUrl] = useState("");

  var [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  var [sportsUSAStats, setSportsUSAStats] = useState({ createdSchools: 0, updatedSchools: 0, createdSites: 0, updatedSites: 0, skipped: 0, errors: 0 });

  // Camps ingest controls
  var [campsDryRun, setCampsDryRun] = useState(true);
  var [campsMaxSites, setCampsMaxSites] = useState(25);
  var [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(8);
  var [campsMaxEvents, setCampsMaxEvents] = useState(100);
  var [campsWorking, setCampsWorking] = useState(false);
  var [campsWriteStats, setCampsWriteStats] = useState({ created: 0, updated: 0, skipped: 0, errors: 0 });

  // Promote stats
  var [promoteWorking, setPromoteWorking] = useState(false);
  var [promoteStats, setPromoteStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  // Load Sports
  async function loadSports() {
    if (!SportEntity || !SportEntity.filter) return;
    setSportsLoading(true);
    try {
      var rows = asArray(await SportEntity.filter({}));
      var normalized = rows
        .map(function (r) {
          var id = r && r.id ? String(r.id) : "";
          var name = safeString(r && (r.sport_name || r.name || r.sportName)) || "";
          var active = true;
          if (typeof (r && r.active) === "boolean") active = r.active;
          return { id: id, name: name, active: active };
        })
        .filter(function (r) {
          return r.id && r.name;
        });

      normalized.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

      setSports(normalized);

      // Auto-select if none
      if (!selectedSportId && normalized.length) {
        setSelectedSportId(normalized[0].id);
        setSelectedSportName(normalized[0].name);
      } else if (selectedSportId) {
        var hit = null;
        for (var i = 0; i < normalized.length; i++) {
          if (normalized[i].id === selectedSportId) hit = normalized[i];
        }
        if (hit) setSelectedSportName(hit.name);
      }
    } catch (e) {
      // noop
    } finally {
      setSportsLoading(false);
    }
  }

  // Load Positions for sport
  async function loadPositionsForSport(sportId) {
    if (!PositionEntity || !PositionEntity.filter || !sportId) {
      setPositions([]);
      return;
    }
    setPositionsLoading(true);
    try {
      var rows = asArray(await PositionEntity.filter({ sport_id: sportId }));
      var normalized = rows
        .map(function (r) {
          return {
            id: r && r.id ? String(r.id) : "",
            code: String((r && r.position_code) || "").trim(),
            name: String((r && r.position_name) || "").trim(),
          };
        })
        .filter(function (p) { return p.id; });

      normalized.sort(function (a, b) {
        return (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || "");
      });

      setPositions(normalized);
    } catch (e2) {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }

  useEffect(function () {
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(function () {
    if (!selectedSportId) return;
    loadPositionsForSport(selectedSportId);

    // Auto-fill SportsUSA directory URL when sport changes
    var guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSADirectoryUrl(guess);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId, selectedSportName]);

  /* ----------------------------
     CampDemo upsert
  ----------------------------- */
  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity || !CampDemoEntity.filter || !CampDemoEntity.create || !CampDemoEntity.update) {
      throw new Error("CampDemo entity not available (expected entities.CampDemo).");
    }
    var key = payload && payload.event_key;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    var existing = [];
    try {
      existing = await CampDemoEntity.filter({ event_key: key });
    } catch (e) {
      existing = [];
    }

    var arr = asArray(existing);
    if (arr.length > 0 && arr[0] && arr[0].id) {
      await CampDemoEntity.update(arr[0].id, payload);
      return "updated";
    }

    await CampDemoEntity.create(payload);
    return "created";
  }

  /* ----------------------------
     SportsUSA: Seed Schools + SchoolSportSite
     Calls /functions/sportsUSASeedSchools
  ----------------------------- */
  async function upsertSchoolBySourceKeyOrName(item, runIso) {
    if (!SchoolEntity || !SchoolEntity.filter || !SchoolEntity.create || !SchoolEntity.update) {
      throw new Error("School entity not available.");
    }

    var schoolName = safeString(item && item.school_name);
    if (!schoolName) return { action: "skip", reason: "missing_school_name" };

    var sourceKey = safeString(item && item.source_key);
    var normalizedName = lc(schoolName)
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 1) Try match by source_key (if you store it)
    var existing = [];
    try {
      existing = sourceKey ? asArray(await SchoolEntity.filter({ source_key: sourceKey })) : [];
    } catch (e0) {
      existing = [];
    }

    // 2) Fallback: match by normalized_name
    if (!existing.length) {
      try {
        existing = normalizedName ? asArray(await SchoolEntity.filter({ normalized_name: normalizedName })) : [];
      } catch (e1) {
        existing = [];
      }
    }

    // 3) Fallback: match by school_name exact
    if (!existing.length) {
      try {
        existing = asArray(await SchoolEntity.filter({ school_name: schoolName }));
      } catch (e2) {
        existing = [];
      }
    }

    var payload = {
      school_name: schoolName,
      normalized_name: normalizedName,
      school_type: "College/University",
      active: true,
      needs_review: true,
      division: "Unknown",
      conference: null,
      city: null,
      state: null,
      country: "US",
      logo_url: safeString(item && item.logo_url) || null,
      website_url: safeString(item && item.view_site_url) || null,

      source_platform: "sportsusa",
      source_school_url: safeString(item && item.source_school_url) || safeString(item && item.view_site_url) || null,
      source_key: sourceKey || null,
      last_seen_at: runIso,
      aliases_json: "[]",
    };

    if (existing.length && existing[0] && existing[0].id) {
      await SchoolEntity.update(String(existing[0].id), payload);
      return { action: "updated", school_id: String(existing[0].id) };
    }

    var created = await SchoolEntity.create(payload);
    var newId = created && created.id ? String(created.id) : null;

    // if create() doesn't return id, refetch by name
    if (!newId) {
      try {
        var ref = asArray(await SchoolEntity.filter({ school_name: schoolName }));
        if (ref.length && ref[0] && ref[0].id) newId = String(ref[0].id);
      } catch (e3) {}
    }

    return { action: "created", school_id: newId };
  }

  async function upsertSchoolSportSite(schoolId, sportId, item, runIso) {
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter || !SchoolSportSiteEntity.create || !SchoolSportSiteEntity.update) {
      throw new Error("SchoolSportSite entity not available.");
    }

    var campSiteUrl = safeString(item && (item.view_site_url || item.camp_site_url));
    if (!schoolId || !sportId || !campSiteUrl) return { action: "skip", reason: "missing_fields" };

    var sourceKey = safeString(item && item.source_key) || ("sportsusa:" + String(sportId) + ":" + lc(campSiteUrl));

    // match by source_key first
    var existing = [];
    try {
      existing = asArray(await SchoolSportSiteEntity.filter({ source_key: sourceKey }));
    } catch (e0) {
      existing = [];
    }

    // fallback: school_id + sport_id + camp_site_url
    if (!existing.length) {
      try {
        existing = asArray(await SchoolSportSiteEntity.filter({ school_id: schoolId, sport_id: sportId, camp_site_url: campSiteUrl }));
      } catch (e1) {
        existing = [];
      }
    }

    var payload = {
      school_id: schoolId,
      sport_id: sportId,
      camp_site_url: campSiteUrl,
      logo_url: safeString(item && item.logo_url) || null,
      source_platform: "sportsusa",
      source_key: sourceKey,
      active: true,
      needs_review: true,
      last_seen_at: runIso,
    };

    if (existing.length && existing[0] && existing[0].id) {
      await SchoolSportSiteEntity.update(String(existing[0].id), payload);
      return { action: "updated" };
    }

    await SchoolSportSiteEntity.create(payload);
    return { action: "created" };
  }

  async function runSportsUSASeedSchools() {
    if (!selectedSportId) return appendSportsUSALog("[SportsUSA] ERROR: Select a sport first.");
    if (!safeString(sportsUSADirectoryUrl)) return appendSportsUSALog("[SportsUSA] ERROR: Provide SportsUSA directory URL (e.g., https://www.footballcampsusa.com).");
    if (!SchoolEntity || !SchoolSportSiteEntity) return appendSportsUSALog("[SportsUSA] ERROR: School / SchoolSportSite entities not available.");

    var runIso = new Date().toISOString();

    setSportsUSAWorking(true);
    setSportsUSAStats({ createdSchools: 0, updatedSchools: 0, createdSites: 0, updatedSites: 0, skipped: 0, errors: 0 });
    setSportsUSALog("");

    appendSportsUSALog("[SportsUSA] Starting: SportsUSA School Seed (" + selectedSportName + ") @ " + runIso);
    appendSportsUSALog("[SportsUSA] DryRun=" + (sportsUSADryRun ? "true" : "false") + " | Limit=" + sportsUSALimit);
    appendSportsUSALog("[SportsUSA] Directory=" + sportsUSADirectoryUrl);

    try {
      var res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl: sportsUSADirectoryUrl,
          limit: sportsUSALimit,
          dryRun: true, // collector always returns data; DB writes happen in AdminImport
        }),
      });

      var data = await res.json().catch(function () { return null; });

      if (!res.ok) {
        appendSportsUSALog("[SportsUSA] ERROR: SportsUSA function ERROR (HTTP " + res.status + ")");
        appendSportsUSALog(JSON.stringify(data || {}, null, 2));
        return;
      }

      var schools = asArray(data && data.schools);
      var http = data && data.stats ? data.stats.http : null;

      appendSportsUSALog("[SportsUSA] SportsUSA fetched: schools_found=" + schools.length + " | http=" + String(http || "n/a"));

      var sample = schools.slice(0, 3);
      if (sample.length) {
        appendSportsUSALog("[SportsUSA] SportsUSA sample (first " + sample.length + "):");
        for (var i = 0; i < sample.length; i++) {
          appendSportsUSALog(
            '- name="' + (sample[i].school_name || "") + '" | logo="' + (sample[i].logo_url || "") + '" | view="' + (sample[i].view_site_url || "") + '"'
          );
        }
      }

      if (sportsUSADryRun) {
        appendSportsUSALog("[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      appendSportsUSALog("[SportsUSA] Writing " + schools.length + " rows to School + SchoolSportSite…");

      var createdSchools = 0;
      var updatedSchools = 0;
      var createdSites = 0;
      var updatedSites = 0;
      var skipped = 0;
      var errors = 0;

      for (var j = 0; j < schools.length; j++) {
        var item = schools[j];

        try {
          var r1 = await upsertSchoolBySourceKeyOrName(item, runIso);
          if (r1.action === "skip") {
            skipped += 1;
            continue;
          }

          if (r1.action === "created") createdSchools += 1;
          if (r1.action === "updated") updatedSchools += 1;

          var schoolId = r1.school_id;

          var r2 = await upsertSchoolSportSite(schoolId, selectedSportId, item, runIso);
          if (r2.action === "created") createdSites += 1;
          if (r2.action === "updated") updatedSites += 1;

          if ((j + 1) % 10 === 0) {
            appendSportsUSALog(
              "[SportsUSA] Progress " +
                String(j + 1) +
                "/" +
                String(schools.length) +
                " | Schools c/u=" +
                String(createdSchools) +
                "/" +
                String(updatedSchools) +
                " | Sites c/u=" +
                String(createdSites) +
                "/" +
                String(updatedSites) +
                " | skipped=" +
                String(skipped) +
                " errors=" +
                String(errors)
            );
          }

          await sleep(25);
        } catch (e4) {
          errors += 1;
          appendSportsUSALog("[SportsUSA] ERROR row #" + String(j + 1) + ": " + String((e4 && e4.message) || e4));
        }

        setSportsUSAStats({
          createdSchools: createdSchools,
          updatedSchools: updatedSchools,
          createdSites: createdSites,
          updatedSites: updatedSites,
          skipped: skipped,
          errors: errors,
        });
      }

      appendSportsUSALog(
        "[SportsUSA] Writes done. Schools: created=" +
          String(createdSchools) +
          " updated=" +
          String(updatedSchools) +
          " | Sites: created=" +
          String(createdSites) +
          " updated=" +
          String(updatedSites) +
          " | skipped=" +
          String(skipped) +
          " errors=" +
          String(errors)
      );
    } catch (e5) {
      appendSportsUSALog("[SportsUSA] ERROR: " + String((e5 && e5.message) || e5));
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     SportsUSA: Ingest Camps
     Reads SchoolSportSite rows for selected sport,
     calls /functions/sportsUSAIngestCamps,
     writes accepted into CampDemo (unless dry run)
  ----------------------------- */
  async function runSportsUSAIngestCamps() {
    if (!selectedSportId) return appendSportsUSACampsLog("[Camps] ERROR: Select a sport first.");
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter) return appendSportsUSACampsLog("[Camps] ERROR: SchoolSportSite entity not available.");
    if (!CampDemoEntity) return appendSportsUSACampsLog("[Camps] ERROR: CampDemo entity not available.");

    var runIso = new Date().toISOString();

    setCampsWorking(true);
    setCampsWriteStats({ created: 0, updated: 0, skipped: 0, errors: 0 });
    setSportsUSACampsLog("");

    appendSportsUSACampsLog("[Camps] Starting: SportsUSA Camps Ingest (" + selectedSportName + ") @ " + runIso);
    appendSportsUSACampsLog(
      "[Camps] DryRun=" +
        (campsDryRun ? "true" : "false") +
        " | MaxSites=" +
        String(campsMaxSites) +
        " | MaxRegsPerSite=" +
        String(campsMaxRegsPerSite) +
        " | MaxEvents=" +
        String(campsMaxEvents)
    );

    try {
      // Pull active sites for this sport
      var siteRows = [];
      try {
        // Some Base44 filters may not support boolean equals reliably; if so, remove active filter.
        siteRows = asArray(await SchoolSportSiteEntity.filter({ sport_id: selectedSportId }));
      } catch (e0) {
        siteRows = [];
      }

      // Normalize + only active
      var sites = siteRows
        .map(function (r) {
          var active = true;
          if (typeof (r && r.active) === "boolean") active = r.active;
          return {
            id: r && r.id ? String(r.id) : "",
            school_id: r && r.school_id ? String(r.school_id) : "",
            camp_site_url: safeString(r && r.camp_site_url),
            logo_url: safeString(r && r.logo_url) || null,
            active: active,
          };
        })
        .filter(function (s) {
          return s.school_id && s.camp_site_url && s.active;
        });

      appendSportsUSACampsLog("[Camps] Loaded SchoolSportSite rows: " + String(sites.length) + " (active)");

      if (!sites.length) {
        appendSportsUSACampsLog("[Camps] Nothing to crawl. Run SportsUSA Seed Schools first, or check SchoolSportSite.active.");
        return;
      }

      // Limit client-side list size
      var sendSites = sites.slice(0, campsMaxSites);

      var res = await fetch("/functions/sportsUSAIngestCamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          dryRun: true, // function collects + returns; AdminImport controls DB writes
          maxSites: campsMaxSites,
          maxRegsPerSite: campsMaxRegsPerSite,
          maxEvents: campsMaxEvents,
          sites: sendSites,
        }),
      });

      var data = await res.json().catch(function () { return null; });

      if (!res.ok) {
        appendSportsUSACampsLog("[Camps] ERROR: sportsUSAIngestCamps function ERROR (HTTP " + res.status + ")");
        appendSportsUSACampsLog(JSON.stringify(data || {}, null, 2));
        return;
      }

      var stats = data && data.stats ? data.stats : {};
      appendSportsUSACampsLog(
        "[Camps] Collector stats: processedSites=" +
          String(stats.processedSites || 0) +
          " processedRegs=" +
          String(stats.processedRegs || 0) +
          " accepted=" +
          String(stats.accepted || 0) +
          " rejected=" +
          String(stats.rejected || 0) +
          " errors=" +
          String(stats.errors || 0)
      );

      var accepted = asArray(data && data.accepted);

      if (accepted.length) {
        appendSportsUSACampsLog("[Camps] Accepted sample (first " + String(Math.min(3, accepted.length)) + "):");
        for (var i = 0; i < Math.min(3, accepted.length); i++) {
          var a = accepted[i];
          appendSportsUSACampsLog(
            '- camp="' + (a.camp_name || "") + '" | start=' + (a.start_date || "") + " | url=" + (a.link_url || "")
          );
        }
      }

      if (campsDryRun) {
        appendSportsUSACampsLog("[Camps] DryRun=true: no CampDemo writes performed.");
        return;
      }

      if (!accepted.length) {
        appendSportsUSACampsLog("[Camps] No accepted camps to write.");
        return;
      }

      // Write to CampDemo (upsert by event_key)
      appendSportsUSACampsLog("[Camps] Writing " + String(accepted.length) + " CampDemo rows…");

      var created = 0;
      var updated = 0;
      var skipped = 0;
      var errors = 0;

      for (var j = 0; j < accepted.length; j++) {
        var p = accepted[j] || {};

        try {
          // Ensure schema alignment + required fields
          var school_id = safeString(p.school_id);
          var sport_id = safeString(p.sport_id) || selectedSportId;
          var camp_name = safeString(p.camp_name);
          var start_date = toISODate(p.start_date);
          var season_year = safeNumber(p.season_year);

          var program_id = safeString(p.program_id) || seedProgramId(school_id, camp_name);
          var source_platform = safeString(p.source_platform) || "sportsusa";
          var link_url = safeString(p.link_url);

          if (!school_id || !sport_id || !camp_name || !start_date || !season_year || !program_id || !link_url) {
            skipped += 1;
            appendSportsUSACampsLog("[Camps] SKIP #" + String(j + 1) + ": missing required fields");
            continue;
          }

          var payload = {
            school_id: school_id,
            sport_id: sport_id,
            camp_name: camp_name,
            start_date: start_date,
            end_date: toISODate(p.end_date) || null,
            city: safeString(p.city) || null,
            state: safeString(p.state) || null,
            position_ids: asArray(p.position_ids),
            price: safeNumber(p.price),
            link_url: link_url,
            notes: safeString(p.notes) || null,

            season_year: season_year,
            program_id: program_id,
            event_key: safeString(p.event_key) || buildEventKey({
              source_platform: source_platform,
              program_id: program_id,
              start_date: start_date,
              link_url: link_url,
              source_url: safeString(p.source_url),
            }),
            source_platform: source_platform,
            source_url: safeString(p.source_url) || link_url,
            last_seen_at: safeString(p.last_seen_at) || new Date().toISOString(),
            content_hash: safeString(p.content_hash) || simpleHash(p),

            event_dates_raw: safeString(p.event_dates_raw) || null,
            grades_raw: safeString(p.grades_raw) || null,
            register_by_raw: safeString(p.register_by_raw) || null,
            price_raw: safeString(p.price_raw) || null,
            price_min: safeNumber(p.price_min),
            price_max: safeNumber(p.price_max),
            sections_json: safeObject(p.sections_json) || null,
          };

          var r = await upsertCampDemoByEventKey(payload);
          if (r === "created") created += 1;
          if (r === "updated") updated += 1;

          if ((j + 1) % 10 === 0) {
            appendSportsUSACampsLog("[Camps] Write progress: " + String(j + 1) + "/" + String(accepted.length));
          }
          await sleep(35);
        } catch (e2) {
          errors += 1;
          appendSportsUSACampsLog("[Camps] ERROR write #" + String(j + 1) + ": " + String((e2 && e2.message) || e2));
        }

        setCampsWriteStats({ created: created, updated: updated, skipped: skipped, errors: errors });
      }

      appendSportsUSACampsLog(
        "[Camps] CampDemo writes done. created=" +
          String(created) +
          " updated=" +
          String(updated) +
          " skipped=" +
          String(skipped) +
          " errors=" +
          String(errors)
      );
    } catch (e3) {
      appendSportsUSACampsLog("[Camps] ERROR: " + String((e3 && e3.message) || e3));
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     Promote CampDemo → Camp
     (uses your existing Camp model logic)
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    var key = payload && payload.event_key;
    if (!key) throw new Error("Missing event_key for upsert");

    var existing = [];
    try {
      existing = await base44.entities.Camp.filter({ event_key: key });
    } catch (e) {
      existing = [];
    }

    var arr = asArray(existing);
    if (arr.length > 0 && arr[0] && arr[0].id) {
      await base44.entities.Camp.update(arr[0].id, payload);
      return "updated";
    }

    await base44.entities.Camp.create(payload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    var school_id = safeString(r && r.school_id);
    var sport_id = safeString(r && r.sport_id);
    var camp_name = safeString(r && (r.camp_name || r.name));

    var start_date = toISODate(r && r.start_date);
    var end_date = toISODate(r && r.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date) {
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };
    }

    var city = safeString(r && r.city);
    var state = safeString(r && r.state);
    var position_ids = normalizeStringArray(r && r.position_ids);

    var price = safeNumber(r && r.price);

    var link_url = safeString(r && (r.link_url || r.url));
    var source_url = safeString(r && r.source_url) || link_url;

    var season_year = safeNumber(r && r.season_year);
    if (!season_year && lc(selectedSportName) === "football") season_year = safeNumber(computeSeasonYearFootball(start_date));
    if (!season_year) {
      var m = start_date.match(/^(\d{4})-/);
      season_year = m && m[1] ? Number(m[1]) : null;
    }

    var source_platform = safeString(r && r.source_platform) || "seed";
    var program_id = safeString(r && r.program_id) || seedProgramId(school_id, camp_name);

    var event_key =
      safeString(r && r.event_key) ||
      buildEventKey({
        source_platform: source_platform,
        program_id: program_id,
        start_date: start_date,
        link_url: link_url,
        source_url: source_url,
      });

    var content_hash =
      safeString(r && r.content_hash) ||
      simpleHash({
        school_id: school_id,
        sport_id: sport_id,
        camp_name: camp_name,
        start_date: start_date,
        end_date: end_date,
        city: city,
        state: state,
        position_ids: position_ids,
        price: price,
        link_url: link_url,
        notes: safeString(r && r.notes),
      });

    var payload = {
      school_id: school_id,
      sport_id: sport_id,
      camp_name: camp_name,
      start_date: start_date,
      end_date: end_date || null,
      city: city || null,
      state: state || null,
      position_ids: position_ids,
      price: price !== null && price !== undefined ? price : null,
      link_url: link_url || null,
      notes: safeString(r && r.notes) || null,

      season_year: season_year !== null && season_year !== undefined ? season_year : null,
      program_id: program_id,
      event_key: event_key,
      source_platform: source_platform,
      source_url: source_url || null,
      last_seen_at: runIso,
      content_hash: content_hash,

      event_dates_raw: safeString(r && r.event_dates_raw) || null,
      grades_raw: safeString(r && r.grades_raw) || null,
      register_by_raw: safeString(r && r.register_by_raw) || null,
      price_raw: safeString(r && r.price_raw) || null,
      price_min: safeNumber(r && r.price_min),
      price_max: safeNumber(r && r.price_max),
      sections_json: safeObject(tryParseJson(r && r.sections_json)) || null,
    };

    return { payload: payload };
  }

  async function promoteCampDemoToCamp() {
    var runIso = new Date().toISOString();
    setPromoteWorking(true);
    setPromoteLog("");
    setPromoteStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendPromoteLog("[Promote] Starting: CampDemo → Camp @ " + runIso);

    var demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({ sport_id: selectedSportId }));
    } catch (e) {
      appendPromoteLog("[Promote] ERROR reading CampDemo: " + String((e && e.message) || e));
      setPromoteWorking(false);
      return;
    }

    appendPromoteLog("[Promote] Found CampDemo rows for sport: " + String(demoRows.length));
    setPromoteStats(function (s) {
      return { read: demoRows.length, created: 0, updated: 0, skipped: 0, errors: 0 };
    });

    var created = 0;
    var updated = 0;
    var skipped = 0;
    var errors = 0;

    for (var i = 0; i < demoRows.length; i++) {
      var r = demoRows[i];

      try {
        var built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          skipped += 1;
          appendPromoteLog("[Promote] SKIP #" + String(i + 1) + ": " + built.error);
          continue;
        }

        var result = await upsertCampByEventKey(built.payload);

        if (result === "created") created += 1;
        if (result === "updated") updated += 1;

        if ((i + 1) % 10 === 0) appendPromoteLog("[Promote] Progress: " + String(i + 1) + "/" + String(demoRows.length));
        await sleep(50);
      } catch (e2) {
        errors += 1;
        appendPromoteLog("[Promote] ERROR #" + String(i + 1) + ": " + String((e2 && e2.message) || e2));
      }

      setPromoteStats({ read: demoRows.length, created: created, updated: updated, skipped: skipped, errors: errors });
    }

    appendPromoteLog("[Promote] Done. created=" + String(created) + " updated=" + String(updated) + " skipped=" + String(skipped) + " errors=" + String(errors));
    setPromoteWorking(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">
              Select a sport once. All tools below run off that selection.
            </div>
          </div>

          <Button variant="outline" onClick={function () { nav(ROUTES.Workspace); }}>
            Back to Workspace
          </Button>
        </div>

        {/* Global sport selector */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport Selection</div>
          <div className="mt-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Sport</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              value={selectedSportId}
              onChange={function (e) {
                var id = e.target.value;
                var hit = null;
                for (var i = 0; i < sports.length; i++) {
                  if (sports[i].id === id) hit = sports[i];
                }
                setSelectedSportId(id);
                setSelectedSportName(hit ? hit.name : "");
              }}
              disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking}
            >
              <option value="">Select…</option>
              {sports.map(function (s) {
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                );
              })}
            </select>

            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={loadSports} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Positions loaded for this sport: <b>{positionsLoading ? "Loading…" : String(positions.length)}</b>
            </div>
          </div>
        </Card>

        {/* SportsUSA Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA: Seed Schools + SchoolSportSite</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls the directory (e.g., footballcampsusa) and writes:
            <b> School</b> + <b>SchoolSportSite</b> (camp_site_url).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA Directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsUSADirectoryUrl}
                onChange={function (e) { setSportsUSADirectoryUrl(e.target.value); }}
                placeholder="https://www.footballcampsusa.com"
                disabled={sportsUSAWorking || campsWorking || promoteWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                This is the directory listing page (not the individual school camp site).
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={sportsUSALimit}
                  onChange={function (e) { setSportsUSALimit(Number(e.target.value || 0)); }}
                  min={10}
                  max={1000}
                  disabled={sportsUSAWorking}
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={sportsUSADryRun}
                    onChange={function (e) { setSportsUSADryRun(e.target.checked); }}
                    disabled={sportsUSAWorking}
                  />
                  Dry Run
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={runSportsUSASeedSchools}
              disabled={!selectedSportId || sportsUSAWorking || campsWorking || promoteWorking}
            >
              {sportsUSAWorking ? "Running…" : sportsUSADryRun ? "Run Seed (Dry Run)" : "Run Seed → Write School + Site"}
            </Button>

            <Button
              variant="outline"
              onClick={function () { setSportsUSALog(""); }}
              disabled={sportsUSAWorking}
            >
              Clear Log
            </Button>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Schools Created:</b> {sportsUSAStats.createdSchools}</span>
              <span><b>Schools Updated:</b> {sportsUSAStats.updatedSchools}</span>
              <span><b>Sites Created:</b> {sportsUSAStats.createdSites}</span>
              <span><b>Sites Updated:</b> {sportsUSAStats.updatedSites}</span>
              <span><b>Errors:</b> {sportsUSAStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {sportsUSALog || "—"}
            </pre>
          </div>
        </Card>

        {/* SportsUSA Ingest Camps */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA: Ingest Camps → CampDemo</div>
          <div className="text-sm text-slate-600 mt-1">
            Crawls <b>SchoolSportSite.camp_site_url</b> for this sport, finds registration pages,
            extracts dates/prices, and writes into <b>CampDemo</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Sites</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxSites}
                onChange={function (e) { setCampsMaxSites(Number(e.target.value || 0)); }}
                min={1}
                max={250}
                disabled={campsWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Reg Links / Site</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxRegsPerSite}
                onChange={function (e) { setCampsMaxRegsPerSite(Number(e.target.value || 0)); }}
                min={1}
                max={25}
                disabled={campsWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Events</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxEvents}
                onChange={function (e) { setCampsMaxEvents(Number(e.target.value || 0)); }}
                min={10}
                max={500}
                disabled={campsWorking}
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={campsDryRun}
                  onChange={function (e) { setCampsDryRun(e.target.checked); }}
                  disabled={campsWorking}
                />
                Dry Run
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={runSportsUSAIngestCamps}
              disabled={!selectedSportId || campsWorking || sportsUSAWorking || promoteWorking}
            >
              {campsWorking ? "Running…" : campsDryRun ? "Run Camps Ingest (Dry Run)" : "Run Camps Ingest → Write CampDemo"}
            </Button>

            <Button
              variant="outline"
              onClick={function () { setSportsUSACampsLog(""); }}
              disabled={campsWorking}
            >
              Clear Log
            </Button>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>CampDemo Created:</b> {campsWriteStats.created}</span>
              <span><b>CampDemo Updated:</b> {campsWriteStats.updated}</span>
              <span><b>Skipped:</b> {campsWriteStats.skipped}</span>
              <span><b>Errors:</b> {campsWriteStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {sportsUSACampsLog || "—"}
            </pre>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            If you get “function not found” KeyError, confirm the backend file is created as:
            <b> /functions/sportsUSAIngestCamps.js</b> and saved.
          </div>
        </Card>

        {/* Promote CampDemo -> Camp */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>. This is the final publish step.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={promoteCampDemoToCamp}
              disabled={!selectedSportId || promoteWorking || campsWorking || sportsUSAWorking}
            >
              {promoteWorking ? "Running…" : "Run Promotion"}
            </Button>

            <Button
              variant="outline"
              onClick={function () { setPromoteLog(""); setPromoteStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 }); }}
              disabled={promoteWorking}
            >
              Clear Log
            </Button>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {promoteStats.read}</span>
              <span><b>Created:</b> {promoteStats.created}</span>
              <span><b>Updated:</b> {promoteStats.updated}</span>
              <span><b>Skipped:</b> {promoteStats.skipped}</span>
              <span><b>Errors:</b> {promoteStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {promoteLog || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button
            variant="outline"
            onClick={function () { nav(ROUTES.Home); }}
            disabled={sportsUSAWorking || campsWorking || promoteWorking}
          >
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
