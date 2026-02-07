// src/pages/AdminImport.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";

/* =========================================================
   Minimal UI primitives (keep stable, avoid blank page)
========================================================= */
const Card = ({ className = "", children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>
);

const Button = ({ variant, className = "", disabled, onClick, children, ...rest }) => (
  <button
    className={`px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm disabled:opacity-50 ${className}`}
    disabled={disabled}
    onClick={onClick}
    {...rest}
  >
    {children}
  </button>
);

/* =========================================================
   Error Boundary (prevents “blank page” on runtime errors)
========================================================= */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error) };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("AdminImport crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 p-4">
          <div className="max-w-3xl mx-auto space-y-3">
            <Card className="p-4">
              <div className="text-lg font-semibold text-slate-900">AdminImport failed to render</div>
              <div className="text-sm text-slate-600 mt-2">
                This is a UI-safe error boundary so the app doesn’t go blank.
              </div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto">
                {this.state.message}
              </pre>
              <div className="text-xs text-slate-500 mt-3">Open DevTools Console for full stack trace.</div>
            </Card>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================================
   Helpers
========================================================= */
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

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s, n = 600) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "…(truncated)" : str;
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

// Stable-enough hash for content comparisons
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

/* =========================================================
   Base44 entity list helper (robust)
========================================================= */
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

/* =========================================================
   Crawl-state helpers
========================================================= */
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
  // ✅ FIX: robust active parsing; no “typeof r && typeof r.active” issues
  return {
    id: r && r.id ? String(r.id) : "",
    school_id: r && r.school_id ? String(r.school_id) : null,
    sport_id: r && r.sport_id ? String(r.sport_id) : null,
    camp_site_url: r && r.camp_site_url ? String(r.camp_site_url) : null,
    active: readActiveFlag(r),
    crawl_status: statusOf(r),
    last_crawled_at: safeString(r && r.last_crawled_at),
    next_crawl_at: safeString(r && r.next_crawl_at),
    crawl_error: safeString(r && r.crawl_error),
    last_crawl_run_id: safeString(r && r.last_crawl_run_id),
    raw: r,
  };
}

/* =========================================================
   Quality rules (CampDemo data)
========================================================= */
function isBadCampName(name) {
  const t = lc(name || "");
  if (!t) return true;
  if (t === "register") return true;
  if (t === "register now") return true;
  if (t === "details" || t === "view details" || t === "view detail") return true;
  if (t === "camp") return true;
  // money-like “names” (e.g. "$475.00")
  if (/^\$?\s*\d{1,5}(\.\d{2})?\s*$/.test(String(name || "").trim())) return true;
  // obvious junk
  if (t.includes("as of fall")) return true;
  return false;
}

function isMissingPrice(row) {
  const p = safeNumber(row?.price);
  const pmin = safeNumber(row?.price_min);
  const pmax = safeNumber(row?.price_max);
  // treat 0 as missing (your requirement)
  const any = [p, pmin, pmax].some((x) => x != null && x > 0);
  return !any;
}

/* =========================================================
   Defaults
========================================================= */
const ROUTES = { Workspace: "/Workspace", Home: "/Home" };

const SPORTSUSA_DIRECTORY_BY_SPORTNAME = {
  Football: "https://www.footballcampsusa.com/",
  Baseball: "https://www.baseballcampsusa.com/",
  Softball: "https://www.softballcampsusa.com/",
  Soccer: "https://www.soccercampsusa.com/",
  Volleyball: "https://www.volleyballcampsusa.com/",
};

