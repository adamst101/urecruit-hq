// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

const Pill = ({ children, tone = "slate" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-green-50 text-green-700 border-green-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${tones[tone] || tones.slate}`}>{children}</span>;
};

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
function isMissingPrice(row) {
  const p = safeNumber(row?.price);
  const pmin = safeNumber(row?.price_min);
  const pmax = safeNumber(row?.price_max);
  const any = [p, pmin, pmax].some((x) => x != null && x > 0);
  return !any;
}
function isMissingLocation(row) {
  const c = safeString(row?.city);
  const s = safeString(row?.state);
  return !c || !s;
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
     Logs
  ----------------------------- */
  const [logOps, setLogOps] = useState("");
  function appendOps(line) {
    setLogOps((prev) => (prev ? prev + "\n" + line : line));
  }

  /* ----------------------------
     Sport selector
  ----------------------------- */
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  /* ----------------------------
     Operations toggles / controls (existing tooling)
  ----------------------------- */
  const [opsOpen, setOpsOpen] = useState(true);

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

  // Rate-limit protection
  const [writeDelayMs, setWriteDelayMs] = useState(250);
  const [batchDelayMs, setBatchDelayMs] = useState(800);

  // Upsert guard
  const [autoDedupOnWrite, setAutoDedupOnWrite] = useState(true);

  const RERUN_MODES = [
    { id: "due", label: "Due only (normal)" },
    { id: "all", label: "Force recrawl ALL active" },
    { id: "error", label: "Recrawl ERROR only" },
    { id: "no_events", label: "Recrawl NO_EVENTS only" },
    { id: "ok", label: "Recrawl OK only" },
    { id: "ready", label: "Recrawl READY only" },
  ];
  const [rerunMode, setRerunMode] = useState("due");

  // Test mode
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [testSchoolId, setTestSchoolId] = useState("");

  /* ----------------------------
     Work flags
  ----------------------------- */
  const [working, setWorking] = useState({
    load: false,
    seed: false,
    ingest: false,
    promote: false,
    dedup: false,
    refresh: false,
    fix: false,
    bulk: false,
  });

  function setWork(key, value) {
    setWorking((p) => ({ ...p, [key]: value }));
  }

  /* =========================================================
     Rate limit retry wrapper
  ========================================================= */
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

        const base = Math.min(8000, 400 * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 250);
        const wait = base + jitter;
        await sleep(wait);
      }
    }
  }

  /* =========================================================
     Load sports
  ========================================================= */
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
      appendOps(`[AdminImport] ERROR loading sports: ${String(e?.message || e)}`);
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

  /* =========================================================
     Shared defect model + triage console state
  ========================================================= */
  const QUEUES = [
    {
      id: "missing_event_key",
      title: "Missing event_key",
      description: "Camp rows that cannot upsert/dedup safely yet.",
      primary: "campdemo",
      tone: "red",
    },
    {
      id: "missing_price",
      title: "Missing price",
      description: "Price, min, and max are all empty/0.",
      primary: "campdemo",
      tone: "amber",
    },
    {
      id: "missing_location",
      title: "Missing city/state",
      description: "City or state is missing.",
      primary: "campdemo",
      tone: "amber",
    },
    {
      id: "bad_name_format",
      title: "Bad name format",
      description: "Name contains pipes/parentheses/HTML junk. Needs cleanup.",
      primary: "campdemo",
      tone: "amber",
    },
    {
      id: "no_camps",
      title: "No camps",
      description: "Active SchoolSportSite has zero CampDemo rows.",
      primary: "schoolsportsite",
      tone: "blue",
    },
    {
      id: "crawl_error_or_no_events",
      title: "Crawl error / no_events",
      description: "SchoolSportSite is in error or no_events state.",
      primary: "schoolsportsite",
      tone: "red",
    },
  ];

  const [queueId, setQueueId] = useState("missing_event_key");
  const [queueCounts, setQueueCounts] = useState({});
  const [worklist, setWorklist] = useState([]);
  const [workSearch, setWorkSearch] = useState("");
  const [workLimit, setWorkLimit] = useState(250);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("campdemo"); // "campdemo" | "schoolsportsite" | "school" | "camp"
  const [drawerContext, setDrawerContext] = useState({
    type: null, // "campdemo" | "schoolsportsite"
    id: "",
    school_id: "",
    sport_id: "",
  });

  // Loaded records for drawer
  const [drawerCampDemo, setDrawerCampDemo] = useState(null);
  const [drawerSite, setDrawerSite] = useState(null);

  const [campEdit, setCampEdit] = useState({});
  const [siteEdit, setSiteEdit] = useState({ camp_site_url: "" });

  function resetDrawer() {
    setDrawerOpen(false);
    setDrawerTab("campdemo");
    setDrawerContext({ type: null, id: "", school_id: "", sport_id: "" });
    setDrawerCampDemo(null);
    setDrawerSite(null);
    setCampEdit({});
    setSiteEdit({ camp_site_url: "" });
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildCampEditDefaults(r) {
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

  /* =========================================================
     Build school sets (used for queues)
  ========================================================= */
  async function getQualitySchoolSets() {
    if (!selectedSportId || !SchoolSportSiteEntity || !CampDemoEntity) {
      return {
        allSites: [],
        allSchools: new Set(),
        bySchool: new Map(),
        noCampSchools: new Set(),
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

    const schoolsWithAnyCamp = new Set(bySchool.keys());
    const noCampSchools = new Set();
    for (const sid of allSchools.values()) {
      if (!schoolsWithAnyCamp.has(sid)) noCampSchools.add(sid);
    }

    return { allSites, allSchools, bySchool, noCampSchools };
  }

  /* =========================================================
     Compute queues + load worklist
  ========================================================= */
  async function refreshQueuesAndWorklist({ keepSelection = false } = {}) {
    setWork("refresh", true);
    try {
      if (!selectedSportId) {
        setQueueCounts({});
        setWorklist([]);
        setSelectedIds(new Set());
        return;
      }
      if (!CampDemoEntity || !SchoolSportSiteEntity) {
        appendOps(`[Triage] ERROR: Missing entities (need CampDemo and SchoolSportSite).`);
        return;
      }

      const sets = await getQualitySchoolSets();
      const allCampRows = asArray(await entityList(CampDemoEntity, { sport_id: selectedSportId }));
      const allSites = asArray(sets.allSites);

      // Queue counts
      const counts = {};
      counts.missing_event_key = allCampRows.filter((r) => !safeString(r?.event_key)).length;
      counts.missing_price = allCampRows.filter((r) => isMissingPrice(r)).length;
      counts.missing_location = allCampRows.filter((r) => isMissingLocation(r)).length;
      counts.bad_name_format = allCampRows.filter((r) => needsPipeOrParenOrHtmlCleanup(r?.camp_name)).length;
      counts.no_camps = sets.noCampSchools.size;
      counts.crawl_error_or_no_events = allSites.filter((s) => {
        const st = statusOf(s);
        return st === "error" || st === "no_events";
      }).length;

      setQueueCounts(counts);

      // Build worklist for selected queue
      let items = [];
      const q = lc(workSearch);

      if (queueId === "no_camps") {
        const sites = allSites.filter((s) => s.school_id && sets.noCampSchools.has(String(s.school_id)));
        items = sites.map((s) => ({
          type: "schoolsportsite",
          id: String(s.id),
          school_id: String(s.school_id || ""),
          sport_id: String(s.sport_id || ""),
          title: `SchoolSportSite: ${String(s.school_id || "")}`,
          subtitle: truncate(String(s.camp_site_url || ""), 120),
          meta: {
            crawl_status: s.crawl_status,
            next_crawl_at: s.next_crawl_at,
          },
          raw: s,
        }));
      } else if (queueId === "crawl_error_or_no_events") {
        const sites = allSites.filter((s) => {
          const st = statusOf(s);
          return st === "error" || st === "no_events";
        });
        items = sites.map((s) => ({
          type: "schoolsportsite",
          id: String(s.id),
          school_id: String(s.school_id || ""),
          sport_id: String(s.sport_id || ""),
          title: `SchoolSportSite: ${String(s.school_id || "")}`,
          subtitle: truncate(String(s.camp_site_url || ""), 120),
          meta: {
            crawl_status: s.crawl_status,
            crawl_error: s.crawl_error,
            last_crawled_at: s.last_crawled_at,
            next_crawl_at: s.next_crawl_at,
          },
          raw: s,
        }));
      } else {
        // CampDemo queues
        let rows = allCampRows;

        if (queueId === "missing_event_key") rows = rows.filter((r) => !safeString(r?.event_key));
        if (queueId === "missing_price") rows = rows.filter((r) => isMissingPrice(r));
        if (queueId === "missing_location") rows = rows.filter((r) => isMissingLocation(r));
        if (queueId === "bad_name_format") rows = rows.filter((r) => needsPipeOrParenOrHtmlCleanup(r?.camp_name));

        items = rows.map((r) => ({
          type: "campdemo",
          id: String(r.id),
          school_id: String(r.school_id || ""),
          sport_id: String(r.sport_id || ""),
          title: safeString(r?.camp_name) ? String(r.camp_name) : "(missing camp_name)",
          subtitle: `start=${String(r.start_date || "")} • ${truncate(String(r.link_url || ""), 100)}`,
          meta: {
            event_key: safeString(r?.event_key),
            price: r?.price,
            price_min: r?.price_min,
            price_max: r?.price_max,
            city: r?.city,
            state: r?.state,
            active: readCampActiveFlag(r),
          },
          raw: r,
        }));
      }

      if (q) {
        items = items.filter((it) => {
          const hay = [
            it.title,
            it.subtitle,
            it.id,
            it.school_id,
            safeString(it?.meta?.event_key),
            safeString(it?.raw?.camp_site_url),
          ]
            .filter(Boolean)
            .join(" ");
          return lc(hay).includes(q);
        });
      }

      // Sort: prefer grouping by school (so you clear root causes)
      items.sort((a, b) => String(a.school_id).localeCompare(String(b.school_id)) || String(a.title).localeCompare(String(b.title)));

      items = items.slice(0, Math.max(50, Number(workLimit || 250)));
      setWorklist(items);

      if (!keepSelection) {
        setSelectedIds(new Set());
      } else {
        // keep only ids still present
        setSelectedIds((prev) => {
          const next = new Set();
          const allow = new Set(items.map((x) => String(x.id)));
          prev.forEach((id) => {
            if (allow.has(String(id))) next.add(String(id));
          });
          return next;
        });
      }
    } catch (e) {
      appendOps(`[Triage] ERROR: ${String(e?.message || e)}`);
    } finally {
      setWork("refresh", false);
    }
  }

  useEffect(() => {
    if (!selectedSportId) return;
    refreshQueuesAndWorklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId, queueId]);

  /* =========================================================
     Open Drawer (routing)
  ========================================================= */
  async function openDrawerForItem(item, { preferredTab = null } = {}) {
    if (!item) return;
    if (!selectedSportId) return;

    setDrawerOpen(true);
    setDrawerContext({
      type: item.type,
      id: String(item.id),
      school_id: String(item.school_id || ""),
      sport_id: String(item.sport_id || selectedSportId),
    });

    if (item.type === "campdemo") {
      setDrawerTab("campdemo");
      setDrawerCampDemo(null);
      setCampEdit({});
      try {
        const rows = await entityList(CampDemoEntity, { id: String(item.id) });
        const hit = asArray(rows)[0] || item.raw || null;
        setDrawerCampDemo(hit);
        setCampEdit(buildCampEditDefaults(hit || {}));
        if (preferredTab) setDrawerTab(preferredTab);
      } catch (e) {
        appendOps(`[Drawer] ERROR loading CampDemo ${item.id}: ${String(e?.message || e)}`);
      }
      // also load site for quick jump
      try {
        const sid = safeString(item.school_id);
        if (sid) {
          const sites = await entityList(SchoolSportSiteEntity, { school_id: String(sid), sport_id: selectedSportId });
          const hitSite = asArray(sites)[0] || null;
          setDrawerSite(hitSite);
          setSiteEdit({ camp_site_url: safeString(hitSite?.camp_site_url) || "" });
        }
      } catch {
        // ignore
      }
    }

    if (item.type === "schoolsportsite") {
      setDrawerTab(preferredTab || "schoolsportsite");
      setDrawerSite(null);
      setSiteEdit({ camp_site_url: "" });
      try {
        const rows = await entityList(SchoolSportSiteEntity, { id: String(item.id) });
        const hit = asArray(rows)[0] || item.raw || null;
        setDrawerSite(hit);
        setSiteEdit({ camp_site_url: safeString(hit?.camp_site_url) || "" });
      } catch (e) {
        appendOps(`[Drawer] ERROR loading SchoolSportSite ${item.id}: ${String(e?.message || e)}`);
      }
    }
  }

  /* =========================================================
     Drawer actions
  ========================================================= */
  async function saveCampDemoPatch() {
    if (!drawerCampDemo?.id) return;
    if (!CampDemoEntity?.update) return appendOps(`[CampDemo] ERROR: CampDemo.update not available.`);
    setWork("fix", true);
    try {
      const cleanedName = sanitizeCampNameForWrite(campEdit.camp_name);
      const payload = {
        camp_name: cleanedName,
        price: safeNumber(campEdit.price),
        price_min: safeNumber(campEdit.price_min),
        price_max: safeNumber(campEdit.price_max),
        city: safeString(campEdit.city) || null,
        state: safeString(campEdit.state) || null,
        start_date: toISODate(campEdit.start_date),
        end_date: toISODate(campEdit.end_date),
        link_url: safeString(campEdit.link_url) || null,
        notes: safeString(campEdit.notes) || null,
        active: typeof campEdit.active === "boolean" ? campEdit.active : true,
        last_seen_at: new Date().toISOString(),
      };

      await writeWithRetry(() => CampDemoEntity.update(String(drawerCampDemo.id), payload), { maxRetries: 7 });
      appendOps(`[CampDemo] Saved row_id=${drawerCampDemo.id}`);

      // refresh drawer record
      const rows = await entityList(CampDemoEntity, { id: String(drawerCampDemo.id) });
      const hit = asArray(rows)[0] || null;
      setDrawerCampDemo(hit);
      setCampEdit(buildCampEditDefaults(hit || {}));

      await refreshQueuesAndWorklist({ keepSelection: true });
    } catch (e) {
      appendOps(`[CampDemo] SAVE FAILED row_id=${drawerCampDemo?.id}: ${String(e?.message || e)}`);
    } finally {
      setWork("fix", false);
    }
  }

  async function generateEventKeyForCampDemo() {
    if (!drawerCampDemo?.id) return;
    if (!CampDemoEntity?.update) return appendOps(`[CampDemo] ERROR: CampDemo.update not available.`);
    setWork("fix", true);
    try {
      const current = drawerCampDemo;

      const maybeStart = toISODate(campEdit.start_date) || toISODate(current?.start_date);
      const maybeLink = safeString(campEdit.link_url) || safeString(current?.link_url) || safeString(current?.source_url);
      const maybeProgram =
        safeString(current?.program_id) || (safeString(campEdit.camp_name) ? `sportsusa:${slugify(campEdit.camp_name)}` : null);
      const maybePlatform = safeString(current?.source_platform) || "sportsusa";
      const maybeSourceUrl = safeString(current?.source_url) || maybeLink;

      if (!maybeStart || !maybeLink || !maybeProgram) {
        appendOps(
          `[CampDemo] Cannot generate event_key. Need start_date + link_url + program_id (or camp_name). start_date=${maybeStart ? "ok" : "missing"} link_url=${maybeLink ? "ok" : "missing"} program_id=${maybeProgram ? "ok" : "missing"}`
        );
        return;
      }

      const generated = buildEventKey({
        source_platform: maybePlatform,
        program_id: maybeProgram,
        start_date: maybeStart,
        link_url: maybeLink,
        source_url: maybeSourceUrl,
      });

      await writeWithRetry(() => CampDemoEntity.update(String(current.id), { event_key: generated, last_seen_at: new Date().toISOString() }), {
        maxRetries: 7,
      });

      appendOps(`[CampDemo] event_key generated for row_id=${current.id}`);

      const rows = await entityList(CampDemoEntity, { id: String(current.id) });
      const hit = asArray(rows)[0] || null;
      setDrawerCampDemo(hit);
      setCampEdit(buildCampEditDefaults(hit || {}));

      await refreshQueuesAndWorklist({ keepSelection: true });
    } catch (e) {
      appendOps(`[CampDemo] event_key generation failed: ${String(e?.message || e)}`);
    } finally {
      setWork("fix", false);
    }
  }

  async function deleteCampDemoRow() {
    if (!drawerCampDemo?.id) return;
    setWork("fix", true);
    try {
      const ok = await writeWithRetry(() => tryDelete(CampDemoEntity, String(drawerCampDemo.id)), { maxRetries: 7 });
      appendOps(ok ? `[CampDemo] Deleted row_id=${drawerCampDemo.id}` : `[CampDemo] Delete FAILED row_id=${drawerCampDemo.id}`);
      resetDrawer();
      await refreshQueuesAndWorklist({ keepSelection: false });
    } catch (e) {
      appendOps(`[CampDemo] Delete FAILED: ${String(e?.message || e)}`);
    } finally {
      setWork("fix", false);
    }
  }

  async function saveSchoolSportSiteUrl() {
    if (!drawerSite?.id) return appendOps(`[Site] ERROR: No SchoolSportSite loaded.`);
    if (!SchoolSportSiteEntity?.update) return appendOps(`[Site] ERROR: SchoolSportSite.update not available.`);
    const url = safeString(siteEdit.camp_site_url);
    if (!url) return appendOps(`[Site] Provide camp_site_url first.`);
    setWork("fix", true);
    try {
      await writeWithRetry(() => SchoolSportSiteEntity.update(String(drawerSite.id), { camp_site_url: url }), { maxRetries: 7 });
      appendOps(`[Site] Saved camp_site_url for site_id=${drawerSite.id}`);

      const rows = await entityList(SchoolSportSiteEntity, { id: String(drawerSite.id) });
      const hit = asArray(rows)[0] || null;
      setDrawerSite(hit);
      setSiteEdit({ camp_site_url: safeString(hit?.camp_site_url) || "" });

      await refreshQueuesAndWorklist({ keepSelection: true });
    } catch (e) {
      appendOps(`[Site] SAVE FAILED site_id=${drawerSite.id}: ${String(e?.message || e)}`);
    } finally {
      setWork("fix", false);
    }
  }

  async function cleanupCampDemoForSchool({ schoolId, dryRun }) {
    if (!schoolId) return { wouldDelete: 0, deleted: 0 };
    const rows = asArray(await entityList(CampDemoEntity, { school_id: String(schoolId), sport_id: selectedSportId }));
    const wouldDelete = rows.length;
    if (dryRun) {
      appendOps(`[Fix] DryRun: would delete CampDemo rows for school_id=${schoolId} sport_id=${selectedSportId}: ${wouldDelete}`);
      return { wouldDelete, deleted: 0 };
    }
    let deleted = 0;
    for (const r of rows) {
      const ok = await writeWithRetry(() => tryDelete(CampDemoEntity, String(r.id)), { maxRetries: 7 }).catch(() => false);
      if (ok) deleted += 1;
      await sleep(Math.max(0, Number(writeDelayMs || 0)));
    }
    appendOps(`[Fix] Deleted CampDemo rows for school_id=${schoolId}: ${deleted}/${wouldDelete}`);
    return { wouldDelete, deleted };
  }

  async function normalizeAcceptedRowToFlat(a) {
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

    // Optional on-write dedup
    if (autoDedupOnWrite && arr.length > 1) {
      // keep highest completeness
      const score = (r) => {
        let s = 0;
        if (safeString(r?.camp_name)) s += 2;
        if (safeString(r?.start_date)) s += 2;
        if (safeString(r?.link_url)) s += 2;
        if (!isMissingPrice(r)) s += 2;
        if (!isMissingLocation(r)) s += 1;
        if (readCampActiveFlag(r)) s += 1;
        const ls = safeString(r?.last_seen_at);
        const t = ls ? new Date(ls).getTime() : 0;
        s += Math.max(0, Math.min(5, Math.floor(t / 1e12)));
        return s;
      };
      const sorted = [...arr].sort((a, b) => score(b) - score(a));
      const keep = sorted[0];
      const losers = sorted.slice(1);
      for (const lose of losers) {
        await tryDelete(CampDemoEntity, String(lose.id));
        await sleep(40);
      }
      existing = await entityList(CampDemoEntity, { event_key: key });
    }

    const arr2 = asArray(existing);
    if (arr2.length > 0 && arr2[0]?.id) {
      const finalPayload = withActiveDefault(payload, arr2[0]);
      await CampDemoEntity.update(String(arr2[0].id), finalPayload);
      return "updated";
    }

    const finalPayload = withActiveDefault(payload, null);
    await CampDemoEntity.create(finalPayload);
    return "created";
  }

  async function writeAcceptedEventsToCampDemo(accepted, runIso) {
    const list = asArray(accepted || []);
    if (!list.length) return { created: 0, updated: 0, skipped: 0, errors: 0 };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < list.length; i++) {
      const a = list[i] || {};

      const school_id = safeString(a.school_id) || null;
      const sport_id = selectedSportId;

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
          city: safeString(a.city),
          state: safeString(a.state),
          price: safeNumber(a.price),
          price_min: safeNumber(a.price_min),
          price_max: safeNumber(a.price_max),
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
        const result = await writeWithRetry(() => upsertCampDemoByEventKey(payload), { maxRetries: 7 });
        if (result === "created") created += 1;
        if (result === "updated") updated += 1;
      } catch (e) {
        errors += 1;
        appendOps(`[Write] ERROR #${i + 1}: ${String(e?.message || e)}`);
      }

      await sleep(Math.max(0, Number(writeDelayMs || 0)));
    }

    return { created, updated, skipped, errors };
  }

  async function fixSiteCleanReingest({ siteId, schoolId, url, dryRun }) {
    if (!selectedSportId) return;
    if (!siteId || !schoolId || !url) {
      appendOps(`[Fix] Missing siteId/schoolId/url`);
      return;
    }
    setWork("fix", true);
    try {
      // 1) Save URL
      if (!dryRun) {
        await writeWithRetry(() => SchoolSportSiteEntity.update(String(siteId), { camp_site_url: url }), { maxRetries: 7 });
        appendOps(`[Fix] Saved camp_site_url for site_id=${siteId}`);
      } else {
        appendOps(`[Fix] DryRun: would save camp_site_url for site_id=${siteId}`);
      }

      // 2) Clean CampDemo rows for school
      await cleanupCampDemoForSchool({ schoolId, dryRun });

      // 3) Re-ingest (test mode for one school)
      appendOps(`[Fix] Re-ingest start. dryRun=${dryRun ? "true" : "false"} testSchoolId=${schoolId} testSiteUrl=${url}`);

      const res = await fetch("/functions/sportsUSAIngestCamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          dryRun: !!dryRun,
          maxSites: 1,
          maxRegsPerSite: Number(campsMaxRegsPerSite || 10),
          maxEvents: Number(campsMaxEvents || 300),
          fastMode: !!fastMode,
          sites: [],
          testSiteUrl: url,
          testSchoolId: schoolId,
        }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        const t = await res.text().catch(() => null);
        appendOps(`[Fix] Function returned non-JSON. HTTP ${res.status} ${truncate(t || "", 300)}`);
        return;
      }

      if (!res.ok) {
        appendOps(`[Fix] Function ERROR (HTTP ${res.status})`);
        appendOps(truncate(JSON.stringify(data || {}, null, 2), 800));
        return;
      }

      const accepted = asArray(data?.accepted || []).map((x) => normalizeAcceptedRowToFlat(x));
      appendOps(`[Fix] Accepted events returned: ${accepted.length}`);

      if (dryRun) {
        appendOps(`[Fix] DryRun=true: no CampDemo writes performed.`);
      } else {
        const wr = await writeAcceptedEventsToCampDemo(accepted, new Date().toISOString());
        appendOps(`[Fix] Writes done. created=${wr.created} updated=${wr.updated} skipped=${wr.skipped} errors=${wr.errors}`);
      }

      await refreshQueuesAndWorklist({ keepSelection: false });
    } catch (e) {
      appendOps(`[Fix] ERROR: ${String(e?.message || e)}`);
    } finally {
      setWork("fix", false);
    }
  }

  /* =========================================================
     Bulk actions (MVP)
  ========================================================= */
  const selectedList = useMemo(() => {
    const ids = new Set([...selectedIds].map(String));
    return worklist.filter((x) => ids.has(String(x.id)));
  }, [selectedIds, worklist]);

  async function bulkGenerateEventKeys() {
    const rows = selectedList.filter((x) => x.type === "campdemo");
    if (!rows.length) return;
    setWork("bulk", true);
    try {
      appendOps(`[Bulk] Generate event_key for ${rows.length} CampDemo rows...`);

      let ok = 0;
      let skipped = 0;
      let failed = 0;

      for (const it of rows) {
        const r = it.raw || null;
        if (!r?.id) {
          skipped += 1;
          continue;
        }
        if (safeString(r?.event_key)) {
          skipped += 1;
          continue;
        }

        const maybeStart = toISODate(r?.start_date);
        const maybeLink = safeString(r?.link_url) || safeString(r?.source_url);
        const maybeProgram = safeString(r?.program_id) || (safeString(r?.camp_name) ? `sportsusa:${slugify(r?.camp_name)}` : null);
        const maybePlatform = safeString(r?.source_platform) || "sportsusa";
        const maybeSourceUrl = safeString(r?.source_url) || maybeLink;

        if (!maybeStart || !maybeLink || !maybeProgram) {
          skipped += 1;
          continue;
        }

        const generated = buildEventKey({
          source_platform: maybePlatform,
          program_id: maybeProgram,
          start_date: maybeStart,
          link_url: maybeLink,
          source_url: maybeSourceUrl,
        });

        try {
          await writeWithRetry(() => CampDemoEntity.update(String(r.id), { event_key: generated, last_seen_at: new Date().toISOString() }), {
            maxRetries: 7,
          });
          ok += 1;
        } catch {
          failed += 1;
        }

        await sleep(Math.max(0, Number(writeDelayMs || 0)));
      }

      appendOps(`[Bulk] Done. ok=${ok} skipped=${skipped} failed=${failed}`);
      await refreshQueuesAndWorklist({ keepSelection: false });
    } finally {
      setWork("bulk", false);
    }
  }

  async function bulkSetActive(value) {
    const rows = selectedList.filter((x) => x.type === "campdemo");
    if (!rows.length) return;
    setWork("bulk", true);
    try {
      let ok = 0;
      let failed = 0;

      for (const it of rows) {
        const r = it.raw || null;
        if (!r?.id) continue;
        try {
          await writeWithRetry(() => CampDemoEntity.update(String(r.id), { active: !!value, last_seen_at: new Date().toISOString() }), {
            maxRetries: 7,
          });
          ok += 1;
        } catch {
          failed += 1;
        }
        await sleep(Math.max(0, Number(writeDelayMs || 0)));
      }

      appendOps(`[Bulk] Set active=${value ? "true" : "false"} done. ok=${ok} failed=${failed}`);
      await refreshQueuesAndWorklist({ keepSelection: false });
    } finally {
      setWork("bulk", false);
    }
  }

  /* =========================================================
     Operations tooling (Seed / Ingest / Promote / Dedup minimal)
     Keep this section as "ops" — triage is now primary.
  ========================================================= */
  function pickSitesByRerunMode(sites) {
    const arr = asArray(sites);
    if (rerunMode === "all") return arr;
    if (rerunMode === "error") return arr.filter((s) => statusOf(s) === "error");
    if (rerunMode === "no_events") return arr.filter((s) => statusOf(s) === "no_events");
    if (rerunMode === "ok") return arr.filter((s) => statusOf(s) === "ok");
    if (rerunMode === "ready") return arr.filter((s) => statusOf(s) === "ready");
    return arr.filter((s) => isDueNow(s));
  }

  async function runSportsUSASeedSchools() {
    const runIso = new Date().toISOString();
    setWork("seed", true);
    appendOps(`[Seed] Starting @ ${runIso} sport=${selectedSportName} dryRun=${sportsUSADryRun ? "true" : "false"} limit=${sportsUSALimit}`);

    try {
      if (!selectedSportId) return appendOps("[Seed] ERROR: Select a sport first.");
      const siteUrl = safeString(sportsUSASiteUrl);
      if (!siteUrl) return appendOps("[Seed] ERROR: Missing SportsUSA directory URL.");
      if (!SchoolEntity || !SchoolSportSiteEntity) return appendOps("[Seed] ERROR: Missing entities.");

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
        appendOps(`[Seed] ERROR (HTTP ${res.status})`);
        if (data) appendOps(truncate(JSON.stringify(data || {}, null, 2), 1000));
        if (!data && rawText) appendOps(`[Seed] Raw: ${truncate(rawText, 600)}`);
        return;
      }

      if (sportsUSADryRun) {
        appendOps(`[Seed] DryRun=true: no writes.`);
        return;
      }

      appendOps(`[Seed] Done. schools_found=${asArray(data?.schools || []).length}`);
      await refreshQueuesAndWorklist();
    } catch (e) {
      appendOps(`[Seed] ERROR: ${String(e?.message || e)}`);
    } finally {
      setWork("seed", false);
    }
  }

  async function runSportsUSACampsIngest() {
    const runIso = new Date().toISOString();
    const runId = `run_${runIso.replace(/[:.]/g, "").slice(0, 15)}`;
    setWork("ingest", true);
    appendOps(`[Ingest] Starting @ ${runIso} sport=${selectedSportName} dryRun=${campsDryRun ? "true" : "false"}`);

    try {
      if (!selectedSportId) return appendOps("[Ingest] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity) return appendOps("[Ingest] ERROR: SchoolSportSite entity not available.");
      if (!CampDemoEntity) return appendOps("[Ingest] ERROR: CampDemo entity not available.");

      const sets = await getQualitySchoolSets();
      const allSites = sets.allSites;

      const rerunFiltered = pickSitesByRerunMode(allSites);

      const tUrl = safeString(testSiteUrl);
      const tSchool = safeString(testSchoolId);

      if (tUrl && !campsDryRun && !tSchool) {
        appendOps("[Ingest] ERROR: For non-dry-run with Test Site URL, provide Test School ID.");
        return;
      }

      if (tUrl) {
        appendOps(`[Ingest] Test mode: ${tUrl}`);
      }

      const maxSitesPerBatch = Math.max(1, Number(campsMaxSites || 25));
      const maxBatchCount = runBatches ? Math.max(1, Number(maxBatches || 1)) : 1;

      const targets = tUrl ? [] : rerunFiltered;
      const totalSites = tUrl ? 0 : targets.length;
      const totalPossibleBatches = tUrl ? 1 : Math.ceil(totalSites / maxSitesPerBatch);
      const batchesToRun = Math.min(totalPossibleBatches, maxBatchCount);

      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (let b = 0; b < batchesToRun; b++) {
        const start = b * maxSitesPerBatch;
        const end = Math.min(totalSites, start + maxSitesPerBatch);
        const batchSites = targets.slice(start, end);

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
            sites: tUrl
              ? []
              : batchSites.map((r) => ({
                  id: r.id,
                  school_id: r.school_id,
                  sport_id: r.sport_id,
                  camp_site_url: r.camp_site_url,
                })),
            testSiteUrl: tUrl || null,
            testSchoolId: tSchool || null,
            runId,
          }),
        });

        let data = null;
        try {
          data = await res.json();
        } catch {
          const raw = await res.text().catch(() => null);
          appendOps(`[Ingest] non-JSON response. HTTP ${res.status} ${truncate(raw || "", 500)}`);
          totalErrors += 1;
          continue;
        }

        if (!res.ok) {
          appendOps(`[Ingest] Function ERROR (HTTP ${res.status})`);
          appendOps(truncate(JSON.stringify(data || {}, null, 2), 1000));
          totalErrors += 1;
          continue;
        }

        const accepted = asArray(data?.accepted || []).map((x) => normalizeAcceptedRowToFlat(x));

        if (campsDryRun) {
          appendOps(`[Ingest] DryRun=true: accepted=${accepted.length} (no writes).`);
        } else {
          const wr = await writeAcceptedEventsToCampDemo(accepted, runIso);
          totalCreated += wr.created;
          totalUpdated += wr.updated;
          totalSkipped += wr.skipped;
          totalErrors += wr.errors;
          appendOps(`[Ingest] Batch ${b + 1}: created=${wr.created} updated=${wr.updated} skipped=${wr.skipped} errors=${wr.errors}`);
        }

        if (b < batchesToRun - 1) await sleep(Math.max(0, Number(batchDelayMs || 0)));
      }

      appendOps(`[Ingest] DONE. created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors}`);
      await refreshQueuesAndWorklist();
    } catch (e) {
      appendOps(`[Ingest] ERROR: ${String(e?.message || e)}`);
    } finally {
      setWork("ingest", false);
    }
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setWork("promote", true);
    appendOps(`[Promote] Starting @ ${runIso}`);

    try {
      if (!selectedSportId) return appendOps("[Promote] ERROR: Select a sport first.");
      if (!CampDemoEntity) return appendOps("[Promote] ERROR: CampDemo entity not available.");
      if (!CampEntity) return appendOps("[Promote] ERROR: Camp entity not available.");

      const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      async function upsertCampByEventKey(payload) {
        if (!CampEntity?.create || !CampEntity?.update) throw new Error("Camp entity not available.");
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

      for (let i = 0; i < demoRows.length; i++) {
        const r = demoRows[i];
        try {
          const school_id = safeString(r?.school_id);
          const sport_id = safeString(r?.sport_id);
          const camp_name = sanitizeCampNameForWrite(r?.camp_name);
          const start_date = toISODate(r?.start_date);
          const end_date = toISODate(r?.end_date);

          if (!school_id || !sport_id || !camp_name || !start_date) {
            skipped += 1;
            continue;
          }

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

          const payload = {
            school_id,
            sport_id,
            camp_name,
            start_date,
            end_date: end_date || null,
            city: safeString(r?.city) || null,
            state: safeString(r?.state) || null,
            position_ids: normalizeStringArray(r?.position_ids),
            price: safeNumber(r?.price) ?? safeNumber(r?.price_max) ?? safeNumber(r?.price_min),
            link_url: link_url || null,
            notes: safeString(r?.notes) || null,
            season_year: season_year != null ? season_year : null,
            program_id,
            event_key,
            source_platform,
            source_url: source_url || null,
            last_seen_at: runIso,
            content_hash: safeString(r?.content_hash) || null,
            active: readCampActiveFlag(r),
          };

          const result = await upsertCampByEventKey(payload);
          if (result === "created") created += 1;
          if (result === "updated") updated += 1;
        } catch (e) {
          errors += 1;
          appendOps(`[Promote] ERROR #${i + 1}: ${String(e?.message || e)}`);
        }
        if ((i + 1) % 100 === 0) await sleep(25);
      }

      appendOps(`[Promote] Done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } finally {
      setWork("promote", false);
    }
  }

  /* =========================================================
     Initial refresh when sport changes
  ========================================================= */
  useEffect(() => {
    if (!selectedSportId) return;
    refreshQueuesAndWorklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* =========================================================
     UI helpers
  ========================================================= */
  function toggleSelected(id) {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    const ids = worklist.map((x) => String(x.id));
    setSelectedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const currentQueue = QUEUES.find((q) => q.id === queueId) || QUEUES[0];

  const anyWorking = Object.values(working).some(Boolean);

  /* =========================================================
     Render
  ========================================================= */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-2xl font-bold text-slate-900">AdminImport</div>
            <div className="text-sm text-slate-600">
              Triage console first. Ingest/tools remain available under Operations.
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => nav("/Workspace")}>Back to Workspace</Button>
            <Button onClick={() => nav("/Home")}>Home</Button>
          </div>
        </div>

        {/* Sport selector */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-slate-900">Select Sport</div>
              <div className="text-xs text-slate-600">All queues and operations run against this sport.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => loadSports()} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button onClick={() => refreshQueuesAndWorklist({ keepSelection: false })} disabled={working.refresh || !selectedSportId}>
                {working.refresh ? "Refreshing…" : "Refresh Queues"}
              </Button>
            </div>
          </div>

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
                  setSelectedIds(new Set());
                }}
                disabled={sportsLoading || anyWorking}
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
              <div className="text-xs text-slate-600">
                Queue: <span className="font-semibold text-slate-900">{currentQueue.title}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* TRIAGE CONSOLE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Queues */}
          <Card className="p-3 lg:col-span-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">Queues</div>
                <div className="text-xs text-slate-600">Pick a defect queue to work.</div>
              </div>
              <Pill tone="slate">{selectedSportName || "No sport"}</Pill>
            </div>

            <div className="mt-3 space-y-2">
              {QUEUES.map((q) => {
                const count = Number(queueCounts?.[q.id] ?? 0);
                const active = q.id === queueId;
                return (
                  <button
                    key={q.id}
                    className={`w-full text-left rounded-lg border px-3 py-2 ${
                      active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setQueueId(q.id);
                      setSelectedIds(new Set());
                    }}
                    disabled={!selectedSportId || anyWorking}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Pill tone={q.tone}>{q.primary}</Pill>
                        <div className="font-semibold text-slate-900 text-sm">{q.title}</div>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{count}</div>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">{q.description}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Tip: clear root causes by fixing SchoolSportSite URLs when you see repeated defects by the same school.
            </div>
          </Card>

          {/* Center: Worklist */}
          <Card className="p-3 lg:col-span-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-slate-900">Worklist</div>
                <div className="text-xs text-slate-600">
                  {currentQueue.title} • showing {worklist.length} items
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={selectAllVisible} disabled={!worklist.length || anyWorking}>
                  Select all
                </Button>
                <Button onClick={clearSelection} disabled={!selectedIds.size || anyWorking}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Search</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={workSearch}
                  onChange={(e) => setWorkSearch(e.target.value)}
                  placeholder="school_id, name, url, event_key…"
                  disabled={!selectedSportId || anyWorking}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Limit</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={workLimit}
                  onChange={(e) => setWorkLimit(Number(e.target.value || 0))}
                  min={50}
                  max={5000}
                  disabled={!selectedSportId || anyWorking}
                />
              </div>
            </div>

            <div className="mt-3 border border-slate-200 rounded-lg overflow-auto bg-white" style={{ maxHeight: 560 }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200 w-10"></th>
                    <th className="p-2 border-b border-slate-200">Item</th>
                    <th className="p-2 border-b border-slate-200 w-36">school_id</th>
                    <th className="p-2 border-b border-slate-200 w-28">Type</th>
                    <th className="p-2 border-b border-slate-200 w-32">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {worklist.length ? (
                    worklist.map((it) => {
                      const checked = selectedIds.has(String(it.id));
                      const metaKey = safeString(it?.meta?.event_key);
                      return (
                        <tr key={String(it.id)} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2">
                            <input type="checkbox" checked={checked} onChange={() => toggleSelected(it.id)} />
                          </td>
                          <td className="p-2">
                            <div className="font-semibold text-slate-900">{truncate(it.title, 90)}</div>
                            <div className="text-xs text-slate-600 mt-0.5">{truncate(it.subtitle, 140)}</div>
                            {it.type === "campdemo" ? (
                              <div className="text-[11px] text-slate-500 mt-1">
                                {metaKey ? (
                                  <span>event_key={truncate(metaKey, 80)}</span>
                                ) : (
                                  <span className="text-amber-700">event_key missing</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 mt-1">
                                status={String(it?.meta?.crawl_status || it?.raw?.crawl_status || "")}
                                {safeString(it?.meta?.crawl_error) ? ` • ${truncate(String(it.meta.crawl_error), 120)}` : ""}
                              </div>
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs">{String(it.school_id || "")}</td>
                          <td className="p-2">
                            <Pill tone={it.type === "campdemo" ? "amber" : "blue"}>{it.type}</Pill>
                          </td>
                          <td className="p-2">
                            <Button
                              className="text-sm"
                              onClick={() => openDrawerForItem(it)}
                              disabled={anyWorking}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-3 text-slate-500">
                        {selectedSportId ? (working.refresh ? "Loading…" : "No items found in this queue.") : "Select a sport first."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bulk actions */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Bulk actions</div>
                  <div className="text-xs text-slate-600">Operate on selected items. MVP includes safe bulk actions only.</div>
                </div>
                <Pill tone="slate">{selectedIds.size} selected</Pill>
              </div>

              <div className="mt-2 flex gap-2 flex-wrap">
                <Button onClick={bulkGenerateEventKeys} disabled={working.bulk || !selectedIds.size || currentQueue.primary !== "campdemo"}>
                  {working.bulk ? "Working…" : "Generate event_key"}
                </Button>
                <Button onClick={() => bulkSetActive(true)} disabled={working.bulk || !selectedIds.size || currentQueue.primary !== "campdemo"}>
                  Mark Active
                </Button>
                <Button onClick={() => bulkSetActive(false)} disabled={working.bulk || !selectedIds.size || currentQueue.primary !== "campdemo"}>
                  Mark Inactive
                </Button>
              </div>

              <div className="text-[11px] text-slate-500 mt-2">
                Bulk generate skips rows missing start_date or link_url.
              </div>
            </div>
          </Card>

          {/* Right: Drawer */}
          <Card className="p-3 lg:col-span-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-slate-900">Triage Drawer</div>
                <div className="text-xs text-slate-600">
                  Routes you to the right record type to fix the defect.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={resetDrawer} disabled={anyWorking}>
                  Close
                </Button>
              </div>
            </div>

            {!drawerOpen ? (
              <div className="mt-4 text-sm text-slate-600">
                Select an item from the Worklist and click <b>Open</b>.
              </div>
            ) : (
              <>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                  <div className="text-slate-700">
                    <b>type</b>={drawerContext.type} • <b>id</b>={drawerContext.id}
                  </div>
                  <div className="text-slate-700 mt-1">
                    <b>school_id</b>={drawerContext.school_id || "—"} • <b>sport_id</b>={drawerContext.sport_id || "—"}
                  </div>
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button
                    className={drawerTab === "campdemo" ? "border-slate-900 bg-slate-50" : ""}
                    onClick={() => setDrawerTab("campdemo")}
                    disabled={!drawerCampDemo}
                  >
                    CampDemo
                  </Button>
                  <Button
                    className={drawerTab === "schoolsportsite" ? "border-slate-900 bg-slate-50" : ""}
                    onClick={() => setDrawerTab("schoolsportsite")}
                    disabled={!drawerSite}
                  >
                    SchoolSportSite
                  </Button>
                </div>

                {/* CampDemo tab */}
                {drawerTab === "campdemo" ? (
                  <div className="mt-3">
                    {!drawerCampDemo ? (
                      <div className="text-sm text-slate-600">Loading CampDemo…</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-slate-200 p-2">
                          <div className="text-xs text-slate-500">event_key</div>
                          <div className="text-sm text-slate-900 break-all">
                            {safeString(drawerCampDemo?.event_key) ? String(drawerCampDemo.event_key) : <span className="text-amber-700">Missing</span>}
                          </div>
                          <div className="mt-2 flex gap-2 flex-wrap">
                            <Button onClick={generateEventKeyForCampDemo} disabled={working.fix}>
                              Generate event_key
                            </Button>
                            {safeString(drawerCampDemo?.event_key) ? (
                              <Button
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(String(drawerCampDemo.event_key));
                                    appendOps(`[Drawer] Copied event_key for row_id=${drawerCampDemo.id}`);
                                  } catch {
                                    appendOps(`[Drawer] Copy failed (browser blocked).`);
                                  }
                                }}
                              >
                                Copy
                              </Button>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-2">
                            Generation requires start_date + link_url + program_id (or camp_name).
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">camp_name</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.camp_name ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, camp_name: e.target.value }))}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">start_date</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.start_date ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, start_date: e.target.value }))}
                              placeholder="YYYY-MM-DD"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">end_date</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.end_date ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, end_date: e.target.value }))}
                              placeholder="YYYY-MM-DD"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">city</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.city ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, city: e.target.value }))}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">state</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.state ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, state: e.target.value }))}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">price</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.price ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, price: e.target.value }))}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">min</label>
                              <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={campEdit.price_min ?? ""}
                                onChange={(e) => setCampEdit((p) => ({ ...p, price_min: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">max</label>
                              <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={campEdit.price_max ?? ""}
                                onChange={(e) => setCampEdit((p) => ({ ...p, price_max: e.target.value }))}
                              />
                            </div>
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">registration link (link_url)</label>
                            <input
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={campEdit.link_url ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, link_url: e.target.value }))}
                            />
                            {safeString(campEdit.link_url) ? (
                              <a className="text-xs text-blue-600 underline break-all" href={campEdit.link_url} target="_blank" rel="noreferrer">
                                Open link_url
                              </a>
                            ) : null}
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">notes</label>
                            <textarea
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              rows={3}
                              value={campEdit.notes ?? ""}
                              onChange={(e) => setCampEdit((p) => ({ ...p, notes: e.target.value }))}
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={!!campEdit.active}
                                onChange={(e) => setCampEdit((p) => ({ ...p, active: e.target.checked }))}
                              />
                              Active (shown in app)
                            </label>
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button className="border-slate-900" onClick={saveCampDemoPatch} disabled={working.fix}>
                            {working.fix ? "Saving…" : "Save CampDemo"}
                          </Button>
                          <Button onClick={deleteCampDemoRow} disabled={working.fix}>
                            Delete row
                          </Button>
                        </div>

                        <div className="text-[11px] text-slate-500">
                          If the registration link is wrong because the <b>school camp page is wrong</b>, switch to the SchoolSportSite tab and fix camp_site_url, then run Fix + Clean + Re-ingest.
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* SchoolSportSite tab */}
                {drawerTab === "schoolsportsite" ? (
                  <div className="mt-3">
                    {!drawerSite ? (
                      <div className="text-sm text-slate-600">Loading SchoolSportSite…</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-slate-200 p-2">
                          <div className="text-xs text-slate-500">Status</div>
                          <div className="text-sm text-slate-900">
                            <Pill tone={statusOf(drawerSite) === "error" ? "red" : statusOf(drawerSite) === "no_events" ? "amber" : "slate"}>
                              {statusOf(drawerSite)}
                            </Pill>
                          </div>
                          {safeString(drawerSite?.crawl_error) ? (
                            <div className="text-xs text-red-700 mt-2">{truncate(String(drawerSite.crawl_error), 240)}</div>
                          ) : null}
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">camp_site_url (school camp page)</label>
                          <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={siteEdit.camp_site_url ?? ""}
                            onChange={(e) => setSiteEdit((p) => ({ ...p, camp_site_url: e.target.value }))}
                            placeholder="https://..."
                          />
                          {safeString(siteEdit.camp_site_url) ? (
                            <a className="text-xs text-blue-600 underline break-all" href={siteEdit.camp_site_url} target="_blank" rel="noreferrer">
                              Open camp_site_url
                            </a>
                          ) : null}
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button className="border-slate-900" onClick={saveSchoolSportSiteUrl} disabled={working.fix}>
                            Save URL
                          </Button>
                          <Button
                            onClick={() =>
                              fixSiteCleanReingest({
                                siteId: String(drawerSite.id),
                                schoolId: String(drawerSite.school_id || drawerContext.school_id || ""),
                                url: safeString(siteEdit.camp_site_url),
                                dryRun: true,
                              })
                            }
                            disabled={working.fix || !safeString(siteEdit.camp_site_url)}
                          >
                            Preview Fix + Re-ingest (DryRun)
                          </Button>
                          <Button
                            className="border-slate-900"
                            onClick={() =>
                              fixSiteCleanReingest({
                                siteId: String(drawerSite.id),
                                schoolId: String(drawerSite.school_id || drawerContext.school_id || ""),
                                url: safeString(siteEdit.camp_site_url),
                                dryRun: false,
                              })
                            }
                            disabled={working.fix || !safeString(siteEdit.camp_site_url)}
                          >
                            Fix + Clean + Re-ingest
                          </Button>
                        </div>

                        <div className="text-[11px] text-slate-500">
                          This is your operator flow: update the school’s camp page URL, wipe that school’s CampDemo rows, then re-ingest from the corrected page.
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </div>

        {/* OPERATIONS */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-slate-900">Operations</div>
              <div className="text-xs text-slate-600">Ingest and maintenance tools. Triage console above is the primary workflow.</div>
            </div>
            <Button onClick={() => setOpsOpen((p) => !p)}>{opsOpen ? "Collapse" : "Expand"}</Button>
          </div>

          {opsOpen ? (
            <div className="mt-3 space-y-4">
              {/* Seed */}
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="font-semibold text-slate-900 text-sm">Seed Schools (SportsUSA)</div>
                <div className="text-xs text-slate-600 mt-1">Creates/updates School + SchoolSportSite for selected sport.</div>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">SportsUSA directory URL</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={sportsUSASiteUrl}
                      onChange={(e) => setSportsUSASiteUrl(e.target.value)}
                      disabled={working.seed}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Limit</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      type="number"
                      value={sportsUSALimit}
                      onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                      min={10}
                      max={5000}
                      disabled={working.seed}
                    />
                  </div>
                  <div className="flex items-end gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={sportsUSADryRun}
                        onChange={(e) => setSportsUSADryRun(e.target.checked)}
                        disabled={working.seed}
                      />
                      Dry Run
                    </label>
                    <Button onClick={runSportsUSASeedSchools} disabled={!selectedSportId || working.seed}>
                      {working.seed ? "Running…" : "Run Seed"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Ingest */}
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="font-semibold text-slate-900 text-sm">Ingest Camps (SportsUSA)</div>
                <div className="text-xs text-slate-600 mt-1">
                  Runs batches using rerun mode. Triage queues tell you what to fix next.
                </div>

                <div className="mt-2 grid grid-cols-1 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Dry Run</label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={campsDryRun} onChange={(e) => setCampsDryRun(e.target.checked)} disabled={working.ingest} />
                      {campsDryRun ? "On" : "Off"}
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Fast Mode</label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} disabled={working.ingest} />
                      {fastMode ? "On" : "Off"}
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Max Sites / Batch</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      type="number"
                      value={campsMaxSites}
                      onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))}
                      min={1}
                      max={250}
                      disabled={working.ingest}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Max Regs / Site</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      type="number"
                      value={campsMaxRegsPerSite}
                      onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))}
                      min={1}
                      max={200}
                      disabled={working.ingest}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Max Events</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      type="number"
                      value={campsMaxEvents}
                      onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))}
                      min={10}
                      max={5000}
                      disabled={working.ingest}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Batch Runner</label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={runBatches} onChange={(e) => setRunBatches(e.target.checked)} disabled={working.ingest} />
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
                        disabled={working.ingest || !runBatches}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Rerun Mode</label>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                      value={rerunMode}
                      onChange={(e) => setRerunMode(e.target.value)}
                      disabled={working.ingest}
                    >
                      {RERUN_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Write Delay (ms)</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      type="number"
                      value={writeDelayMs}
                      onChange={(e) => setWriteDelayMs(Number(e.target.value || 0))}
                      min={0}
                      max={5000}
                      disabled={working.ingest}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Batch Delay (ms)</label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      type="number"
                      value={batchDelayMs}
                      onChange={(e) => setBatchDelayMs(Number(e.target.value || 0))}
                      min={0}
                      max={20000}
                      disabled={working.ingest}
                    />
                  </div>

                  <div className="flex items-end gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={autoDedupOnWrite} onChange={(e) => setAutoDedupOnWrite(e.target.checked)} disabled={working.ingest} />
                      Auto-dedup on write
                    </label>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <div className="font-semibold text-slate-900 text-sm">Test Mode (optional)</div>
                  <div className="text-xs text-slate-600 mt-1">Run ingest against one specific camp site URL (uses testSchoolId for writes).</div>

                  <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Test Site URL</label>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={testSiteUrl}
                        onChange={(e) => setTestSiteUrl(e.target.value)}
                        disabled={working.ingest}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Test School ID</label>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={testSchoolId}
                        onChange={(e) => setTestSchoolId(e.target.value)}
                        disabled={working.ingest}
                        placeholder="Required if DryRun=false"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || working.ingest}>
                    {working.ingest ? "Running…" : "Run Ingest"}
                  </Button>
                  <Button onClick={promoteCampDemoToCamp} disabled={!selectedSportId || working.promote}>
                    {working.promote ? "Promoting…" : "Promote CampDemo → Camp"}
                  </Button>
                </div>
              </div>

              {/* Ops log */}
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900 text-sm">Console Log</div>
                  <Button onClick={() => setLogOps("")} disabled={anyWorking}>
                    Clear
                  </Button>
                </div>
                <pre className="mt-2 text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">{logOps || "—"}</pre>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="text-center">
          <div className="text-xs text-slate-500">
            Operator rule: fix the <b>source</b> (SchoolSportSite.camp_site_url) when multiple CampDemo rows are wrong for the same school.
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

