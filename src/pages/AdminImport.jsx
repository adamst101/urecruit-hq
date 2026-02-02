// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Helpers
----------------------------- */
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeString(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function safeObject(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return x;
}

function tryParseJson(value) {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!s) return value;
  if (!(s.startsWith("{") || s.startsWith("["))) return value;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

function normalizeStringArray(value) {
  const v = tryParseJson(value);
  if (Array.isArray(v)) {
    return v
      .map((x) => (x == null ? null : String(x).trim()))
      .filter((x) => !!x);
  }
  const one = safeString(v);
  return one ? [one] : [];
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Return YYYY-MM-DD (UTC) or null
function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = String(mdy[1]).padStart(2, "0");
      const dd = String(mdy[2]).padStart(2, "0");
      const yyyy = String(mdy[3]);
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Football rollover: Feb 1 (UTC)
function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  const d = new Date(`${startDateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1
  return d >= feb1 ? y : y - 1;
}

// Simple stable hash (MVP-safe; not cryptographic)
function simpleHash(obj) {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}

function seedProgramId({ school_id, camp_name }) {
  return `seed:${String(school_id || "na")}:${slugify(camp_name || "camp")}`;
}

function buildEventKey({ source_platform, program_id, start_date, link_url, source_url }) {
  const platform = source_platform || "seed";
  const disc = link_url || source_url || "na";
  return `${platform}:${program_id}:${start_date || "na"}:${disc}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ----------------------------
   Routes (hardcoded)
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   Defaults: Position seeds
----------------------------- */
const DEFAULT_POSITION_SEEDS = {
  Football: [
    { position_code: "QB", position_name: "Quarterback" },
    { position_code: "RB", position_name: "Running Back" },
    { position_code: "WR", position_name: "Wide Receiver" },
    { position_code: "TE", position_name: "Tight End" },
    { position_code: "OL", position_name: "Offensive Line" },
    { position_code: "DL", position_name: "Defensive Line" },
    { position_code: "LB", position_name: "Linebacker" },
    { position_code: "DB", position_name: "Defensive Back" },
    { position_code: "K", position_name: "Kicker" },
    { position_code: "P", position_name: "Punter" },
    { position_code: "LS", position_name: "Long Snapper" },
  ],
  Baseball: [
    { position_code: "P", position_name: "Pitcher" },
    { position_code: "C", position_name: "Catcher" },
    { position_code: "1B", position_name: "First Base" },
    { position_code: "2B", position_name: "Second Base" },
    { position_code: "3B", position_name: "Third Base" },
    { position_code: "SS", position_name: "Shortstop" },
    { position_code: "LF", position_name: "Left Field" },
    { position_code: "CF", position_name: "Center Field" },
    { position_code: "RF", position_name: "Right Field" },
    { position_code: "UTIL", position_name: "Utility" },
  ],
  Basketball: [
    { position_code: "PG", position_name: "Point Guard" },
    { position_code: "SG", position_name: "Shooting Guard" },
    { position_code: "SF", position_name: "Small Forward" },
    { position_code: "PF", position_name: "Power Forward" },
    { position_code: "C", position_name: "Center" },
  ],
  Softball: [
    { position_code: "P", position_name: "Pitcher" },
    { position_code: "C", position_name: "Catcher" },
    { position_code: "1B", position_name: "First Base" },
    { position_code: "2B", position_name: "Second Base" },
    { position_code: "3B", position_name: "Third Base" },
    { position_code: "SS", position_name: "Shortstop" },
    { position_code: "LF", position_name: "Left Field" },
    { position_code: "CF", position_name: "Center Field" },
    { position_code: "RF", position_name: "Right Field" },
    { position_code: "UTIL", position_name: "Utility" },
  ],
  Volleyball: [
    { position_code: "S", position_name: "Setter" },
    { position_code: "OH", position_name: "Outside Hitter" },
    { position_code: "MB", position_name: "Middle Blocker" },
    { position_code: "OPP", position_name: "Opposite" },
    { position_code: "L", position_name: "Libero" },
    { position_code: "DS", position_name: "Defensive Specialist" },
  ],
  Soccer: [
    { position_code: "GK", position_name: "Goalkeeper" },
    { position_code: "DEF", position_name: "Defender" },
    { position_code: "MID", position_name: "Midfielder" },
    { position_code: "FWD", position_name: "Forward" },
  ],
  "Men's Soccer": [
    { position_code: "GK", position_name: "Goalkeeper" },
    { position_code: "DEF", position_name: "Defender" },
    { position_code: "MID", position_name: "Midfielder" },
    { position_code: "FWD", position_name: "Forward" },
  ],
  "Women's Soccer": [
    { position_code: "GK", position_name: "Goalkeeper" },
    { position_code: "DEF", position_name: "Defender" },
    { position_code: "MID", position_name: "Midfielder" },
    { position_code: "FWD", position_name: "Forward" },
  ],
};

/* ----------------------------
   Entity field helpers
----------------------------- */
function normalizeSportNameFromRow(r) {
  return String(r && (r.sport_name || r.name || r.sportName) ? (r.sport_name || r.name || r.sportName) : "")
    .trim();
}

function readActiveFlag(row) {
  if (typeof row && typeof row.active === "boolean") return row.active;
  if (typeof row && typeof row.is_active === "boolean") return row.is_active;
  if (typeof row && typeof row.isActive === "boolean") return row.isActive;
  const st = String(row && row.status ? row.status : "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;
  return true;
}

async function tryUpdateWithPayloads(Entity, id, payloads) {
  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    try {
      await Entity.update(String(id), p);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

async function tryCreateWithPayloads(Entity, payloads) {
  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    try {
      const created = await Entity.create(p);
      return created || true;
    } catch {
      // continue
    }
  }
  return null;
}

async function tryDelete(Entity, id) {
  if (!Entity || !id) return false;
  const fns = ["delete", "remove", "destroy"];
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    try {
      if (typeof Entity[fn] === "function") {
        await Entity[fn](String(id));
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

/* ----------------------------
   Ryzer ActivityTypeId mapping (optional convenience)
----------------------------- */
const RYZER_ACTIVITY_TYPE_BY_SPORTNAME = {
  Football: "A8ADF526-3822-4261-ADCF-1592CF4BB7FF",
  // Baseball: "PUT-GUID-HERE",
  // Soccer: "PUT-GUID-HERE",
};

export default function AdminImport() {
  const nav = useNavigate();

  /* ----------------------------
     Entities
  ----------------------------- */
  const SportEntity = (base44 && base44.entities && (base44.entities.Sport || base44.entities.Sports)) || null;
  const SchoolEntity = (base44 && base44.entities && (base44.entities.School || base44.entities.Schools)) || null;
  const SchoolSportSiteEntity =
    (base44 && base44.entities && (base44.entities.SchoolSportSite || base44.entities.SchoolSportSites)) || null;

  const PositionEntity =
    (base44 && base44.entities && (base44.entities.Position || base44.entities.Positions)) || null;

  const CampDemoEntity = (base44 && base44.entities && base44.entities.CampDemo) || null;
  const CampEntity = (base44 && base44.entities && base44.entities.Camp) || null;

  /* ----------------------------
     Selected sport drives EVERYTHING
  ----------------------------- */
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  /* ----------------------------
     Section logs (separate)
  ----------------------------- */
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logRyzer, setLogRyzer] = useState("");
  const [logPositions, setLogPositions] = useState("");
  const [logPromotion, setLogPromotion] = useState("");

  const appendSportsUSA = (line) => setLogSportsUSA((p) => (p ? p + "\n" + line : line));
  const appendRyzer = (line) => setLogRyzer((p) => (p ? p + "\n" + line : line));
  const appendPositions = (line) => setLogPositions((p) => (p ? p + "\n" + line : line));
  const appendPromotion = (line) => setLogPromotion((p) => (p ? p + "\n" + line : line));

  /* ----------------------------
     SchoolSportSite mapping UI
  ----------------------------- */
  const [siteUrl, setSiteUrl] = useState(""); // editable input for selected sport
  const [siteRowId, setSiteRowId] = useState(""); // existing row id if found
  const [siteWorking, setSiteWorking] = useState(false);

  /* ----------------------------
     SportsUSA seed controls
  ----------------------------- */
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);

  /* ----------------------------
     Ryzer ingestion controls
  ----------------------------- */
  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerRecordsPerPage, setRyzerRecordsPerPage] = useState(25);
  const [ryzerMaxPages, setRyzerMaxPages] = useState(10);
  const [ryzerMaxEvents, setRyzerMaxEvents] = useState(200);
  const [ryzerActivityTypeId, setRyzerActivityTypeId] = useState("");

  /* ----------------------------
     Positions section
  ----------------------------- */
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [seedWorking, setSeedWorking] = useState(false);
  const [seedStats, setSeedStats] = useState({ attempted: 0, created: 0, updated: 0, errors: 0 });

  const [positionAddCode, setPositionAddCode] = useState("");
  const [positionAddName, setPositionAddName] = useState("");
  const [positionAddWorking, setPositionAddWorking] = useState(false);
  const [positionSaveWorking, setPositionSaveWorking] = useState(false);
  const [positionDeleteWorking, setPositionDeleteWorking] = useState("");

  const [positionsEdit, setPositionsEdit] = useState({});

  /* ----------------------------
     Promotion section
  ----------------------------- */
  const [promoWorking, setPromoWorking] = useState(false);
  const [promoStats, setPromoStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  /* ----------------------------
     Derived: seed list for selected sport
  ----------------------------- */
  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  /* ----------------------------
     Load Sports (once)
  ----------------------------- */
  async function loadSports() {
    if (!SportEntity || !SportEntity.filter) return;
    setSportsLoading(true);
    try {
      const rows = asArray(await SportEntity.filter({}));
      const normalized = rows
        .map((r) => ({
          id: r && r.id ? String(r.id) : "",
          name: normalizeSportNameFromRow(r),
          active: readActiveFlag(r),
          raw: r,
        }))
        .filter((r) => r.id && r.name);

      normalized.sort((a, b) => a.name.localeCompare(b.name));
      setSports(normalized);

      if (!selectedSportId && normalized.length) {
        setSelectedSportId(normalized[0].id);
        setSelectedSportName(normalized[0].name);
      } else if (selectedSportId) {
        const hit = normalized.find((s) => s.id === selectedSportId);
        if (hit) setSelectedSportName(hit.name);
      }
    } catch {
      // no-op
    } finally {
      setSportsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSports();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------
     When selected sport changes:
     - fill Ryzer ActivityTypeId if known
     - load SchoolSportSite mapping for that sport
     - load positions for that sport
  ----------------------------- */
  useEffect(() => {
    const guess = RYZER_ACTIVITY_TYPE_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setRyzerActivityTypeId(guess);
  }, [selectedSportName]);

  async function loadSchoolSportSiteMapping(sportId) {
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter || !sportId) {
      setSiteUrl("");
      setSiteRowId("");
      return;
    }

    setSiteWorking(true);
    try {
      const rows = asArray(await SchoolSportSiteEntity.filter({ sport_id: String(sportId) }));
      const hit = rows && rows.length ? rows[0] : null;

      const url =
        safeString(hit && (hit.site_url || hit.siteUrl || hit.url || hit.website_url || hit.websiteUrl)) || "";

      setSiteUrl(url);
      setSiteRowId(hit && hit.id ? String(hit.id) : "");
    } catch {
      setSiteUrl("");
      setSiteRowId("");
    } finally {
      setSiteWorking(false);
    }
  }

  async function loadPositionsForSport(sportId) {
    if (!PositionEntity || !PositionEntity.filter || !sportId) {
      setPositions([]);
      setPositionsEdit({});
      return;
    }

    setPositionsLoading(true);
    try {
      const rows = asArray(await PositionEntity.filter({ sport_id: String(sportId) }));
      const normalized = rows
        .map((r) => ({
          id: r && r.id ? String(r.id) : "",
          code: String(r && r.position_code ? r.position_code : "").trim(),
          name: String(r && r.position_name ? r.position_name : "").trim(),
          raw: r,
        }))
        .filter((p) => p.id);

      normalized.sort(
        (a, b) => (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || "")
      );
      setPositions(normalized);

      const nextEdit = {};
      for (let i = 0; i < normalized.length; i++) {
        const p = normalized[i];
        nextEdit[p.id] = { code: p.code, name: p.name };
      }
      setPositionsEdit(nextEdit);
    } catch {
      setPositions([]);
      setPositionsEdit({});
    } finally {
      setPositionsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedSportId) return;
      await loadSchoolSportSiteMapping(selectedSportId);
      if (cancelled) return;

      await loadPositionsForSport(selectedSportId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* ----------------------------
     Save/Upsert mapping row (SchoolSportSite)
  ----------------------------- */
  async function saveSchoolSportSiteMapping() {
    const runIso = new Date().toISOString();
    setLogSportsUSA(""); // keep SportsUSA area clean; mapping messages go there too
    appendSportsUSA(`[SportsUSA] Mapping: Save site URL @ ${runIso}`);

    if (!selectedSportId) return appendSportsUSA(`[SportsUSA] ERROR: Select a sport first.`);
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.create || !SchoolSportSiteEntity.update) {
      return appendSportsUSA(`[SportsUSA] ERROR: SchoolSportSite entity not available.`);
    }

    const url = safeString(siteUrl);
    if (!url) return appendSportsUSA(`[SportsUSA] ERROR: site_url is required.`);

    setSiteWorking(true);
    try {
      // Prefer update when we have row id, otherwise try find then create
      if (siteRowId) {
        const ok = await tryUpdateWithPayloads(SchoolSportSiteEntity, siteRowId, [
          { sport_id: String(selectedSportId), site_url: url, active: true },
          { sport_id: String(selectedSportId), siteUrl: url, active: true },
          { sport_id: String(selectedSportId), url: url, active: true },
        ]);
        appendSportsUSA(
          ok
            ? `[SportsUSA] Mapping saved: sport_id=${selectedSportId} site_url=${url}`
            : `[SportsUSA] ERROR: Update failed (field names mismatch?). Try columns: site_url OR url OR siteUrl.`
        );
      } else {
        const rows = asArray(await SchoolSportSiteEntity.filter({ sport_id: String(selectedSportId) }));
        const hit = rows && rows.length ? rows[0] : null;

        if (hit && hit.id) {
          const ok = await tryUpdateWithPayloads(SchoolSportSiteEntity, hit.id, [
            { sport_id: String(selectedSportId), site_url: url, active: true },
            { sport_id: String(selectedSportId), siteUrl: url, active: true },
            { sport_id: String(selectedSportId), url: url, active: true },
          ]);
          appendSportsUSA(
            ok
              ? `[SportsUSA] Mapping updated: sport_id=${selectedSportId} site_url=${url}`
              : `[SportsUSA] ERROR: Update failed (field names mismatch?).`
          );
          setSiteRowId(String(hit.id));
        } else {
          const created = await tryCreateWithPayloads(SchoolSportSiteEntity, [
            { sport_id: String(selectedSportId), site_url: url, active: true },
            { sport_id: String(selectedSportId), siteUrl: url, active: true },
            { sport_id: String(selectedSportId), url: url, active: true },
          ]);
          appendSportsUSA(
            created
              ? `[SportsUSA] Mapping created: sport_id=${selectedSportId} site_url=${url}`
              : `[SportsUSA] ERROR: Create failed (field names mismatch?).`
          );

          await loadSchoolSportSiteMapping(selectedSportId);
        }
      }
    } catch (e) {
      appendSportsUSA(`[SportsUSA] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setSiteWorking(false);
    }
  }

  /* ----------------------------
     SportsUSA seed (calls backend function)
     IMPORTANT: This expects you to have a backend function:
       /functions/sportsUSASeedSchools
     which fetches/parses the site server-side (avoids browser CORS).
  ----------------------------- */
  async function runSportsUSASeed() {
    const runIso = new Date().toISOString();
    setLogSportsUSA("");
    appendSportsUSA(`[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName || "?"}) @ ${runIso}`);
    appendSportsUSA(`[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);

    if (!selectedSportId) return appendSportsUSA(`[SportsUSA] ERROR: Select a sport first.`);
    if (!SchoolEntity) return appendSportsUSA(`[SportsUSA] ERROR: School entity not available.`);
    if (!safeString(siteUrl)) {
      appendSportsUSA(`[SportsUSA] ERROR: No site URL found for this sport.`);
      appendSportsUSA(`[SportsUSA] Fix: set the site URL above, then click "Save mapping".`);
      return;
    }

    setSportsUSAWorking(true);
    try {
      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: String(selectedSportId),
          sportName: String(selectedSportName || ""),
          siteUrl: String(siteUrl),
          limit: Number(sportsUSALimit || 0),
          dryRun: !!sportsUSADryRun,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendSportsUSA(`[SportsUSA] ERROR: SportsUSA function ERROR (HTTP ${res.status})`);
        appendSportsUSA(JSON.stringify(data || {}, null, 2));
        appendSportsUSA(
          `[SportsUSA] NOTE: If you don't have /functions/sportsUSASeedSchools yet, you must add it (server-side scrape to avoid CORS).`
        );
        return;
      }

      const stats = data && data.stats ? data.stats : {};
      appendSportsUSA(
        `[SportsUSA] SportsUSA fetched: schools_found=${stats.schools_found || 0} | http=${stats.http || "n/a"}`
      );

      const sample = asArray(data && data.sample ? data.sample : []).slice(0, 10);
      if (sample.length) {
        appendSportsUSA(`[SportsUSA] Sample (first ${sample.length}):`);
        for (let i = 0; i < sample.length; i++) {
          const s = sample[i] || {};
          appendSportsUSA(
            `- name="${s.school_name || ""}" | logo="${s.logo_url || ""}" | view="${s.source_school_url || ""}"`
          );
        }
      }

      if (sportsUSADryRun) {
        appendSportsUSA(`[SportsUSA] DryRun=true: no School writes performed.`);
      } else {
        appendSportsUSA(
          `[SportsUSA] Writes: created=${stats.created || 0} updated=${stats.updated || 0} skipped=${stats.skipped || 0} errors=${stats.errors || 0}`
        );
      }
    } catch (e) {
      appendSportsUSA(`[SportsUSA] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Ryzer ingestion (calls backend function /functions/ryzerIngest)
     NOTE: This stays as a “secondary” ingest; SportsUSA is source of truth for Schools/logos.
  ----------------------------- */
  async function runRyzerIngestion() {
    const runIso = new Date().toISOString();
    setLogRyzer("");

    appendRyzer(`[Ryzer] Starting: Ryzer ingestion (${selectedSportName || "?"}) @ ${runIso}`);
    appendRyzer(
      `[Ryzer] DryRun=${ryzerDryRun ? "true" : "false"} | RPP=${ryzerRecordsPerPage} | Pages=${ryzerMaxPages} | MaxEvents=${ryzerMaxEvents}`
    );

    if (!selectedSportId) return appendRyzer(`[Ryzer] ERROR: Select a sport first.`);
    if (!safeString(ryzerActivityTypeId)) return appendRyzer(`[Ryzer] ERROR: Provide Ryzer ActivityTypeId GUID.`);
    if (!SchoolEntity || !SchoolEntity.filter) return appendRyzer(`[Ryzer] ERROR: School entity not available.`);
    if (!CampDemoEntity) return appendRyzer(`[Ryzer] ERROR: CampDemo entity not available.`);

    setRyzerWorking(true);

    try {
      const schoolRows = asArray(await SchoolEntity.filter({}));
      const schools = schoolRows
        .map((s) => ({
          id: String(s && s.id ? s.id : ""),
          school_name: String(s && s.school_name ? s.school_name : "").trim(),
          state: String(s && s.state ? s.state : "").trim(),
          aliases: asArray(tryParseJson(s && s.aliases_json ? s.aliases_json : "[]")).filter(Boolean),
        }))
        .filter((s) => s.id && s.school_name);

      appendRyzer(`[Ryzer] Loaded Schools: ${schools.length} (indexed=${schools.length})`);

      const res = await fetch("/functions/ryzerIngest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: String(selectedSportId),
          sportName: String(selectedSportName || ""),
          activityTypeId: String(ryzerActivityTypeId),
          recordsPerPage: Number(ryzerRecordsPerPage || 25),
          maxPages: Number(ryzerMaxPages || 1),
          maxEvents: Number(ryzerMaxEvents || 100),
          dryRun: !!ryzerDryRun,
          schools, // keep school matching available in function versions that use it
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendRyzer(`[Ryzer] ERROR: Ryzer function ERROR (HTTP ${res.status})`);
        appendRyzer(JSON.stringify(data || {}, null, 2));
        return;
      }

      appendRyzer(
        `[Ryzer] Results: accepted=${(data && data.stats && data.stats.accepted) || 0}, rejected=${(data && data.stats && data.stats.rejected) || 0}, errors=${(data && data.stats && data.stats.errors) || 0}`
      );
      appendRyzer(`[Ryzer] Processed: ${(data && data.stats && data.stats.processed) || 0}`);
      appendRyzer(`[Ryzer] Debug version: ${(data && data.debug && data.debug.version) || "MISSING"}`);

      // Page 0 debug
      const p0 = (asArray(data && data.debug && data.debug.pages ? data.debug.pages : [])[0]) || null;
      if (p0) {
        appendRyzer(
          `[Ryzer] p0 http=${p0.http != null ? p0.http : "n/a"} rowCount=${p0.rowCount != null ? p0.rowCount : "n/a"} total=${p0.total != null ? p0.total : "n/a"}`
        );
        appendRyzer(`[Ryzer] p0 keys: ${(p0.respKeys || []).join(", ") || "n/a"}`);
        appendRyzer(`[Ryzer] p0 dataWasString: ${p0.dataWasString ? "true" : "false"}`);
        appendRyzer(`[Ryzer] p0 innerKeys: ${(p0.innerKeys || []).join(", ") || "n/a"}`);
        appendRyzer(`[Ryzer] p0 rowsArrayPath: ${p0.rowsArrayPath || "n/a"}`);
        if (p0.uniqueActivityNames && p0.uniqueActivityNames.length) {
          appendRyzer(`[Ryzer] p0 uniqueActivityNames: ${JSON.stringify(p0.uniqueActivityNames)}`);
        }
        appendRyzer(`[Ryzer] p0 reqPayload: ${JSON.stringify(p0.reqPayload || {})}`);
      }

      // Rejected samples
      const rej = asArray(data && (data.rejected || data.rejected_samples) ? (data.rejected || data.rejected_samples) : [])
        .slice(0, 10);
      if (rej.length) {
        appendRyzer(`[Ryzer] Rejected samples (first ${rej.length}):`);
        for (let i = 0; i < rej.length; i++) {
          const r = rej[i] || {};
          appendRyzer(
            `- reason=${r.reason || "n/a"} host_guess="${r.host_guess || r.host || ""}" title="${r.title || ""}" url="${r.registrationUrl || ""}"`
          );
        }
      }

      if (ryzerDryRun) {
        appendRyzer(`[Ryzer] DryRun=true: no DB writes performed.`);
        return;
      }

      // If not dry run and function returns accepted, write CampDemo here (optional).
      // Most teams prefer to keep DB writes on the backend function instead.
      // Leaving this page fail-closed: only show results; no writes unless you explicitly wire them.
      appendRyzer(`[Ryzer] NOTE: This AdminImport is currently configured to not write CampDemo from Ryzer results here.`);
      appendRyzer(`[Ryzer] If you want UI-side writes, tell me and I’ll wire the accepted → CampDemo upsert safely.`);
    } catch (e) {
      appendRyzer(`[Ryzer] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setRyzerWorking(false);
    }
  }

  /* ----------------------------
     Positions: upsert helpers
  ----------------------------- */
  async function upsertPositionBySportAndCode({ sportId, code, name }) {
    if (!PositionEntity || !PositionEntity.filter || !PositionEntity.create || !PositionEntity.update) {
      throw new Error("Position entity not available (expected entities.Position).");
    }

    const position_code = String(code || "").trim().toUpperCase();
    const position_name = String(name || "").trim();

    if (!sportId) throw new Error("Missing sport_id for Position upsert.");
    if (!position_code) throw new Error("Missing position_code for Position upsert.");
    if (!position_name) throw new Error("Missing position_name for Position upsert.");

    let existing = [];
    try {
      existing = asArray(await PositionEntity.filter({ sport_id: String(sportId) }));
    } catch {
      existing = [];
    }

    const hit = existing.find(
      (r) => String(r && r.position_code ? r.position_code : "").trim().toUpperCase() === position_code
    );

    const payload = { sport_id: String(sportId), position_code, position_name };

    if (hit && hit.id) {
      await PositionEntity.update(String(hit.id), payload);
      return "updated";
    }

    await PositionEntity.create(payload);
    return "created";
  }

  async function seedPositionsForSport() {
    const runIso = new Date().toISOString();
    setLogPositions("");
    appendPositions(`[Positions] Starting: Seed Positions @ ${runIso}`);

    if (!selectedSportId) {
      appendPositions(`[Positions] ERROR: Select a sport first.`);
      return;
    }

    const list = seedListForSelectedSport;
    if (!list.length) {
      appendPositions(`[Positions] ERROR: No default seed list found for sport "${selectedSportName || "?"}".`);
      return;
    }

    setSeedWorking(true);
    setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });

    appendPositions(`[Positions] Sport: ${selectedSportName} (${selectedSportId})`);
    appendPositions(`[Positions] Seed rows: ${list.length}`);

    try {
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        setSeedStats((s) => ({ ...s, attempted: s.attempted + 1 }));

        try {
          const result = await upsertPositionBySportAndCode({
            sportId: selectedSportId,
            code: row.position_code,
            name: row.position_name,
          });

          if (result === "created") setSeedStats((s) => ({ ...s, created: s.created + 1 }));
          if (result === "updated") setSeedStats((s) => ({ ...s, updated: s.updated + 1 }));

          if ((i + 1) % 10 === 0) appendPositions(`[Positions] Seed progress: ${i + 1}/${list.length}`);
          await sleep(35);
        } catch (e) {
          setSeedStats((s) => ({ ...s, errors: s.errors + 1 }));
          appendPositions(`[Positions] SEED ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`);
        }
      }

      appendPositions(`[Positions] Seed Positions done.`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setSeedWorking(false);
    }
  }

  async function addPosition() {
    setLogPositions("");
    if (!PositionEntity || !PositionEntity.create) {
      appendPositions(`[Positions] ERROR: Position entity not available for create.`);
      return;
    }
    if (!selectedSportId) {
      appendPositions(`[Positions] ERROR: Select a sport first.`);
      return;
    }

    const code = safeString(positionAddCode);
    const name = safeString(positionAddName);

    if (!code) return appendPositions(`[Positions] ERROR: Position code is required.`);
    if (!name) return appendPositions(`[Positions] ERROR: Position name is required.`);

    setPositionAddWorking(true);
    try {
      const result = await upsertPositionBySportAndCode({ sportId: selectedSportId, code, name });
      appendPositions(`[Positions] ${result === "created" ? "Created" : "Updated"} Position ${String(code).toUpperCase()}`);
      setPositionAddCode("");
      setPositionAddName("");
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendPositions(`[Positions] ERROR add Position: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setPositionAddWorking(false);
    }
  }

  async function savePositionRow(positionId) {
    if (!PositionEntity || !PositionEntity.update) {
      appendPositions(`[Positions] ERROR: Position entity not available for update.`);
      return;
    }
    const row = positionsEdit && positionsEdit[positionId] ? positionsEdit[positionId] : null;
    if (!row) return;

    const code = safeString(row.code);
    const name = safeString(row.name);

    if (!selectedSportId) return appendPositions(`[Positions] ERROR: Select a sport first.`);
    if (!code) return appendPositions(`[Positions] ERROR: Position code is required.`);
    if (!name) return appendPositions(`[Positions] ERROR: Position name is required.`);

    setPositionSaveWorking(true);
    try {
      await PositionEntity.update(String(positionId), {
        sport_id: String(selectedSportId),
        position_code: String(code).toUpperCase(),
        position_name: String(name).trim(),
      });
      appendPositions(`[Positions] Saved Position: ${String(code).toUpperCase()}`);
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendPositions(`[Positions] FAILED save Position: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setPositionSaveWorking(false);
    }
  }

  async function deletePosition(positionId) {
    if (!positionId) return;
    if (!PositionEntity) {
      appendPositions(`[Positions] ERROR: Position entity missing.`);
      return;
    }

    const hit = positions.find((p) => p.id === positionId);
    const label = hit && hit.code ? `${hit.code} — ${hit.name || ""}` : positionId;

    setPositionDeleteWorking(positionId);
    try {
      const ok = await tryDelete(PositionEntity, positionId);
      appendPositions(ok ? `[Positions] Deleted Position: ${label}` : `[Positions] FAILED delete Position: ${label}`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setPositionDeleteWorking("");
    }
  }

  /* ----------------------------
     Promotion: CampDemo -> Camp
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    if (!CampEntity || !CampEntity.filter || !CampEntity.create || !CampEntity.update) {
      throw new Error("Camp entity not available (expected entities.Camp).");
    }
    const key = payload && payload.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for Camp upsert");

    let existing = [];
    try {
      existing = await CampEntity.filter({ event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0] && arr[0].id) {
      await CampEntity.update(arr[0].id, payload);
      return "updated";
    }

    await CampEntity.create(payload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r && r.school_id ? r.school_id : null);
    const sport_id = safeString(r && r.sport_id ? r.sport_id : null);
    const camp_name = safeString(r && (r.camp_name || r.name) ? (r.camp_name || r.name) : null);

    const start_date = toISODate(r && r.start_date ? r.start_date : null);
    const end_date = toISODate(r && r.end_date ? r.end_date : null);

    if (!school_id || !sport_id || !camp_name || !start_date) {
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };
    }

    const city = safeString(r && r.city ? r.city : null);
    const state = safeString(r && r.state ? r.state : null);
    const position_ids = normalizeStringArray(r && r.position_ids ? r.position_ids : []);

    const price = safeNumber(r && r.price != null ? r.price : null);

    const link_url = safeString(r && (r.link_url || r.url) ? (r.link_url || r.url) : null);
    const source_url = safeString(r && r.source_url ? r.source_url : null) || link_url;

    const season_year = safeNumber(r && r.season_year != null ? r.season_year : null) || safeNumber(computeSeasonYearFootball(start_date));

    const source_platform = safeString(r && r.source_platform ? r.source_platform : null) || "seed";
    const program_id = safeString(r && r.program_id ? r.program_id : null) || seedProgramId({ school_id, camp_name });

    const event_key =
      safeString(r && r.event_key ? r.event_key : null) ||
      buildEventKey({
        source_platform,
        program_id,
        start_date,
        link_url,
        source_url,
      });

    const content_hash =
      safeString(r && r.content_hash ? r.content_hash : null) ||
      simpleHash({
        school_id,
        sport_id,
        camp_name,
        start_date,
        end_date,
        city,
        state,
        position_ids,
        price,
        link_url,
        notes: safeString(r && r.notes ? r.notes : null),
      });

    const payload = {
      school_id,
      sport_id,
      camp_name,
      start_date,
      end_date: end_date || null,
      city: city || null,
      state: state || null,
      position_ids,
      price: price != null ? price : null,
      link_url: link_url || null,
      notes: safeString(r && r.notes ? r.notes : null) || null,

      season_year: season_year != null ? season_year : null,
      program_id,
      event_key,
      source_platform,
      source_url: source_url || null,
      last_seen_at: runIso,
      content_hash,

      event_dates_raw: safeString(r && r.event_dates_raw ? r.event_dates_raw : null) || null,
      grades_raw: safeString(r && r.grades_raw ? r.grades_raw : null) || null,
      register_by_raw: safeString(r && r.register_by_raw ? r.register_by_raw : null) || null,
      price_raw: safeString(r && r.price_raw ? r.price_raw : null) || null,
      price_min: safeNumber(r && r.price_min != null ? r.price_min : null),
      price_max: safeNumber(r && r.price_max != null ? r.price_max : null),
      sections_json: safeObject(tryParseJson(r && r.sections_json ? r.sections_json : null)) || null,
    };

    return { payload };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setLogPromotion("");
    setPromoStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendPromotion(`[Promote] Starting: CampDemo → Camp @ ${runIso}`);

    if (!CampDemoEntity || !CampDemoEntity.filter) {
      appendPromotion(`[Promote] ERROR: CampDemo entity not available.`);
      return;
    }
    if (!CampEntity) {
      appendPromotion(`[Promote] ERROR: Camp entity not available.`);
      return;
    }

    setPromoWorking(true);

    try {
      const demoRows = asArray(await CampDemoEntity.filter({}));
      appendPromotion(`[Promote] Found CampDemo rows: ${demoRows.length}`);
      setPromoStats((s) => ({ ...s, read: demoRows.length }));

      for (let i = 0; i < demoRows.length; i++) {
        const r = demoRows[i];

        try {
          const built = buildSafeCampPayloadFromDemoRow(r, runIso);
          if (built.error) {
            setPromoStats((s) => ({ ...s, skipped: s.skipped + 1 }));
            appendPromotion(`[Promote] SKIP #${i + 1}: ${built.error}`);
            continue;
          }

          const result = await upsertCampByEventKey(built.payload);

          if (result === "created") setPromoStats((s) => ({ ...s, created: s.created + 1 }));
          if (result === "updated") setPromoStats((s) => ({ ...s, updated: s.updated + 1 }));

          if ((i + 1) % 25 === 0) appendPromotion(`[Promote] Progress: ${i + 1}/${demoRows.length}`);
          await sleep(45);
        } catch (e) {
          setPromoStats((s) => ({ ...s, errors: s.errors + 1 }));
          appendPromotion(`[Promote] ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`);
        }
      }

      appendPromotion(`[Promote] Done.`);
    } catch (e) {
      appendPromotion(`[Promote] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setPromoWorking(false);
    }
  }

  /* ----------------------------
     UI
  ----------------------------- */
  const busyAny =
    sportsUSAWorking || siteWorking || ryzerWorking || seedWorking || promoWorking || positionsLoading || sportsLoading;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">Admin tools for seeding schools + positions + ingestion + promotion.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* Selected Sport (single control drives all tools) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Selected Sport (drives all tools)</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sport</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={selectedSportId}
                onChange={(e) => {
                  const id = e.target.value;
                  const hit = sports.find((x) => x.id === id) || null;
                  setSelectedSportId(id);
                  setSelectedSportName(hit ? hit.name : "");
                }}
                disabled={sportsLoading || busyAny}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {selectedSportId ? `sport_id=${selectedSportId}` : "Select a sport to enable all tools."}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => loadSports()} disabled={sportsLoading || busyAny}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setLogSportsUSA("");
                  setLogRyzer("");
                  setLogPositions("");
                  setLogPromotion("");
                }}
                disabled={busyAny}
              >
                Clear All Logs
              </Button>
            </div>
          </div>
        </Card>

        {/* SportsUSA mapping + seeding */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Seed Schools from SportsUSA site</div>
          <div className="text-sm text-slate-600 mt-1">
            Uses <b>SchoolSportSite</b> mapping for the selected sport (footballcampsusa, etc.). Writes Schools on demand.
          </div>

          {/* Mapping editor */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Site URL for selected sport</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="e.g., https://www.footballcampsusa.com/"
                disabled={!selectedSportId || siteWorking || busyAny}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Source stored in SchoolSportSite. {siteRowId ? `RowId=${siteRowId}` : "No row yet (will create on save)."}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={saveSchoolSportSiteMapping}
                disabled={!selectedSportId || siteWorking || busyAny || !safeString(siteUrl)}
              >
                {siteWorking ? "Saving…" : "Save mapping"}
              </Button>
            </div>
          </div>

          {/* Seed controls */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sportsUSADryRun}
                onChange={(e) => setSportsUSADryRun(e.target.checked)}
                disabled={sportsUSAWorking || busyAny}
              />
              <span className="text-sm text-slate-700">Dry Run</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={sportsUSALimit}
                onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                min={10}
                max={10000}
                disabled={sportsUSAWorking || busyAny}
              />
            </div>

            <div className="flex justify-start md:justify-end">
              <Button onClick={runSportsUSASeed} disabled={sportsUSAWorking || busyAny || !selectedSportId}>
                {sportsUSAWorking ? "Running…" : sportsUSADryRun ? "Run Seed (Dry Run)" : "Run Seed → Write Schools"}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">
              {logSportsUSA || "—"}
            </pre>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            If you see a 500/404 calling <b>/functions/sportsUSASeedSchools</b>, you haven’t created that backend function yet.
            This page intentionally calls a backend function to avoid browser CORS.
          </div>
        </Card>

        {/* Ryzer ingestion */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Ryzer ingestion (debug tool)</div>
          <div className="text-sm text-slate-600 mt-1">
            Keeps your Ryzer pipeline available, but SportsUSA seeding is your primary source of truth for universities + logos.
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ryzer ActivityTypeId (GUID)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ryzerActivityTypeId}
                onChange={(e) => setRyzerActivityTypeId(e.target.value)}
                placeholder="e.g., A8ADF526-3822-4261-ADCF-1592CF4BB7FF"
                disabled={ryzerWorking || busyAny}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Capture from DevTools → eventSearch payload field <b>ActivityTypes[0]</b>.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ryzerDryRun}
                onChange={(e) => setRyzerDryRun(e.target.checked)}
                disabled={ryzerWorking || busyAny}
              />
              <span className="text-sm text-slate-700">Dry Run</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Records per page</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={ryzerRecordsPerPage}
                onChange={(e) => setRyzerRecordsPerPage(Number(e.target.value || 0))}
                min={5}
                max={100}
                disabled={ryzerWorking || busyAny}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max pages</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={ryzerMaxPages}
                onChange={(e) => setRyzerMaxPages(Number(e.target.value || 0))}
                min={1}
                max={200}
                disabled={ryzerWorking || busyAny}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={ryzerMaxEvents}
                onChange={(e) => setRyzerMaxEvents(Number(e.target.value || 0))}
                min={10}
                max={5000}
                disabled={ryzerWorking || busyAny}
              />
            </div>
          </div>

          <div className="mt-3">
            <Button onClick={runRyzerIngestion} disabled={ryzerWorking || busyAny || !selectedSportId}>
              {ryzerWorking ? "Running…" : ryzerDryRun ? "Run Ryzer (Dry Run)" : "Run Ryzer"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">
              {logRyzer || "—"}
            </pre>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            If you see auth errors (401/403), confirm Base44 Secret <b>RYZER_AUTH</b> is set to your DevTools authorization JWT.
          </div>
        </Card>

        {/* Positions */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Manage Positions</div>
          <div className="text-sm text-slate-600 mt-1">
            Auto-seed a default set, or manually add/edit/delete positions per sport. Uses the selected sport at the top.
          </div>

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <Button onClick={seedPositionsForSport} disabled={!selectedSportId || seedWorking || busyAny}>
              {seedWorking ? "Seeding…" : "Auto-seed positions"}
            </Button>
            <Button
              variant="outline"
              onClick={() => (selectedSportId ? loadPositionsForSport(selectedSportId) : null)}
              disabled={!selectedSportId || positionsLoading || busyAny}
            >
              {positionsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            {selectedSportName
              ? seedListForSelectedSport.length
                ? `Default seeds available: ${seedListForSelectedSport.length}`
                : "No default seeds for this sport (add to DEFAULT_POSITION_SEEDS)"
              : "Choose a sport"}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={positionAddCode}
                onChange={(e) => setPositionAddCode(e.target.value)}
                placeholder="e.g., QB"
                disabled={!selectedSportId || busyAny}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={positionAddName}
                onChange={(e) => setPositionAddName(e.target.value)}
                placeholder="e.g., Quarterback"
                disabled={!selectedSportId || busyAny}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addPosition} disabled={!selectedSportId || positionAddWorking || busyAny}>
                {positionAddWorking ? "Saving…" : "Add / Upsert"}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">Positions</div>

            <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200 w-28">Code</th>
                    <th className="p-2 border-b border-slate-200">Name</th>
                    <th className="p-2 border-b border-slate-200 w-44">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length ? (
                    positions.map((p) => {
                      const edit = positionsEdit[p.id] || { code: p.code, name: p.name };
                      return (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.code || ""}
                              onChange={(e) =>
                                setPositionsEdit((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...(prev[p.id] || {}),
                                    code: e.target.value,
                                    name: (prev[p.id] && prev[p.id].name) != null ? prev[p.id].name : p.name,
                                  },
                                }))
                              }
                              disabled={busyAny}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.name || ""}
                              onChange={(e) =>
                                setPositionsEdit((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...(prev[p.id] || {}),
                                    name: e.target.value,
                                    code: (prev[p.id] && prev[p.id].code) != null ? prev[p.id].code : p.code,
                                  },
                                }))
                              }
                              disabled={busyAny}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => savePositionRow(p.id)} disabled={positionSaveWorking || busyAny}>
                                Save
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => deletePosition(p.id)}
                                disabled={positionDeleteWorking === p.id || busyAny}
                              >
                                {positionDeleteWorking === p.id ? "Deleting…" : "Delete"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-3 text-slate-500">
                        {selectedSportId ? (positionsLoading ? "Loading…" : "No positions found for this sport.") : "Select a sport first."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Positions are referenced by <b>AthleteProfile.primary_position_id</b>. If a position is in use, prefer renaming over deleting.
            </div>

            <div className="mt-4 text-sm text-slate-700">
              <div className="flex flex-wrap gap-4">
                <span><b>Seed Attempted:</b> {seedStats.attempted}</span>
                <span><b>Seed Created:</b> {seedStats.created}</span>
                <span><b>Seed Updated:</b> {seedStats.updated}</span>
                <span><b>Seed Errors:</b> {seedStats.errors}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-1">Log</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">
                {logPositions || "—"}
              </pre>
            </div>
          </div>
        </Card>

        {/* Promote CampDemo -> Camp */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>. Payload is type-safe and includes platform metadata.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={promoWorking || busyAny}>
              {promoWorking ? "Running…" : "Run Promotion"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setLogPromotion("");
                setPromoStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
              }}
              disabled={promoWorking || busyAny}
            >
              Clear Log
            </Button>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {promoStats.read}</span>
              <span><b>Created:</b> {promoStats.created}</span>
              <span><b>Updated:</b> {promoStats.updated}</span>
              <span><b>Skipped:</b> {promoStats.skipped}</span>
              <span><b>Errors:</b> {promoStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">
              {logPromotion || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={busyAny}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
