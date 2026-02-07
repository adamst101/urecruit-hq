// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";

/* =========================================================
   AdminImport.jsx (FULL FILE)
   What this version fixes/guarantees:
   1) NO DUPLICATES: Upsert by event_key (CampDemo + Camp) and
      inline dedupe-on-write if multiple rows already exist.
   2) QUALITY COUNTERS ALWAYS RECOUNT: Counters are computed by
      scanning CampDemo rows (no deactivation tricks).
   3) NAME CLEANUPS CHANGE COUNTERS: Cleanups update rows, then
      Refresh Quality Counters recounts remaining issues.
   4) NO DEACTIVATION IF UNREPAIRABLE: We log "unfixable" and
      leave records active so they keep showing in quality totals.
   5) RATE LIMIT RESILIENCE: writeWithRetry + throttled writes.
   6) CAMP EDITOR INCLUDES registration_link: visible + editable.
   7) Supports batch ingest across SchoolSportSite rows, with
      rerun mode + quality mode filters.
========================================================= */

/* =========================================================
   Minimal UI primitives
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

const Toggle = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

/* =========================================================
   Error Boundary (prevents blank UI)
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
              <div className="text-sm text-slate-600 mt-2">Open DevTools Console for the stack trace.</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto">
                {this.state.message}
              </pre>
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
function truncate(s, n = 900) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "…(truncated)" : str;
}
function parseIsoOrNull(x) {
  const s = safeString(x);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
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
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
   ✅ Rate limit / transient write resilience
========================================================= */
async function writeWithRetry(fn, { maxRetries = 12 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || e);
      const lower = msg.toLowerCase();

      const isRate = lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("429");
      const isNet = lower.includes("network") || lower.includes("fetch") || lower.includes("timeout");

      if (!isRate && !isNet) throw e;

      attempt += 1;
      if (attempt > maxRetries) throw e;

      const base = Math.min(15000, 300 * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
}

/* =========================================================
   Crawl-state helpers
========================================================= */
function statusOf(site) {
  const s = safeString(site && site.crawl_status);
  return s || "ready";
}
function isDueNow(site) {
  const now = new Date();
  const next = parseIsoOrNull(site && site.next_crawl_at);
  return !next || next <= now;
}
function normalizeSiteRow(r) {
  return {
    id: r && r.id ? String(r.id) : "",
    school_id: r && r.school_id ? String(r.school_id) : null,
    sport_id: r && r.sport_id ? String(r.sport_id) : null,
    camp_site_url: safeString(r && r.camp_site_url),
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
   ✅ Stable event_key (DO NOT INCLUDE CAMP NAME)
========================================================= */
function buildEventKeyStable({ source_platform, school_id, start_date, link_url, source_url }) {
  const platform = safeString(source_platform) || "seed";
  const sid = safeString(school_id) || "na";
  const dt = safeString(start_date) || "na";
  const dest = safeString(link_url) || safeString(source_url) || "na";
  return `${platform}:${sid}:${dt}:${dest}`;
}

/* =========================================================
   Name cleanup logic + quality checks
========================================================= */
function looksLikeHtmlOrTableJunk(s) {
  const t = lc(s || "");
  if (!t) return false;
  if (t.includes("<") || t.includes(">")) return true;
  if (t.includes('valign="') || t.includes("valign='")) return true;
  if (t.includes("data-th=") || t.includes("data-th:")) return true;
  if (t.startsWith("td valign=") || t.startsWith("tr ")) return true;
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

  // SportsUSA: "CAMP NAME | ..." — keep left side
  if (s.includes("|")) s = s.split("|")[0].trim();

  // Remove parenthetical trailing junk: "(As of Fall...)" etc
  const parenIdx = s.indexOf("(");
  if (parenIdx > 0) s = s.slice(0, parenIdx).trim();

  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}
function needsNameFormatCleanup(name) {
  const raw = safeString(name);
  if (!raw) return false;
  const t = lc(raw);
  if (t.includes("|")) return true;
  if (t.includes("(")) return true;
  if (looksLikeHtmlOrTableJunk(raw)) return true;
  if (t.includes('valign="') || t.includes("data-th=")) return true;
  return false;
}
function isBadCampName(name) {
  const t = lc(name || "");
  if (!t) return true;
  if (t === "register" || t === "register now") return true;
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
   Active flag handling (Camp / CampDemo)
========================================================= */
function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;
  const st = lc(row?.status);
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
}
function withActiveDefault(payload, existingRow) {
  const existingActive = existingRow ? readActiveFlag(existingRow) : null;
  const nextActive =
    typeof payload?.active === "boolean"
      ? payload.active
      : typeof existingActive === "boolean"
      ? existingActive
      : true;
  return { ...payload, active: nextActive };
}

/* =========================================================
   Quality modes vocabulary (stable)
========================================================= */
const QUALITY_MODES = [
  { id: "none", label: "No quality filter (use rerun mode only)" },
  { id: "bad_name", label: "Schools: Bad Name" },
  { id: "name_format", label: "Schools: Name Format" },
  { id: "missing_price", label: "Schools: Missing Price" },
  { id: "no_camps", label: "No Camps Remaining" },
  { id: "any_cleanup", label: "Schools: Any Cleanup" },
];

const RERUN_MODES = [
  { id: "due", label: "Due only (normal)" },
  { id: "all", label: "Force recrawl ALL active" },
  { id: "error", label: "Recrawl ERROR only" },
  { id: "no_events", label: "Recrawl NO_EVENTS only" },
  { id: "ok", label: "Recrawl OK only" },
  { id: "ready", label: "Recrawl READY only" },
];

const SPORTSUSA_DIRECTORY_BY_SPORTNAME = {
  Football: "https://www.footballcampsusa.com/",
  Baseball: "https://www.baseballcampsusa.com/",
  Softball: "https://www.softballcampsusa.com/",
  Soccer: "https://www.soccercampsusa.com/",
  Volleyball: "https://www.volleyballcampsusa.com/",
};

/* =========================================================
   Component
========================================================= */
function AdminImportInner() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities ? (base44.entities.Sport || base44.entities.Sports) : null;
  const SchoolEntity = base44?.entities ? (base44.entities.School || base44.entities.Schools) : null;
  const SchoolSportSiteEntity = base44?.entities
    ? base44.entities.SchoolSportSite || base44.entities.SchoolSportSites
    : null;
  const CampDemoEntity = base44?.entities ? base44.entities.CampDemo : null;
  const CampEntity = base44?.entities ? base44.entities.Camp : null;

  // Sport selection
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // Logs
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");
  const [logPromote, setLogPromote] = useState("");
  const [logCounters, setLogCounters] = useState("");
  const [logQuality, setLogQuality] = useState("");
  const [logEditor, setLogEditor] = useState("");
  const [logDedupe, setLogDedupe] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "counters") setLogCounters(add);
    if (which === "quality") setLogQuality(add);
    if (which === "editor") setLogEditor(add);
    if (which === "dedupe") setLogDedupe(add);
  }

  // Working flags
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  const [campsWorking, setCampsWorking] = useState(false);
  const [promoteWorking, setPromoteWorking] = useState(false);
  const [countersWorking, setCountersWorking] = useState(false);
  const [qualityWorking, setQualityWorking] = useState(false);
  const [resetWorking, setResetWorking] = useState(false);
  const [editorWorking, setEditorWorking] = useState(false);
  const [dedupeWorking, setDedupeWorking] = useState(false);

  // Seed controls
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);
  const [sportsUSASiteUrl, setSportsUSASiteUrl] = useState("");

  // Ingest controls
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(25);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(10);
  const [campsMaxEvents, setCampsMaxEvents] = useState(300);
  const [fastMode, setFastMode] = useState(false);
  const [runBatches, setRunBatches] = useState(true);
  const [maxBatches, setMaxBatches] = useState(10);
  const [writeDelayMs, setWriteDelayMs] = useState(500);
  const [batchDelayMs, setBatchDelayMs] = useState(2000);

  const [rerunMode, setRerunMode] = useState("due");
  const [qualityMode, setQualityMode] = useState("any_cleanup");

  const [testSiteUrl, setTestSiteUrl] = useState("");

  // Counters
  const [siteCounters, setSiteCounters] = useState({
    active: 0,
    ready: 0,
    ok: 0,
    no_events: 0,
    error: 0,
    dueNow: 0,
    done: 0,
  });

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

  // Camp Editor
  const [editorSearch, setEditorSearch] = useState("");
  const [editorFilter, setEditorFilter] = useState("all"); // all | campdemo | camp
  const [editorLimit, setEditorLimit] = useState(200);
  const [editorRows, setEditorRows] = useState([]);
  const [editorSelected, setEditorSelected] = useState(null);
  const [editorDraft, setEditorDraft] = useState({});

  /* =========================================================
     Load Sports
  ========================================================= */
  async function loadSports() {
    setSportsLoading(true);
    try {
      if (!SportEntity) throw new Error("Sport entity missing (base44.entities.Sport).");

      const rows = await entityList(SportEntity, {});
      const normalized = asArray(rows)
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
          name: String(r?.sport_name || r?.name || r?.sportName || "").trim(),
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
    loadSports();
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

  /* =========================================================
     Crawl Counters
  ========================================================= */
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
          await writeWithRetry(() =>
            SchoolSportSiteEntity.update(String(s.id), {
              crawl_status: "ready",
              crawl_error: null,
              last_crawled_at: null,
              next_crawl_at: null,
              last_crawl_run_id: null,
              last_seen_at: runIso,
            })
          );
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

  /* =========================================================
     ✅ Quality Counters (recount from CampDemo each time)
  ========================================================= */
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
        if (needsNameFormatCleanup(r?.camp_name)) hasFmt = true;
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

      let badNameRemaining = 0;
      let nameFormatRemaining = 0;
      let missingPriceRemaining = 0;

      for (const rows of sets.bySchool.values()) {
        for (const r of rows) {
          if (isBadCampName(r?.camp_name)) badNameRemaining += 1;
          if (needsNameFormatCleanup(r?.camp_name)) nameFormatRemaining += 1;
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
        `[Quality] Refreshed @ ${nowIso} | BadName=${badNameRemaining} | NameFormat=${nameFormatRemaining} | MissingPrice=${missingPriceRemaining} | NoCamps=${noCampsRemaining} | Schools(BadName=${sets.badNameSchools.size}, NameFormat=${sets.nameFormatSchools.size}, MissingPrice=${sets.missingPriceSchools.size}, AnyCleanup=${sets.anyCleanupSchools.size}) | ImprovedThisRun=${improved}`
      );
    } catch (e) {
      appendLog("quality", `[Quality] ERROR: ${String(e?.message || e)}`);
    } finally {
      setQualityWorking(false);
    }
  }

  /* =========================================================
     SportsUSA Seed Schools
  ========================================================= */
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
      await writeWithRetry(() => SchoolEntity.update(String(existing[0].id), payload));
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await writeWithRetry(() => SchoolEntity.create(payload));
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
      await writeWithRetry(() => SchoolSportSiteEntity.update(String(existing[0].id), payload));
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await writeWithRetry(() => SchoolSportSiteEntity.create(payload));
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

      const schoolsFound = asArray(data?.schools || data?.rows || []);
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
          const schoolName = safeString(srow.school_name || srow.name);
          const logoUrl = safeString(srow.logo_url || srow.logo);
          const viewSiteUrl = safeString(srow.view_site_url || srow.site_url || srow.url);

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

  /* =========================================================
     ✅ Dedup sweep (by event_key)
  ========================================================= */
  function pickKeepRow(rows) {
    const arr = asArray(rows).filter((r) => r && r.id);
    if (!arr.length) return null;

    const score = (r) => {
      const ca =
        parseIsoOrNull(r.created_at || r.createdAt || null) ||
        parseIsoOrNull(r.inserted_at || r.insertedAt || null) ||
        null;
      const ls = parseIsoOrNull(r.last_seen_at || r.lastSeenAt || null);
      const createdMs = ca ? ca.getTime() : Number.POSITIVE_INFINITY;
      const seenMs = ls ? ls.getTime() : Number.POSITIVE_INFINITY;
      const id = String(r.id);
      return { createdMs, seenMs, id };
    };

    const sorted = arr.slice().sort((a, b) => {
      const A = score(a);
      const B = score(b);
      if (A.createdMs !== B.createdMs) return A.createdMs - B.createdMs;
      if (A.seenMs !== B.seenMs) return A.seenMs - B.seenMs;
      return A.id.localeCompare(B.id);
    });

    return sorted[0];
  }

  async function dedupeSweepEntityByEventKey(Entity, { entityName, sport_id }) {
    if (!Entity) throw new Error(`${entityName} entity missing.`);
    if (!sport_id) throw new Error(`Missing sport_id for ${entityName} dedupe sweep.`);

    const runIso = new Date().toISOString();
    appendLog("dedupe", `[Dedupe] Starting ${entityName} sweep @ ${runIso} (sport_id=${sport_id})`);

    const rows = await entityList(Entity, { sport_id });
    appendLog("dedupe", `[Dedupe] Loaded ${entityName} rows: ${rows.length}`);

    const byKey = new Map();
    let missingKey = 0;

    for (const r of rows) {
      const key = safeString(r?.event_key);
      if (!key) {
        missingKey += 1;
        continue;
      }
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }

    const dupKeys = [];
    for (const [k, arr] of byKey.entries()) {
      if (arr.length > 1) dupKeys.push([k, arr]);
    }

    appendLog("dedupe", `[Dedupe] event_key missing on ${missingKey} rows (not touched).`);
    appendLog("dedupe", `[Dedupe] Duplicate event_key groups: ${dupKeys.length}`);

    let groupsProcessed = 0;
    let rowsDeleted = 0;
    let deleteFailed = 0;

    for (let i = 0; i < dupKeys.length; i++) {
      const [key, arr] = dupKeys[i];
      const keep = pickKeepRow(arr);
      const keepId = keep?.id ? String(keep.id) : null;
      if (!keepId) continue;

      const toDelete = asArray(arr)
        .filter((x) => x?.id && String(x.id) !== keepId)
        .map((x) => String(x.id));

      for (const id of toDelete) {
        const ok = await writeWithRetry(() => tryDelete(Entity, id), { maxRetries: 12 }).catch(() => false);
        if (ok) rowsDeleted += 1;
        else deleteFailed += 1;
        await sleep(50);
      }

      groupsProcessed += 1;

      if ((i + 1) % 25 === 0) {
        appendLog(
          "dedupe",
          `[Dedupe] Progress ${i + 1}/${dupKeys.length} | groupsProcessed=${groupsProcessed} rowsDeleted=${rowsDeleted} deleteFailed=${deleteFailed}`
        );
      }

      await sleep(100);
    }

    appendLog(
      "dedupe",
      `[Dedupe] DONE ${entityName} | groupsProcessed=${groupsProcessed}/${dupKeys.length} rowsDeleted=${rowsDeleted} deleteFailed=${deleteFailed}`
    );

    return { groupsProcessed, totalGroups: dupKeys.length, rowsDeleted, deleteFailed, missingKey, totalRows: rows.length };
  }

  async function runDedupeSweep(target) {
    setDedupeWorking(true);
    setLogDedupe("");
    try {
      if (!selectedSportId) {
        appendLog("dedupe", `[Dedupe] Select a sport first.`);
        return;
      }

      if (target === "campdemo") {
        if (!CampDemoEntity) return appendLog("dedupe", `[Dedupe] CampDemo entity not available.`);
        await dedupeSweepEntityByEventKey(CampDemoEntity, { entityName: "CampDemo", sport_id: selectedSportId });
      } else if (target === "camp") {
        if (!CampEntity) return appendLog("dedupe", `[Dedupe] Camp entity not available.`);
        await dedupeSweepEntityByEventKey(CampEntity, { entityName: "Camp", sport_id: selectedSportId });
      } else if (target === "both") {
        if (CampDemoEntity) await dedupeSweepEntityByEventKey(CampDemoEntity, { entityName: "CampDemo", sport_id: selectedSportId });
        else appendLog("dedupe", `[Dedupe] CampDemo entity not available.`);
        if (CampEntity) await dedupeSweepEntityByEventKey(CampEntity, { entityName: "Camp", sport_id: selectedSportId });
        else appendLog("dedupe", `[Dedupe] Camp entity not available.`);
      }

      await refreshQualityCounters();
    } catch (e) {
      appendLog("dedupe", `[Dedupe] ERROR: ${String(e?.message || e)}`);
    } finally {
      setDedupeWorking(false);
    }
  }

  /* =========================================================
     ✅ Upsert-by-event_key (NO DUPES)
     - used by ingest + editor save
========================================================= */
  async function upsertByEventKey(Entity, { entityName, event_key, payload }) {
    if (!Entity?.create || !Entity?.update) throw new Error(`${entityName} entity missing create/update.`);
    const key = safeString(event_key);
    if (!key) throw new Error(`${entityName} missing event_key.`);

    let existing = [];
    try {
      existing = await entityList(Entity, { event_key: key });
    } catch {
      existing = [];
    }

    // If duplicates already exist, keep one and delete the rest.
    if (existing.length > 1) {
      const keep = pickKeepRow(existing);
      const keepId = keep?.id ? String(keep.id) : null;

      const toDelete = existing.filter((r) => r?.id && String(r.id) !== keepId).map((r) => String(r.id));
      for (const id of toDelete) {
        await writeWithRetry(() => tryDelete(Entity, id)).catch(() => false);
        await sleep(50);
      }

      existing = keepId ? existing.filter((r) => r?.id && String(r.id) === keepId) : [];
    }

    if (existing.length === 1 && existing[0]?.id) {
      const id = String(existing[0].id);
      const finalPayload = withActiveDefault(payload, existing[0]);
      await writeWithRetry(() => Entity.update(id, finalPayload));
      return { mode: "updated", id };
    }

    const created = await writeWithRetry(() => Entity.create({ ...payload, event_key: key }));
    return { mode: "created", id: created?.id ? String(created.id) : null };
  }

  function normalizeEventFromFunctionRow(r, { school_id, sport_id, source_platform }) {
    const start_date = toISODate(r?.start_date || r?.startDate || r?.date_start || r?.date);
    const end_date = toISODate(r?.end_date || r?.endDate || r?.date_end);

    const link_url =
      safeString(r?.registration_link) ||
      safeString(r?.registration_url) ||
      safeString(r?.register_url) ||
      safeString(r?.registerNowUrl) ||
      safeString(r?.register_now_url) ||
      safeString(r?.url) ||
      safeString(r?.link_url);

    const source_url = safeString(r?.source_url) || safeString(r?.event_url) || safeString(r?.details_url);

    const event_key =
      safeString(r?.event_key) ||
      buildEventKeyStable({
        source_platform,
        school_id,
        start_date,
        link_url,
        source_url,
      });

    const rawCampName = safeString(r?.camp_name || r?.name || r?.title);
    const cleanedCampName = sanitizeCampNameForWrite(rawCampName) || rawCampName;

    // location
    const city = safeString(r?.city);
    const state = safeString(r?.state);
    const location_text = safeString(r?.location) || safeString(r?.location_text);

    // prices
    const price = safeNumber(r?.price);
    const price_min = safeNumber(r?.price_min);
    const price_max = safeNumber(r?.price_max);

    // dates/times
    const start_time = safeString(r?.start_time);
    const end_time = safeString(r?.end_time);

    // season year (football logic; harmless for other sports)
    const season_year = computeSeasonYearFootball(start_date);

    return {
      event_key,
      school_id: safeString(school_id),
      sport_id: safeString(sport_id),
      source_platform: safeString(source_platform) || "sportsusa",

      camp_name: cleanedCampName,
      raw_camp_name: rawCampName,

      start_date,
      end_date,
      start_time,
      end_time,

      city,
      state,
      location: location_text,

      registration_link: link_url, // ✅ editor needs this
      source_url,

      price,
      price_min,
      price_max,

      season_year,

      active: true,
      last_seen_at: new Date().toISOString(),
    };
  }

  /* =========================================================
     ✅ Camps Ingest
========================================================= */
  function passesRerunFilter(site) {
    const st = statusOf(site);
    if (rerunMode === "all") return true;
    if (rerunMode === "due") return isDueNow(site);
    if (rerunMode === "error") return st === "error";
    if (rerunMode === "no_events") return st === "no_events";
    if (rerunMode === "ok") return st === "ok";
    if (rerunMode === "ready") return st === "ready";
    return isDueNow(site);
  }

  async function getSitesForIngest() {
    const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
    const allSites = siteRowsRaw.map(normalizeSiteRow).filter((s) => s.id && s.school_id && s.camp_site_url);

    const rerunFiltered = allSites.filter(passesRerunFilter);

    if (!CampDemoEntity || qualityMode === "none") {
      return { allSites, rerunFiltered, qualityFiltered: rerunFiltered, qualitySchoolsCount: 0 };
    }

    const sets = await getQualitySchoolSets();

    let allowedSchoolSet = null;
    if (qualityMode === "bad_name") allowedSchoolSet = sets.badNameSchools;
    if (qualityMode === "name_format") allowedSchoolSet = sets.nameFormatSchools;
    if (qualityMode === "missing_price") allowedSchoolSet = sets.missingPriceSchools;
    if (qualityMode === "no_camps") allowedSchoolSet = sets.noCampSchools;
    if (qualityMode === "any_cleanup") allowedSchoolSet = sets.anyCleanupSchools;

    if (!allowedSchoolSet) {
      return { allSites, rerunFiltered, qualityFiltered: rerunFiltered, qualitySchoolsCount: 0 };
    }

    const qualityFiltered = rerunFiltered.filter((s) => allowedSchoolSet.has(String(s.school_id)));
    return { allSites, rerunFiltered, qualityFiltered, qualitySchoolsCount: allowedSchoolSet.size };
  }

  async function updateCrawlState(siteId, patch) {
    if (!SchoolSportSiteEntity?.update) return;
    await writeWithRetry(() => SchoolSportSiteEntity.update(String(siteId), patch)).catch(() => null);
  }

  async function runSportsUSAIngestCamps() {
    const runIso = new Date().toISOString();
    setCampsWorking(true);
    setLogCamps("");

    try {
      if (!selectedSportId) return appendLog("camps", "[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity || !CampDemoEntity) return appendLog("camps", "[Camps] ERROR: Missing entities.");

      appendLog("camps", `[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
      appendLog(
        "camps",
        `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents} | fastMode=${fastMode ? "true" : "false"}`
      );
      appendLog("camps", `[Camps] RerunMode=${rerunMode} | QualityMode=${QUALITY_MODES.find((x) => x.id === qualityMode)?.label || qualityMode}`);

      const { allSites, rerunFiltered, qualityFiltered, qualitySchoolsCount } = await getSitesForIngest();

      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${allSites.length} (active)`);
      appendLog("camps", `[Camps] Rerun filtered sites: ${rerunFiltered.length}`);
      appendLog("camps", `[Camps] Quality filtered sites: ${qualityFiltered.length} (qualitySchools=${qualitySchoolsCount})`);

      if (!qualityFiltered.length) {
        appendLog("camps", `[Camps] Nothing to process.`);
        return;
      }

      let remaining = qualityFiltered.slice();
      let batchNum = 0;

      let totalsCreated = 0;
      let totalsUpdated = 0;
      let totalsSkipped = 0;
      let totalsErrors = 0;
      let totalsImproved = 0;

      const maxBatchesToRun = runBatches ? Math.max(1, Number(maxBatches || 10)) : 1;

      while (remaining.length > 0 && batchNum < maxBatchesToRun) {
        batchNum += 1;

        const batch = remaining.slice(0, Number(campsMaxSites || 25));
        remaining = remaining.slice(batch.length);

        appendLog("camps", `\n[Camps] ---- Batch ${batchNum} ----`);
        appendLog("camps", `[Camps] Batch size=${batch.length} | remainingAfterThis=${remaining.length}`);

        const payloadSites = batch.map((s) => ({
          id: s.id,
          school_id: s.school_id,
          camp_site_url: s.camp_site_url,
        }));

        appendLog(
          "camps",
          `[Camps] Calling /functions/sportsUSAIngestCamps (payload: sites=${payloadSites.length}, testSiteUrl=${safeString(testSiteUrl) ? "yes" : "no"})`
        );

        const res = await fetch("/functions/sportsUSAIngestCamps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sportId: selectedSportId,
            sportName: selectedSportName,
            dryRun: !!campsDryRun,
            sites: payloadSites,
            maxRegsPerSite: Number(campsMaxRegsPerSite || 10),
            maxEvents: Number(campsMaxEvents || 300),
            fastMode: !!fastMode,
            testSiteUrl: safeString(testSiteUrl) || null,
            qualityMode: QUALITY_MODES.find((x) => x.id === qualityMode)?.label || qualityMode,
            rerunMode,
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
          appendLog("camps", `[Camps] ERROR (HTTP ${res.status})`);
          if (data) appendLog("camps", JSON.stringify(data || {}, null, 2));
          if (!data && rawText) appendLog("camps", `[Camps] Raw response: ${truncate(rawText, 700)}`);
          totalsErrors += 1;
          // mark batch sites as error
          for (const s of batch) {
            await updateCrawlState(s.id, {
              crawl_status: "error",
              crawl_error: `HTTP ${res.status}`,
              last_crawled_at: new Date().toISOString(),
              last_crawl_run_id: runIso,
              next_crawl_at: null,
            });
          }
          if (remaining.length > 0) await sleep(batchDelayMs);
          continue;
        }

        if (!data) {
          appendLog("camps", `[Camps] WARNING: Non-JSON response.`);
          if (rawText) appendLog("camps", `[Camps] Raw response: ${truncate(rawText, 700)}`);
          totalsErrors += 1;
          if (remaining.length > 0) await sleep(batchDelayMs);
          continue;
        }

        const fnVersion = safeString(data?.version || data?.function_version || data?.fn_version);
        if (fnVersion) appendLog("camps", `[Camps] Function version: ${fnVersion}`);

        const acceptedEvents = asArray(data?.accepted_events || data?.accepted || data?.events || data?.rows || []);
        appendLog("camps", `[Camps] Accepted events returned: ${acceptedEvents.length}`);

        // Update crawl-state for batch sites (ok or no_events)
        const seenSchools = new Set();
        for (const ev of acceptedEvents) {
          const sid = safeString(ev?.school_id);
          if (sid) seenSchools.add(sid);
        }

        for (const s of batch) {
          const status = seenSchools.has(String(s.school_id)) ? "ok" : "no_events";
          await updateCrawlState(s.id, {
            crawl_status: status,
            crawl_error: null,
            last_crawled_at: new Date().toISOString(),
            last_crawl_run_id: runIso,
            // simple cadence: 30 days
            next_crawl_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            last_seen_at: new Date().toISOString(),
          });
        }

        if (campsDryRun) {
          appendLog("camps", `[Camps] DryRun=true: skipping writes.`);
          if (remaining.length > 0) await sleep(batchDelayMs);
          continue;
        }

        // Snapshot quality before writes (for "improved" calculation)
        const before = lastQualitySnapshotRef.current;

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (let i = 0; i < acceptedEvents.length; i++) {
          const ev = acceptedEvents[i] || {};

          try {
            const school_id = safeString(ev?.school_id);
            if (!school_id) {
              skipped += 1;
              continue;
            }

            const normalized = normalizeEventFromFunctionRow(ev, {
              school_id,
              sport_id: selectedSportId,
              source_platform: "sportsusa",
            });

            // Upsert into CampDemo (your staging table)
            const r1 = await upsertByEventKey(CampDemoEntity, {
              entityName: "CampDemo",
              event_key: normalized.event_key,
              payload: normalized,
            });

            if (r1.mode === "created") created += 1;
            if (r1.mode === "updated") updated += 1;

            // Throttle writes to reduce rate limit
            await sleep(Math.max(0, Number(writeDelayMs || 0)));
          } catch (e) {
            errors += 1;
            appendLog("camps", `[Camps] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
            await sleep(Math.max(0, Number(writeDelayMs || 0)));
          }

          if ((i + 1) % 25 === 0) appendLog("camps", `[Camps] Write progress: ${i + 1}/${acceptedEvents.length}`);
        }

        await refreshQualityCounters(); // recompute remaining issues

        // improved calc: compare "remaining" totals to show movement
        const after = lastQualitySnapshotRef.current;
        let improved = 0;
        if (before && after) {
          const beforeTotal =
            (before.badNameRemaining || 0) +
            (before.nameFormatRemaining || 0) +
            (before.missingPriceRemaining || 0);
          const afterTotal =
            (after.badNameRemaining || 0) +
            (after.nameFormatRemaining || 0) +
            (after.missingPriceRemaining || 0);
          improved = Math.max(0, beforeTotal - afterTotal);
        }

        appendLog(
          "camps",
          `[Camps] Batch ${batchNum} writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors} improved=${improved}`
        );

        totalsCreated += created;
        totalsUpdated += updated;
        totalsSkipped += skipped;
        totalsErrors += errors;
        totalsImproved += improved;

        if (remaining.length > 0) await sleep(Math.max(0, Number(batchDelayMs || 0)));
      }

      appendLog(
        "camps",
        `\n[Camps] DONE (this click). totals: created=${totalsCreated} updated=${totalsUpdated} skipped=${totalsSkipped} errors=${totalsErrors} improved=${totalsImproved}`
      );

      await refreshCrawlCounters();
    } catch (e) {
      appendLog("camps", `[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* =========================================================
     ✅ Promote CampDemo -> Camp (Upsert by event_key)
========================================================= */
  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setPromoteWorking(true);
    setLogPromote("");

    try {
      if (!selectedSportId) return appendLog("promote", "[Promote] ERROR: Select a sport first.");
      if (!CampDemoEntity || !CampEntity) return appendLog("promote", "[Promote] ERROR: Missing CampDemo or Camp entity.");

      appendLog("promote", `[Promote] Starting @ ${runIso} (sport_id=${selectedSportId})`);

      const demos = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      appendLog("promote", `[Promote] Loaded CampDemo rows: ${demos.length}`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < demos.length; i++) {
        const r = demos[i] || {};
        const key = safeString(r?.event_key);
        if (!key) {
          skipped += 1;
          continue;
        }

        try {
          // Promote payload: keep the important fields; feel free to extend
          const payload = {
            event_key: key,
            school_id: safeString(r?.school_id),
            sport_id: safeString(r?.sport_id),
            source_platform: safeString(r?.source_platform) || "sportsusa",
            camp_name: safeString(r?.camp_name),
            start_date: safeString(r?.start_date),
            end_date: safeString(r?.end_date),
            start_time: safeString(r?.start_time),
            end_time: safeString(r?.end_time),
            city: safeString(r?.city),
            state: safeString(r?.state),
            location: safeString(r?.location),
            registration_link: safeString(r?.registration_link) || safeString(r?.registration_url),
            source_url: safeString(r?.source_url),
            price: safeNumber(r?.price),
            price_min: safeNumber(r?.price_min),
            price_max: safeNumber(r?.price_max),
            season_year: safeNumber(r?.season_year),
            active: readActiveFlag(r),
            last_seen_at: new Date().toISOString(),
          };

          const out = await upsertByEventKey(CampEntity, { entityName: "Camp", event_key: key, payload });
          if (out.mode === "created") created += 1;
          if (out.mode === "updated") updated += 1;

          await sleep(Math.max(0, Number(writeDelayMs || 0)));
        } catch (e) {
          errors += 1;
          appendLog("promote", `[Promote] ERROR #${i + 1}: ${String(e?.message || e)}`);
          await sleep(Math.max(0, Number(writeDelayMs || 0)));
        }

        if ((i + 1) % 100 === 0) {
          appendLog("promote", `[Promote] Progress ${i + 1}/${demos.length} | created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
        }
      }

      appendLog("promote", `[Promote] DONE. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);

      // After promote, run a quick dedupe sweep in Camp to ensure no legacy dupes.
      appendLog("promote", `[Promote] Post-step: running Camp dedupe sweep...`);
      setLogDedupe("");
      await dedupeSweepEntityByEventKey(CampEntity, { entityName: "Camp", sport_id: selectedSportId });

    } catch (e) {
      appendLog("promote", `[Promote] ERROR: ${String(e?.message || e)}`);
    } finally {
      setPromoteWorking(false);
    }
  }

  /* =========================================================
     ✅ Camp Editor (CampDemo + Camp)
========================================================= */
  const canEditorLoad = !!selectedSportId && (editorFilter === "campdemo" ? !!CampDemoEntity : editorFilter === "camp" ? !!CampEntity : !!CampDemoEntity || !!CampEntity);

  async function loadEditorRows() {
    const nowIso = new Date().toISOString();
    setEditorWorking(true);
    setLogEditor("");
    setEditorRows([]);
    setEditorSelected(null);
    setEditorDraft({});

    try {
      if (!selectedSportId) return appendLog("editor", "[Editor] Select a sport first.");

      const q = safeString(editorSearch);
      const limit = Math.max(1, Number(editorLimit || 200));
      const filter = editorFilter;

      // Base44 typically has limited "search"; we do a constrained pull and filter locally.
      let rows = [];

      if (filter === "campdemo") {
        if (!CampDemoEntity) return appendLog("editor", "[Editor] CampDemo entity not available.");
        rows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      } else if (filter === "camp") {
        if (!CampEntity) return appendLog("editor", "[Editor] Camp entity not available.");
        rows = await entityList(CampEntity, { sport_id: selectedSportId });
      } else {
        // all: merge with source label; used mainly for inspection
        const a = CampDemoEntity ? await entityList(CampDemoEntity, { sport_id: selectedSportId }) : [];
        const b = CampEntity ? await entityList(CampEntity, { sport_id: selectedSportId }) : [];
        rows = [
          ...asArray(a).map((r) => ({ ...r, __entity: "CampDemo" })),
          ...asArray(b).map((r) => ({ ...r, __entity: "Camp" })),
        ];
      }

      // Search locally
      let filtered = asArray(rows);
      if (q) {
        const needle = lc(q);
        filtered = filtered.filter((r) => {
          const hay = [
            r?.event_key,
            r?.camp_name,
            r?.registration_link,
            r?.registration_url,
            r?.source_url,
            r?.city,
            r?.state,
            r?.location,
            r?.school_id,
          ]
            .map((x) => lc(x))
            .join(" | ");
          return hay.includes(needle);
        });
      }

      // Sort newest-ish first
      filtered.sort((a, b) => {
        const da = parseIsoOrNull(a?.start_date) ? parseIsoOrNull(a?.start_date).getTime() : 0;
        const db = parseIsoOrNull(b?.start_date) ? parseIsoOrNull(b?.start_date).getTime() : 0;
        return db - da;
      });

      const limited = filtered.slice(0, limit);
      setEditorRows(limited);

      appendLog(
        "editor",
        `[Editor] Loaded @ ${nowIso} | rows=${limited.length} filter=${filter} search="${q || ""}" limit=${limit}`
      );
    } catch (e) {
      appendLog("editor", `[Editor] ERROR: ${String(e?.message || e)}`);
    } finally {
      setEditorWorking(false);
    }
  }

  function selectEditorRow(row) {
    setEditorSelected(row);
    setEditorDraft({
      camp_name: safeString(row?.camp_name) || "",
      start_date: safeString(row?.start_date) || "",
      end_date: safeString(row?.end_date) || "",
      city: safeString(row?.city) || "",
      state: safeString(row?.state) || "",
      location: safeString(row?.location) || "",
      price: row?.price ?? "",
      price_min: row?.price_min ?? "",
      price_max: row?.price_max ?? "",
      registration_link: safeString(row?.registration_link || row?.registration_url) || "",
      source_url: safeString(row?.source_url) || "",
      active: readActiveFlag(row),
    });
  }

  async function saveEditorRow() {
    const row = editorSelected;
    if (!row) return;

    setEditorWorking(true);
    try {
      const entityName = row.__entity || editorFilter === "camp" ? "Camp" : editorFilter === "campdemo" ? "CampDemo" : (row.__entity || "CampDemo");

      const Entity = entityName === "Camp" ? CampEntity : CampDemoEntity;
      if (!Entity?.update) return appendLog("editor", `[Editor] ERROR: ${entityName} update not available.`);

      const id = String(row.id);
      const patch = {
        camp_name: sanitizeCampNameForWrite(editorDraft.camp_name) || safeString(editorDraft.camp_name),
        start_date: toISODate(editorDraft.start_date),
        end_date: toISODate(editorDraft.end_date),
        city: safeString(editorDraft.city) || null,
        state: safeString(editorDraft.state) || null,
        location: safeString(editorDraft.location) || null,
        price: safeNumber(editorDraft.price),
        price_min: safeNumber(editorDraft.price_min),
        price_max: safeNumber(editorDraft.price_max),
        registration_link: safeString(editorDraft.registration_link) || null,
        source_url: safeString(editorDraft.source_url) || null,
        active: !!editorDraft.active,
        last_seen_at: new Date().toISOString(),
      };

      await writeWithRetry(() => Entity.update(id, patch));

      appendLog("editor", `[Editor] Saved ${entityName} id=${id}`);

      // reload to show changes
      await loadEditorRows();
      await refreshQualityCounters();
    } catch (e) {
      appendLog("editor", `[Editor] SAVE ERROR: ${String(e?.message || e)}`);
    } finally {
      setEditorWorking(false);
    }
  }

  async function applyNameFormatCleanupSelected() {
    const row = editorSelected;
    if (!row) return;

    setEditorWorking(true);
    try {
      const entityName = row.__entity || (editorFilter === "camp" ? "Camp" : "CampDemo");
      const Entity = entityName === "Camp" ? CampEntity : CampDemoEntity;
      if (!Entity?.update) return appendLog("editor", `[Editor] ERROR: ${entityName} update not available.`);

      const current = safeString(row?.camp_name);
      const cleaned = sanitizeCampNameForWrite(current);

      if (!cleaned || cleaned === current) {
        appendLog("editor", `[Editor] Name cleanup: no change (or unfixable) for id=${row.id}`);
        // IMPORTANT: do NOT deactivate; keep it in quality counts if still bad.
        return;
      }

      await writeWithRetry(() =>
        Entity.update(String(row.id), {
          camp_name: cleaned,
          last_seen_at: new Date().toISOString(),
        })
      );

      appendLog("editor", `[Editor] Name cleanup applied for id=${row.id}: "${current}" -> "${cleaned}"`);
      await loadEditorRows();
      await refreshQualityCounters();
    } catch (e) {
      appendLog("editor", `[Editor] Name cleanup ERROR: ${String(e?.message || e)}`);
    } finally {
      setEditorWorking(false);
    }
  }

  /* =========================================================
     Batch Name Format Cleanup (CampDemo) - does NOT deactivate
========================================================= */
  async function runNameFormatCleanupBatch() {
    const runIso = new Date().toISOString();
    setEditorWorking(true);
    appendLog("editor", `[Cleanup] Starting Name Format cleanup @ ${runIso}`);

    try {
      if (!selectedSportId) return appendLog("editor", "[Cleanup] Select a sport first.");
      if (!CampDemoEntity?.update) return appendLog("editor", "[Cleanup] CampDemo update not available.");

      const rows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const targets = asArray(rows).filter((r) => needsNameFormatCleanup(r?.camp_name));

      appendLog("editor", `[Cleanup] Targets (needsNameFormatCleanup): ${targets.length}`);

      let updated = 0;
      let unchanged = 0;
      let errors = 0;

      for (let i = 0; i < targets.length; i++) {
        const r = targets[i];
        const current = safeString(r?.camp_name);
        const cleaned = sanitizeCampNameForWrite(current);

        try {
          if (cleaned && cleaned !== current) {
            await writeWithRetry(() =>
              CampDemoEntity.update(String(r.id), {
                camp_name: cleaned,
                last_seen_at: new Date().toISOString(),
              })
            );
            updated += 1;
          } else {
            // unfixable or already clean: keep active; keep counting
            unchanged += 1;
          }
        } catch {
          errors += 1;
        }

        if ((i + 1) % 50 === 0) {
          appendLog("editor", `[Cleanup] Progress ${i + 1}/${targets.length} updated=${updated} unchanged=${unchanged} errors=${errors}`);
        }

        await sleep(Math.max(25, Number(writeDelayMs || 0)));
      }

      appendLog("editor", `[Cleanup] DONE. updated=${updated} unchanged=${unchanged} errors=${errors}`);
      await refreshQualityCounters();
    } finally {
      setEditorWorking(false);
    }
  }

  /* =========================================================
     UI
========================================================= */
  const sportOptions = useMemo(() => sports, [sports]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">Admin Import</div>
            <div className="text-sm text-slate-600 mt-1">
              Seed → Ingest (batch) → Promote → Editor (registration link included) → Quality + Dedupe.
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Key rule: event_key is stable and camp_name changes will never create a new row.
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
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking || dedupeWorking}
              >
                <option value="">Select…</option>
                {sportOptions.map((sx) => (
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
              <Button onClick={() => resetCrawlStateForSport()} disabled={resetWorking || !selectedSportId}>
                {resetWorking ? "Resetting…" : "Reset Crawl-State"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Counters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="font-semibold text-slate-900">Crawl Counters</div>
            <div className="mt-2 text-sm text-slate-700 grid grid-cols-2 gap-2">
              <div>Active Sites</div><div className="text-right">{siteCounters.active}</div>
              <div>Due Now</div><div className="text-right">{siteCounters.dueNow}</div>
              <div>Ready</div><div className="text-right">{siteCounters.ready}</div>
              <div>OK</div><div className="text-right">{siteCounters.ok}</div>
              <div>No Events</div><div className="text-right">{siteCounters.no_events}</div>
              <div>Error</div><div className="text-right">{siteCounters.error}</div>
            </div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-40">{logCounters || "—"}</pre>
          </Card>

          <Card className="p-4">
            <div className="font-semibold text-slate-900">Quality Counters (recounted)</div>
            <div className="mt-2 text-sm text-slate-700 grid grid-cols-2 gap-2">
              <div>Bad Name Remaining</div><div className="text-right">{qualityCounters.badNameRemaining}</div>
              <div>Name Format Remaining</div><div className="text-right">{qualityCounters.nameFormatRemaining}</div>
              <div>Missing Price Remaining</div><div className="text-right">{qualityCounters.missingPriceRemaining}</div>
              <div>No Camps Remaining (schools)</div><div className="text-right">{qualityCounters.noCampsRemaining}</div>
              <div>Schools Needing Any Cleanup</div><div className="text-right">{qualityCounters.schoolsNeedingAnyCleanup}</div>
              <div>Improved This Run</div><div className="text-right">{qualityCounters.improvedThisRun}</div>
            </div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-40">{logQuality || "—"}</pre>
          </Card>
        </div>

        {/* 2) Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">2) SportsUSA Seed Schools</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA Directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={sportsUSASiteUrl}
                onChange={(e) => setSportsUSASiteUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                type="number"
                value={sportsUSALimit}
                onChange={(e) => setSportsUSALimit(Number(e.target.value))}
              />
            </div>
            <div className="flex items-end gap-3">
              <Toggle checked={sportsUSADryRun} onChange={setSportsUSADryRun} label="Dry Run" />
              <Button onClick={runSportsUSASeedSchools} disabled={!selectedSportId || sportsUSAWorking}>
                {sportsUSAWorking ? "Running…" : "Run Seed"}
              </Button>
              <Button onClick={() => setLogSportsUSA("")} disabled={sportsUSAWorking}>
                Clear Log
              </Button>
            </div>
          </div>
          <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-56">{logSportsUSA || "—"}</pre>
        </Card>

        {/* 3) Ingest Camps */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">3) SportsUSA Camps Ingest</div>
          <div className="text-sm text-slate-600 mt-1">
            This upserts by event_key and will not create duplicates. Rate limit resilience is built in.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-2">
              <Toggle checked={campsDryRun} onChange={setCampsDryRun} label="Dry Run" />
              <Toggle checked={fastMode} onChange={setFastMode} label="fastMode" />
              <Toggle checked={runBatches} onChange={setRunBatches} label="Run multiple batches" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Sites (per batch)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={campsMaxSites} onChange={(e) => setCampsMaxSites(Number(e.target.value))} />
              <label className="block text-xs font-semibold text-slate-700 mb-1 mt-2">Max Batches</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={maxBatches} onChange={(e) => setMaxBatches(Number(e.target.value))} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Regs Per Site</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={campsMaxRegsPerSite} onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value))} />
              <label className="block text-xs font-semibold text-slate-700 mb-1 mt-2">Max Events</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={campsMaxEvents} onChange={(e) => setCampsMaxEvents(Number(e.target.value))} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun Mode</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={rerunMode} onChange={(e) => setRerunMode(e.target.value)}>
                {RERUN_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>

              <label className="block text-xs font-semibold text-slate-700 mb-1 mt-2">Quality Mode</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={qualityMode} onChange={(e) => setQualityMode(e.target.value)}>
                {QUALITY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write Delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={writeDelayMs} onChange={(e) => setWriteDelayMs(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={batchDelayMs} onChange={(e) => setBatchDelayMs(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test Site URL (optional)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={testSiteUrl} onChange={(e) => setTestSiteUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button onClick={runSportsUSAIngestCamps} disabled={!selectedSportId || campsWorking}>
              {campsWorking ? "Running…" : "Run Camps Ingest"}
            </Button>
            <Button onClick={() => setLogCamps("")} disabled={campsWorking}>
              Clear Log
            </Button>
          </div>

          <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-80">{logCamps || "—"}</pre>
        </Card>

        {/* 4) Promote */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">4) Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">Upserts by event_key; includes registration_link.</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button onClick={promoteCampDemoToCamp} disabled={!selectedSportId || promoteWorking}>
              {promoteWorking ? "Promoting…" : "Promote Now"}
            </Button>
            <Button onClick={() => setLogPromote("")} disabled={promoteWorking}>
              Clear Log
            </Button>
          </div>
          <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-56">{logPromote || "—"}</pre>
        </Card>

        {/* Dedupe Sweep */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">Dedupe Sweep (by event_key)</div>
          <div className="text-sm text-slate-600 mt-1">
            Deletes duplicates that share the same event_key. Keeps the oldest row and removes the rest.
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button onClick={() => runDedupeSweep("campdemo")} disabled={!selectedSportId || dedupeWorking}>
              {dedupeWorking ? "Running…" : "Dedupe CampDemo"}
            </Button>
            <Button onClick={() => runDedupeSweep("camp")} disabled={!selectedSportId || dedupeWorking}>
              {dedupeWorking ? "Running…" : "Dedupe Camp"}
            </Button>
            <Button onClick={() => runDedupeSweep("both")} disabled={!selectedSportId || dedupeWorking}>
              {dedupeWorking ? "Running…" : "Dedupe Both"}
            </Button>
            <Button onClick={() => setLogDedupe("")} disabled={dedupeWorking}>
              Clear Log
            </Button>
          </div>

          <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-56">{logDedupe || "—"}</pre>
        </Card>

        {/* Camp Editor */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">Camp Editor</div>
          <div className="text-sm text-slate-600 mt-1">
            Search by event_key, name, location, or registration link. Registration link is editable.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Filter</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorFilter} onChange={(e) => setEditorFilter(e.target.value)}>
                <option value="all">All (CampDemo + Camp)</option>
                <option value="campdemo">CampDemo only</option>
                <option value="camp">Camp only</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Search</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorSearch} onChange={(e) => setEditorSearch(e.target.value)} placeholder='e.g. "ryzer:323568:2026-06-01"' />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" type="number" value={editorLimit} onChange={(e) => setEditorLimit(Number(e.target.value))} />
            </div>
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button onClick={loadEditorRows} disabled={!canEditorLoad || editorWorking}>
              {editorWorking ? "Loading…" : "Load"}
            </Button>
            <Button onClick={() => setLogEditor("")} disabled={editorWorking}>
              Clear Log
            </Button>
            <Button onClick={runNameFormatCleanupBatch} disabled={!selectedSportId || editorWorking}>
              {editorWorking ? "Working…" : "Run Name Format Cleanup (CampDemo)"}
            </Button>
          </div>

          <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 mt-3 overflow-auto max-h-36">{logEditor || "—"}</pre>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* List */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">Rows</div>
              <div className="border border-slate-200 rounded-lg bg-white max-h-96 overflow-auto">
                {editorRows.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">No rows loaded.</div>
                ) : (
                  editorRows.map((r) => {
                    const entity = r.__entity || (editorFilter === "camp" ? "Camp" : editorFilter === "campdemo" ? "CampDemo" : "");
                    const key = safeString(r?.event_key) || "(no event_key)";
                    const name = safeString(r?.camp_name) || "(no name)";
                    const reg = safeString(r?.registration_link || r?.registration_url) || "";
                    return (
                      <button
                        key={`${entity}:${r.id}`}
                        className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${
                          editorSelected?.id === r.id && (editorSelected?.__entity || "") === (r.__entity || "") ? "bg-slate-50" : ""
                        }`}
                        onClick={() => selectEditorRow(r)}
                      >
                        <div className="text-xs text-slate-500">{entity || "Row"}</div>
                        <div className="text-sm font-semibold text-slate-900">{name}</div>
                        <div className="text-xs text-slate-600 mt-1">{key}</div>
                        {reg ? <div className="text-xs text-slate-500 mt-1">reg: {truncate(reg, 90)}</div> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Detail */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">Selected</div>
              {!editorSelected ? (
                <div className="p-3 text-sm text-slate-500 border border-slate-200 rounded-lg bg-white">Select a row.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg bg-white p-3 space-y-3">
                  <div className="text-xs text-slate-500">
                    id={String(editorSelected.id)} event_key={safeString(editorSelected.event_key) || "(none)"} entity={editorSelected.__entity || editorFilter}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Camp Name</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.camp_name} onChange={(e) => setEditorDraft((p) => ({ ...p, camp_name: e.target.value }))} />
                    </div>
                    <div className="flex items-end">
                      <Toggle checked={!!editorDraft.active} onChange={(v) => setEditorDraft((p) => ({ ...p, active: v }))} label="Active" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.start_date} onChange={(e) => setEditorDraft((p) => ({ ...p, start_date: e.target.value }))} placeholder="YYYY-MM-DD" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.end_date} onChange={(e) => setEditorDraft((p) => ({ ...p, end_date: e.target.value }))} placeholder="YYYY-MM-DD" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.city} onChange={(e) => setEditorDraft((p) => ({ ...p, city: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.state} onChange={(e) => setEditorDraft((p) => ({ ...p, state: e.target.value }))} />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.location} onChange={(e) => setEditorDraft((p) => ({ ...p, location: e.target.value }))} />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Price</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.price} onChange={(e) => setEditorDraft((p) => ({ ...p, price: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Price Min</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.price_min} onChange={(e) => setEditorDraft((p) => ({ ...p, price_min: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Price Max</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.price_max} onChange={(e) => setEditorDraft((p) => ({ ...p, price_max: e.target.value }))} />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Registration Link</label>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                        value={editorDraft.registration_link}
                        onChange={(e) => setEditorDraft((p) => ({ ...p, registration_link: e.target.value }))}
                        placeholder="https://register..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Source URL</label>
                      <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={editorDraft.source_url} onChange={(e) => setEditorDraft((p) => ({ ...p, source_url: e.target.value }))} placeholder="https://..." />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={saveEditorRow} disabled={editorWorking}>Save</Button>
                    <Button onClick={applyNameFormatCleanupSelected} disabled={editorWorking}>Apply Name Cleanup</Button>
                    <Button onClick={() => refreshQualityCounters()} disabled={qualityWorking}>Refresh Quality</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* =========================================================
   Export with boundary
========================================================= */
export default function AdminImport() {
  return (
    <ErrorBoundary>
      <AdminImportInner />
    </ErrorBoundary>
  );
}
