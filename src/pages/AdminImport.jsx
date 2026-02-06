// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/entities"; // ✅ FIX: align to your project pattern (entities.js exports base44)

/* =========================================================
   AdminImport
   - Seed Schools (SportsUSA)
   - Ingest Camps (SchoolSportSite -> CampDemo)
   - Promote (CampDemo -> Camp)
   - Crawl Counters (state)
   - Quality Counters (cleanup targeting + stop signals)
   - Batch Runner per click (with delays + rate-limit friendly writes)
========================================================= */

/* ----------------------------
   Minimal UI wrappers (avoids blank page if ui/* imports differ)
----------------------------- */
const Card = ({ className = "", children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>
);
const Button = ({ variant = "solid", className = "", disabled, onClick, children, ...rest }) => {
  const base = "px-3 py-2 rounded-lg text-sm border disabled:opacity-50 disabled:cursor-not-allowed";
  const style =
    variant === "outline"
      ? "bg-white border-slate-300 hover:bg-slate-50"
      : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800";
  return (
    <button className={`${base} ${style} ${className}`} disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  );
};

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

// null/"" stays null; numeric strings convert; invalid -> null
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

// Simple stable hash (MVP-safe; not crypto)
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

function truncate(s, n) {
  const str = String(s ?? "");
  const max = Number(n ?? 600);
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
}

/* ----------------------------
   Base44 entity query helper
----------------------------- */
async function entityList(Entity, whereObj) {
  if (!Entity) throw new Error("Entity is null/undefined.");
  const where = whereObj || {};

  if (typeof Entity.filter === "function") return asArray(await Entity.filter(where));

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

  if (typeof Entity.all === "function") return asArray(await Entity.all());

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
   Crawl-state helpers
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
    active: typeof r?.active === "boolean" ? r.active : !!(r && r.active),
    crawl_status: statusOf(r),
    last_crawled_at: safeString(r && r.last_crawled_at),
    next_crawl_at: safeString(r && r.next_crawl_at),
    crawl_error: safeString(r && r.crawl_error),
    last_crawl_run_id: safeString(r && r.last_crawl_run_id),
    raw: r,
  };
}

/* ----------------------------
   Quality rules (what “needs cleanup” means)
----------------------------- */
function isRegisterishName(name) {
  const t = lc(name);
  if (!t) return false;
  if (t === "register") return true;
  if (t === "register now") return true;
  if (t === "view details") return true;
  if (t === "details") return true;
  return false;
}

function isMissingOrZeroPrice(row) {
  // Treat missing/0 as needing cleanup
  const p = safeNumber(row?.price);
  const pmin = safeNumber(row?.price_min);
  const pmax = safeNumber(row?.price_max);

  // “0” is junk in your context; null is missing
  const any = [p, pmin, pmax].some((x) => x != null);
  if (!any) return true;
  if (p === 0) return true;
  if (pmin === 0) return true;
  if (pmax === 0) return true;

  // if all present values are null (already handled) or all are 0 handled
  // If price exists but min/max missing, that's still acceptable; do NOT flag.
  return false;
}

