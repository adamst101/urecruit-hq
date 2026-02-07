// src/pages/AdminImport.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";

/* =========================================================
   Minimal UI primitives (stable, prevents blank UI)
========================================================= */
const Card = ({ className = "", children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>
);

const Button = ({ className = "", disabled, onClick, children, ...rest }) => (
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
                This boundary prevents a total blank page so you can still navigate.
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
    return v.map((x) => (x == null ? null : String(x).trim())).filter((x) => !!x);
  }
  const one = safeString(v);
  return one ? [one] : [];
}
function toISODate(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) return dateInput.trim();
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
function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  const d = new Date(`${startDateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}
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
  return {
    id: r && r.id ? String(r.id) : "",
    school_id: r && r.school_id ? String(r.school_id) : null,
    sport_id: r && r.sport_id ? String(r.sport_id) : null,
    camp_site_url: r && r.camp_site_url ? String(r.camp_site_url) : null,
    active: typeof r && typeof r.active === "boolean" ? r.active : !!(r && r.active),
    crawl_status: statusOf(r),
    last_crawled_at: safeString(r && r.last_crawled_at),
    next_crawl_at: safeString(r && r.next_crawl_at),
    crawl_error: safeString(r && r.crawl_error),
    last_crawl_run_id: safeString(r && r.last_crawl_run_id),
    raw: r,
  };
}

/* =========================================================
   Camp name cleanup (pipe + parentheses + HTML-ish junk)
========================================================= */
function looksLikeHtmlOrTableJunk(s) {
  const t = lc(s || "");
  if (!t) return false;
  if (t.includes("<") || t.includes(">")) return true;
  if (t.includes('valign="') || t.includes("valign='")) return true;
  if (t.includes('data-th="') || t.includes("data-th='") || t.includes("data-th=")) return true;
  if (t.startsWith("d valign=") || t.startsWith("td valign=") || t.startsWith("tr ")) return true;
  return false;
}
function stripHtmlish(s) {
  if (!s) return "";
  let x = String(s);
  x = x.replace(/<script[\s\S]*?<\/script>/gi, " ");
  x = x.replace(/<style[\s\S]*?<\/style>/gi, " ");
  x = x.replace(/<\/?[^>]+>/g, " ");
  x = x.replace(/\s+/g, " ").trim();
  return x;
}
function sanitizeCampNameForWrite(name) {
  const raw = safeString(name);
  if (!raw) return null;

  let s = looksLikeHtmlOrTableJunk(raw) ? stripHtmlish(raw) : raw;

  const junkTokens = ['valign="', "valign='", "data-th=", "data-th:"];
  for (const tok of junkTokens) {
    const idx = lc(s).indexOf(tok);
    if (idx > 0) {
      s = s.slice(0, idx).trim();
      break;
    }
  }

  if (s.includes("|")) s = s.split("|")[0].trim();

  const parenIdx = s.indexOf("(");
  if (parenIdx > 0) s = s.slice(0, parenIdx).trim();

  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}
function needsPipeOrParenOrHtmlCleanup(name) {
  const raw = safeString(name);
  if (!raw) return false;
  const t = lc(raw);
  if (t.includes("|")) return true;
  if (t.includes("(")) return true;
  if (looksLikeHtmlOrTableJunk(raw)) return true;
  if (t.includes('valign="') || t.includes("data-th=")) return true;
  return false;
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
  if (/^\$?\s*\d{1,5}(\.\d{2})?\s*$/.test(String(name || "").trim())) return true;
  if (t.includes("as of fall")) return true;
  if (looksLikeHtmlOrTableJunk(name)) return true;
  return false;
}
function isMissingPrice(row) {
  const p = safeNumber(row?.price);
  const pmin = safeNumber(row?.price_min);
  const pmax = safeNumber(row?.price_max);
  const any = [p, pmin, pmax].some((x) => x != null && x > 0);
  return !any;
}

/* =========================================================
   Active flag helpers for Camp/CampDemo
========================================================= */
function readCampActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;
  const st = lc(row?.status);
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
}
function withActiveDefault(payload, existingRow) {
  const existingActive = existingRow ? readCampActiveFlag(existingRow) : null;
  const nextActive =
    typeof payload?.active === "boolean"
      ? payload.active
      : typeof existingActive === "boolean"
      ? existingActive
      : true;

  return { ...payload, active: nextActive };
}

/* =========================================================
   Quality vocabulary + modes
   - labels MUST MATCH your Quality Counters naming
   - includes both row-level and school-level options
========================================================= */
const QUALITY_VOCAB = {
  bad_name: "Bad Name Remaining",
  name_format: "Name Format Remaining",
  missing_price: "Missing Price Remaining",
  no_camps: "No Camps Remaining",
  schools_bad_name: "Schools: Bad Name",
  schools_name_format: "Schools: Name Format",
  schools_missing_price: "Schools: Missing Price",
  schools_any_cleanup: "Schools: Any Cleanup",
};

const QUALITY_MODES = [
  { id: "none", label: "No quality filter (use rerun mode only)" },

  // row-level counters
  { id: "bad_name", label: QUALITY_VOCAB.bad_name },
  { id: "name_format", label: QUALITY_VOCAB.name_format },
  { id: "missing_price", label: QUALITY_VOCAB.missing_price },
  { id: "no_camps", label: QUALITY_VOCAB.no_camps },

  // school-level counters
  { id: "schools_bad_name", label: QUALITY_VOCAB.schools_bad_name },
  { id: "schools_name_format", label: QUALITY_VOCAB.schools_name_format },
  { id: "schools_missing_price", label: QUALITY_VOCAB.schools_missing_price },
  { id: "schools_any_cleanup", label: QUALITY_VOCAB.schools_any_cleanup },
];

/* =========================================================
   Defaults
========================================================= */
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
  const [logDedup, setLogDedup] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "counters") setLogCounters(add);
    if (which === "quality") setLogQuality(add);
    if (which === "editor") setLogEditor(add);
    if (which === "dedup") setLogDedup(add);
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
  const [dedupWorking, setDedupWorking] = useState(false);

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

  // Rate-limit protection for writes (defaults bumped)
  const [writeDelayMs, setWriteDelayMs] = useState(250);
  const [batchDelayMs, setBatchDelayMs] = useState(800);

  // Auto dedup during ingest: if multiple rows share same event_key, keep one, delete rest
  const [autoDedupOnWrite, setAutoDedupOnWrite] = useState(true);

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

  // Quality mode aligned to counters naming (default school-level “Any Cleanup”)
  const [qualityMode, setQualityMode] = useState("schools_any_cleanup");

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
     Quality Counters (aligned)
  ----------------------------- */
  const [qualityCounters, setQualityCounters] = useState({
    badNameRemaining: 0,
    nameFormatRemaining: 0,
    missingPriceRemaining: 0,
    noCampsRemaining: 0,
    improvedThisRun: 0,
    schoolsNeedingBadNameFix: 0,
    schoolsNeedingNameFormatFix: 0,
    schoolsNeedingPriceFix: 0,
    schoolsNeedingAnyCleanup: 0,
  });

  const lastQualitySnapshotRef = useRef(null);

  /**
   * Builds the same school sets used by:
   * - Quality Counters
   * - Ingest Quality Mode filtering
   * - Editor (school-level filters + No Camps Remaining)
   */
  async function getQualitySchoolSets() {
    if (!selectedSportId || !SchoolSportSiteEntity || !CampDemoEntity) {
      return {
        allSites: [],
        allSchools: new Set(),
        bySchool: new Map(),
        badNameSchools: new Set(),
        nameFormatSchools: new Set(),
        missingPriceSchools: new Set(),
        noCampSchools: new Set(),
        anyCleanupSchools: new Set(),
      };
    }

    const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
    const allSites = siteRowsRaw.map(normalizeSiteRow);
    const allSchools = new Set(allSites.map((s) => s.school_id).filter(Boolean));

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
    const nameFormatSchools = new Set();
    const missingPriceSchools = new Set();
    const schoolsWithAnyCamp = new Set(bySchool.keys());

    for (const [sid, rows] of bySchool.entries()) {
      let hasBad = false;
      let hasFmt = false;
      let hasPrice = false;

      for (const r of rows) {
        if (isBadCampName(r?.camp_name)) hasBad = true;
        if (needsPipeOrParenOrHtmlCleanup(r?.camp_name)) hasFmt = true;
        if (isMissingPrice(r)) hasPrice = true;
      }

      if (hasBad) badNameSchools.add(sid);
      if (hasFmt) nameFormatSchools.add(sid);
      if (hasPrice) missingPriceSchools.add(sid);
    }

    const noCampSchools = new Set();
    for (const sid of allSchools.values()) {
      if (!schoolsWithAnyCamp.has(sid)) noCampSchools.add(sid);
    }

    const anyCleanupSchools = new Set([...badNameSchools, ...nameFormatSchools, ...missingPriceSchools, ...noCampSchools]);

    return {
      allSites,
      allSchools,
      bySchool,
      badNameSchools,
      nameFormatSchools,
      missingPriceSchools,
      noCampSchools,
      anyCleanupSchools,
    };
  }

  async function refreshQualityCounters({ improvedThisRun = null } = {}) {
    const nowIso = new Date().toISOString();
    setQualityWorking(true);

    try {
      if (!selectedSportId) {
        setQualityCounters({
          badNameRemaining: 0,
          nameFormatRemaining: 0,
          missingPriceRemaining: 0,
          noCampsRemaining: 0,
          improvedThisRun: 0,
          schoolsNeedingBadNameFix: 0,
          schoolsNeedingNameFormatFix: 0,
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

      const sets = await getQualitySchoolSets();

      // Remaining counts are row-level from CampDemo (except No Camps)
      let badNameRemaining = 0;
      let nameFormatRemaining = 0;
      let missingPriceRemaining = 0;

      for (const rows of sets.bySchool.values()) {
        for (const r of rows) {
          if (isBadCampName(r?.camp_name)) badNameRemaining += 1;
          if (needsPipeOrParenOrHtmlCleanup(r?.camp_name)) nameFormatRemaining += 1;
          if (isMissingPrice(r)) missingPriceRemaining += 1;
        }
      }

      const noCampsRemaining = sets.noCampSchools.size;
      const improved = improvedThisRun != null ? improvedThisRun : 0;

      setQualityCounters({
        badNameRemaining,
        nameFormatRemaining,
        missingPriceRemaining,
        noCampsRemaining,
        improvedThisRun: improved,
        schoolsNeedingBadNameFix: sets.badNameSchools.size,
        schoolsNeedingNameFormatFix: sets.nameFormatSchools.size,
        schoolsNeedingPriceFix: sets.missingPriceSchools.size,
        schoolsNeedingAnyCleanup: sets.anyCleanupSchools.size,
      });

      lastQualitySnapshotRef.current = {
        badNameRemaining,
        nameFormatRemaining,
        missingPriceRemaining,
        noCampsRemaining,
        schoolsNeedingBadNameFix: sets.badNameSchools.size,
        schoolsNeedingNameFormatFix: sets.nameFormatSchools.size,
        schoolsNeedingPriceFix: sets.missingPriceSchools.size,
        schoolsNeedingAnyCleanup: sets.anyCleanupSchools.size,
      };

      appendLog(
        "quality",
        `[Quality] Refreshed @ ${nowIso} | ${QUALITY_VOCAB.bad_name}=${badNameRemaining} | ${QUALITY_VOCAB.name_format}=${nameFormatRemaining} | ${QUALITY_VOCAB.missing_price}=${missingPriceRemaining} | ${QUALITY_VOCAB.no_camps}=${noCampsRemaining} | ${QUALITY_VOCAB.schools_bad_name}=${sets.badNameSchools.size} | ${QUALITY_VOCAB.schools_name_format}=${sets.nameFormatSchools.size} | ${QUALITY_VOCAB.schools_missing_price}=${sets.missingPriceSchools.size} | ${QUALITY_VOCAB.schools_any_cleanup}=${sets.anyCleanupSchools.size} | ImprovedThisRun=${improved}`
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

  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSASiteUrl(guess);
  }, [selectedSportName]);

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
    if (!SchoolSportSiteEntity?.create || !SchoolSportSiteEntity?.update)
      throw new Error("SchoolSportSite entity not available.");

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
      if (!SchoolEntity || !SchoolSportSiteEntity) return appendLog("sportsusa", "[SportsUSA] ERROR: Missing entities.");

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

      const schoolsFound = asArray(data?.schools || []);
      appendLog("sportsusa", `[SportsUSA] schools_found=${schoolsFound.length}`);

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

      for (let i = 0; i < schoolsFound.length; i++) {
        const srow = schoolsFound[i] || {};
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
          appendLog(
            "sportsusa",
            `[SportsUSA] Progress ${i + 1}/${schoolsFound.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`
          );
        }
        await sleep(15);
      }

      appendLog(
        "sportsusa",
        `[SportsUSA] Done. Schools created=${schoolsCreated} updated=${schoolsUpdated} | Sites created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`
      );
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
        active: typeof e.active === "boolean" ? e.active : undefined,
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
      active: typeof a.active === "boolean" ? a.active : undefined,
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
    return arr.filter((s) => isDueNow(s));
  }

  function qualityPickSet(sets) {
    // school-level
    if (qualityMode === "schools_bad_name") return sets.badNameSchools;
    if (qualityMode === "schools_name_format") return sets.nameFormatSchools;
    if (qualityMode === "schools_missing_price") return sets.missingPriceSchools;
    if (qualityMode === "schools_any_cleanup") return sets.anyCleanupSchools;

    // row-level uses school sets too (we target those schools)
    if (qualityMode === "bad_name") return sets.badNameSchools;
    if (qualityMode === "name_format") return sets.nameFormatSchools;
    if (qualityMode === "missing_price") return sets.missingPriceSchools;
    if (qualityMode === "no_camps") return sets.noCampSchools;

    return null;
  }

  function qualityFilterSites(sites, sets) {
    const arr = asArray(sites);
    if (qualityMode === "none") return arr;

    const pickSet = qualityPickSet(sets);
    if (!pickSet) return arr;

    return arr.filter((s) => s.school_id && pickSet.has(String(s.school_id)));
  }

  async function writeWithRetry(fn, { maxRetries = 7 } = {}) {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (e) {
        const msg = String(e?.message || e);
        const m = msg.toLowerCase();
        const isRate =
          m.includes("rate limit") ||
          m.includes("rate-limit") ||
          m.includes("rate_limit") ||
          m.includes("too many requests") ||
          m.includes("429");
        const isNet = m.includes("network") || m.includes("fetch") || m.includes("timeout") || m.includes("gateway");

        if (!isRate && !isNet) throw e;

        attempt += 1;
        if (attempt > maxRetries) throw e;

        // exponential backoff + jitter
        const base = Math.min(8000, 400 * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        const wait = base + jitter;
        await sleep(wait);
      }
    }
  }

  function scoreRowForDedup(r) {
    // Keep the most "complete" row, then newest last_seen_at, then with price
    let score = 0;
    if (safeString(r?.camp_name)) score += 2;
    if (safeString(r?.start_date)) score += 2;
    if (safeString(r?.link_url)) score += 2;
    if (safeString(r?.city)) score += 1;
    if (safeString(r?.state)) score += 1;
    if (!isMissingPrice(r)) score += 2;
    if (readCampActiveFlag(r)) score += 1;

    const ls = safeString(r?.last_seen_at);
    const t = ls ? new Date(ls).getTime() : 0;
    score += Math.max(0, Math.min(5, Math.floor(t / 1e12))); // tiny nudge

    return score;
  }

  async function dedupEventKeyGroup(rows, { dryRun }) {
    const arr = asArray(rows).filter((x) => x && x.id);
    if (arr.length <= 1) return { keptId: arr[0]?.id ? String(arr[0].id) : null, deleted: 0 };

    // choose winner
    const sorted = [...arr].sort((a, b) => scoreRowForDedup(b) - scoreRowForDedup(a));
    const keep = sorted[0];
    const losers = sorted.slice(1);

    if (!dryRun) {
      for (const lose of losers) {
        await tryDelete(CampDemoEntity, String(lose.id));
        await sleep(40);
      }
    }

    return { keptId: String(keep.id), deleted: losers.length };
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

    // If duplicates already exist, optionally dedup them right here (so you stop accumulating)
    if (!campsDryRun && autoDedupOnWrite && arr.length > 1) {
      await dedupEventKeyGroup(arr, { dryRun: false });
      // re-load after delete
      try {
        existing = await entityList(CampDemoEntity, { event_key: key });
      } catch {
        existing = [];
      }
    }

    const arr2 = asArray(existing);
    if (arr2.length > 0 && arr2[0]?.id) {
      const finalPayload = withActiveDefault(payload, arr2[0]); // preserve active on update
      await CampDemoEntity.update(String(arr2[0].id), finalPayload);
      return "updated";
    }

    const finalPayload = withActiveDefault(payload, null); // default active=true on create
    await CampDemoEntity.create(finalPayload);
    return "created";
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
    appendLog("camps", `[Camps] RerunMode=${rerunMode} | QualityMode=${QUALITY_MODES.find((m) => m.id === qualityMode)?.label || qualityMode}`);

    try {
      if (!selectedSportId) return appendLog("camps", "[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity) return appendLog("camps", "[Camps] ERROR: SchoolSportSite entity not available.");
      if (!CampDemoEntity) return appendLog("camps", "[Camps] ERROR: CampDemo entity not available.");

      if (!lastQualitySnapshotRef.current) await refreshQualityCounters();

      const sets = await getQualitySchoolSets();
      const allSites = sets.allSites;

      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${allSites.length} (active)`);

      const rerunFiltered = pickSitesByRerunMode(allSites);
      appendLog("camps", `[Camps] Rerun filtered sites: ${rerunFiltered.length}`);

      const qualityFiltered = qualityFilterSites(rerunFiltered, sets);
      appendLog("camps", `[Camps] Quality filtered sites: ${qualityFiltered.length} (mode="${QUALITY_MODES.find((m) => m.id === qualityMode)?.label || qualityMode}")`);

      const tUrl = safeString(testSiteUrl);
      const tSchool = safeString(testSchoolId);

      if (tUrl && !campsDryRun && !tSchool) {
        appendLog("camps", "[Camps] ERROR: For non-dry-run with Test Site URL, provide Test School ID.");
        return;
      }

      if (tUrl) {
        appendLog("camps", `[Camps] Test mode enabled: ${tUrl}`);
        await runOneIngestCall({ runIso, runId, batchSites: [], testSiteUrl: tUrl, testSchoolId: tSchool });
        await refreshCrawlCounters();
        await refreshQualityCounters({ improvedThisRun: 0 });
        return;
      }

      if (!qualityFiltered.length) {
        appendLog("camps", `[Camps] Nothing to do for this Rerun+Quality selection.`);
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

        appendLog("camps", ``);
        appendLog("camps", `[Camps] ---- Batch ${b + 1} ----`);
        appendLog("camps", `[Camps] Batch size=${batchSites.length} | remainingAfterThis=${Math.max(0, totalSites - end)}`);

        const res = await runOneIngestCall({ runIso, runId, batchSites, testSiteUrl: null, testSchoolId: null });

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
          const dBad = Math.max(0, (before.badNameRemaining || 0) - (after.badNameRemaining || 0));
          const dFmt = Math.max(0, (before.nameFormatRemaining || 0) - (after.nameFormatRemaining || 0));
          const dPrice = Math.max(0, (before.missingPriceRemaining || 0) - (after.missingPriceRemaining || 0));
          const dNo = Math.max(0, (before.noCampsRemaining || 0) - (after.noCampsRemaining || 0));
          const improved = dBad + dFmt + dPrice + dNo;
          setQualityCounters((prev) => ({ ...prev, improvedThisRun: improved }));
          appendLog("quality", `[Quality] ImprovedThisRun computed: ${improved} (BadName -${dBad}, NameFormat -${dFmt}, MissingPrice -${dPrice}, NoCamps -${dNo})`);
        }
      } else {
        await refreshQualityCounters({ improvedThisRun: 0 });
      }
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

    const acceptedRaw = asArray(data?.accepted || []);
    const accepted = acceptedRaw.map((x) => normalizeAcceptedRowToFlat(x));
    appendLog("camps", `[Camps] Accepted events returned: ${accepted.length}`);

    // Update crawl-state for batch sites (only in non-dry-run, non-test)
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

      // enforce pipe + parentheses cleanup on write (prevents reintroducing)
      const camp_name = sanitizeCampNameForWrite(a.camp_name);

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

      // IMPORTANT: If function provides program_id / event_key, use it (prevents new keys).
      const source_platform = safeString(a.source_platform) || "sportsusa";
      const program_id = safeString(a.program_id) || `sportsusa:${slugify(camp_name)}`;
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
          city: safeString(a.city),
          state: safeString(a.state),
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
        ...(typeof a.active === "boolean" ? { active: a.active } : {}),
      };

      try {
        let existing = [];
        try {
          existing = await entityList(CampDemoEntity, { event_key });
        } catch {
          existing = [];
        }
        const prevHash = existing?.[0]?.content_hash ? String(existing[0].content_hash) : null;

        const result = await writeWithRetry(() => upsertCampDemoByEventKey(payload), { maxRetries: 7 });
        if (result === "created") created += 1;
        if (result === "updated") updated += 1;

        // Improved = created OR content hash changed
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
     Promote CampDemo -> Camp
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
      const finalPayload = withActiveDefault(payload, arr[0]);
      await CampEntity.update(String(arr[0].id), finalPayload);
      return "updated";
    }

    const finalPayload = withActiveDefault(payload, null);
    await CampEntity.create(finalPayload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r?.school_id);
    const sport_id = safeString(r?.sport_id);
    const camp_name = sanitizeCampNameForWrite(r?.camp_name);
    const start_date = toISODate(r?.start_date);
    const end_date = toISODate(r?.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date)
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };

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

    const active = readCampActiveFlag(r);

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
      active,
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
     Dedup Sweep (CampDemo)
  ----------------------------- */
  const [dedupDryRun, setDedupDryRun] = useState(true);
  const [dedupLimit, setDedupLimit] = useState(20000);

  async function runDedupSweep() {
    const runIso = new Date().toISOString();
    setDedupWorking(true);
    setLogDedup("");

    try {
      if (!selectedSportId) return appendLog("dedup", "[Dedup] ERROR: Select a sport first.");
      if (!CampDemoEntity) return appendLog("dedup", "[Dedup] ERROR: CampDemo entity not available.");

      appendLog("dedup", `[Dedup] Starting @ ${runIso} | dryRun=${dedupDryRun ? "true" : "false"} | limit=${dedupLimit}`);

      const all = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const rows = asArray(all).slice(0, Math.max(100, Number(dedupLimit || 20000)));

      appendLog("dedup", `[Dedup] Loaded CampDemo rows: ${rows.length}`);

      const groups = new Map();
      let missingKey = 0;
      for (const r of rows) {
        const k = safeString(r?.event_key);
        if (!k) {
          missingKey += 1;
          continue;
        }
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }

      const dupKeys = [];
      for (const [k, arr] of groups.entries()) {
        if (arr.length > 1) dupKeys.push([k, arr.length]);
      }
      dupKeys.sort((a, b) => b[1] - a[1]);

      appendLog("dedup", `[Dedup] event_key missing on ${missingKey} rows (cannot dedup those).`);
      appendLog("dedup", `[Dedup] Duplicate event_key groups: ${dupKeys.length}`);

      let groupsProcessed = 0;
      let rowsDeleted = 0;

      for (let i = 0; i < dupKeys.length; i++) {
        const [k] = dupKeys[i];
        const arr = groups.get(k);

        const res = await dedupEventKeyGroup(arr, { dryRun: !!dedupDryRun });
        groupsProcessed += 1;
        rowsDeleted += res.deleted;

        if ((i + 1) % 25 === 0) {
          appendLog("dedup", `[Dedup] Progress groups: ${i + 1}/${dupKeys.length} | deleted=${rowsDeleted}`);
        }

        // gentle pacing
        await sleep(dedupDryRun ? 5 : 80);
      }

      appendLog("dedup", `[Dedup] DONE. duplicate_groups=${dupKeys.length} groups_processed=${groupsProcessed} rows_deleted=${rowsDeleted}`);

      // refresh counters to reflect new reality
      if (!dedupDryRun) {
        await refreshQualityCounters({ improvedThisRun: 0 });
      }
    } catch (e) {
      appendLog("dedup", `[Dedup] ERROR: ${String(e?.message || e)}`);
    } finally {
      setDedupWorking(false);
    }
  }

  /* ----------------------------
     Camp Editor (aligned naming + includes link column)
  ----------------------------- */
  const [editorFilter, setEditorFilter] = useState("name_format");
  const [editorSearch, setEditorSearch] = useState("");
  const [editorLimit, setEditorLimit] = useState(200);
  const [campRows, setCampRows] = useState([]);
  const [campEdit, setCampEdit] = useState({});
  const [campSavingId, setCampSavingId] = useState("");
  const [noCampSites, setNoCampSites] = useState([]);

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
      active: readCampActiveFlag(r),
    };
  }

  async function loadCampRowsForEditor() {
    const nowIso = new Date().toISOString();
    setEditorWorking(true);
    setLogEditor("");
    setNoCampSites([]);
    setCampRows([]);
    setCampEdit({});

    try {
      if (!selectedSportId) return appendLog("editor", `[Editor] Select a sport first.`);
      if (!CampDemoEntity) return appendLog("editor", `[Editor] CampDemo entity not available.`);
      if (!SchoolSportSiteEntity) return appendLog("editor", `[Editor] SchoolSportSite entity not available.`);

      const sets = await getQualitySchoolSets();

      // No Camps Remaining = show schools/sites with zero CampDemo rows
      if (editorFilter === "no_camps") {
        const sites = asArray(sets.allSites)
          .filter((s) => s.school_id && sets.noCampSchools.has(String(s.school_id)))
          .slice(0, Math.max(10, Number(editorLimit || 200)));

        setNoCampSites(sites);
        appendLog("editor", `[Editor] Loaded @ ${nowIso} | ${QUALITY_VOCAB.no_camps} sites=${sites.length}`);
        appendLog("editor", `[Editor] Note: this mode lists schools/sites (no CampDemo rows exist yet). Use Ingest to create rows.`);
        return;
      }

      const all = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      let rows = asArray(all);

      // School-level filters (show all rows for those schools)
      const schoolFilterSet =
        editorFilter === "schools_bad_name"
          ? sets.badNameSchools
          : editorFilter === "schools_name_format"
          ? sets.nameFormatSchools
          : editorFilter === "schools_missing_price"
          ? sets.missingPriceSchools
          : editorFilter === "schools_any_cleanup"
          ? sets.anyCleanupSchools
          : null;

      if (schoolFilterSet) {
        rows = rows.filter((r) => {
          const sid = safeString(r?.school_id);
          return sid && schoolFilterSet.has(String(sid));
        });
      } else {
        // Row-level filters
        if (editorFilter === "bad_name") rows = rows.filter((r) => isBadCampName(r?.camp_name));
        if (editorFilter === "name_format") rows = rows.filter((r) => needsPipeOrParenOrHtmlCleanup(r?.camp_name));
        if (editorFilter === "missing_price") rows = rows.filter((r) => isMissingPrice(r));
      }

      if (editorFilter === "any_cleanup") {
        rows = rows.filter((r) => isBadCampName(r?.camp_name) || needsPipeOrParenOrHtmlCleanup(r?.camp_name) || isMissingPrice(r));
      }

      if (editorFilter === "inactive") rows = rows.filter((r) => readCampActiveFlag(r) === false);
      if (editorFilter === "active_only") rows = rows.filter((r) => readCampActiveFlag(r) === true);

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
      appendLog("editor", `[Editor] Active toggle: uncheck to hide a camp from the app.`);
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
      const cleanedName = sanitizeCampNameForWrite(patch.camp_name);

      const payload = {
        camp_name: cleanedName,
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
        active: typeof patch.active === "boolean" ? patch.active : true,
      };

      await writeWithRetry(() => CampDemoEntity.update(String(id), payload), { maxRetries: 7 });

      appendLog("editor", `[Editor] Saved ${id} (active=${payload.active ? "true" : "false"})`);
      await refreshQualityCounters();
    } catch (e) {
      appendLog("editor", `[Editor] SAVE FAILED ${id}: ${String(e?.message || e)}`);
    } finally {
      setCampSavingId("");
    }
  }

  async function setAllLoadedActive(value) {
    const v = !!value;
    setCampEdit((prev) => {
      const next = { ...prev };
      for (const r of campRows) {
        const id = String(r.id);
        next[id] = { ...(next[id] || buildEditRowDefaults(r)), active: v };
      }
      return next;
    });
  }

  /* ----------------------------
     UI
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">Admin Import</div>
            <div className="text-sm text-slate-600">
              Seed → Ingest (targeted batches) → Dedup Sweep → Promote → Direct cleanup editor (includes Active toggle).
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => nav("/Workspace")}>Back to Workspace</Button>
            <Button onClick={() => nav("/Home")}>Home</Button>
          </div>
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
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking || dedupWorking}
              >
                <option value="">Select…</option>
                {sports.map((sx) => (
                  <option key={sx.id} value={sx.id}>
                    {sx.name} {sx.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <Button onClick={() => loadSports()} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button onClick={() => refreshCrawlCounters()} disabled={countersWorking || !selectedSportId}>
                {countersWorking ? "Refreshing…" : "Refresh Crawl Counters"}
              </Button>
              <Button onClick={() => refreshQualityCounters()} disabled={qualityWorking || !selectedSportId}>
                {qualityWorking ? "Refreshing…" : "Refresh Quality Counters"}
              </Button>
            </div>
          </div>
        </Card>

        {/* 2) Crawl + Quality Counters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="font-semibold text-slate-900">2) Crawl Counters (SchoolSportSite)</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">Active Sites</div>
                <div className="text-lg font-semibold">{siteCounters.active}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">Done (ok/no/error)</div>
                <div className="text-lg font-semibold">{siteCounters.done}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">Due Now</div>
                <div className="text-lg font-semibold">{siteCounters.dueNow}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">Ready</div>
                <div className="text-lg font-semibold">{siteCounters.ready}</div>
              </div>

              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">OK</div>
                <div className="text-lg font-semibold">{siteCounters.ok}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">NO_EVENTS</div>
                <div className="text-lg font-semibold">{siteCounters.no_events}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">ERROR</div>
                <div className="text-lg font-semibold">{siteCounters.error}</div>
              </div>

              <div className="rounded-lg border border-slate-200 p-2 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Reset to READY</div>
                  <div className="text-xs text-slate-500">All active sites</div>
                </div>
                <Button onClick={resetCrawlStateForSport} disabled={resetWorking || !selectedSportId}>
                  {resetWorking ? "Resetting…" : "Reset"}
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">Counters Log</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-44">
                {logCounters || "—"}
              </pre>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-semibold text-slate-900">3) Quality Counters (CampDemo)</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.bad_name}</div>
                <div className="text-lg font-semibold">{qualityCounters.badNameRemaining}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.name_format}</div>
                <div className="text-lg font-semibold">{qualityCounters.nameFormatRemaining}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.missing_price}</div>
                <div className="text-lg font-semibold">{qualityCounters.missingPriceRemaining}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.no_camps}</div>
                <div className="text-lg font-semibold">{qualityCounters.noCampsRemaining}</div>
              </div>

              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.schools_bad_name}</div>
                <div className="text-lg font-semibold">{qualityCounters.schoolsNeedingBadNameFix}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.schools_name_format}</div>
                <div className="text-lg font-semibold">{qualityCounters.schoolsNeedingNameFormatFix}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.schools_missing_price}</div>
                <div className="text-lg font-semibold">{qualityCounters.schoolsNeedingPriceFix}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{QUALITY_VOCAB.schools_any_cleanup}</div>
                <div className="text-lg font-semibold">{qualityCounters.schoolsNeedingAnyCleanup}</div>
              </div>
            </div>

            <div className="mt-2 rounded-lg border border-slate-200 p-2">
              <div className="text-xs text-slate-500">Improved This Run (computed after ingest)</div>
              <div className="text-lg font-semibold">{qualityCounters.improvedThisRun}</div>
            </div>

            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">Quality Log</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-44">
                {logQuality || "—"}
              </pre>
            </div>
          </Card>
        </div>

        {/* 4) Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">4) Seed Schools (SportsUSA)</div>
          <div className="text-sm text-slate-600 mt-1">Creates/updates School + SchoolSportSite for the selected sport.</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsUSASiteUrl}
                onChange={(e) => setSportsUSASiteUrl(e.target.value)}
                placeholder="https://www.footballcampsusa.com/"
                disabled={sportsUSAWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={sportsUSALimit}
                onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                min={10}
                max={5000}
                disabled={sportsUSAWorking}
              />
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={sportsUSADryRun}
                  onChange={(e) => setSportsUSADryRun(e.target.checked)}
                  disabled={sportsUSAWorking}
                />
                Dry Run
              </label>
              <Button onClick={runSportsUSASeedSchools} disabled={!selectedSportId || sportsUSAWorking}>
                {sportsUSAWorking ? "Running…" : "Run Seed"}
              </Button>
              <Button onClick={() => setLogSportsUSA("")} disabled={sportsUSAWorking}>
                Clear Log
              </Button>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Seed Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">
              {logSportsUSA || "—"}
            </pre>
          </div>
        </Card>

        {/* 5) Ingest Camps */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">5) Ingest Camps (SportsUSA)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs targeted batches using <b>Rerun Mode</b> + <b>Quality Mode</b>. Camp name cleanup (pipe + parentheses) is enforced on write.
          </div>

          <div className="mt-3 grid grid-cols-1 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dry Run</label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={campsDryRun} onChange={(e) => setCampsDryRun(e.target.checked)} disabled={campsWorking} />
                {campsDryRun ? "On" : "Off"}
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fast Mode</label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} disabled={campsWorking} />
                {fastMode ? "On" : "Off"}
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Sites / Batch</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxSites}
                onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))}
                min={1}
                max={250}
                disabled={campsWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Regs / Site</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxRegsPerSite}
                onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))}
                min={1}
                max={200}
                disabled={campsWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Events</label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Runner</label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={runBatches} onChange={(e) => setRunBatches(e.target.checked)} disabled={campsWorking} />
                {runBatches ? "On" : "Off"}
              </label>
              <div className="mt-1">
                <label className="block text-[11px] text-slate-500">Max Batches</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={maxBatches}
                  onChange={(e) => setMaxBatches(Number(e.target.value || 0))}
                  min={1}
                  max={1000}
                  disabled={campsWorking || !runBatches}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun Mode</label>
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
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quality Mode (aligned to Quality Counters)</label>
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

              <div className="mt-2 text-xs text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoDedupOnWrite}
                    onChange={(e) => setAutoDedupOnWrite(e.target.checked)}
                    disabled={campsWorking}
                  />
                  Auto-dedup on write (delete extra rows sharing the same event_key)
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write Delay (ms)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={writeDelayMs}
                onChange={(e) => setWriteDelayMs(Number(e.target.value || 0))}
                min={0}
                max={5000}
                disabled={campsWorking}
              />
              <div className="mt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Delay (ms)</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={batchDelayMs}
                  onChange={(e) => setBatchDelayMs(Number(e.target.value || 0))}
                  min={0}
                  max={20000}
                  disabled={campsWorking}
                />
              </div>
            </div>
          </div>

          {/* Test mode */}
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <div className="font-semibold text-slate-900 text-sm">Test Mode (optional)</div>
            <div className="text-xs text-slate-600 mt-1">Run ingest against one specific camp site URL without using SchoolSportSite list.</div>
            <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Test Site URL</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={testSiteUrl}
                  onChange={(e) => setTestSiteUrl(e.target.value)}
                  placeholder="https://www.somefootballcampsite.com/"
                  disabled={campsWorking}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Test School ID</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={testSchoolId}
                  onChange={(e) => setTestSchoolId(e.target.value)}
                  placeholder="Required if DryRun=false"
                  disabled={campsWorking}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking}>
              {campsWorking ? "Running…" : "Run Ingest"}
            </Button>
            <Button onClick={() => setLogCamps("")} disabled={campsWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Ingest Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">
              {logCamps || "—"}
            </pre>
          </div>
        </Card>

        {/* 6) Dedup Sweep */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">6) Dedup Sweep (CampDemo)</div>
          <div className="text-sm text-slate-600 mt-1">
            Finds duplicate rows that share the <b>same event_key</b>. Keeps the best row and deletes the extras.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={dedupDryRun} onChange={(e) => setDedupDryRun(e.target.checked)} disabled={dedupWorking} />
              <span className="text-sm text-slate-700">Dry Run (report only)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit rows scanned</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={dedupLimit}
                onChange={(e) => setDedupLimit(Number(e.target.value || 0))}
                min={500}
                max={200000}
                disabled={dedupWorking}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={runDedupSweep} disabled={!selectedSportId || dedupWorking}>
                {dedupWorking ? "Running…" : "Run Dedup Sweep"}
              </Button>
              <Button onClick={() => setLogDedup("")} disabled={dedupWorking}>
                Clear Log
              </Button>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Dedup Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">
              {logDedup || "—"}
            </pre>
          </div>
        </Card>

        {/* 7) Promote */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">7) Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">Copies rows into Camp table (and carries Active flag). Upsert by event_key.</div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button onClick={promoteCampDemoToCamp} disabled={!selectedSportId || promoteWorking}>
              {promoteWorking ? "Promoting…" : "Promote Now"}
            </Button>
            <Button onClick={() => setLogPromote("")} disabled={promoteWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Promote Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">
              {logPromote || "—"}
            </pre>
          </div>
        </Card>

        {/* 8) Camp Editor */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">8) Camp Editor (aligned to Quality Counters)</div>
          <div className="text-sm text-slate-600 mt-1">
            Filters match the naming in <b>3) Quality Counters (CampDemo)</b>. Registration links render as clickable URLs.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Filter (aligned)</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={editorFilter}
                onChange={(e) => setEditorFilter(e.target.value)}
                disabled={editorWorking}
              >
                <option value="bad_name">{QUALITY_VOCAB.bad_name}</option>
                <option value="name_format">{QUALITY_VOCAB.name_format}</option>
                <option value="missing_price">{QUALITY_VOCAB.missing_price}</option>
                <option value="no_camps">{QUALITY_VOCAB.no_camps}</option>

                <option value="schools_bad_name">{QUALITY_VOCAB.schools_bad_name}</option>
                <option value="schools_name_format">{QUALITY_VOCAB.schools_name_format}</option>
                <option value="schools_missing_price">{QUALITY_VOCAB.schools_missing_price}</option>
                <option value="schools_any_cleanup">{QUALITY_VOCAB.schools_any_cleanup}</option>

                <option value="any_cleanup">{QUALITY_VOCAB.schools_any_cleanup} (row list)</option>
                <option value="active_only">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="all">All (sport)</option>
              </select>
              <div className="text-[11px] text-slate-500 mt-1">Note: {QUALITY_VOCAB.no_camps} lists schools/sites (not CampDemo rows).</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Search</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={editorSearch}
                onChange={(e) => setEditorSearch(e.target.value)}
                placeholder="camp name, school_id, event_key, url…"
                disabled={editorWorking || editorFilter === "no_camps"}
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
                max={5000}
                disabled={editorWorking}
              />
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <Button onClick={loadCampRowsForEditor} disabled={!selectedSportId || editorWorking || campsWorking}>
                {editorWorking ? "Loading…" : "Load"}
              </Button>
              <Button onClick={() => setAllLoadedActive(true)} disabled={!campRows.length || editorWorking || editorFilter === "no_camps"}>
                Mark all Active
              </Button>
              <Button onClick={() => setAllLoadedActive(false)} disabled={!campRows.length || editorWorking || editorFilter === "no_camps"}>
                Mark all Inactive
              </Button>
              <Button onClick={() => setLogEditor("")} disabled={editorWorking}>
                Clear Log
              </Button>
            </div>
          </div>

          {/* No Camps Remaining view */}
          {editorFilter === "no_camps" ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200">school_id</th>
                    <th className="p-2 border-b border-slate-200">site_id</th>
                    <th className="p-2 border-b border-slate-200">camp_site_url</th>
                    <th className="p-2 border-b border-slate-200">crawl_status</th>
                    <th className="p-2 border-b border-slate-200">next_crawl_at</th>
                  </tr>
                </thead>
                <tbody>
                  {noCampSites.length ? (
                    noCampSites.map((s) => (
                      <tr key={String(s.id)} className="border-b border-slate-100">
                        <td className="p-2">{String(s.school_id || "")}</td>
                        <td className="p-2">{String(s.id || "")}</td>
                        <td className="p-2">
                          <a className="text-blue-600 underline" href={s.camp_site_url || "#"} target="_blank" rel="noreferrer">
                            {truncate(String(s.camp_site_url || ""), 80)}
                          </a>
                        </td>
                        <td className="p-2">{String(s.crawl_status || "")}</td>
                        <td className="p-2">{String(s.next_crawl_at || "")}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-3 text-slate-500">
                        {selectedSportId ? (editorWorking ? "Loading…" : "No schools currently in No Camps Remaining. Click Load.") : "Select a sport first."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200">Camp Name</th>
                    <th className="p-2 border-b border-slate-200 w-24">Active</th>
                    <th className="p-2 border-b border-slate-200 w-28">Price</th>
                    <th className="p-2 border-b border-slate-200 w-28">Min</th>
                    <th className="p-2 border-b border-slate-200 w-28">Max</th>
                    <th className="p-2 border-b border-slate-200 w-28">City</th>
                    <th className="p-2 border-b border-slate-200 w-20">State</th>
                    <th className="p-2 border-b border-slate-200 w-[360px]">Registration Link</th>
                    <th className="p-2 border-b border-slate-200 w-44">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campRows.length ? (
                    campRows.map((r) => {
                      const id = String(r.id);
                      const edit = campEdit?.[id] || buildEditRowDefaults(r);
                      const link = safeString(edit.link_url);

                      return (
                        <tr key={id} className="border-b border-slate-100">
                          <td className="p-2 min-w-[320px]">
                            <div className="text-[11px] text-slate-500 mb-1">
                              school_id={String(r.school_id || "")} • event_key={truncate(String(r.event_key || ""), 52)}
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
                          </td>

                          <td className="p-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={!!edit.active}
                                onChange={(e) =>
                                  setCampEdit((prev) => ({
                                    ...prev,
                                    [id]: { ...(prev[id] || edit), active: e.target.checked },
                                  }))
                                }
                              />
                              {edit.active ? "Yes" : "No"}
                            </label>
                            <div className="text-[11px] text-slate-500 mt-1">{edit.active ? "Shown" : "Hidden"}</div>
                          </td>

                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.price ?? ""}
                              onChange={(e) =>
                                setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), price: e.target.value } }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.price_min ?? ""}
                              onChange={(e) =>
                                setCampEdit((prev) => ({
                                  ...prev,
                                  [id]: { ...(prev[id] || edit), price_min: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.price_max ?? ""}
                              onChange={(e) =>
                                setCampEdit((prev) => ({
                                  ...prev,
                                  [id]: { ...(prev[id] || edit), price_max: e.target.value },
                                }))
                              }
                            />
                          </td>

                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.city ?? ""}
                              onChange={(e) =>
                                setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), city: e.target.value } }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.state ?? ""}
                              onChange={(e) =>
                                setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), state: e.target.value } }))
                              }
                            />
                          </td>

                          {/* Registration Link: input + clickable link */}
                          <td className="p-2">
                            <div className="flex flex-col gap-1">
                              <input
                                className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                                value={edit.link_url ?? ""}
                                onChange={(e) =>
                                  setCampEdit((prev) => ({
                                    ...prev,
                                    [id]: { ...(prev[id] || edit), link_url: e.target.value },
                                  }))
                                }
                              />
                              {link ? (
                                <a className="text-xs text-blue-600 underline break-all" href={link} target="_blank" rel="noreferrer">
                                  {link}
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>
                          </td>

                          <td className="p-2">
                            <div className="flex gap-2 flex-wrap">
                              <Button className="text-sm" onClick={() => saveCampRow(id)} disabled={campSavingId === id || editorWorking}>
                                {campSavingId === id ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                className="text-sm"
                                onClick={async () => {
                                  const nextActive = !readCampActiveFlag(r);
                                  setCampEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || edit), active: nextActive } }));
                                  await saveCampRow(id);
                                }}
                                disabled={campSavingId === id || editorWorking}
                              >
                                Toggle Active
                              </Button>
                              <Button
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
                      <td colSpan={9} className="p-3 text-slate-500">
                        {selectedSportId ? (editorWorking ? "Loading…" : "No rows loaded. Click Load.") : "Select a sport first."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Editor Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">
              {logEditor || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <div className="text-xs text-slate-500">
            Reminder: to hide inactive camps in the app, your list queries must filter for <b>active === true</b>.
          </div>
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