/* =========================================================
   Main Component
========================================================= */
function AdminImportInner() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities ? (base44.entities.Sport || base44.entities.Sports) : null;
  const SchoolEntity = base44?.entities ? (base44.entities.School || base44.entities.Schools) : null;
  const SchoolSportSiteEntity = base44?.entities ? (base44.entities.SchoolSportSite || base44.entities.SchoolSportSites) : null;
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
  const [logEditor, setLogEditor] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "counters") setLogCounters(add);
    if (which === "quality") setLogQuality(add);
    if (which === "editor") setLogEditor(add);
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
  const [editorWorking, setEditorWorking] = useState(false);

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

  // Batch runner
  const [runBatches, setRunBatches] = useState(true);
  const [maxBatches, setMaxBatches] = useState(10);

  // Rate-limit protection for writes
  const [writeDelayMs, setWriteDelayMs] = useState(100);
  const [batchDelayMs, setBatchDelayMs] = useState(400);

  // Rerun mode (crawl-state targeting)
  const RERUN_MODES = [
    { id: "due", label: "Due only (normal)" },
    { id: "all", label: "Force recrawl ALL active" },
    { id: "error", label: "Recrawl ERROR only" },
    { id: "no_events", label: "Recrawl NO_EVENTS only" },
    { id: "ok", label: "Recrawl OK only" },
    { id: "ready", label: "Recrawl READY only" },
  ];
  const [rerunMode, setRerunMode] = useState("due");

  // Quality mode (data cleanup targeting)
  const QUALITY_MODES = [
    { id: "none", label: "No quality filter (use rerun mode only)" },
    { id: "bad_name", label: 'Only schools with bad camp names ("Register" / money / junk)' },
    { id: "missing_price", label: "Only schools with missing/zero price" },
    { id: "no_camps", label: "Only schools with no camps (0 CampDemo rows)" },
    { id: "any_cleanup", label: "Schools needing cleanup (bad name OR missing price OR no camps)" },
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
        `[Counters] Refreshed @ ${nowIso} | active=${active} done=${done} (${pct}%) ready=${ready} ok=${ok} no_events=${no_events} error=${error} dueNow=${dueNow}`
      );
    } catch (e) {
      appendLog("counters", `[Counters] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCountersWorking(false);
    }
  }

  /* ----------------------------
     Quality Counters (data cleanup stop signals)
  ----------------------------- */
  const [qualityCounters, setQualityCounters] = useState({
    registerNamesRemaining: 0,
    missingPriceRemaining: 0,
    noCampsRemaining: 0,
    improvedThisRun: 0,
    schoolsNeedingBadNameFix: 0,
    schoolsNeedingPriceFix: 0,
    schoolsNeedingAnyCleanup: 0,
  });

  const lastQualitySnapshotRef = useRef(null);

  async function refreshQualityCounters({ improvedThisRun = null } = {}) {
    const nowIso = new Date().toISOString();
    setQualityWorking(true);

    try {
      if (!selectedSportId) {
        setQualityCounters({
          registerNamesRemaining: 0,
          missingPriceRemaining: 0,
          noCampsRemaining: 0,
          improvedThisRun: 0,
          schoolsNeedingBadNameFix: 0,
          schoolsNeedingPriceFix: 0,
          schoolsNeedingAnyCleanup: 0,
        });
        appendLog("quality", `[Quality] Select a sport first.`);
        return;
      }
      if (!SchoolSportSiteEntity || !CampDemoEntity) {
        appendLog("quality", `[Quality] ERROR: Missing entities (need SchoolSportSite and CampDemo).`);
        return;
      }

      // 1) schools (active) for this sport
      const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = siteRowsRaw.map(normalizeSiteRow);
      const schoolsAll = new Set(sites.map((s) => s.school_id).filter(Boolean));

      // 2) CampDemo rows for this sport
      const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const demos = asArray(demoRows);

      // Group by school_id
      const bySchool = new Map(); // school_id -> rows[]
      for (const r of demos) {
        const sid = safeString(r?.school_id);
        if (!sid) continue;
        if (!bySchool.has(sid)) bySchool.set(sid, []);
        bySchool.get(sid).push(r);
      }

      // Calculate totals
      let registerNamesRemaining = 0;
      let missingPriceRemaining = 0;

      const badNameSchools = new Set();
      const missingPriceSchools = new Set();
      const schoolsWithAnyCamp = new Set(bySchool.keys());

      for (const [sid, rows] of bySchool.entries()) {
        let schoolHasBad = false;
        let schoolHasMissingPrice = false;

        for (const r of rows) {
          if (isBadCampName(r?.camp_name)) {
            registerNamesRemaining += 1;
            schoolHasBad = true;
          }
          if (isMissingPrice(r)) {
            missingPriceRemaining += 1;
            schoolHasMissingPrice = true;
          }
        }

        if (schoolHasBad) badNameSchools.add(sid);
        if (schoolHasMissingPrice) missingPriceSchools.add(sid);
      }

      // NoCampsRemaining = active schools with 0 CampDemo rows
      let noCampsRemaining = 0;
      const noCampSchools = [];
      for (const sid of schoolsAll.values()) {
        if (!schoolsWithAnyCamp.has(sid)) {
          noCampsRemaining += 1;
          noCampSchools.push(sid);
        }
      }

      const anyCleanupSchools = new Set([...badNameSchools, ...missingPriceSchools, ...noCampSchools]);
      const improved = improvedThisRun != null ? improvedThisRun : 0;

      setQualityCounters({
        registerNamesRemaining,
        missingPriceRemaining,
        noCampsRemaining,
        improvedThisRun: improved,
        schoolsNeedingBadNameFix: badNameSchools.size,
        schoolsNeedingPriceFix: missingPriceSchools.size,
        schoolsNeedingAnyCleanup: anyCleanupSchools.size,
      });

      lastQualitySnapshotRef.current = {
        registerNamesRemaining,
        missingPriceRemaining,
        noCampsRemaining,
        schoolsNeedingBadNameFix: badNameSchools.size,
        schoolsNeedingPriceFix: missingPriceSchools.size,
        schoolsNeedingAnyCleanup: anyCleanupSchools.size,
      };

      appendLog(
        "quality",
        `[Quality] Refreshed @ ${nowIso} | RegisterRemaining=${registerNamesRemaining} | MissingPriceRemaining=${missingPriceRemaining} | NoCampsRemaining=${noCampsRemaining} | SchoolsBadName=${badNameSchools.size} | SchoolsMissingPrice=${missingPriceSchools.size} | SchoolsAnyCleanup=${anyCleanupSchools.size} | ImprovedThisRun=${improved}`
      );
    } catch (e) {
      appendLog("quality", `[Quality] ERROR: ${String(e?.message || e)}`);
    } finally {
      setQualityWorking(false);
    }
  }

  /* ----------------------------
     Reset crawl state
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

      appendLog("counters", `[Counters] Resetting ${sites.length} SchoolSportSite rows → READY…`);

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
     Load sports
  ----------------------------- */
  async function loadSports() {
    setSportsLoading(true);
    try {
      if (!SportEntity) throw new Error("Sport entity missing (base44.entities.Sport).");

      const rows = await entityList(SportEntity, {});
      const normalized = asArray(rows)
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
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

  // Auto-fill SportsUSA directory URL
  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSASiteUrl(guess);
  }, [selectedSportName]);

  // Refresh counters when sport changes
  useEffect(() => {
    if (!selectedSportId) return;
    refreshCrawlCounters();
    refreshQualityCounters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* ----------------------------
     SportsUSA Seed Schools
  ----------------------------- */
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

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
      if (!SchoolEntity || !SchoolSportSiteEntity) return appendLog("sportsusa", "[SportsUSA] ERROR: Missing School or SchoolSportSite entity.");

      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl: siteUrl,
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
        appendLog("sportsusa", `[SportsUSA] ERROR (HTTP ${res.status})`);
        if (data) appendLog("sportsusa", JSON.stringify(data || {}, null, 2));
        if (!data && rawText) appendLog("sportsusa", `[SportsUSA] Raw response: ${truncate(rawText, 500)}`);
        return;
      }

      if (!data) {
        appendLog("sportsusa", `[SportsUSA] WARNING: Response not JSON. HTTP ${res.status}`);
        if (rawText) appendLog("sportsusa", `[SportsUSA] Raw response: ${truncate(rawText, 500)}`);
        return;
      }

      const schools = asArray(data?.schools || []);
      appendLog("sportsusa", `[SportsUSA] schools_found=${schools.length}`);

      if (sportsUSADryRun) {
        appendLog("sportsusa", "[SportsUSA] DryRun=true: no writes performed.");
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
        if ((i + 1) % 25 === 0) {
          appendLog("sportsusa", `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`);
        }
        await sleep(15);
      }

      appendLog("sportsusa", `[SportsUSA] Done. Schools created=${schoolsCreated} updated=${schoolsUpdated} | Sites created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`);
      await refreshCrawlCounters();
      await refreshQualityCounters();
    } catch (e) {
      appendLog("sportsusa", `[SportsUSA] ERROR: ${String(e?.message || e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Camps ingest helpers
  ----------------------------- */
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
        sections_json: tryParseJson(e.sections_json),
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
      sections_json: tryParseJson(a.sections_json),
      registration_url: safeString(a.registration_url),
    };
  }

  async function updateCrawlStateForSites(siteIds, patch) {
    if (!SchoolSportSiteEntity?.update) return { updated: 0, errors: 0 };
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
    return arr.filter((s) => isDueNow(s)); // due
  }

  async function getQualitySchoolSets() {
    if (!selectedSportId || !SchoolSportSiteEntity || !CampDemoEntity) {
      return { allSchools: new Set(), badNameSchools: new Set(), missingPriceSchools: new Set(), noCampSchools: new Set(), anyCleanupSchools: new Set() };
    }

    const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
    const sites = siteRowsRaw.map(normalizeSiteRow);
    const allSchools = new Set(sites.map((s) => s.school_id).filter(Boolean));

    const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
    const demos = asArray(demoRows);

    const bySchool = new Map();
    for (const r of demos) {
      const sid = safeString(r?.school_id);
      if (!sid) continue;
      if (!bySchool.has(sid)) bySchool.set(sid, []);
      bySchool.get(sid).push(r);
    }

    const badNameSchools = new Set();
    const missingPriceSchools = new Set();
    const schoolsWithAnyCamp = new Set(bySchool.keys());

    for (const [sid, rows] of bySchool.entries()) {
      let hasBad = false;
      let hasMissingPrice = false;
      for (const r of rows) {
        if (isBadCampName(r?.camp_name)) hasBad = true;
        if (isMissingPrice(r)) hasMissingPrice = true;
      }
      if (hasBad) badNameSchools.add(sid);
      if (hasMissingPrice) missingPriceSchools.add(sid);
    }

    const noCampSchools = new Set();
    for (const sid of allSchools.values()) {
      if (!schoolsWithAnyCamp.has(sid)) noCampSchools.add(sid);
    }

    const anyCleanupSchools = new Set([...badNameSchools, ...missingPriceSchools, ...noCampSchools]);

    return { allSchools, badNameSchools, missingPriceSchools, noCampSchools, anyCleanupSchools };
  }

  function qualityFilterSites(sites, sets) {
    const arr = asArray(sites);
    if (qualityMode === "none") return arr;

    const pickSet =
      qualityMode === "bad_name"
        ? sets.badNameSchools
        : qualityMode === "missing_price"
          ? sets.missingPriceSchools
          : qualityMode === "no_camps"
            ? sets.noCampSchools
            : sets.anyCleanupSchools;

    return arr.filter((s) => s.school_id && pickSet.has(String(s.school_id)));
  }

  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity?.create || !CampDemoEntity?.update) throw new Error("CampDemo entity not available.");
    const key = payload?.event_key ? String(payload.event_key) : null;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    let existing = [];
    try {
      existing = await entityList(CampDemoEntity, { event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0]?.id) {
      await CampDemoEntity.update(String(arr[0].id), payload);
      return "updated";
    }

    await CampDemoEntity.create(payload);
    return "created";
  }

  async function writeWithRetry(fn, { maxRetries = 5 } = {}) {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (e) {
        const msg = String(e?.message || e);
        const isRate = msg.toLowerCase().includes("rate limit");
        const isNet = msg.toLowerCase().includes("network");
        if (!isRate && !isNet) throw e;

        attempt += 1;
        if (attempt > maxRetries) throw e;

        const wait = Math.min(2000, 200 * attempt * attempt);
        await sleep(wait);
      }
    }
  }

  /* ----------------------------
     Camps ingest (batch runner)
  ----------------------------- */
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
    appendLog("camps", `[Camps] QualityMode=${qualityMode} | RerunMode=${rerunMode} | BatchRunner=${runBatches ? "ON" : "OFF"} maxBatches=${maxBatches}`);

    try {
      if (!selectedSportId) return appendLog("camps", "[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity) return appendLog("camps", "[Camps] ERROR: SchoolSportSite entity not available.");
      if (!CampDemoEntity) return appendLog("camps", "[Camps] ERROR: CampDemo entity not available.");

      if (!lastQualitySnapshotRef.current) await refreshQualityCounters();

      const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const allSites = siteRowsRaw.map(normalizeSiteRow);

      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${allSites.length} (active)`);

      const rerunFiltered = pickSitesByRerunMode(allSites);
      appendLog("camps", `[Camps] Rerun filtered sites: ${rerunFiltered.length}`);

      const sets = await getQualitySchoolSets();
      const qualityFiltered = qualityFilterSites(rerunFiltered, sets);
      appendLog("camps", `[Camps] Quality filtered sites: ${qualityFiltered.length}`);

      if (!qualityFiltered.length && !safeString(testSiteUrl)) {
        appendLog("camps", `[Camps] Nothing to do for this rerun+quality selection.`);
        appendLog("camps", `[Camps] Tip: switch QualityMode or RerunMode or Reset crawl-state.`);
        await refreshCrawlCounters();
        await refreshQualityCounters({ improvedThisRun: 0 });
        return;
      }

      const tUrl = safeString(testSiteUrl);
      const tSchool = safeString(testSchoolId);

      if (tUrl && !campsDryRun && !tSchool) {
        appendLog("camps", "[Camps] ERROR: For non-dry-run with Test Site URL, provide Test School ID.");
        return;
      }

      if (tUrl) {
        appendLog("camps", `[Camps] Test mode enabled: ${tUrl}`);
        await runOneIngestCall({
          runIso,
          runId,
          batchSites: [],
          testSiteUrl: tUrl,
          testSchoolId: tSchool,
        });
        await refreshCrawlCounters();
        await refreshQualityCounters({ improvedThisRun: 0 });
        return;
      }

      const maxSitesPerBatch = Math.max(1, Number(campsMaxSites || 25));
      const maxBatchCount = runBatches ? Math.max(1, Number(maxBatches || 1)) : 1;

      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      let improvedTotal = 0;

      const totalSites = qualityFiltered.length;
      const totalPossibleBatches = Math.ceil(totalSites / maxSitesPerBatch);
      const batchesToRun = Math.min(totalPossibleBatches, maxBatchCount);

      for (let b = 0; b < batchesToRun; b++) {
        const start = b * maxSitesPerBatch;
        const end = Math.min(totalSites, start + maxSitesPerBatch);
        const batchSites = qualityFiltered.slice(start, end);

        const remainingAfterThis = Math.max(0, totalSites - end);

        appendLog("camps", ``);
        appendLog("camps", `[Camps] ---- Batch ${b + 1} ----`);
        appendLog("camps", `[Camps] Batch size=${batchSites.length} | remainingAfterThis=${remainingAfterThis}`);

        const res = await runOneIngestCall({
          runIso,
          runId,
          batchSites,
          testSiteUrl: null,
          testSchoolId: null,
        });

        totalCreated += res.created;
        totalUpdated += res.updated;
        totalSkipped += res.skipped;
        totalErrors += res.errors;
        improvedTotal += res.improved;

        appendLog("camps", `[Camps] Batch ${b + 1} writes done. created=${res.created} updated=${res.updated} skipped=${res.skipped} errors=${res.errors} improved=${res.improved}`);

        if (b < batchesToRun - 1) await sleep(Math.max(0, Number(batchDelayMs || 0)));
      }

      appendLog("camps", `[Camps] DONE (this click). totals: created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors} improved=${improvedTotal}`);

      await refreshCrawlCounters();

      if (!campsDryRun) {
        const before = lastQualitySnapshotRef.current;
        await refreshQualityCounters();
        const after = lastQualitySnapshotRef.current;

        if (before && after) {
          const d1 = Math.max(0, before.registerNamesRemaining - after.registerNamesRemaining);
          const d2 = Math.max(0, before.missingPriceRemaining - after.missingPriceRemaining);
          const d3 = Math.max(0, before.noCampsRemaining - after.noCampsRemaining);
          improvedTotal = d1 + d2 + d3;
          setQualityCounters((prev) => ({ ...prev, improvedThisRun: improvedTotal }));
          appendLog("quality", `[Quality] ImprovedThisRun computed: ${improvedTotal} (Register -${d1}, Price -${d2}, NoCamps -${d3})`);
        }
      } else {
        await refreshQualityCounters({ improvedThisRun: 0 });
      }

      appendLog("camps", `[Camps] Stop rule: When your target Remaining counter stops dropping for 2 clicks, you’re done for that mode.`);
    } catch (e) {
      appendLog("camps", `[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  async function runOneIngestCall({ runIso, runId, batchSites, testSiteUrl, testSchoolId }) {
    const batch = asArray(batchSites);

    appendLog(
      "camps",
      `[Camps] Calling /functions/sportsUSAIngestCamps (payload: sites=${batch.length}, testSiteUrl=${testSiteUrl ? testSiteUrl : "no"})`
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
        sites: testSiteUrl
          ? []
          : batch.map((r) => ({
            id: r.id,
            school_id: r.school_id,
            sport_id: r.sport_id,
            camp_site_url: r.camp_site_url,
          })),
        testSiteUrl: testSiteUrl || null,
        testSchoolId: testSchoolId || null,
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
      if (!data && rawText) appendLog("camps", `[Camps] Raw response: ${truncate(rawText, 500)}`);
      return { created: 0, updated: 0, skipped: 0, errors: 1, improved: 0 };
    }

    if (!data) {
      appendLog("camps", `[Camps] WARNING: Response not JSON. HTTP ${res.status}`);
      if (rawText) appendLog("camps", `[Camps] Raw response: ${truncate(rawText, 500)}`);
      return { created: 0, updated: 0, skipped: 0, errors: 1, improved: 0 };
    }

    appendLog("camps", `[Camps] Function version: ${data?.version ? data.version : "MISSING"}`);
    appendLog(
      "camps",
      `[Camps] Function stats: processedSites=${data?.stats?.processedSites ?? 0} processedRegs=${data?.stats?.processedRegs ?? 0} accepted=${data?.stats?.accepted ?? 0} rejected=${data?.stats?.rejected ?? 0} errors=${data?.stats?.errors ?? 0}`
    );

    if (data?.debug?.kpi) {
      const k = data.debug.kpi;
      appendLog("camps", `[Camps] Date KPI: listing=${k.datesParsedFromListing || 0} detail=${k.datesParsedFromDetail || 0} missing=${k.datesMissing || 0}`);
      appendLog(
        "camps",
        `[Camps] Name KPI: listing=${k.namesFromListing || 0} detail=${k.namesFromDetail || 0} missing=${k.namesMissing || 0} qualityReject=${k.namesRejectedByQualityGate || 0}`
      );
      appendLog("camps", `[Camps] Price KPI: detail=${k.pricesFromDetail || 0} missing=${k.pricesMissing || 0}`);
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

    if (!testSiteUrl) {
      if (campsDryRun) {
        appendLog("camps", `[Camps] DryRun=true: crawl-state update skipped.`);
      } else {
        const outcome = accepted.length ? "ok" : "no_events";
        const patch = {
          crawl_status: outcome,
          crawl_error: null,
          last_crawled_at: runIso,
          next_crawl_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          last_crawl_run_id: runId,
          last_seen_at: runIso,
        };
        const ids = batch.map((b) => b.id).filter(Boolean);
        const upd = await updateCrawlStateForSites(ids, patch);
        appendLog("camps", `[Camps] Updated crawl-state for batch sites: ${upd.updated} (${outcome}) errors=${upd.errors}`);
      }
    }

    if (campsDryRun) {
      appendLog("camps", `[Camps] DryRun=true: no CampDemo writes performed.`);
      return { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };
    }

    if (!accepted.length) {
      appendLog("camps", `[Camps] No accepted events returned from function.`);
      return { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let improved = 0;

    for (let i = 0; i < accepted.length; i++) {
      const a = accepted[i] || {};

      const school_id = safeString(a.school_id) || null;
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
        sections_json: a.sections_json != null ? a.sections_json : null,
      };

      try {
        let existing = [];
        try {
          existing = await entityList(CampDemoEntity, { event_key });
        } catch {
          existing = [];
        }
        const prevHash = existing?.[0]?.content_hash ? String(existing[0].content_hash) : null;

        const result = await writeWithRetry(() => upsertCampDemoByEventKey(payload), { maxRetries: 5 });

        if (result === "created") created += 1;
        if (result === "updated") updated += 1;

        if (prevHash && prevHash !== content_hash) improved += 1;
        if (!prevHash && result === "created") improved += 1;
      } catch (e) {
        errors += 1;
        appendLog("camps", `[Camps] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
      }

      if ((i + 1) % 25 === 0) appendLog("camps", `[Camps] Write progress: ${i + 1}/${accepted.length}`);
      await sleep(Math.max(0, Number(writeDelayMs || 0)));
    }

    return { created, updated, skipped, errors, improved };
  }

  /* ----------------------------
     Promote CampDemo -> Camp (optional)
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    if (!CampEntity?.create || !CampEntity?.update) throw new Error("Camp entity not available (base44.entities.Camp missing).");
    const key = payload?.event_key ? String(payload.event_key) : null;
    if (!key) throw new Error("Missing event_key for Camp upsert");

    let existing = [];
    try {
      existing = await entityList(CampEntity, { event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0]?.id) {
      await CampEntity.update(String(arr[0].id), payload);
      return "updated";
    }

    await CampEntity.create(payload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r?.school_id);
    const sport_id = safeString(r?.sport_id);
    const camp_name = safeString(r?.camp_name);
    const start_date = toISODate(r?.start_date);
    const end_date = toISODate(r?.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date) {
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };
    }

    const city = safeString(r?.city);
    const state = safeString(r?.state);
    const position_ids = normalizeStringArray(r?.position_ids);

    const price = safeNumber(r?.price) ?? safeNumber(r?.price_max) ?? safeNumber(r?.price_min);
    const link_url = safeString(r?.link_url);
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
      sections_json: tryParseJson(r?.sections_json) || null,
    };

    return { payload };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setPromoteWorking(true);
    setLogPromote("");

    appendLog("promote", `[Promote] Starting: Promote CampDemo → Camp @ ${runIso}`);

    try {
      if (!selectedSportId) return appendLog("promote", "[Promote] ERROR: Select a sport first.");
      if (!CampDemoEntity) return appendLog("promote", "[Promote] ERROR: CampDemo entity not available.");
      if (!CampEntity) return appendLog("promote", "[Promote] ERROR: Camp entity not available.");

      const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
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
        await sleep(15);
      }

      appendLog("promote", `[Promote] Done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } finally {
      setPromoteWorking(false);
    }
  }

  /* ----------------------------
     Camp Editor (direct row updates)
  ----------------------------- */
  const [editorFilter, setEditorFilter] = useState("bad_name"); // bad_name | missing_price | all
  const [editorSearch, setEditorSearch] = useState("");
  const [editorLimit, setEditorLimit] = useState(200);
  const [campRows, setCampRows] = useState([]);
  const [campEdit, setCampEdit] = useState({}); // id -> patch
  const [campSavingId, setCampSavingId] = useState("");

  function buildEditRowDefaults(r) {
    return {
      camp_name: r?.camp_name ?? "",
      price: r?.price ?? "",
      price_min: r?.price_min ?? "",
      price_max: r?.price_max ?? "",
      city: r?.city ?? "",
      state: r?.state ?? "",
      start_date: r?.start_date ?? "",
      end_date: r?.end_date ?? "",
      link_url: r?.link_url ?? "",
      notes: r?.notes ?? "",
    };
  }

  async function loadCampRowsForEditor() {
    const nowIso = new Date().toISOString();
    setEditorWorking(true);
    setLogEditor("");

    try {
      if (!selectedSportId) return appendLog("editor", `[Editor] Select a sport first.`);
      if (!CampDemoEntity) return appendLog("editor", `[Editor] CampDemo entity not available.`);

      const all = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      let rows = asArray(all);

      if (editorFilter === "bad_name") rows = rows.filter((r) => isBadCampName(r?.camp_name));
      if (editorFilter === "missing_price") rows = rows.filter((r) => isMissingPrice(r));

      const q = lc(editorSearch);
      if (q) {
        rows = rows.filter((r) => {
          const hay = [safeString(r?.camp_name), safeString(r?.school_id), safeString(r?.event_key), safeString(r?.link_url)]
            .filter(Boolean)
            .join(" ");
          return lc(hay).includes(q);
        });
      }

      rows = rows.slice(0, Math.max(10, Number(editorLimit || 200)));

      setCampRows(rows);

      const nextEdit = {};
      for (const r of rows) nextEdit[String(r.id)] = buildEditRowDefaults(r);
      setCampEdit(nextEdit);

      appendLog("editor", `[Editor] Loaded @ ${nowIso} | rows=${rows.length} filter=${editorFilter} search="${editorSearch}" limit=${editorLimit}`);
      appendLog("editor", `[Editor] Tip: edit fields inline and click Save per row.`);
    } catch (e) {
      appendLog("editor", `[Editor] ERROR: ${String(e?.message || e)}`);
    } finally {
      setEditorWorking(false);
    }
  }

  async function saveCampRow(id) {
    if (!id) return;
    if (!CampDemoEntity?.update) return appendLog("editor", `[Editor] ERROR: CampDemo.update not available.`);

    const patch = campEdit?.[id];
    if (!patch) return;

    setCampSavingId(id);

    try {
      const payload = {
        camp_name: safeString(patch.camp_name) || null,
        price: safeNumber(patch.price),
        price_min: safeNumber(patch.price_min),
        price_max: safeNumber(patch.price_max),
        city: safeString(patch.city) || null,
        state: safeString(patch.state) || null,
        start_date: toISODate(patch.start_date),
        end_date: toISODate(patch.end_date),
        link_url: safeString(patch.link_url) || null,
        notes: safeString(patch.notes) || null,
        last_seen_at: new Date().toISOString(),
      };

      await writeWithRetry(() => CampDemoEntity.update(String(id), payload), { maxRetries: 5 });

      appendLog("editor", `[Editor] Saved ${id}`);
      await refreshQualityCounters();
    } catch (e) {
      appendLog("editor", `[Editor] SAVE FAILED ${id}: ${String(e?.message || e)}`);
    } finally {
      setCampSavingId("");
    }
  }

  /* ----------------------------
     UI
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">Admin Import</div>
            <div className="text-sm text-slate-600">Seed → Ingest (targeted batches) → Promote → Direct cleanup editor.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* 1) Select sport */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">1) Select Sport</div>
          <div className="text-sm text-slate-600 mt-1">This selection drives all other sections.</div>

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
                  setSelectedSportName(hit?.name ? hit.name : "");
                }}
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking}
              >
                <option value="">Select…</option>
                {sports.map((sx) => (
                  <option key={sx.id} value={sx.id}>
                    {sx.name} {sx.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {sportsLoading ? "Loading sports…" : selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport"}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => loadSports()} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button variant="outline" onClick={() => refreshCrawlCounters()} disabled={countersWorking || !selectedSportId}>
                {countersWorking ? "Refreshing…" : "Refresh Crawl Counters"}
              </Button>
              <Button variant="outline" onClick={() => refreshQualityCounters()} disabled={qualityWorking || !selectedSportId}>
                {qualityWorking ? "Refreshing…" : "Refresh Quality Counters"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Crawl Counters */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">Crawl Counters (site state)</div>
          <div className="text-sm text-slate-600 mt-1">
            These show crawler status only. They do <b>not</b> tell you if names/prices were fixed. Use Quality Counters for stop signals.
          </div>

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

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button variant="outline" onClick={resetCrawlStateForSport} disabled={!selectedSportId || resetWorking || campsWorking}>
              {resetWorking ? "Resetting…" : "Reset crawl state (READY for all)"}
            </Button>
            <Button variant="outline" onClick={() => setLogCounters("")}>
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
          <div className="font-semibold text-slate-900">Quality Counters (your STOP signals)</div>
          <div className="text-sm text-slate-600 mt-1">
            These are the counters you use to know when to stop cleanup. They should trend down as data improves.
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[
              ["Register names remaining", qualityCounters.registerNamesRemaining],
              ["Missing price remaining", qualityCounters.missingPriceRemaining],
              ["Schools with no camps", qualityCounters.noCampsRemaining],
              ["Improved this run", qualityCounters.improvedThisRun],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            {[
              ["Schools needing Register fix", qualityCounters.schoolsNeedingBadNameFix],
              ["Schools needing price fix", qualityCounters.schoolsNeedingPriceFix],
              ["Schools needing any cleanup", qualityCounters.schoolsNeedingAnyCleanup],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
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

          <div className="text-[11px] text-slate-500 mt-3">
            <b>Stop rule:</b> Pick one Quality Mode target (bad names / missing price / no camps). When its “Remaining” stops dropping for 2 clicks, you’re done for that mode.
          </div>
        </Card>

        {/* 2) Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">2) Seed Schools from SportsUSA (School + SchoolSportSite)</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls sport directory (e.g., footballcampsusa.com) and seeds universities + their camp site URLs.
          </div>

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
              <div className="mt-1 text-[11px] text-slate-500">Auto-fills based on sport; override if needed.</div>
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
                  max={5000}
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

        {/* 3) Ingest Camps */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">3) Ingest Camps (SchoolSportSite → CampDemo)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs targeted batches based on <b>Quality Mode</b>, so you’re not blindly rerunning.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quality mode (cleanup targeting)</label>
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
              <div className="mt-1 text-[11px] text-slate-500">This determines which schools get included in the batch set.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun mode (crawl-state targeting)</label>
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
              <div className="mt-1 text-[11px] text-slate-500">Most cleanup runs use “Force recrawl ALL active”.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites/batch</label>
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

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events/call</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxEvents}
                onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))}
                min={10}
                max={5000}
                disabled={campsWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write delay (ms)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={writeDelayMs}
                onChange={(e) => setWriteDelayMs(Number(e.target.value || 0))}
                min={0}
                max={1000}
                disabled={campsWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">Raise to 120–200 if you see rate limits.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch delay (ms)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={batchDelayMs}
                onChange={(e) => setBatchDelayMs(Number(e.target.value || 0))}
                min={0}
                max={5000}
                disabled={campsWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">Pause between batches.</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} disabled={campsWorking} />
              fastMode (fewer detail fetches; faster but can miss deep fields)
            </label>
            <span className="text-[11px] text-slate-500">For cleanup, keep fastMode OFF.</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={runBatches} onChange={(e) => setRunBatches(e.target.checked)} disabled={campsWorking} />
              Run multiple batches per click
            </label>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">Max batches/click</span>
              <input
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={maxBatches}
                onChange={(e) => setMaxBatches(Number(e.target.value || 0))}
                min={1}
                max={100}
                disabled={campsWorking || !runBatches}
              />
            </div>

            <span className="text-[11px] text-slate-500">
              Example: QualityFilteredSites=50 and MaxSites=25 ⇒ 2 batches (that’s correct).
            </span>
          </div>

          {/* Test Mode */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test Site URL (optional)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSiteUrl}
                onChange={(e) => setTestSiteUrl(e.target.value)}
                placeholder="https://www.hardingfootballcamps.com/"
                disabled={campsWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">If set, runs single-site mode (does not touch SchoolSportSite state).</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test School ID (required for writes)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSchoolId}
                onChange={(e) => setTestSchoolId(e.target.value)}
                placeholder="Paste School.id (only needed when DryRun=false)"
                disabled={campsWorking}
              />
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

        {/* 4) Promote */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">4) Promote CampDemo → Camp (optional)</div>
          <div className="text-sm text-slate-600 mt-1">Upserts by event_key for the selected sport.</div>

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

        {/* 5) Camp Editor */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">5) Camp Editor (direct cleanup)</div>
          <div className="text-sm text-slate-600 mt-1">
            Pull CampDemo rows needing cleanup and update them inline (fix the last 13 bad names, missing prices, etc).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Filter</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={editorFilter}
                onChange={(e) => setEditorFilter(e.target.value)}
                disabled={editorWorking}
              >
                <option value="bad_name">Bad camp names</option>
                <option value="missing_price">Missing/zero price</option>
                <option value="all">All (sport)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Search</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={editorSearch}
                onChange={(e) => setEditorSearch(e.target.value)}
                placeholder="camp name, school_id, event_key, url…"
                disabled={editorWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={editorLimit}
                onChange={(e) => setEditorLimit(Number(e.target.value || 0))}
                min={50}
                max={2000}
                disabled={editorWorking}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={loadCampRowsForEditor} disabled={!selectedSportId || editorWorking || campsWorking}>
                {editorWorking ? "Loading…" : "Load Camps"}
              </Button>
              <Button variant="outline" onClick={() => setLogEditor("")} disabled={editorWorking}>
                Clear Log
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="p-2 border-b border-slate-200">Camp Name</th>
                  <th className="p-2 border-b border-slate-200 w-28">Price</th>
                  <th className="p-2 border-b border-slate-200 w-28">Min</th>
                  <th className="p-2 border-b border-slate-200 w-28">Max</th>
                  <th className="p-2 border-b border-slate-200 w-28">City</th>
                  <th className="p-2 border-b border-slate-200 w-20">State</th>
                  <th className="p-2 border-b border-slate-200 w-32">Start</th>
                  <th className="p-2 border-b border-slate-200 w-32">End</th>
                  <th className="p-2 border-b border-slate-200 w-52">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campRows.length ? (
                  campRows.map((r) => {
                    const id = String(r.id);
                    const edit = campEdit?.[id] || buildEditRowDefaults(r);
                    const original = buildEditRowDefaults(r);

                    return (
                      <tr key={id} className="border-b border-slate-100">
                        <td className="p-2 min-w-[320px]">
                          <div className="text-[11px] text-slate-500 mb-1">
                            school_id={String(r.school_id || "")} • event_key={truncate(String(r.event_key || ""), 40)}
                          </div>
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.camp_name ?? ""}
                            onChange={(e) =>
                              setCampEdit((prev) => ({
                                ...prev,
                                [id]: { ...(prev[id] || edit), camp_name: e.target.value },
                              }))
                            }
                          />
                          <div className="text-[11px] text-slate-500 mt-1">
                            <a className="underline" href={r.link_url || "#"} target="_blank" rel="noreferrer">
                              Open registration
                            </a>
                          </div>
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.price ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), price: e.target.value } }))}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.price_min ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), price_min: e.target.value } }))}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.price_max ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), price_max: e.target.value } }))}
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.city ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), city: e.target.value } }))}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.state ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), state: e.target.value } }))}
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.start_date ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), start_date: e.target.value } }))}
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={edit.end_date ?? ""}
                            onChange={(e) => setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), end_date: e.target.value } }))}
                          />
                        </td>

                        <td className="p-2">
                          <div className="flex gap-2 flex-wrap">
                            <Button className="text-sm" onClick={() => saveCampRow(id)} disabled={campSavingId === id || editorWorking}>
                              {campSavingId === id ? "Saving…" : "Save"}
                            </Button>

                            <Button
                              variant="outline"
                              className="text-sm"
                              onClick={() =>
                                setCampEdit((prev) => ({
                                  ...prev,
                                  [id]: original,
                                }))
                              }
                              disabled={editorWorking}
                            >
                              Reset
                            </Button>

                            <Button
                              variant="outline"
                              className="text-sm"
                              onClick={async () => {
                                const ok = await tryDelete(CampDemoEntity, id);
                                appendLog("editor", ok ? `[Editor] Deleted ${id}` : `[Editor] Delete FAILED ${id}`);
                                if (ok) {
                                  await loadCampRowsForEditor();
                                  await refreshQualityCounters();
                                }
                              }}
                              disabled={editorWorking}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="p-3 text-slate-500">
                      {selectedSportId ? (editorWorking ? "Loading…" : "No rows loaded. Click Load Camps.") : "Select a sport first."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Editor Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logEditor || "—"}</pre>
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

export default function AdminImport() {
  return (
    <ErrorBoundary>
      <AdminImportInner />
    </ErrorBoundary>
  );
}
