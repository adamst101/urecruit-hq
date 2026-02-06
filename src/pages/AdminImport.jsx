// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Helpers (editor-safe)
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
  if (x == null) return null;
  if (typeof x === "string" && !x.trim()) return null;
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
  return new Promise((r) => setTimeout(r, ms));
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
  const str = typeof obj === "string" ? obj : JSON.stringify(obj ?? {});
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}

function buildEventKey({ source_platform, program_id, start_date, link_url, source_url }) {
  const platform = source_platform || "seed";
  const disc = link_url || source_url || "na";
  return `${platform}:${program_id}:${start_date || "na"}:${disc}`;
}

function normalizeSportNameFromRow(r) {
  return String(r && (r.sport_name || r.name || r.sportName) ? (r.sport_name || r.name || r.sportName) : "").trim();
}

function readActiveFlag(row) {
  if (typeof (row && row.active) === "boolean") return row.active;
  if (typeof (row && row.is_active) === "boolean") return row.is_active;
  if (typeof (row && row.isActive) === "boolean") return row.isActive;
  const st = String(row && row.status ? row.status : "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;
  return true;
}

async function tryDelete(Entity, id) {
  if (!Entity || !id) return false;
  const fns = ["delete", "remove", "destroy"];
  for (const fn of fns) {
    try {
      if (typeof Entity[fn] === "function") {
        await Entity[fn](String(id));
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/* ----------------------------
   ✅ Robust Base44 entity query helper
----------------------------- */
async function entityList(Entity, whereObj) {
  if (!Entity) throw new Error("Entity is null/undefined.");
  const where = whereObj || {};

  if (typeof Entity.filter === "function") {
    return asArray(await Entity.filter(where));
  }

  if (typeof Entity.list === "function") {
    try {
      return asArray(await Entity.list({ where }));
    } catch {
      return asArray(await Entity.list(where));
    }
  }

  if (typeof Entity.findMany === "function") {
    try {
      return asArray(await Entity.findMany({ where }));
    } catch {
      return asArray(await Entity.findMany(where));
    }
  }

  if (typeof Entity.all === "function") {
    return asArray(await Entity.all());
  }

  throw new Error("Entity has no supported list method (filter/list/findMany/all).");
}

/* ----------------------------
   Routes (hardcoded)
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   SportsUSA directory sites (defaults)
----------------------------- */
const SPORTSUSA_DIRECTORY_BY_SPORTNAME = {
  Football: "https://www.footballcampsusa.com/",
  Baseball: "https://www.baseballcampsusa.com/",
  Softball: "https://www.softballcampsusa.com/",
  Soccer: "https://www.soccercampsusa.com/",
  Volleyball: "https://www.volleyballcampsusa.com/",
};

/* ----------------------------
   Default Positions
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
};

/* ----------------------------
   ✅ Truncate helper
----------------------------- */
function truncate(s, n) {
  const str = String(s ?? "");
  const max = Number(n ?? 500);
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
}

/* ----------------------------
   ✅ Crawl-state helpers
----------------------------- */
function parseIsoOrNull(x) {
  const s = safeString(x);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isDueNow(site) {
  const now = new Date();
  const next = parseIsoOrNull(site && site.next_crawl_at);
  return !next || next <= now;
}

function statusOf(site) {
  const s = safeString(site && site.crawl_status);
  return s || "ready";
}

function normalizeSiteRow(r) {
  return {
    id: r && r.id ? String(r.id) : "",
    school_id: r && r.school_id ? String(r.school_id) : null,
    sport_id: r && r.sport_id ? String(r.sport_id) : null,
    camp_site_url: r && r.camp_site_url ? String(r.camp_site_url) : null,
    active: typeof r && r.active === "boolean" ? r.active : !!(r && r.active),
    crawl_status: statusOf(r),
    last_crawled_at: safeString(r && r.last_crawled_at),
    next_crawl_at: safeString(r && r.next_crawl_at),
    crawl_error: safeString(r && r.crawl_error),
    last_crawl_run_id: safeString(r && r.last_crawl_run_id),
    raw: r,
  };
}

/* ----------------------------
   ✅ Quality detection helpers (frontend)
   These drive the Quality Counters + filtering.
----------------------------- */
function looksLikeBadCampName(name) {
  const t = lc(name);
  if (!t) return true;
  if (t === "register") return true;
  if (t === "details" || t === "view details" || t === "view detail" || t === "register now") return true;
  if (t === "camp") return true;

  // if name is actually money "$475.00"
  if (/^\$\s*\d/.test(String(name || "").trim())) return true;

  // if it looks like a pricing line like "475.00"
  if (/^\d{2,5}(\.\d{2})?$/.test(String(name || "").trim())) return true;

  // metadata-ish phrases
  if (t.includes("as of fall") || t.includes("as of")) return true;

  // if it contains 2+ metadata tokens, treat as bad
  const tokens = ["grades", "grade", "ages", "age", "location", "cost", "price"];
  let hits = 0;
  for (const tok of tokens) if (t.includes(tok)) hits++;
  if (hits >= 2) return true;

  return false;
}

function isMissingPriceRow(row) {
  const price = safeNumber(row && row.price);
  const pmin = safeNumber(row && row.price_min);
  const pmax = safeNumber(row && row.price_max);

  // missing if all null/0-ish
  const hasReal =
    (price != null && price > 0) ||
    (pmin != null && pmin > 0) ||
    (pmax != null && pmax > 0);

  return !hasReal;
}

/* ----------------------------
   ✅ Quality modes
----------------------------- */
const QUALITY_MODES = [
  { id: "any_cleanup", label: "Any cleanup (bad name OR missing price OR no camps)" },
  { id: "bad_name", label: "Schools with bad camp names" },
  { id: "missing_price", label: "Schools with missing/0 price" },
  { id: "no_camps", label: "Schools with no camps" },
];

export default function AdminImport() {
  const nav = useNavigate();

  /* ----------------------------
     Entities
  ----------------------------- */
  const SportEntity = base44 && base44.entities ? (base44.entities.Sport || base44.entities.Sports) : null;
  const SchoolEntity = base44 && base44.entities ? (base44.entities.School || base44.entities.Schools) : null;
  const SchoolSportSiteEntity = base44 && base44.entities ? (base44.entities.SchoolSportSite || base44.entities.SchoolSportSites) : null;
  const CampDemoEntity = base44 && base44.entities ? base44.entities.CampDemo : null;
  const PositionEntity = base44 && base44.entities ? (base44.entities.Position || base44.entities.Positions) : null;
  const CampEntity = base44 && base44.entities ? base44.entities.Camp : null;

  /* ----------------------------
     Sport selector
  ----------------------------- */
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  /* ----------------------------
     Logs
  ----------------------------- */
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");
  const [logPromote, setLogPromote] = useState("");
  const [logPositions, setLogPositions] = useState("");
  const [logCounters, setLogCounters] = useState("");
  const [logQuality, setLogQuality] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "positions") setLogPositions(add);
    if (which === "counters") setLogCounters(add);
    if (which === "quality") setLogQuality(add);
  }

  /* ----------------------------
     Work flags
  ----------------------------- */
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  const [campsWorking, setCampsWorking] = useState(false);
  const [promoteWorking, setPromoteWorking] = useState(false);
  const [seedWorking, setSeedWorking] = useState(false);
  const [countersWorking, setCountersWorking] = useState(false);
  const [qualityWorking, setQualityWorking] = useState(false);
  const [resetWorking, setResetWorking] = useState(false);

  /* ----------------------------
     Seed Schools controls
  ----------------------------- */
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);
  const [sportsUSASiteUrl, setSportsUSASiteUrl] = useState("");

  /* ----------------------------
     Camps ingest controls
  ----------------------------- */
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(25);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(10);
  const [campsMaxEvents, setCampsMaxEvents] = useState(300);
  const [fastMode, setFastMode] = useState(false);

  const RERUN_MODES = [
    { id: "due", label: "Due only (normal)" },
    { id: "all", label: "Force recrawl ALL active" },
    { id: "error", label: "Recrawl ERROR only" },
    { id: "no_events", label: "Recrawl NO_EVENTS only" },
    { id: "ok", label: "Recrawl OK only" },
    { id: "ready", label: "Recrawl READY only" },
  ];
  const [rerunMode, setRerunMode] = useState("due");

  // ✅ Quality Mode selector (aligned + visible)
  const [qualityMode, setQualityMode] = useState("any_cleanup");

  // Batch runner controls
  const [batchRunnerOn, setBatchRunnerOn] = useState(true);
  const [maxBatches, setMaxBatches] = useState(25);

  // Test mode
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [testSchoolId, setTestSchoolId] = useState("");

  /* ----------------------------
     Crawl Counters
  ----------------------------- */
  const [siteCounters, setSiteCounters] = useState({
    active: 0,
    ready: 0,
    ok: 0,
    no_events: 0,
    error: 0,
    dueNow: 0,
    done: 0,
  });

  async function refreshCrawlCounters() {
    const nowIso = new Date().toISOString();
    setCountersWorking(true);

    try {
      if (!selectedSportId) {
        setSiteCounters({ active: 0, ready: 0, ok: 0, no_events: 0, error: 0, dueNow: 0, done: 0 });
        appendLog("counters", `[Counters] Select a sport first.`);
        return;
      }
      if (!SchoolSportSiteEntity) {
        appendLog("counters", `[Counters] ERROR: SchoolSportSite entity not available.`);
        return;
      }

      const rows = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = rows.map(normalizeSiteRow);

      let active = sites.length;
      let ready = 0;
      let ok = 0;
      let no_events = 0;
      let error = 0;
      let dueNow = 0;

      for (const s of sites) {
        const st = statusOf(s);
        if (st === "ready") ready += 1;
        if (st === "ok") ok += 1;
        if (st === "no_events") no_events += 1;
        if (st === "error") error += 1;
        if (isDueNow(s)) dueNow += 1;
      }

      const done = ok + no_events + error;
      setSiteCounters({ active, ready, ok, no_events, error, dueNow, done });

      const pct = active ? Math.round((done / active) * 1000) / 10 : 0;
      appendLog(
        "counters",
        `[Counters] Refreshed @ ${nowIso} | Sites: active=${active} done=${done} (${pct}%) ready=${ready} ok=${ok} no_events=${no_events} error=${error} dueNow=${dueNow}`
      );
    } catch (e) {
      appendLog("counters", `[Counters] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setCountersWorking(false);
    }
  }

  /* ----------------------------
     ✅ Quality Counters (what you asked for)
  ----------------------------- */
  const [qualityCounters, setQualityCounters] = useState({
    badNameRemaining: 0,
    missingPriceRemaining: 0,
    noCampsRemaining: 0,
    lastRefreshedAt: null,
  });

  async function refreshQualityCounters() {
    const nowIso = new Date().toISOString();
    setQualityWorking(true);

    try {
      if (!selectedSportId) {
        setQualityCounters({ badNameRemaining: 0, missingPriceRemaining: 0, noCampsRemaining: 0, lastRefreshedAt: nowIso });
        appendLog("quality", `[Quality] Select a sport first.`);
        return;
      }
      if (!CampDemoEntity) {
        appendLog("quality", `[Quality] ERROR: CampDemo entity not available.`);
        return;
      }
      if (!SchoolSportSiteEntity) {
        appendLog("quality", `[Quality] ERROR: SchoolSportSite entity not available.`);
        return;
      }

      // Load all campdemo for sport (this is the “truth” for cleanup remaining)
      const demo = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const demoRows = asArray(demo);

      // Bad-name and missing-price are counted at the event level (CampDemo rows)
      let badNameRemaining = 0;
      let missingPriceRemaining = 0;

      // Track which schools have at least 1 camp
      const schoolIdsWithCamps = new Set();

      for (const r of demoRows) {
        const school_id = safeString(r && r.school_id);
        if (school_id) schoolIdsWithCamps.add(school_id);

        const name = safeString(r && r.camp_name);
        if (looksLikeBadCampName(name)) badNameRemaining += 1;

        if (isMissingPriceRow(r)) missingPriceRemaining += 1;
      }

      // No-camps is counted at the SITE level (SchoolSportSite rows)
      const sitesRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = asArray(sitesRaw).map(normalizeSiteRow);

      let noCampsRemaining = 0;
      for (const s of sites) {
        const sid = safeString(s && s.school_id);
        if (!sid) continue;
        if (!schoolIdsWithCamps.has(sid)) noCampsRemaining += 1;
      }

      setQualityCounters({ badNameRemaining, missingPriceRemaining, noCampsRemaining, lastRefreshedAt: nowIso });

      appendLog(
        "quality",
        `[Quality] Refreshed @ ${nowIso} | BadNameRemaining=${badNameRemaining} MissingPriceRemaining=${missingPriceRemaining} NoCampsRemaining=${noCampsRemaining}`
      );
    } catch (e) {
      appendLog("quality", `[Quality] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setQualityWorking(false);
    }
  }

  // Refresh counters when sport changes
  useEffect(() => {
    if (!selectedSportId) return;
    refreshCrawlCounters();
    refreshQualityCounters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  async function resetCrawlStateForSport() {
    const runIso = new Date().toISOString();
    setResetWorking(true);
    appendLog("camps", `[Camps] Reset crawl-state requested @ ${runIso}`);

    try {
      if (!selectedSportId) return appendLog("camps", "[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.update) {
        return appendLog("camps", "[Camps] ERROR: SchoolSportSite update not available.");
      }

      const rows = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = rows.map(normalizeSiteRow).filter((x) => x.id);

      appendLog("camps", `[Camps] Resetting ${sites.length} SchoolSportSite rows to READY…`);

      let updated = 0;
      let errors = 0;

      for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        try {
          await SchoolSportSiteEntity.update(String(s.id), {
            crawl_status: "ready",
            crawl_error: null,
            last_crawled_at: null,
            next_crawl_at: null,
            last_crawl_run_id: null,
            last_seen_at: runIso,
          });
          updated += 1;
        } catch {
          errors += 1;
        }
        if ((i + 1) % 50 === 0) appendLog("camps", `[Camps] Reset progress: ${i + 1}/${sites.length}`);
        await sleep(10);
      }

      appendLog("camps", `[Camps] Reset done. updated=${updated} errors=${errors}`);
      await refreshCrawlCounters();
    } finally {
      setResetWorking(false);
    }
  }

  /* ----------------------------
     Load Sports
  ----------------------------- */
  async function loadSports() {
    setSportsLoading(true);

    try {
      if (!SportEntity) throw new Error("Sport entity is not available. (base44.entities.Sport missing)");

      const rows = await entityList(SportEntity, {});
      const normalized = asArray(rows)
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
        const hit = normalized.find((sx) => sx.id === selectedSportId);
        if (hit) setSelectedSportName(hit.name);
      }

      if (!normalized.length) {
        appendLog("sportsusa", `[AdminImport] NOTE: Sport query returned 0 rows @ ${new Date().toISOString()}`);
      }
    } catch (e) {
      setSports([]);
      setSelectedSportId("");
      setSelectedSportName("");

      appendLog("sportsusa", `[AdminImport] ERROR loading sports @ ${new Date().toISOString()}`);
      appendLog("sportsusa", `[AdminImport] ${String(e && e.message ? e.message : e)}`);
      appendLog("sportsusa", `[AdminImport] Tip: confirm the Sport table exists and has rows, and base44.entities.Sport is correct.`);
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

  // auto-fill SportsUSA directory for sport
  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSASiteUrl(guess);
  }, [selectedSportName]);

  /* ----------------------------
     Camps ingest support
  ----------------------------- */
  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity || !CampDemoEntity.create || !CampDemoEntity.update) {
      throw new Error("CampDemo entity not available (expected entities.CampDemo).");
    }
    const key = payload && payload.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    let existing = [];
    try {
      existing = await entityList(CampDemoEntity, { event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0] && arr[0].id) {
      await CampDemoEntity.update(arr[0].id, payload);
      return "updated";
    }

    await CampDemoEntity.create(payload);
    return "created";
  }

  function normalizeAcceptedRowToFlat(a) {
    if (!a) return {};
    if (a.event && typeof a.event === "object") {
      const e = a.event;
      return {
        school_id: safeString(e.school_id),
        sport_id: safeString(e.sport_id),
        camp_name: safeString(e.camp_name),
        start_date: safeString(e.start_date),
        end_date: safeString(e.end_date),
        city: safeString(e.city),
        state: safeString(e.state),
        position_ids: asArray(e.position_ids),
        price: safeNumber(e.price) ?? safeNumber(e.price_max) ?? safeNumber(e.price_min),
        link_url: safeString(e.link_url),
        notes: safeString(e.notes),
        season_year: safeNumber(e.season_year),
        program_id: safeString(e.program_id),
        event_key: safeString(e.event_key),
        source_platform: safeString(e.source_platform),
        source_url: safeString(e.source_url),
        last_seen_at: safeString(e.last_seen_at),
        content_hash: safeString(e.content_hash),
        event_dates_raw: safeString(e.event_dates_raw),
        grades_raw: safeString(e.grades_raw),
        register_by_raw: safeString(e.register_by_raw),
        price_raw: safeString(e.price_raw),
        price_min: safeNumber(e.price_min),
        price_max: safeNumber(e.price_max),
        sections_json: safeObject(tryParseJson(e.sections_json)),
        registration_url: safeString(e.link_url),
      };
    }

    return {
      school_id: safeString(a.school_id),
      sport_id: safeString(a.sport_id),
      camp_name: safeString(a.camp_name),
      start_date: safeString(a.start_date),
      end_date: safeString(a.end_date),
      city: safeString(a.city),
      state: safeString(a.state),
      position_ids: asArray(a.position_ids),
      price: safeNumber(a.price) ?? safeNumber(a.price_max) ?? safeNumber(a.price_min),
      link_url: safeString(a.link_url) || safeString(a.registration_url) || safeString(a.source_url),
      notes: safeString(a.notes),
      season_year: safeNumber(a.season_year),
      program_id: safeString(a.program_id),
      event_key: safeString(a.event_key),
      source_platform: safeString(a.source_platform),
      source_url: safeString(a.source_url) || safeString(a.registration_url) || safeString(a.link_url),
      last_seen_at: safeString(a.last_seen_at),
      content_hash: safeString(a.content_hash),
      event_dates_raw: safeString(a.event_dates_raw),
      grades_raw: safeString(a.grades_raw),
      register_by_raw: safeString(a.register_by_raw),
      price_raw: safeString(a.price_raw),
      price_min: safeNumber(a.price_min),
      price_max: safeNumber(a.price_max),
      sections_json: safeObject(tryParseJson(a.sections_json)),
      registration_url: safeString(a.registration_url),
    };
  }

  async function updateCrawlStateForSites(siteIds, patch) {
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.update) return { updated: 0, errors: 0 };
    const ids = asArray(siteIds).filter((x) => !!x);
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < ids.length; i++) {
      try {
        await SchoolSportSiteEntity.update(String(ids[i]), patch);
        updated += 1;
      } catch {
        errors += 1;
      }
      if ((i + 1) % 50 === 0) await sleep(5);
    }
    return { updated, errors };
  }

  function pickSitesByRerunMode(sites) {
    const arr = asArray(sites);

    if (rerunMode === "all") return arr;
    if (rerunMode === "error") return arr.filter((s) => statusOf(s) === "error");
    if (rerunMode === "no_events") return arr.filter((s) => statusOf(s) === "no_events");
    if (rerunMode === "ok") return arr.filter((s) => statusOf(s) === "ok");
    if (rerunMode === "ready") return arr.filter((s) => statusOf(s) === "ready");

    return arr.filter((s) => isDueNow(s));
  }

  // ✅ Quality filter at SITE level
  async function pickSitesByQualityMode({ sites }) {
    const arr = asArray(sites);

    if (!selectedSportId || !CampDemoEntity) return arr;

    // Load CampDemo once for sport and build indexes
    const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
    const demo = asArray(demoRows);

    const schoolHasCamp = new Set();
    const schoolHasBadName = new Set();
    const schoolHasMissingPrice = new Set();

    for (const r of demo) {
      const sid = safeString(r && r.school_id);
      if (!sid) continue;
      schoolHasCamp.add(sid);

      const nm = safeString(r && r.camp_name);
      if (looksLikeBadCampName(nm)) schoolHasBadName.add(sid);

      if (isMissingPriceRow(r)) schoolHasMissingPrice.add(sid);
    }

    if (qualityMode === "bad_name") return arr.filter((s) => s.school_id && schoolHasBadName.has(String(s.school_id)));
    if (qualityMode === "missing_price") return arr.filter((s) => s.school_id && schoolHasMissingPrice.has(String(s.school_id)));
    if (qualityMode === "no_camps") return arr.filter((s) => s.school_id && !schoolHasCamp.has(String(s.school_id)));

    // any_cleanup
    return arr.filter((s) => {
      const sid = safeString(s && s.school_id);
      if (!sid) return false;
      return schoolHasBadName.has(sid) || schoolHasMissingPrice.has(sid) || !schoolHasCamp.has(sid);
    });
  }

  async function runSportsUSACampsIngest() {
    const runIso = new Date().toISOString();
    const runId = `run_${runIso.replace(/[:.]/g, "").slice(0, 15)}`;
    setCampsWorking(true);
    setLogCamps("");

    appendLog("camps", `[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
    appendLog(
      "camps",
      `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents} | fastMode=${fastMode ? "true" : "false"}`
    );
    appendLog("camps", `[Camps] QualityMode=${qualityMode} | RerunMode=${rerunMode} | BatchRunner=${batchRunnerOn ? "ON" : "OFF"} maxBatches=${maxBatches}`);

    if (campsDryRun) {
      appendLog("camps", `[Camps] NOTE: DryRun=true means: no CampDemo writes, no crawl-state updates, counters will not change.`);
    }

    try {
      if (!selectedSportId) {
        appendLog("camps", "[Camps] ERROR: Select a sport first.");
        return;
      }
      if (!SchoolSportSiteEntity) {
        appendLog("camps", "[Camps] ERROR: SchoolSportSite entity not available.");
        return;
      }
      if (!CampDemoEntity) {
        appendLog("camps", "[Camps] ERROR: CampDemo entity not available.");
        return;
      }

      const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const siteRows = siteRowsRaw.map(normalizeSiteRow);

      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${siteRows.length} (active)`);

      const rerunFiltered = pickSitesByRerunMode(siteRows);
      appendLog("camps", `[Camps] Rerun filtered sites: ${rerunFiltered.length}`);

      const qualityFiltered = await pickSitesByQualityMode({ sites: rerunFiltered });
      appendLog("camps", `[Camps] Quality filtered sites: ${qualityFiltered.length}`);

      // If not batching, run a single batch
      const batchesToRun = batchRunnerOn ? Math.max(1, Number(maxBatches || 1)) : 1;

      let totals = { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };

      let remaining = qualityFiltered.slice();
      for (let b = 1; b <= batchesToRun; b++) {
        if (!remaining.length) break;

        appendLog("camps", ``);
        appendLog("camps", `[Camps] ---- Batch ${b} ----`);

        const batch = remaining.slice(0, Number(campsMaxSites || 25));
        remaining = remaining.slice(batch.length);

        appendLog("camps", `[Camps] Batch size=${batch.length} | remainingAfterThis=${remaining.length}`);

        if (!batch.length) break;

        const tUrl = safeString(testSiteUrl);
        const tSchool = safeString(testSchoolId);

        if (tUrl && !campsDryRun && !tSchool) {
          appendLog("camps", "[Camps] ERROR: For non-dry-run with Test Site URL, you must provide Test School ID.");
          return;
        }

        const sitesToSend = tUrl
          ? []
          : batch.map((r) => ({
              id: r.id,
              school_id: r.school_id,
              sport_id: r.sport_id,
              camp_site_url: r.camp_site_url,
            }));

        appendLog("camps", `[Camps] Calling /functions/sportsUSAIngestCamps (payload: sites=${sitesToSend.length}, testSiteUrl=${tUrl ? tUrl : "no"})`);

        const res = await fetch("/functions/sportsUSAIngestCamps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sportId: selectedSportId,
            sportName: selectedSportName,
            dryRun: !!campsDryRun,
            maxSites: Number(campsMaxSites || 25),
            maxRegsPerSite: Number(campsMaxRegsPerSite || 10),
            maxEvents: Number(campsMaxEvents || 300),
            fastMode: !!fastMode,
            sites: sitesToSend,
            testSiteUrl: tUrl || null,
            testSchoolId: tSchool || null,
          }),
        });

        let data = null;
        let rawText = null;

        try {
          data = await res.json();
        } catch {
          rawText = await res.text().catch(() => null);
        }

        if (!res.ok) {
          appendLog("camps", `[Camps] Function ERROR (HTTP ${res.status})`);
          if (data) appendLog("camps", JSON.stringify(data || {}, null, 2));
          if (!data && rawText) appendLog("camps", `[Camps] Raw response (first 500 chars): ${truncate(rawText, 500)}`);
          return;
        }

        if (!data) {
          appendLog("camps", `[Camps] WARNING: Response was not JSON. HTTP ${res.status}`);
          if (rawText) appendLog("camps", `[Camps] Raw response (first 500 chars): ${truncate(rawText, 500)}`);
          return;
        }

        appendLog("camps", `[Camps] Function version: ${data && data.version ? data.version : "MISSING"}`);
        appendLog(
          "camps",
          `[Camps] Function stats: processedSites=${data && data.stats ? data.stats.processedSites : 0} processedRegs=${data && data.stats ? data.stats.processedRegs : 0} accepted=${data && data.stats ? data.stats.accepted : 0} rejected=${data && data.stats ? data.stats.rejected : 0} errors=${data && data.stats ? data.stats.errors : 0}`
        );

        if (data && data.debug && data.debug.kpi) {
          const k = data.debug.kpi;
          appendLog("camps", `[Camps] Date KPI: listing=${k.datesParsedFromListing || 0} detail=${k.datesParsedFromDetail || 0} missing=${k.datesMissing || 0}`);
          appendLog(
            "camps",
            `[Camps] Name KPI: listing=${k.namesFromListing || 0} detail=${k.namesFromDetail || 0} missing=${k.namesMissing || 0} qualityReject=${k.namesRejectedByQualityGate || 0}`
          );
          appendLog("camps", `[Camps] Price KPI: detail=${k.pricesFromDetail || 0} missing=${k.pricesMissing || 0}`);
        }

        const acceptedRaw = asArray(data && data.accepted ? data.accepted : []);
        const accepted = acceptedRaw.map((x) => normalizeAcceptedRowToFlat(x));

        appendLog("camps", `[Camps] Accepted events returned: ${accepted.length}`);
        if (accepted.length) {
          appendLog("camps", `[Camps] Sample (first 5):`);
          for (let i = 0; i < Math.min(5, accepted.length); i++) {
            const a = accepted[i] || {};
            appendLog("camps", `- camp="${a.camp_name || ""}" start=${a.start_date || "n/a"} price=${a.price != null ? a.price : "n/a"} url=${a.link_url || a.registration_url || ""}`);
          }
        }

        // crawl-state update
        if (tUrl) {
          appendLog("camps", `[Camps] Test mode: not updating SchoolSportSite crawl-state (no site ids).`);
        } else if (campsDryRun) {
          appendLog("camps", `[Camps] DryRun=true: crawl-state update skipped.`);
        } else {
          const outcome = accepted.length ? "ok" : "no_events";
          const patch = {
            crawl_status: outcome,
            crawl_error: null,
            last_crawled_at: runIso,
            next_crawl_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            last_crawl_run_id: runId,
            last_seen_at: runIso,
          };
          const ids = batch.map((b2) => b2.id).filter(Boolean);
          const upd = await updateCrawlStateForSites(ids, patch);
          appendLog("camps", `[Camps] Updated crawl-state for batch sites: ${upd.updated} (${outcome}) errors=${upd.errors}`);
        }

        // writes
        if (campsDryRun) {
          appendLog("camps", `[Camps] DryRun=true: no CampDemo writes performed.`);
          continue;
        }

        if (!accepted.length) continue;

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        let improved = 0;

        for (let i = 0; i < accepted.length; i++) {
          const a = accepted[i] || {};

          const school_id = safeString(a.school_id) || (tUrl ? safeString(tSchool) : null);
          const sport_id = selectedSportId;
          const camp_name = safeString(a.camp_name);

          const start_date = toISODate(a.start_date);
          const end_date = toISODate(a.end_date);

          const link_url = safeString(a.link_url) || safeString(a.registration_url) || safeString(a.source_url);

          if (!school_id || !sport_id || !camp_name || !start_date) {
            skipped += 1;
            continue;
          }

          const season_year = safeNumber(a.season_year) ?? safeNumber(computeSeasonYearFootball(start_date));
          if (season_year == null) {
            skipped += 1;
            continue;
          }

          const program_id = safeString(a.program_id) || `sportsusa:${slugify(camp_name)}`;

          const source_platform = safeString(a.source_platform) || "sportsusa";
          const source_url = safeString(a.source_url) || link_url;

          const event_key =
            safeString(a.event_key) ||
            buildEventKey({
              source_platform,
              program_id,
              start_date,
              link_url,
              source_url,
            });

          // pre-check for “improvement” (based on what exists today)
          let existing = [];
          try {
            existing = await entityList(CampDemoEntity, { event_key });
          } catch {
            existing = [];
          }
          const prev = existing && existing[0] ? existing[0] : null;
          const prevBad = prev ? looksLikeBadCampName(prev.camp_name) : true;
          const prevMissing = prev ? isMissingPriceRow(prev) : true;

          const price_best = safeNumber(a.price) ?? safeNumber(a.price_max) ?? safeNumber(a.price_min);

          const content_hash =
            safeString(a.content_hash) ||
            simpleHash({
              school_id,
              sport_id,
              camp_name,
              start_date,
              end_date,
              link_url,
              source_platform,
              program_id,
              event_dates_raw: safeString(a.event_dates_raw),
              notes: safeString(a.notes),
              price: safeNumber(price_best),
              price_min: safeNumber(a.price_min),
              price_max: safeNumber(a.price_max),
              price_raw: safeString(a.price_raw),
            });

          const payload = {
            school_id,
            sport_id,
            camp_name,
            start_date,
            end_date: end_date || null,
            city: safeString(a.city) || null,
            state: safeString(a.state) || null,
            position_ids: normalizeStringArray(a.position_ids),
            price: price_best,
            link_url: link_url || null,
            notes: safeString(a.notes) || null,
            season_year,
            program_id,
            event_key,
            source_platform,
            source_url: source_url || null,
            last_seen_at: runIso,
            content_hash,
            event_dates_raw: safeString(a.event_dates_raw) || null,
            grades_raw: safeString(a.grades_raw) || null,
            register_by_raw: safeString(a.register_by_raw) || null,
            price_raw: safeString(a.price_raw) || null,
            price_min: safeNumber(a.price_min),
            price_max: safeNumber(a.price_max),
            sections_json: safeObject(a.sections_json) || null,
          };

          try {
            const r = await upsertCampDemoByEventKey(payload);
            if (r === "created") created += 1;
            if (r === "updated") updated += 1;

            // improvement = previously bad name OR missing price, and now fixed
            const nowBad = looksLikeBadCampName(payload.camp_name);
            const nowMissing = isMissingPriceRow(payload);

            const improvedThisRow = (prevBad && !nowBad) || (prevMissing && !nowMissing);
            if (improvedThisRow) improved += 1;
          } catch (e) {
            errors += 1;
            appendLog("camps", `[Camps] WRITE ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`);
          }

          if ((i + 1) % 25 === 0) appendLog("camps", `[Camps] Write progress: ${i + 1}/${accepted.length}`);
          await sleep(25);
        }

        totals.created += created;
        totals.updated += updated;
        totals.skipped += skipped;
        totals.errors += errors;
        totals.improved += improved;

        appendLog("camps", `[Camps] Batch ${b} writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors} improved=${improved}`);

        // refresh quality counters so you can see the countdown
        await refreshQualityCounters();
      }

      appendLog("camps", `[Camps] DONE (this click). totals: created=${totals.created} updated=${totals.updated} skipped=${totals.skipped} errors=${totals.errors} improved=${totals.improved}`);
      appendLog("camps", `[Camps] Stop rule: When your target Remaining counter stops dropping for 2 clicks, you’re done for that mode.`);
      await refreshCrawlCounters();
    } catch (e) {
      appendLog("camps", `[Camps] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     UI
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">SportsUSA seeding + camp ingestion + promotion.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* Global Sport Selector */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">1) Select Sport</div>
          <div className="text-sm text-slate-600 mt-1">This selection drives Seed Schools, Camps Ingest, and Counters.</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sport</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={selectedSportId}
                onChange={(e) => {
                  const id = e.target.value;
                  const hit = sports.find((x) => x.id === id) || null;
                  setSelectedSportId(id);
                  setSelectedSportName(hit && hit.name ? hit.name : "");
                }}
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking || seedWorking}
              >
                <option value="">Select…</option>
                {sports.map((sx) => (
                  <option key={sx.id} value={sx.id}>
                    {sx.name} {sx.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">{sportsLoading ? "Loading sports…" : selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport"}</div>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => loadSports()} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button variant="outline" onClick={() => refreshCrawlCounters()} disabled={countersWorking || !selectedSportId}>
                {countersWorking ? "Refreshing…" : "Refresh Crawl"}
              </Button>
              <Button variant="outline" onClick={() => refreshQualityCounters()} disabled={qualityWorking || !selectedSportId}>
                {qualityWorking ? "Refreshing…" : "Refresh Quality"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Crawl Counters */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Crawl Counters</div>
          <div className="text-sm text-slate-600 mt-1">Tracks SchoolSportSite crawl-state (not CampDemo cleanup).</div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-7 gap-2 text-sm">
            {[
              ["Active", siteCounters.active],
              ["Done", siteCounters.done],
              ["Due Now", siteCounters.dueNow],
              ["Ready", siteCounters.ready],
              ["OK", siteCounters.ok],
              ["No Events", siteCounters.no_events],
              ["Error", siteCounters.error],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={resetCrawlStateForSport} disabled={!selectedSportId || resetWorking || campsWorking}>
              {resetWorking ? "Resetting…" : "Reset crawl state (READY for all)"}
            </Button>
            <Button variant="outline" onClick={() => setLogCounters("")}>
              Clear Crawl Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Crawl Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logCounters || "—"}</pre>
          </div>
        </Card>

        {/* ✅ Quality Counters */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Quality Counters</div>
          <div className="text-sm text-slate-600 mt-1">
            This is your cleanup countdown (derived from <b>CampDemo</b> + SchoolSportSite).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-white border border-slate-200 p-2">
              <div className="text-[11px] text-slate-500">BadNameRemaining</div>
              <div className="font-semibold">{qualityCounters.badNameRemaining}</div>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2">
              <div className="text-[11px] text-slate-500">MissingPriceRemaining</div>
              <div className="font-semibold">{qualityCounters.missingPriceRemaining}</div>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2">
              <div className="text-[11px] text-slate-500">NoCampsRemaining</div>
              <div className="font-semibold">{qualityCounters.noCampsRemaining}</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => refreshQualityCounters()} disabled={qualityWorking || !selectedSportId}>
              {qualityWorking ? "Refreshing…" : "Refresh Quality"}
            </Button>
            <Button variant="outline" onClick={() => setLogQuality("")}>
              Clear Quality Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Quality Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logQuality || "—"}</pre>
          </div>
        </Card>

        {/* Camps ingest */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">2) Ingest Camps (SchoolSportSite → CampDemo)</div>
          <div className="text-sm text-slate-600 mt-1">
            For cleanup: use <b>QualityMode</b> + <b>BatchRunner</b> + DryRun=false, then watch Quality Counters drop.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quality mode</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={qualityMode}
                onChange={(e) => setQualityMode(e.target.value)}
                disabled={campsWorking}
              >
                {QUALITY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">Pick the cleanup target you want to burn down.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun mode</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={rerunMode}
                onChange={(e) => setRerunMode(e.target.value)}
                disabled={campsWorking}
              >
                {RERUN_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">Most cleanup runs should use Force recrawl ALL.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={campsMaxSites}
                  onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))}
                  min={1}
                  max={500}
                  disabled={campsWorking}
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={campsDryRun} onChange={(e) => setCampsDryRun(e.target.checked)} disabled={campsWorking} />
                  Dry Run
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max regs/site</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={campsMaxRegsPerSite}
                  onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))}
                  min={1}
                  max={50}
                  disabled={campsWorking}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max events</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={campsMaxEvents}
                  onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))}
                  min={5}
                  max={5000}
                  disabled={campsWorking}
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} disabled={campsWorking} />
                fastMode
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={batchRunnerOn} onChange={(e) => setBatchRunnerOn(e.target.checked)} disabled={campsWorking} />
                  BatchRunner
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">maxBatches</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={maxBatches}
                  onChange={(e) => setMaxBatches(Number(e.target.value || 0))}
                  min={1}
                  max={200}
                  disabled={campsWorking || !batchRunnerOn}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking || sportsUSAWorking || promoteWorking || seedWorking}>
              {campsWorking ? "Running…" : campsDryRun ? "Run Camps Ingest (Dry Run)" : "Run Camps Ingest → Write CampDemo"}
            </Button>

            <Button variant="outline" onClick={() => setLogCamps("")} disabled={campsWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Camps Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">{logCamps || "—"}</pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={sportsUSAWorking || campsWorking || promoteWorking || seedWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