/* =========================================================
   Component
========================================================= */
export default function AdminImport() {
  const nav = useNavigate();

  /* ----------------------------
     Entities (defensive)
  ----------------------------- */
  const SportEntity = base44?.entities ? base44.entities.Sport || base44.entities.Sports : null;
  const SchoolEntity = base44?.entities ? base44.entities.School || base44.entities.Schools : null;
  const SchoolSportSiteEntity = base44?.entities ? base44.entities.SchoolSportSite || base44.entities.SchoolSportSites : null;

  const CampDemoEntity = base44?.entities ? base44.entities.CampDemo : null;
  const CampEntity = base44?.entities ? base44.entities.Camp : null;

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
  const [logCounters, setLogCounters] = useState("");
  const [logQuality, setLogQuality] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "counters") setLogCounters(add);
    if (which === "quality") setLogQuality(add);
  }

  /* ----------------------------
     Work flags
  ----------------------------- */
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  const [campsWorking, setCampsWorking] = useState(false);
  const [promoteWorking, setPromoteWorking] = useState(false);
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

  // Write throttling (prevents “Rate limit exceeded”)
  const [writeDelayMs, setWriteDelayMs] = useState(150);
  const [batchDelayMs, setBatchDelayMs] = useState(400);

  // Batch runner
  const [batchRunnerOn, setBatchRunnerOn] = useState(true);
  const [maxBatchesPerClick, setMaxBatchesPerClick] = useState(10);

  // Rerun mode
  const RERUN_MODES = [
    { id: "due", label: "Due only (normal)" },
    { id: "all", label: "Force recrawl ALL active" },
    { id: "error", label: "Recrawl ERROR only" },
    { id: "no_events", label: "Recrawl NO_EVENTS only" },
    { id: "ok", label: "Recrawl OK only" },
    { id: "ready", label: "Recrawl READY only" },
  ];
  const [rerunMode, setRerunMode] = useState("due");

  // Quality mode (THIS is the aligned list you asked for)
  const QUALITY_MODES = [
    { id: "none", label: "No quality filter (use rerun mode only)" },
    { id: "register_only", label: "Only schools with camp_name='Register'" },
    { id: "missing_price_only", label: "Only schools with missing price" },
    { id: "no_camps_only", label: "Only schools with NO camps" },
    { id: "any_cleanup", label: "Schools needing cleanup (Register OR missing price OR no camps)" },
  ];
  const [qualityMode, setQualityMode] = useState("any_cleanup");

  // Test mode
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [testSchoolId, setTestSchoolId] = useState("");

  /* ----------------------------
     Crawl Counters (site state)
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
      appendLog("counters", `[Counters] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCountersWorking(false);
    }
  }

  /* ----------------------------
     Quality Counters (STOP signals)
     - Register names remaining (events)
     - Missing price remaining (events)
     - Schools with no camps
     - Improved this run (events updated from "bad" -> "good")
     - Also: school counts for targeting
  ----------------------------- */
  const [qualityCounters, setQualityCounters] = useState({
    registerNamesRemaining: 0,
    missingPriceRemaining: 0,
    schoolsWithNoCamps: 0,
    improvedThisRun: 0,
    schoolsNeedingRegisterFix: 0,
    schoolsNeedingPriceFix: 0,
    schoolsNeedingAnyCleanup: 0,
  });

  // Store the target school_id sets to drive qualityMode filtering
  const [qualitySchoolSets, setQualitySchoolSets] = useState({
    register: new Set(),
    missingPrice: new Set(),
    noCamps: new Set(),
    any: new Set(),
  });

  async function refreshQualityCounters({ improvedThisRunOverride } = {}) {
    const nowIso = new Date().toISOString();
    setQualityWorking(true);

    try {
      if (!selectedSportId) {
        setQualityCounters({
          registerNamesRemaining: 0,
          missingPriceRemaining: 0,
          schoolsWithNoCamps: 0,
          improvedThisRun: 0,
          schoolsNeedingRegisterFix: 0,
          schoolsNeedingPriceFix: 0,
          schoolsNeedingAnyCleanup: 0,
        });
        setQualitySchoolSets({ register: new Set(), missingPrice: new Set(), noCamps: new Set(), any: new Set() });
        appendLog("quality", `[Quality] Select a sport first.`);
        return;
      }
      if (!SchoolSportSiteEntity || !CampDemoEntity) {
        appendLog("quality", `[Quality] ERROR: Missing entities (SchoolSportSite or CampDemo).`);
        return;
      }

      // Load sites
      const siteRows = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = siteRows.map(normalizeSiteRow).filter((s) => s.school_id);

      // Load CampDemo rows for sport
      const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });

      let registerNamesRemaining = 0;
      let missingPriceRemaining = 0;

      const schoolHasCamp = new Set();
      const registerSchools = new Set();
      const missingPriceSchools = new Set();

      for (const r of asArray(demoRows)) {
        const schoolId = safeString(r?.school_id);
        if (schoolId) schoolHasCamp.add(schoolId);

        const name = safeString(r?.camp_name);
        if (schoolId && isRegisterishName(name)) {
          registerNamesRemaining += 1;
          registerSchools.add(schoolId);
        }

        if (schoolId && isMissingOrZeroPrice(r)) {
          missingPriceRemaining += 1;
          missingPriceSchools.add(schoolId);
        }
      }

      // Schools with no camps = active sites whose school_id has no CampDemo
      const noCampsSchools = new Set();
      for (const s of sites) {
        if (s.school_id && !schoolHasCamp.has(s.school_id)) noCampsSchools.add(s.school_id);
      }

      const anyCleanupSchools = new Set([...registerSchools, ...missingPriceSchools, ...noCampsSchools]);

      setQualitySchoolSets({
        register: registerSchools,
        missingPrice: missingPriceSchools,
        noCamps: noCampsSchools,
        any: anyCleanupSchools,
      });

      const schoolsWithNoCamps = noCampsSchools.size;

      const improvedThisRun =
        typeof improvedThisRunOverride === "number"
          ? improvedThisRunOverride
          : qualityCounters.improvedThisRun || 0;

      setQualityCounters({
        registerNamesRemaining,
        missingPriceRemaining,
        schoolsWithNoCamps,
        improvedThisRun,
        schoolsNeedingRegisterFix: registerSchools.size,
        schoolsNeedingPriceFix: missingPriceSchools.size,
        schoolsNeedingAnyCleanup: anyCleanupSchools.size,
      });

      appendLog(
        "quality",
        `[Quality] Refreshed @ ${nowIso} | RegisterRemaining=${registerNamesRemaining} | MissingPriceRemaining=${missingPriceRemaining} | SchoolsNoCamps=${schoolsWithNoCamps} | Schools(Register)=${registerSchools.size} | Schools(Price)=${missingPriceSchools.size} | Schools(Any)=${anyCleanupSchools.size}`
      );
    } catch (e) {
      appendLog("quality", `[Quality] ERROR: ${String(e?.message || e)}`);
    } finally {
      setQualityWorking(false);
    }
  }

  /* ----------------------------
     Reset crawl-state for sport
     - Use this when you WANT everything to be due/ready again.
     - Do NOT use during cleanup targeting unless you intentionally want to force full refresh.
  ----------------------------- */
  async function resetCrawlStateForSport() {
    const runIso = new Date().toISOString();
    setResetWorking(true);
    appendLog("counters", `[Counters] Reset crawl-state requested @ ${runIso}`);

    try {
      if (!selectedSportId) return appendLog("counters", "[Counters] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity?.update) return appendLog("counters", "[Counters] ERROR: SchoolSportSite update not available.");

      const rows = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = rows.map(normalizeSiteRow).filter((x) => x.id);

      appendLog("counters", `[Counters] Resetting ${sites.length} SchoolSportSite rows to READY…`);

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
        if ((i + 1) % 50 === 0) appendLog("counters", `[Counters] Reset progress: ${i + 1}/${sites.length}`);
        await sleep(10);
      }

      appendLog("counters", `[Counters] Reset done. updated=${updated} errors=${errors}`);
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
      if (!SportEntity) throw new Error("Sport entity not available.");

      const rows = await entityList(SportEntity, {});
      const normalized = asArray(rows)
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
          name: String(r?.sport_name || r?.name || r?.sportName || "").trim(),
        }))
        .filter((r) => r.id && r.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      setSports(normalized);

      if (!selectedSportId && normalized.length) {
        setSelectedSportId(normalized[0].id);
        setSelectedSportName(normalized[0].name);
      } else if (selectedSportId) {
        const hit = normalized.find((sx) => sx.id === selectedSportId);
        if (hit) setSelectedSportName(hit.name);
      }
    } catch (e) {
      setSports([]);
      setSelectedSportId("");
      setSelectedSportName("");
      appendLog("sportsusa", `[AdminImport] ERROR loading sports: ${String(e?.message || e)}`);
    } finally {
      setSportsLoading(false);
    }
  }

  useEffect(() => {
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill directory for sport
  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSASiteUrl(guess);
  }, [selectedSportName]);

  // Refresh counters when sport changes
  useEffect(() => {
    if (!selectedSportId) return;
    refreshCrawlCounters();
    refreshQualityCounters({ improvedThisRunOverride: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* ----------------------------
     Seed Schools
  ----------------------------- */
  async function upsertSchoolBySourceKey({ school_name, logo_url, source_key, source_school_url }) {
    if (!SchoolEntity?.create || !SchoolEntity?.update) throw new Error("School entity not available.");
    const key = safeString(source_key);
    const name = safeString(school_name);
    if (!name) throw new Error("Missing school_name");
    if (!key) throw new Error("Missing source_key");

    let existing = [];
    try {
      existing = await entityList(SchoolEntity, { source_key: key });
    } catch {
      existing = [];
    }

    const payload = {
      school_name: name,
      logo_url: safeString(logo_url) || null,
      source_platform: "sportsusa",
      source_school_url: safeString(source_school_url) || null,
      source_key: key,
      active: true,
      needs_review: false,
      normalized_name: lc(name).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(),
      aliases_json: "[]",
      school_type: "College/University",
      division: "Unknown",
      conference: null,
      city: null,
      state: null,
      country: "US",
      website_url: null,
      last_seen_at: new Date().toISOString(),
    };

    if (existing.length && existing[0]?.id) {
      await SchoolEntity.update(String(existing[0].id), payload);
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await SchoolEntity.create(payload);
    return { id: created?.id ? String(created.id) : null, mode: "created" };
  }

  async function upsertSchoolSportSiteByKey({ school_id, sport_id, camp_site_url, logo_url, source_key }) {
    if (!SchoolSportSiteEntity?.create || !SchoolSportSiteEntity?.update) throw new Error("SchoolSportSite entity not available.");

    const key = safeString(source_key);
    if (!key) throw new Error("Missing source_key for SchoolSportSite");

    let existing = [];
    try {
      existing = await entityList(SchoolSportSiteEntity, { source_key: key });
    } catch {
      existing = [];
    }

    const payload = {
      school_id: safeString(school_id),
      sport_id: safeString(sport_id),
      camp_site_url: safeString(camp_site_url),
      logo_url: safeString(logo_url) || null,
      source_platform: "sportsusa",
      source_key: key,
      active: true,
      needs_review: false,
      last_seen_at: new Date().toISOString(),

      crawl_status: "ready",
      crawl_error: null,
      last_crawled_at: null,
      next_crawl_at: null,
      last_crawl_run_id: null,
    };

    if (existing.length && existing[0]?.id) {
      await SchoolSportSiteEntity.update(String(existing[0].id), payload);
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await SchoolSportSiteEntity.create(payload);
    return { id: created?.id ? String(created.id) : null, mode: "created" };
  }

  async function runSportsUSASeedSchools() {
    const runIso = new Date().toISOString();
    setSportsUSAWorking(true);
    setLogSportsUSA("");

    appendLog("sportsusa", `[SportsUSA] Starting: School Seed (${selectedSportName}) @ ${runIso}`);
    appendLog("sportsusa", `[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);

    try {
      if (!selectedSportId) return appendLog("sportsusa", "[SportsUSA] ERROR: Select a sport first.");
      const siteUrl = safeString(sportsUSASiteUrl);
      if (!siteUrl) return appendLog("sportsusa", "[SportsUSA] ERROR: Missing SportsUSA directory URL.");
      if (!SchoolEntity || !SchoolSportSiteEntity) return appendLog("sportsusa", "[SportsUSA] ERROR: Entities missing.");

      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl,
          limit: Number(sportsUSALimit || 300),
          dryRun: !!sportsUSADryRun,
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
        appendLog("sportsusa", `[SportsUSA] Function ERROR (HTTP ${res.status})`);
        if (data) appendLog("sportsusa", JSON.stringify(data || {}, null, 2));
        if (!data && rawText) appendLog("sportsusa", truncate(rawText, 600));
        return;
      }

      const schools = asArray(data?.schools || []);
      appendLog("sportsusa", `[SportsUSA] schools_found=${schools.length}`);

      if (sportsUSADryRun) {
        appendLog("sportsusa", `[SportsUSA] DryRun=true: no writes.`);
        return;
      }

      let schoolsCreated = 0;
      let schoolsUpdated = 0;
      let sitesCreated = 0;
      let sitesUpdated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < schools.length; i++) {
        const srow = schools[i] || {};
        try {
          const schoolName = safeString(srow.school_name);
          const logoUrl = safeString(srow.logo_url);
          const viewSiteUrl = safeString(srow.view_site_url);

          const sourceKeySchool = safeString(srow.source_key) || `sportsusa:school:${lc(viewSiteUrl || schoolName || "")}`;
          const sourceKeySite = `sportsusa:${slugify(selectedSportName)}:${lc(viewSiteUrl || "")}`;

          if (!schoolName || !viewSiteUrl) {
            skipped += 1;
            continue;
          }

          const upSchool = await upsertSchoolBySourceKey({
            school_name: schoolName,
            logo_url: logoUrl,
            source_key: sourceKeySchool,
            source_school_url: viewSiteUrl,
          });
          if (upSchool.mode === "created") schoolsCreated += 1;
          if (upSchool.mode === "updated") schoolsUpdated += 1;

          const upSite = await upsertSchoolSportSiteByKey({
            school_id: upSchool.id,
            sport_id: selectedSportId,
            camp_site_url: viewSiteUrl,
            logo_url: logoUrl,
            source_key: sourceKeySite,
          });
          if (upSite.mode === "created") sitesCreated += 1;
          if (upSite.mode === "updated") sitesUpdated += 1;
        } catch (e) {
          errors += 1;
          appendLog("sportsusa", `[SportsUSA] ERROR row #${i + 1}: ${String(e?.message || e)}`);
        }

        if ((i + 1) % 10 === 0) {
          appendLog(
            "sportsusa",
            `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`
          );
        }
        await sleep(20);
      }

      appendLog(
        "sportsusa",
        `[SportsUSA] Done. Schools created=${schoolsCreated} updated=${schoolsUpdated} | Sites created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`
      );

      await refreshCrawlCounters();
      await refreshQualityCounters({ improvedThisRunOverride: 0 });
    } catch (e) {
      appendLog("sportsusa", `[SportsUSA] ERROR: ${String(e?.message || e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Camps ingest plumbing
  ----------------------------- */
  function pickSitesByRerunMode(sites) {
    const arr = asArray(sites);
    if (rerunMode === "all") return arr;
    if (rerunMode === "error") return arr.filter((s) => statusOf(s) === "error");
    if (rerunMode === "no_events") return arr.filter((s) => statusOf(s) === "no_events");
    if (rerunMode === "ok") return arr.filter((s) => statusOf(s) === "ok");
    if (rerunMode === "ready") return arr.filter((s) => statusOf(s) === "ready");
    return arr.filter((s) => isDueNow(s));
  }

  function pickSitesByQualityMode(sites) {
    // Quality filters target by school_id sets, not crawl_status
    if (qualityMode === "none") return sites;

    const pickSet =
      qualityMode === "register_only"
        ? qualitySchoolSets.register
        : qualityMode === "missing_price_only"
        ? qualitySchoolSets.missingPrice
        : qualityMode === "no_camps_only"
        ? qualitySchoolSets.noCamps
        : qualityMode === "any_cleanup"
        ? qualitySchoolSets.any
        : null;

    if (!pickSet || pickSet.size === 0) return [];

    return asArray(sites).filter((s) => s.school_id && pickSet.has(s.school_id));
  }

  async function updateCrawlStateForSites(siteIds, patch) {
    if (!SchoolSportSiteEntity?.update) return { updated: 0, errors: 0 };
    const ids = asArray(siteIds).filter(Boolean);
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

  async function upsertCampDemoByEventKeyWithRetry(payload, maxAttempts = 4) {
    if (!CampDemoEntity?.create || !CampDemoEntity?.update) throw new Error("CampDemo entity not available.");
    const key = payload?.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    // Look up existing once per attempt (Base44 rate limits sometimes hit on write, not read)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let existing = [];
        try {
          existing = await entityList(CampDemoEntity, { event_key: key });
        } catch {
          existing = [];
        }

        const arr = asArray(existing);
        if (arr.length > 0 && arr[0]?.id) {
          await CampDemoEntity.update(arr[0].id, payload);
          return "updated";
        }

        await CampDemoEntity.create(payload);
        return "created";
      } catch (e) {
        const msg = String(e?.message || e);
        const isRate = msg.toLowerCase().includes("rate limit");
        const isNetwork = msg.toLowerCase().includes("network");
        if (attempt === maxAttempts || (!isRate && !isNetwork)) throw e;

        // Backoff
        const wait = 250 + attempt * 250;
        await sleep(wait);
      }
    }

    // Should never hit
    return "updated";
  }

  /* ----------------------------
     Ingest runner (single batch call)
     Returns: { accepted, improvedCount, created, updated, errors }
  ----------------------------- */
  async function runOneBatch(batchSites, { runIso, runId }) {
    // Guard
    if (!batchSites.length) return { accepted: [], improvedCount: 0, created: 0, updated: 0, errors: 0 };

    const tUrl = safeString(testSiteUrl);
    const tSchool = safeString(testSchoolId);

    if (tUrl && !campsDryRun && !tSchool) {
      appendLog("camps", "[Camps] ERROR: For non-dry-run with Test Site URL, you must provide Test School ID.");
      return { accepted: [], improvedCount: 0, created: 0, updated: 0, errors: 1 };
    }

    const sitesToSend = tUrl
      ? []
      : batchSites.map((r) => ({
          id: r.id,
          school_id: r.school_id,
          sport_id: r.sport_id,
          camp_site_url: r.camp_site_url,
        }));

    appendLog(
      "camps",
      `[Camps] Calling /functions/sportsUSAIngestCamps (payload: sites=${sitesToSend.length}, testSiteUrl=${tUrl ? tUrl : "no"})`
    );

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

    if (!res.ok || !data) {
      appendLog("camps", `[Camps] Function ERROR (HTTP ${res.status})`);
      if (data) appendLog("camps", JSON.stringify(data || {}, null, 2));
      if (!data && rawText) appendLog("camps", truncate(rawText, 600));
      return { accepted: [], improvedCount: 0, created: 0, updated: 0, errors: 1 };
    }

    appendLog("camps", `[Camps] Function version: ${data?.version || "MISSING"}`);
    appendLog(
      "camps",
      `[Camps] Function stats: processedSites=${data?.stats?.processedSites || 0} processedRegs=${data?.stats?.processedRegs || 0} accepted=${
        data?.stats?.accepted || 0
      } rejected=${data?.stats?.rejected || 0} errors=${data?.stats?.errors || 0}`
    );

    if (data?.debug?.kpi) {
      const k = data.debug.kpi;
      appendLog("camps", `[Camps] Date KPI: listing=${k.datesParsedFromListing || 0} detail=${k.datesParsedFromDetail || 0} missing=${k.datesMissing || 0}`);
      appendLog(
        "camps",
        `[Camps] Name KPI: listing=${k.namesFromListing || 0} detail=${k.namesFromDetail || 0} missing=${k.namesMissing || 0} qualityReject=${k.namesRejectedByQualityGate || 0}`
      );
      if (k.pricesFromDetail != null) appendLog("camps", `[Camps] Price KPI: detail=${k.pricesFromDetail || 0} missing=${k.pricesMissing || 0}`);
    }

    const acceptedRaw = asArray(data?.accepted || []);
    const accepted = acceptedRaw.map((x) => normalizeAcceptedRowToFlat(x));

    appendLog("camps", `[Camps] Accepted events returned: ${accepted.length}`);
    if (accepted.length) {
      appendLog("camps", `[Camps] Sample (first 5):`);
      for (let i = 0; i < Math.min(5, accepted.length); i++) {
        const a = accepted[i] || {};
        appendLog("camps", `- camp="${a.camp_name || ""}" start=${a.start_date || "n/a"} price=${a.price != null ? a.price : "n/a"} url=${a.link_url || a.registration_url || ""}`);
      }
    }

    // Crawl-state patch
    if (!tUrl && !campsDryRun) {
      const outcome = accepted.length ? "ok" : "no_events";
      const patch = {
        crawl_status: outcome,
        crawl_error: null,
        last_crawled_at: runIso,
        // push next crawl out for normal operations (weekly/periodic)
        next_crawl_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // ✅ weekly cadence default
        last_crawl_run_id: runId,
        last_seen_at: runIso,
      };
      const ids = batchSites.map((b) => b.id).filter(Boolean);
      const upd = await updateCrawlStateForSites(ids, patch);
      appendLog("camps", `[Camps] Updated crawl-state for batch sites: ${upd.updated} (${outcome}) errors=${upd.errors}`);
    } else if (tUrl) {
      appendLog("camps", `[Camps] Test mode: not updating SchoolSportSite crawl-state.`);
    } else {
      appendLog("camps", `[Camps] DryRun=true: would update crawl-state for batch sites: ${batchSites.length} (skipped)`);
    }

    // Writes (CampDemo)
    if (campsDryRun) {
      appendLog("camps", `[Camps] DryRun=true: no CampDemo writes.`);
      return { accepted, improvedCount: 0, created: 0, updated: 0, errors: 0 };
    }

    if (!accepted.length) {
      appendLog("camps", `[Camps] No accepted events to write.`);
      return { accepted, improvedCount: 0, created: 0, updated: 0, errors: 0 };
    }

    // To compute “improved this run”, we consider an event “improved” if:
    // - prior state (existing) had registerish camp_name OR missing/0 price
    // - new payload has a better camp_name and non-missing price
    // We'll check existing row by event_key before upsert.
    let created = 0;
    let updated = 0;
    let errors = 0;
    let improvedCount = 0;

    for (let i = 0; i < accepted.length; i++) {
      const a = accepted[i] || {};

      const school_id = safeString(a.school_id) || (tUrl ? safeString(testSchoolId) : null);
      const sport_id = selectedSportId;
      const camp_name = safeString(a.camp_name);

      const start_date = toISODate(a.start_date);
      const end_date = toISODate(a.end_date);

      const link_url = safeString(a.link_url) || safeString(a.registration_url) || safeString(a.source_url);
      if (!school_id || !sport_id || !camp_name || !start_date) {
        continue;
      }

      const season_year = safeNumber(a.season_year) ?? safeNumber(computeSeasonYearFootball(start_date));
      if (season_year == null) continue;

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
          price: safeNumber(a.price),
          price_min: safeNumber(a.price_min),
          price_max: safeNumber(a.price_max),
          price_raw: safeString(a.price_raw),
        });

      const price_best = safeNumber(a.price) ?? safeNumber(a.price_max) ?? safeNumber(a.price_min);

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
        // improvement check: fetch existing by event_key
        let before = null;
        try {
          const ex = await entityList(CampDemoEntity, { event_key });
          if (ex && ex[0]) before = ex[0];
        } catch {
          before = null;
        }

        const beforeBadName = before ? isRegisterishName(before?.camp_name) : false;
        const beforeBadPrice = before ? isMissingOrZeroPrice(before) : false;

        const afterBadName = isRegisterishName(payload.camp_name);
        const afterBadPrice = isMissingOrZeroPrice(payload);

        const r = await upsertCampDemoByEventKeyWithRetry(payload, 4);
        if (r === "created") created += 1;
        if (r === "updated") updated += 1;

        if ((beforeBadName || beforeBadPrice) && !afterBadName && !afterBadPrice) {
          improvedCount += 1;
        }
      } catch (e) {
        errors += 1;
        appendLog("camps", `[Camps] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
      }

      if ((i + 1) % 25 === 0) appendLog("camps", `[Camps] Write progress: ${i + 1}/${accepted.length}`);
      await sleep(Math.max(0, Number(writeDelayMs || 0)));
    }

    appendLog("camps", `[Camps] Batch writes done. created=${created} updated=${updated} errors=${errors} improved=${improvedCount}`);
    return { accepted, improvedCount, created, updated, errors };
  }

  /* ----------------------------
     Main Camps Ingest: supports multi-batch per click
  ----------------------------- */
  async function runSportsUSACampsIngest() {
    const runIso = new Date().toISOString();
    const runId = `run_${runIso.replace(/[:.]/g, "").slice(0, 15)}`;

    setCampsWorking(true);
    setLogCamps("");
    // reset improved this run for the click
    let improvedTotal = 0;
    let createdTotal = 0;
    let updatedTotal = 0;
    let errorsTotal = 0;

    appendLog("camps", `[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
    appendLog(
      "camps",
      `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents} | fastMode=${fastMode ? "true" : "false"}`
    );
    appendLog("camps", `[Camps] QualityMode=${qualityMode} | RerunMode=${rerunMode} | BatchRunner=${batchRunnerOn ? "ON" : "OFF"} maxBatches=${maxBatchesPerClick}`);

    try {
      if (!selectedSportId) {
        appendLog("camps", "[Camps] ERROR: Select a sport first.");
        return;
      }
      if (!SchoolSportSiteEntity || !CampDemoEntity) {
        appendLog("camps", "[Camps] ERROR: Required entities missing (SchoolSportSite/CampDemo).");
        return;
      }

      // Always refresh quality counters before targeting runs so the school sets are current
      await refreshQualityCounters({ improvedThisRunOverride: 0 });

      const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const siteRows = siteRowsRaw.map(normalizeSiteRow);

      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${siteRows.length} (active)`);

      const rerunFiltered = pickSitesByRerunMode(siteRows);
      appendLog("camps", `[Camps] Rerun filtered sites: ${rerunFiltered.length}`);

      const qualityFiltered = pickSitesByQualityMode(rerunFiltered);
      appendLog("camps", `[Camps] Quality filtered sites: ${qualityFiltered.length}`);

      const allTargets = qualityFiltered; // final list
      if (!allTargets.length) {
        appendLog("camps", `[Camps] Nothing to do for current (RerunMode + QualityMode).`);
        appendLog("camps", `[Camps] Stop rule: if your Quality counters are already low/0 for this mode, you are done.`);
        await refreshCrawlCounters();
        await refreshQualityCounters({ improvedThisRunOverride: 0 });
        return;
      }

      // If testSiteUrl is set, ignore allTargets and just run one batch (function handles it)
      const tUrl = safeString(testSiteUrl);
      const doBatchRunner = !tUrl && batchRunnerOn;

      const maxBatches = doBatchRunner ? Math.max(1, Number(maxBatchesPerClick || 1)) : 1;
      const perBatch = Math.max(1, Number(campsMaxSites || 25));

      let cursor = 0;

      for (let b = 1; b <= maxBatches; b++) {
        const remaining = allTargets.length - cursor;
        if (!tUrl && remaining <= 0) break;

        const batch = tUrl ? allTargets.slice(0, perBatch) : allTargets.slice(cursor, cursor + perBatch);

        appendLog("camps", ``);
        appendLog("camps", `[Camps] ---- Batch ${b} ----`);
        appendLog("camps", `[Camps] Batch size=${batch.length} | remainingAfterThis=${Math.max(0, remaining - perBatch)}`);

        const result = await runOneBatch(batch, { runIso, runId });

        improvedTotal += result.improvedCount || 0;
        createdTotal += result.created || 0;
        updatedTotal += result.updated || 0;
        errorsTotal += result.errors || 0;

        // Advance cursor if not test mode
        if (!tUrl) cursor += perBatch;

        // Batch delay
        if (doBatchRunner && b < maxBatches) {
          await sleep(Math.max(0, Number(batchDelayMs || 0)));
        }

        // If we’re not doing batch runner, break after 1
        if (!doBatchRunner) break;
      }

      appendLog("camps", ``);
      appendLog(
        "camps",
        `[Camps] DONE (this click). totals: created=${createdTotal} updated=${updatedTotal} errors=${errorsTotal} improved=${improvedTotal}`
      );

      // Refresh counters and quality (with improvedThisRun)
      await refreshCrawlCounters();
      await refreshQualityCounters({ improvedThisRunOverride: improvedTotal });

      appendLog("camps", `[Camps] Tip: Stop when your selected QualityMode’s remaining counters are ~0 (or close enough to accept).`);
    } catch (e) {
      appendLog("camps", `[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     Promote CampDemo -> Camp
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    if (!CampEntity?.create || !CampEntity?.update) throw new Error("Camp entity not available.");
    const key = payload?.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for upsert");

    let existing = [];
    try {
      existing = await entityList(CampEntity, { event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0]?.id) {
      await CampEntity.update(arr[0].id, payload);
      return "updated";
    }

    await CampEntity.create(payload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r?.school_id);
    const sport_id = safeString(r?.sport_id);
    const camp_name = safeString(r?.camp_name || r?.name);
    const start_date = toISODate(r?.start_date);
    const end_date = toISODate(r?.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date) return { error: "Missing required fields" };

    const city = safeString(r?.city);
    const state = safeString(r?.state);
    const position_ids = normalizeStringArray(r?.position_ids);

    const price = safeNumber(r?.price) ?? safeNumber(r?.price_max) ?? safeNumber(r?.price_min);
    const link_url = safeString(r?.link_url || r?.url);
    const source_url = safeString(r?.source_url) || link_url;

    const season_year = safeNumber(r?.season_year) ?? safeNumber(computeSeasonYearFootball(start_date));
    const source_platform = safeString(r?.source_platform) || "seed";
    const program_id = safeString(r?.program_id) || `seed:${String(school_id)}:${slugify(camp_name)}`;

    const event_key =
      safeString(r?.event_key) ||
      buildEventKey({
        source_platform,
        program_id,
        start_date,
        link_url,
        source_url,
      });

    const content_hash =
      safeString(r?.content_hash) ||
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
        notes: safeString(r?.notes),
      });

    return {
      payload: {
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
        notes: safeString(r?.notes) || null,
        season_year: season_year != null ? season_year : null,
        program_id,
        event_key,
        source_platform,
        source_url: source_url || null,
        last_seen_at: runIso,
        content_hash,
        event_dates_raw: safeString(r?.event_dates_raw) || null,
        grades_raw: safeString(r?.grades_raw) || null,
        register_by_raw: safeString(r?.register_by_raw) || null,
        price_raw: safeString(r?.price_raw) || null,
        price_min: safeNumber(r?.price_min),
        price_max: safeNumber(r?.price_max),
        sections_json: safeObject(tryParseJson(r?.sections_json)) || null,
      },
    };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setPromoteWorking(true);
    setLogPromote("");
    appendLog("promote", `[Promote] Starting: Promote CampDemo → Camp @ ${runIso}`);

    try {
      if (!selectedSportId) return appendLog("promote", "[Promote] ERROR: Select a sport first.");
      if (!CampDemoEntity) return appendLog("promote", "[Promote] ERROR: CampDemo entity missing.");
      if (!CampEntity) return appendLog("promote", "[Promote] ERROR: Camp entity missing.");

      let demoRows = [];
      try {
        demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      } catch (e) {
        appendLog("promote", `[Promote] ERROR reading CampDemo: ${String(e?.message || e)}`);
        return;
      }

      appendLog("promote", `[Promote] Found CampDemo rows: ${demoRows.length}`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < demoRows.length; i++) {
        const r = demoRows[i];
        try {
          const built = buildSafeCampPayloadFromDemoRow(r, runIso);
          if (built.error) {
            skipped += 1;
            continue;
          }
          const result = await upsertCampByEventKey(built.payload);
          if (result === "created") created += 1;
          if (result === "updated") updated += 1;
        } catch (e) {
          errors += 1;
          appendLog("promote", `[Promote] ERROR #${i + 1}: ${String(e?.message || e)}`);
        }
        if ((i + 1) % 50 === 0) appendLog("promote", `[Promote] Progress: ${i + 1}/${demoRows.length}`);
        await sleep(25);
      }

      appendLog("promote", `[Promote] Done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } finally {
      setPromoteWorking(false);
    }
  }

  /* ----------------------------
     UI
  ----------------------------- */
  const stopSignalText = useMemo(() => {
    if (qualityMode === "register_only") return "Stop when Register names remaining reaches ~0.";
    if (qualityMode === "missing_price_only") return "Stop when Missing price remaining reaches ~0.";
    if (qualityMode === "no_camps_only") return "Stop when Schools with no camps reaches ~0.";
    if (qualityMode === "any_cleanup") return "Stop when Register + Missing price + No camps are all acceptable (or you hit diminishing returns).";
    return "With no quality filter, use crawl counters + your own spot checks.";
  }, [qualityMode]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">Admin Import</div>
            <div className="text-sm text-slate-600">SportsUSA seeding + camp ingestion + promotion + cleanup targeting.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* Sport Selector */}
        <Card className="p-4">
          <div className="font-semibold">1) Select Sport</div>

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
                  setSelectedSportName(hit?.name || "");
                }}
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking}
              >
                <option value="">Select…</option>
                {sports.map((sx) => (
                  <option key={sx.id} value={sx.id}>
                    {sx.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">{sportsLoading ? "Loading sports…" : selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport"}</div>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={loadSports} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button variant="outline" onClick={refreshCrawlCounters} disabled={countersWorking || !selectedSportId}>
                {countersWorking ? "Refreshing…" : "Refresh Counters"}
              </Button>
              <Button variant="outline" onClick={() => refreshQualityCounters({ improvedThisRunOverride: qualityCounters.improvedThisRun })} disabled={qualityWorking || !selectedSportId}>
                {qualityWorking ? "Refreshing…" : "Refresh Quality"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Crawl Counters */}
        <Card className="p-4">
          <div className="font-semibold">Crawl Counters (site state)</div>
          <div className="text-sm text-slate-600 mt-1">These are site crawl states. They do not tell you if Register/prices got fixed.</div>

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
            <Button variant="outline" onClick={() => setLogCounters("")} disabled={countersWorking}>
              Clear Crawl Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Crawl Counters Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logCounters || "—"}</pre>
          </div>
        </Card>

        {/* Quality Counters */}
        <Card className="p-4">
          <div className="font-semibold">Quality Counters (your STOP signals)</div>
          <div className="text-sm text-slate-600 mt-1">This is what tells you when to stop cleanup. These should trend down as data improves.</div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[
              ["Register names remaining", qualityCounters.registerNamesRemaining],
              ["Missing price remaining", qualityCounters.missingPriceRemaining],
              ["Schools with no camps", qualityCounters.schoolsWithNoCamps],
              ["Improved this run", qualityCounters.improvedThisRun],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            {[
              ["Schools needing Register fix", qualityCounters.schoolsNeedingRegisterFix],
              ["Schools needing price fix", qualityCounters.schoolsNeedingPriceFix],
              ["Schools needing any cleanup", qualityCounters.schoolsNeedingAnyCleanup],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setLogQuality("")} disabled={qualityWorking}>
              Clear Quality Log
            </Button>
            <div className="text-sm text-slate-600 self-center">{stopSignalText}</div>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Quality Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logQuality || "—"}</pre>
          </div>
        </Card>

        {/* Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold">2) Seed Schools from SportsUSA (School + SchoolSportSite)</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsUSASiteUrl}
                onChange={(e) => setSportsUSASiteUrl(e.target.value)}
                placeholder="https://www.footballcampsusa.com/"
                disabled={sportsUSAWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">Auto-fills by sport; override if needed.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={sportsUSALimit}
                  onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                  min={50}
                  max={2000}
                  disabled={sportsUSAWorking}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={sportsUSADryRun} onChange={(e) => setSportsUSADryRun(e.target.checked)} disabled={sportsUSAWorking} />
                  Dry Run
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button onClick={runSportsUSASeedSchools} disabled={!selectedSportId || sportsUSAWorking || campsWorking || promoteWorking}>
              {sportsUSAWorking ? "Running…" : sportsUSADryRun ? "Run Seed (Dry Run)" : "Run Seed → Write School + Site"}
            </Button>
            <Button variant="outline" onClick={() => setLogSportsUSA("")} disabled={sportsUSAWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">SportsUSA Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">{logSportsUSA || "—"}</pre>
          </div>
        </Card>

        {/* Camps ingest */}
        <Card className="p-4">
          <div className="font-semibold">3) Ingest Camps (SchoolSportSite → CampDemo)</div>
          <div className="text-sm text-slate-600 mt-1">
            Use <b>Quality Mode</b> to target cleanup so you are not blindly rerunning.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quality mode (cleanup targeting)</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={qualityMode} onChange={(e) => setQualityMode(e.target.value)} disabled={campsWorking}>
                {QUALITY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">This determines which schools get batched. The STOP signals are in Quality Counters above.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun mode (crawl-state)</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={rerunMode} onChange={(e) => setRerunMode(e.target.value)} disabled={campsWorking}>
                {RERUN_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">For cleanup, most runs can be “Due only” + a quality mode. Use “Force recrawl ALL” when you intentionally want a refresh sweep.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites/batch</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxSites} onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))} min={1} max={500} disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">If rate limits hit, reduce to 10–15.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max regs/site</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxRegsPerSite} onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))} min={1} max={50} disabled={campsWorking} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events/call</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxEvents} onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))} min={25} max={5000} disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">Suggested: 150–300 for cleanup.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={writeDelayMs} onChange={(e) => setWriteDelayMs(Number(e.target.value || 0))} min={0} max={2000} disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">Raise to 200–350ms if “Rate limit exceeded”.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={batchDelayMs} onChange={(e) => setBatchDelayMs(Number(e.target.value || 0))} min={0} max={10000} disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">Pause between batches.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={campsDryRun} onChange={(e) => setCampsDryRun(e.target.checked)} disabled={campsWorking} />
              Dry Run
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} disabled={campsWorking} />
              fastMode (fewer detail fetches)
            </label>

            <div className="text-[11px] text-slate-500">
              For cleanup runs, keep <b>fastMode OFF</b>.
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={batchRunnerOn} onChange={(e) => setBatchRunnerOn(e.target.checked)} disabled={campsWorking} />
              Run multiple batches per click
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max batches per click</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={maxBatchesPerClick} onChange={(e) => setMaxBatchesPerClick(Number(e.target.value || 0))} min={1} max={50} disabled={campsWorking} />
            </div>

            <div className="text-[11px] text-slate-500">
              Suggested cleanup run: MaxSites=10–25, MaxEvents=150–300, WriteDelay=150–250ms, Batches=10.
            </div>
          </div>

          {/* Test mode */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test Site URL (optional)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={testSiteUrl} onChange={(e) => setTestSiteUrl(e.target.value)} placeholder="https://www.hardingfootballcamps.com/" disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">If set, runs single-site mode and does not touch SchoolSportSite state.</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test School ID (required for writes)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={testSchoolId} onChange={(e) => setTestSchoolId(e.target.value)} placeholder="Paste School.id (needed when DryRun=false)" disabled={campsWorking} />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking || sportsUSAWorking || promoteWorking}>
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

        {/* Promote */}
        <Card className="p-4">
          <div className="font-semibold">4) Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">Upserts by event_key. (Runs for the selected sport.)</div>

          <div className="mt-3 flex gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={!selectedSportId || promoteWorking || sportsUSAWorking || campsWorking}>
              {promoteWorking ? "Running…" : "Run Promotion"}
            </Button>
            <Button variant="outline" onClick={() => setLogPromote("")} disabled={promoteWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Promote Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">{logPromote || "—"}</pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={sportsUSAWorking || campsWorking || promoteWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

