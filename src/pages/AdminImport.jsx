// src/pages/AdminImport.jsx
/* Generated handoff file: AdminImport.jsx
   Focus: ingest + quality filters + dedup + fix panel
   If you have additional AdminImport features (promote, seed editors), merge them back in. */

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";

/**
 * Fixes / adds:
 * - Rate-limit protection + batching controls for ingest writes (prevents 429 loops)
 * - Quality filter modes aligned to your Quality Counters naming (row + school level)
 * - Clickable registration links in the editor
 * - Camp name cleanup on write (pipe/paren/html junk)
 * - Active flag handling end-to-end (preserve on update, default true on create)
 * - Dedup sweep: deletes duplicate CampDemo rows sharing the same event_key (keeps best row)
 * - Fix panel always renders and supports camp_site_url fix + cleanup + re-ingest
 */

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
              <div className="text-sm text-slate-600 mt-2">Open DevTools Console for stack trace.</div>
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

/* ---------------- Helpers ---------------- */
const asArray = (x) => (Array.isArray(x) ? x : []);
const safeString = (x) => {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
};
const lc = (x) => String(x || "").toLowerCase().trim();
const safeNumber = (x) => {
  if (x == null) return null;
  if (typeof x === "string" && !x.trim()) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const truncate = (s, n = 600) => {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "…(truncated)" : str;
};
const toISODate = (x) => {
  if (!x) return null;
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.trim())) return x.trim();
  if (typeof x === "string") {
    const mdy = x.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) return `${mdy[3]}-${String(mdy[1]).padStart(2, "0")}-${String(mdy[2]).padStart(2, "0")}`;
  }
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const computeSeasonYearFootball = (startISO) => {
  if (!startISO) return null;
  const d = new Date(`${startISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
};
const simpleHash = (obj) => {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj ?? {});
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
};
const buildEventKey = ({ source_platform, program_id, start_date, link_url, source_url }) => {
  const platform = source_platform || "seed";
  const disc = link_url || source_url || "na";
  return `${platform}:${program_id}:${start_date || "na"}:${disc}`;
};
const looksLikeHtmlOrTableJunk = (s) => {
  const t = lc(s || "");
  return (
    t.includes("<") ||
    t.includes(">") ||
    t.includes('valign="') ||
    t.includes("valign='") ||
    t.includes("data-th=") ||
    t.startsWith("td valign=") ||
    t.startsWith("tr ")
  );
};
const stripHtmlish = (s) => {
  if (!s) return "";
  let x = String(s);
  x = x.replace(/<script[\s\S]*?<\/script>/gi, " ");
  x = x.replace(/<style[\s\S]*?<\/style>/gi, " ");
  x = x.replace(/<\/?[^>]+>/g, " ");
  return x.replace(/\s+/g, " ").trim();
};
const sanitizeCampNameForWrite = (name) => {
  const raw = safeString(name);
  if (!raw) return null;
  let s = looksLikeHtmlOrTableJunk(raw) ? stripHtmlish(raw) : raw;
  if (s.includes("|")) s = s.split("|")[0].trim();
  const p = s.indexOf("(");
  if (p > 0) s = s.slice(0, p).trim();
  return s.replace(/\s+/g, " ").trim() || null;
};
const needsPipeOrParenOrHtmlCleanup = (name) => {
  const raw = safeString(name);
  if (!raw) return false;
  const t = lc(raw);
  return t.includes("|") || t.includes("(") || looksLikeHtmlOrTableJunk(raw) || t.includes('valign="') || t.includes("data-th=");
};
const isBadCampName = (name) => {
  const t = lc(name || "");
  if (!t) return true;
  if (t === "register" || t === "register now" || t === "details" || t === "view details" || t === "camp") return true;
  if (/^\$?\s*\d{1,5}(\.\d{2})?\s*$/.test(String(name || "").trim())) return true;
  if (t.includes("as of fall")) return true;
  if (looksLikeHtmlOrTableJunk(name)) return true;
  return false;
};
const isMissingPrice = (row) => {
  const p = safeNumber(row?.price);
  const pmin = safeNumber(row?.price_min);
  const pmax = safeNumber(row?.price_max);
  return ![p, pmin, pmax].some((x) => x != null && x > 0);
};
const readActiveFlag = (row) => {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;
  const st = lc(row?.status);
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
};
const withActiveDefault = (payload, existingRow) => {
  const existingActive = existingRow ? readActiveFlag(existingRow) : null;
  const active =
    typeof payload?.active === "boolean" ? payload.active : typeof existingActive === "boolean" ? existingActive : true;
  return { ...payload, active };
};

async function entityList(Entity, whereObj) {
  const where = whereObj || {};
  if (typeof Entity?.filter === "function") return asArray(await Entity.filter(where));
  if (typeof Entity?.list === "function") {
    try {
      return asArray(await Entity.list({ where }));
    } catch {
      return asArray(await Entity.list(where));
    }
  }
  if (typeof Entity?.findMany === "function") {
    try {
      return asArray(await Entity.findMany({ where }));
    } catch {
      return asArray(await Entity.findMany(where));
    }
  }
  if (typeof Entity?.all === "function") return asArray(await Entity.all());
  throw new Error("Entity has no supported list method.");
}
async function tryDelete(Entity, id) {
  const fns = ["delete", "remove", "destroy"];
  for (const fn of fns) {
    try {
      if (typeof Entity?.[fn] === "function") {
        await Entity[fn](String(id));
        return true;
      }
    } catch {}
  }
  return false;
}
async function writeWithRetry(fn, { maxRetries = 7 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || e).toLowerCase();
      const isRate =
        msg.includes("rate limit") || msg.includes("rate-limit") || msg.includes("too many requests") || msg.includes("429");
      const isNet = msg.includes("network") || msg.includes("fetch") || msg.includes("timeout") || msg.includes("gateway");
      if (!isRate && !isNet) throw e;
      attempt += 1;
      if (attempt > maxRetries) throw e;
      const base = Math.min(8000, 400 * Math.pow(2, attempt));
      await sleep(base + Math.floor(Math.random() * 250));
    }
  }
}

/* ---------------- Quality vocab ---------------- */
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

const parseIsoOrNull = (x) => {
  const s = safeString(x);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isDueNow = (site) => {
  const now = new Date();
  const next = parseIsoOrNull(site?.next_crawl_at);
  return !next || next <= now;
};
const statusOf = (site) => safeString(site?.crawl_status) || "ready";
const normalizeSiteRow = (r) => ({
  id: r?.id ? String(r.id) : "",
  school_id: r?.school_id ? String(r.school_id) : null,
  sport_id: r?.sport_id ? String(r.sport_id) : null,
  camp_site_url: r?.camp_site_url ? String(r.camp_site_url) : null,
  active: typeof r?.active === "boolean" ? r.active : !!r?.active,
  crawl_status: statusOf(r),
  last_crawled_at: safeString(r?.last_crawled_at),
  next_crawl_at: safeString(r?.next_crawl_at),
  crawl_error: safeString(r?.crawl_error),
  last_crawl_run_id: safeString(r?.last_crawl_run_id),
  raw: r,
});

function AdminImportInner() {
  const nav = useNavigate();

  const SportEntity = base44?.entities ? (base44.entities.Sport || base44.entities.Sports) : null;
  const SchoolEntity = base44?.entities ? (base44.entities.School || base44.entities.Schools) : null;
  const SchoolSportSiteEntity = base44?.entities ? (base44.entities.SchoolSportSite || base44.entities.SchoolSportSites) : null;
  const CampDemoEntity = base44?.entities ? base44.entities.CampDemo : null;

  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  const [logCamps, setLogCamps] = useState("");
  const [logQuality, setLogQuality] = useState("");
  const [logDedup, setLogDedup] = useState("");
  const [logEditor, setLogEditor] = useState("");
  const [logCounters, setLogCounters] = useState("");

  const appendLog = (setter) => (line) => setter((prev) => (prev ? prev + "\n" + line : line));
  const logC = appendLog(setLogCamps);
  const logQ = appendLog(setLogQuality);
  const logD = appendLog(setLogDedup);
  const logE = appendLog(setLogEditor);
  const logK = appendLog(setLogCounters);

  const [campsWorking, setCampsWorking] = useState(false);
  const [qualityWorking, setQualityWorking] = useState(false);
  const [dedupWorking, setDedupWorking] = useState(false);
  const [editorWorking, setEditorWorking] = useState(false);
  const [countersWorking, setCountersWorking] = useState(false);

  // Ingest controls
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(25);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(10);
  const [campsMaxEvents, setCampsMaxEvents] = useState(300);
  const [fastMode, setFastMode] = useState(false);
  const [runBatches, setRunBatches] = useState(true);
  const [maxBatches, setMaxBatches] = useState(10);
  const [writeDelayMs, setWriteDelayMs] = useState(250);
  const [batchDelayMs, setBatchDelayMs] = useState(800);
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

  // Quality mode aligned to counters naming
  const [qualityMode, setQualityMode] = useState("schools_any_cleanup");

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

  const [siteCounters, setSiteCounters] = useState({
    active: 0,
    ready: 0,
    ok: 0,
    no_events: 0,
    error: 0,
    dueNow: 0,
    done: 0,
  });

  // School index for friendly label in editor
  const [schoolNameById, setSchoolNameById] = useState({});
  const loadSchoolIndex = async () => {
    if (!SchoolEntity) return;
    try {
      const rows = await entityList(SchoolEntity, {});
      const map = {};
      for (const r of rows) {
        const id = safeString(r?.id);
        const nm = safeString(r?.school_name) || safeString(r?.name) || safeString(r?.schoolName);
        if (id && nm) map[String(id)] = nm;
      }
      setSchoolNameById(map);
    } catch (e) {
      logE(`[SchoolIndex] ERROR: ${String(e?.message || e)}`);
    }
  };
  const schoolLabel = (id) => (id ? schoolNameById[String(id)] || "" : "");

  const loadSports = async () => {
    setSportsLoading(true);
    try {
      if (!SportEntity) throw new Error("Sport entity missing.");
      const rows = await entityList(SportEntity, {});
      const normalized = rows
        .map((r) => ({ id: r?.id ? String(r.id) : "", name: safeString(r?.sport_name) || safeString(r?.name) || safeString(r?.sportName) }))
        .filter((r) => r.id && r.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setSports(normalized);
      if (!selectedSportId && normalized.length) {
        setSelectedSportId(normalized[0].id);
        setSelectedSportName(normalized[0].name);
      } else if (selectedSportId) {
        const hit = normalized.find((x) => x.id === selectedSportId);
        if (hit) setSelectedSportName(hit.name);
      }
    } catch {
      setSports([]);
    } finally {
      setSportsLoading(false);
    }
  };

  useEffect(() => {
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSportId) return;
    loadSchoolIndex();
    refreshCrawlCounters();
    refreshQualityCounters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  const refreshCrawlCounters = async () => {
    const nowIso = new Date().toISOString();
    setCountersWorking(true);
    try {
      if (!selectedSportId) return;
      if (!SchoolSportSiteEntity) return;
      const rows = (await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true })).map(normalizeSiteRow);
      let ready = 0,
        ok = 0,
        no_events = 0,
        error = 0,
        dueNow = 0;
      for (const s of rows) {
        const st = statusOf(s);
        if (st === "ready") ready += 1;
        if (st === "ok") ok += 1;
        if (st === "no_events") no_events += 1;
        if (st === "error") error += 1;
        if (isDueNow(s)) dueNow += 1;
      }
      const active = rows.length;
      const done = ok + no_events + error;
      setSiteCounters({ active, ready, ok, no_events, error, dueNow, done });
      logK(`[Counters] Refreshed @ ${nowIso} | active=${active} done=${done} ready=${ready} ok=${ok} no_events=${no_events} error=${error} dueNow=${dueNow}`);
    } catch (e) {
      logK(`[Counters] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCountersWorking(false);
    }
  };

  const getQualitySchoolSets = async () => {
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

    const allSites = (await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true })).map(normalizeSiteRow);
    const allSchools = new Set(allSites.map((s) => s.school_id).filter(Boolean));

    const demos = await entityList(CampDemoEntity, { sport_id: selectedSportId });
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

    for (const [sid, rows] of bySchool.entries()) {
      let hasBad = false,
        hasFmt = false,
        hasPrice = false;
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
    for (const sid of allSchools.values()) if (!bySchool.has(sid)) noCampSchools.add(sid);

    const anyCleanupSchools = new Set([...badNameSchools, ...nameFormatSchools, ...missingPriceSchools, ...noCampSchools]);

    return { allSites, allSchools, bySchool, badNameSchools, nameFormatSchools, missingPriceSchools, noCampSchools, anyCleanupSchools };
  };

  const refreshQualityCounters = async ({ improvedThisRun = null } = {}) => {
    const nowIso = new Date().toISOString();
    setQualityWorking(true);
    try {
      if (!selectedSportId) return;
      if (!SchoolSportSiteEntity || !CampDemoEntity) return;

      const sets = await getQualitySchoolSets();

      let badNameRemaining = 0,
        nameFormatRemaining = 0,
        missingPriceRemaining = 0;
      for (const rows of sets.bySchool.values()) {
        for (const r of rows) {
          if (isBadCampName(r?.camp_name)) badNameRemaining += 1;
          if (needsPipeOrParenOrHtmlCleanup(r?.camp_name)) nameFormatRemaining += 1;
          if (isMissingPrice(r)) missingPriceRemaining += 1;
        }
      }
      const noCampsRemaining = sets.noCampSchools.size;
      const improved = improvedThisRun != null ? improvedThisRun : 0;

      const next = {
        badNameRemaining,
        nameFormatRemaining,
        missingPriceRemaining,
        noCampsRemaining,
        improvedThisRun: improved,
        schoolsNeedingBadNameFix: sets.badNameSchools.size,
        schoolsNeedingNameFormatFix: sets.nameFormatSchools.size,
        schoolsNeedingPriceFix: sets.missingPriceSchools.size,
        schoolsNeedingAnyCleanup: sets.anyCleanupSchools.size,
      };

      setQualityCounters(next);
      lastQualitySnapshotRef.current = { ...next };

      logQ(
        `[Quality] Refreshed @ ${nowIso} | ${QUALITY_VOCAB.bad_name}=${badNameRemaining} | ${QUALITY_VOCAB.name_format}=${nameFormatRemaining} | ${QUALITY_VOCAB.missing_price}=${missingPriceRemaining} | ${QUALITY_VOCAB.no_camps}=${noCampsRemaining} | ${QUALITY_VOCAB.schools_any_cleanup}=${sets.anyCleanupSchools.size} | ImprovedThisRun=${improved}`
      );
    } catch (e) {
      logQ(`[Quality] ERROR: ${String(e?.message || e)}`);
    } finally {
      setQualityWorking(false);
    }
  };

  const pickSitesByRerunMode = (sites) => {
    const arr = asArray(sites);
    if (rerunMode === "all") return arr;
    if (rerunMode === "error") return arr.filter((s) => statusOf(s) === "error");
    if (rerunMode === "no_events") return arr.filter((s) => statusOf(s) === "no_events");
    if (rerunMode === "ok") return arr.filter((s) => statusOf(s) === "ok");
    if (rerunMode === "ready") return arr.filter((s) => statusOf(s) === "ready");
    return arr.filter((s) => isDueNow(s));
  };
  const qualityPickSet = (sets) => {
    if (qualityMode === "schools_bad_name") return sets.badNameSchools;
    if (qualityMode === "schools_name_format") return sets.nameFormatSchools;
    if (qualityMode === "schools_missing_price") return sets.missingPriceSchools;
    if (qualityMode === "schools_any_cleanup") return sets.anyCleanupSchools;
    if (qualityMode === "no_camps") return sets.noCampSchools;
    return null;
  };
  const qualityFilterSites = (sites, sets) => {
    const arr = asArray(sites);
    if (qualityMode === "none") return arr;
    const set = qualityPickSet(sets);
    if (!set) return arr;
    return arr.filter((s) => s.school_id && set.has(String(s.school_id)));
  };

  const scoreRowForDedup = (r) => {
    let score = 0;
    if (safeString(r?.camp_name)) score += 2;
    if (safeString(r?.start_date)) score += 2;
    if (safeString(r?.link_url)) score += 2;
    if (safeString(r?.city)) score += 1;
    if (safeString(r?.state)) score += 1;
    if (!isMissingPrice(r)) score += 2;
    if (readActiveFlag(r)) score += 1;
    const ls = safeString(r?.last_seen_at);
    const t = ls ? new Date(ls).getTime() : 0;
    score += Math.max(0, Math.min(5, Math.floor(t / 1e12)));
    return score;
  };
  const dedupEventKeyGroup = async (rows, { dryRun }) => {
    const arr = asArray(rows).filter((x) => x?.id);
    if (arr.length <= 1) return { keptId: arr[0]?.id ? String(arr[0].id) : null, deleted: 0 };
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
  };
  const upsertCampDemoByEventKey = async (payload) => {
    if (!CampDemoEntity?.create || !CampDemoEntity?.update) throw new Error("CampDemo entity not available.");
    const key = payload?.event_key ? String(payload.event_key) : null;
    if (!key) throw new Error("Missing event_key");

    let existing = [];
    try {
      existing = await entityList(CampDemoEntity, { event_key: key });
    } catch {
      existing = [];
    }
    if (autoDedupOnWrite && asArray(existing).length > 1) {
      await dedupEventKeyGroup(existing, { dryRun: false });
      existing = await entityList(CampDemoEntity, { event_key: key });
    }

    const arr = asArray(existing);
    if (arr.length && arr[0]?.id) {
      await CampDemoEntity.update(String(arr[0].id), withActiveDefault(payload, arr[0]));
      return "updated";
    }
    await CampDemoEntity.create(withActiveDefault(payload, null));
    return "created";
  };

  const writeAcceptedEventsToCampDemo = async (accepted, runIso) => {
    const list = asArray(accepted || []);
    if (!list.length) return { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };

    let created = 0,
      updated = 0,
      skipped = 0,
      errors = 0,
      improved = 0;

    for (let i = 0; i < list.length; i++) {
      const a = list[i] || {};
      const school_id = safeString(a.school_id);
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
      const program_id = safeString(a.program_id) || `sportsusa:${lc(camp_name).replace(/[^a-z0-9]+/g, "-")}`;
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
          season_year,
          city: safeString(a.city),
          state: safeString(a.state),
          price: safeNumber(a.price),
          price_min: safeNumber(a.price_min),
          price_max: safeNumber(a.price_max),
        });

      const prevRows = await entityList(CampDemoEntity, { event_key }).catch(() => []);
      const prevHash = prevRows?.[0]?.content_hash ? String(prevRows[0].content_hash) : null;

      const price_best = safeNumber(a.price) ?? safeNumber(a.price_max) ?? safeNumber(a.price_min);

      const payload = {
        school_id,
        sport_id,
        camp_name,
        start_date,
        end_date: end_date || null,
        city: safeString(a.city) || null,
        state: safeString(a.state) || null,
        position_ids: asArray(a.position_ids).map(String),
        price: price_best,
        price_min: safeNumber(a.price_min),
        price_max: safeNumber(a.price_max),
        link_url: link_url || null,
        season_year,
        program_id,
        event_key,
        source_platform,
        source_url: source_url || null,
        last_seen_at: runIso,
        content_hash,
        active: typeof a.active === "boolean" ? a.active : undefined,
      };

      try {
        const result = await writeWithRetry(() => upsertCampDemoByEventKey(payload), { maxRetries: 7 });
        if (result === "created") created += 1;
        if (result === "updated") updated += 1;
        if ((prevHash && prevHash !== content_hash) || (!prevHash && result === "created")) improved += 1;
      } catch (e) {
        errors += 1;
        logC(`[Camps] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
      }

      if ((i + 1) % 25 === 0) logC(`[Camps] Write progress: ${i + 1}/${list.length}`);
      await sleep(Math.max(0, Number(writeDelayMs || 0)));
    }

    return { created, updated, skipped, errors, improved };
  };

  const updateCrawlStateForSites = async (siteIds, patch) => {
    if (!SchoolSportSiteEntity?.update) return { updated: 0, errors: 0 };
    const ids = asArray(siteIds).filter(Boolean);
    let updated = 0,
      errors = 0;
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
  };

  const normalizeAcceptedRowToFlat = (a) => {
    if (!a) return {};
    const e = a?.event && typeof a.event === "object" ? a.event : a;
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
      price_min: safeNumber(e.price_min),
      price_max: safeNumber(e.price_max),
      link_url: safeString(e.link_url) || safeString(e.registration_url) || safeString(e.source_url),
      season_year: safeNumber(e.season_year),
      program_id: safeString(e.program_id),
      event_key: safeString(e.event_key),
      source_platform: safeString(e.source_platform),
      source_url: safeString(e.source_url),
      content_hash: safeString(e.content_hash),
      active: typeof e.active === "boolean" ? e.active : undefined,
    };
  };

  const runOneIngestCall = async ({ runIso, runId, batchSites }) => {
    const batch = asArray(batchSites);
    logC(`[Camps] Calling /functions/sportsUSAIngestCamps (sites=${batch.length})`);

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
        sites: batch.map((r) => ({ id: r.id, school_id: r.school_id, sport_id: r.sport_id, camp_site_url: r.camp_site_url })),
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
      logC(`[Camps] Function ERROR (HTTP ${res.status})`);
      if (data) logC(truncate(JSON.stringify(data || {}, null, 2), 800));
      if (!data && rawText) logC(`[Camps] Raw response: ${truncate(rawText, 500)}`);
      return { created: 0, updated: 0, skipped: 0, errors: 1, improved: 0 };
    }

    const accepted = asArray(data?.accepted || []).map(normalizeAcceptedRowToFlat);
    logC(`[Camps] Accepted events returned: ${accepted.length}`);

    // crawl-state update
    if (!campsDryRun) {
      const outcome = accepted.length ? "ok" : "no_events";
      const patch = {
        crawl_status: outcome,
        crawl_error: null,
        last_crawled_at: runIso,
        next_crawl_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        last_crawl_run_id: runId,
        last_seen_at: runIso,
      };
      const upd = await updateCrawlStateForSites(batch.map((b) => b.id).filter(Boolean), patch);
      logC(`[Camps] Updated crawl-state: ${upd.updated} (${outcome}) errors=${upd.errors}`);
    }

    if (campsDryRun) {
      logC(`[Camps] DryRun=true: no CampDemo writes performed.`);
      return { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };
    }

    return await writeAcceptedEventsToCampDemo(accepted, runIso);
  };

  const runSportsUSACampsIngest = async () => {
    const runIso = new Date().toISOString();
    const runId = `run_${runIso.replace(/[:.]/g, "").slice(0, 15)}`;
    setCampsWorking(true);
    setLogCamps("");

    logC(`[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
    logC(`[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents} | fastMode=${fastMode ? "true" : "false"}`);
    logC(`[Camps] RerunMode=${rerunMode} | QualityMode=${qualityMode}`);

    try {
      if (!selectedSportId) return logC("[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity || !CampDemoEntity) return logC("[Camps] ERROR: Missing entities.");

      if (!lastQualitySnapshotRef.current) await refreshQualityCounters();

      const sets = await getQualitySchoolSets();
      const allSites = sets.allSites;

      const rerunFiltered = pickSitesByRerunMode(allSites);
      const qualityFiltered = qualityMode === "none" ? rerunFiltered : qualityFilterSites(rerunFiltered, sets);

      logC(`[Camps] Loaded sites(active): ${allSites.length}`);
      logC(`[Camps] Rerun filtered: ${rerunFiltered.length}`);
      logC(`[Camps] Quality filtered: ${qualityFiltered.length}`);

      if (!qualityFiltered.length) {
        logC(`[Camps] Nothing to do for this selection.`);
        return;
      }

      const maxSitesPerBatch = Math.max(1, Number(campsMaxSites || 25));
      const totalSites = qualityFiltered.length;
      const totalPossibleBatches = Math.ceil(totalSites / maxSitesPerBatch);
      const batchesToRun = runBatches ? Math.min(totalPossibleBatches, Math.max(1, Number(maxBatches || 1))) : 1;

      let totals = { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };

      for (let b = 0; b < batchesToRun; b++) {
        const start = b * maxSitesPerBatch;
        const end = Math.min(totalSites, start + maxSitesPerBatch);
        const batchSites = qualityFiltered.slice(start, end);

        logC("");
        logC(`[Camps] ---- Batch ${b + 1} ---- size=${batchSites.length}`);

        const res = await runOneIngestCall({ runIso, runId, batchSites });
        totals = {
          created: totals.created + res.created,
          updated: totals.updated + res.updated,
          skipped: totals.skipped + res.skipped,
          errors: totals.errors + res.errors,
          improved: totals.improved + res.improved,
        };

        logC(`[Camps] Batch ${b + 1} done. created=${res.created} updated=${res.updated} skipped=${res.skipped} errors=${res.errors} improved=${res.improved}`);
        if (b < batchesToRun - 1) await sleep(Math.max(0, Number(batchDelayMs || 0)));
      }

      logC(`[Camps] DONE. totals: created=${totals.created} updated=${totals.updated} skipped=${totals.skipped} errors=${totals.errors} improved=${totals.improved}`);

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
          logQ(`[Quality] ImprovedThisRun computed: ${improved} (BadName -${dBad}, NameFormat -${dFmt}, MissingPrice -${dPrice}, NoCamps -${dNo})`);
        }
      } else {
        await refreshQualityCounters({ improvedThisRun: 0 });
      }
    } catch (e) {
      logC(`[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  };

  // Dedup sweep
  const [dedupDryRun, setDedupDryRun] = useState(true);
  const [dedupLimit, setDedupLimit] = useState(20000);

  const runDedupSweep = async () => {
    const runIso = new Date().toISOString();
    setDedupWorking(true);
    setLogDedup("");
    try {
      if (!selectedSportId) return logD("[Dedup] ERROR: Select a sport first.");
      if (!CampDemoEntity) return logD("[Dedup] ERROR: CampDemo entity not available.");

      logD(`[Dedup] Starting @ ${runIso} | dryRun=${dedupDryRun ? "true" : "false"} | limit=${dedupLimit}`);

      const all = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const rows = asArray(all).slice(0, Math.max(100, Number(dedupLimit || 20000)));

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
      for (const [k, arr] of groups.entries()) if (arr.length > 1) dupKeys.push([k, arr.length]);
      dupKeys.sort((a, b) => b[1] - a[1]);

      logD(`[Dedup] event_key missing on ${missingKey} rows.`);
      logD(`[Dedup] Duplicate event_key groups: ${dupKeys.length}`);

      let rowsDeleted = 0;
      for (let i = 0; i < dupKeys.length; i++) {
        const [k] = dupKeys[i];
        const arr = groups.get(k);
        const res = await dedupEventKeyGroup(arr, { dryRun: !!dedupDryRun });
        rowsDeleted += res.deleted;
        if ((i + 1) % 25 === 0) logD(`[Dedup] Progress groups: ${i + 1}/${dupKeys.length} | deleted=${rowsDeleted}`);
        await sleep(dedupDryRun ? 5 : 80);
      }

      logD(`[Dedup] DONE. duplicate_groups=${dupKeys.length} rows_deleted=${rowsDeleted}`);
      if (!dedupDryRun) await refreshQualityCounters({ improvedThisRun: 0 });
    } catch (e) {
      logD(`[Dedup] ERROR: ${String(e?.message || e)}`);
    } finally {
      setDedupWorking(false);
    }
  };

  // Editor: No Camps Remaining list + Fix panel
  const [editorLimit, setEditorLimit] = useState(200);
  const [noCampSites, setNoCampSites] = useState([]);

  const [fixPanelOpen, setFixPanelOpen] = useState(false);
  const [fixSchoolId, setFixSchoolId] = useState("");
  const [fixSiteRow, setFixSiteRow] = useState(null);
  const [fixCampSiteUrl, setFixCampSiteUrl] = useState("");
  const [fixDryRun, setFixDryRun] = useState(true);
  const [fixWorking, setFixWorking] = useState(false);

  const loadNoCampSites = async () => {
    setEditorWorking(true);
    setLogEditor("");
    setNoCampSites([]);
    try {
      if (!selectedSportId) return logE("[Editor] Select a sport first.");
      if (!SchoolSportSiteEntity || !CampDemoEntity) return logE("[Editor] Missing entities.");

      const sets = await getQualitySchoolSets();
      const sites = asArray(sets.allSites)
        .filter((s) => s.school_id && sets.noCampSchools.has(String(s.school_id)))
        .slice(0, Math.max(10, Number(editorLimit || 200)));

      setNoCampSites(sites);
      logE(`[Editor] Loaded ${QUALITY_VOCAB.no_camps}: ${sites.length} sites`);
    } catch (e) {
      logE(`[Editor] ERROR: ${String(e?.message || e)}`);
    } finally {
      setEditorWorking(false);
    }
  };

  const openFixPanelForSchoolId = async (schoolId) => {
    const sid = safeString(schoolId);
    if (!sid) return;
    if (!selectedSportId) return logE("[Fix] Select a sport first.");
    if (!SchoolSportSiteEntity) return logE("[Fix] SchoolSportSite entity not available.");

    setFixPanelOpen(true);
    setFixSchoolId(String(sid));
    setFixSiteRow(null);
    setFixCampSiteUrl("");

    try {
      const sites = await entityList(SchoolSportSiteEntity, { school_id: String(sid), sport_id: selectedSportId }).catch(() => []);
      const hit = asArray(sites)[0] || null;
      setFixSiteRow(hit);
      setFixCampSiteUrl(safeString(hit?.camp_site_url) || "");
      logE(`[Fix] Loaded SchoolSportSite: ${hit?.id ? `site_id=${hit.id}` : "NOT FOUND"}`);
    } catch (e) {
      logE(`[Fix] ERROR loading SchoolSportSite: ${String(e?.message || e)}`);
    }
  };

  const saveFixCampSiteUrlOnly = async () => {
    if (!fixSiteRow?.id) return logE("[Fix] Cannot save: SchoolSportSite not loaded.");
    if (!SchoolSportSiteEntity?.update) return logE("[Fix] SchoolSportSite.update not available.");
    const url = safeString(fixCampSiteUrl);
    if (!url) return logE("[Fix] Provide a camp_site_url first.");

    setFixWorking(true);
    try {
      await writeWithRetry(() => SchoolSportSiteEntity.update(String(fixSiteRow.id), { camp_site_url: url }), { maxRetries: 7 });
      logE(`[Fix] Saved camp_site_url for site_id=${fixSiteRow.id}`);
    } catch (e) {
      logE(`[Fix] SAVE FAILED: ${String(e?.message || e)}`);
    } finally {
      setFixWorking(false);
    }
  };

  const cleanupCampDemoForFixSchool = async ({ dryRun }) => {
    const sid = safeString(fixSchoolId);
    if (!sid) return { wouldDelete: 0, deleted: 0 };
    const rows = await entityList(CampDemoEntity, { school_id: String(sid), sport_id: selectedSportId }).catch(() => []);
    const wouldDelete = rows.length;
    if (dryRun) {
      logE(`[Fix] DryRun: would delete CampDemo rows for school_id=${sid}: ${wouldDelete}`);
      return { wouldDelete, deleted: 0 };
    }
    let deleted = 0;
    for (const r of rows) {
      const ok = await writeWithRetry(() => tryDelete(CampDemoEntity, String(r.id)), { maxRetries: 7 }).catch(() => false);
      if (ok) deleted += 1;
      await sleep(Math.max(0, Number(writeDelayMs || 0)));
    }
    logE(`[Fix] Deleted CampDemo rows for school_id=${sid}: ${deleted}/${wouldDelete}`);
    return { wouldDelete, deleted };
  };

  const reingestForFixSchool = async ({ dryRun }) => {
    const sid = safeString(fixSchoolId);
    const url = safeString(fixCampSiteUrl);
    if (!sid || !url) return { created: 0, updated: 0, skipped: 0, errors: 1, improved: 0 };

    const runIso = new Date().toISOString();
    logE(`[Fix] Re-ingest start. dryRun=${dryRun ? "true" : "false"} school_id=${sid}`);

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
        testSchoolId: sid,
      }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      const t = await res.text().catch(() => null);
      logE(`[Fix] Function returned non-JSON. HTTP ${res.status} ${truncate(t || "", 300)}`);
      return { created: 0, updated: 0, skipped: 0, errors: 1, improved: 0 };
    }

    if (!res.ok) {
      logE(`[Fix] Function ERROR (HTTP ${res.status})`);
      logE(truncate(JSON.stringify(data || {}, null, 2), 800));
      return { created: 0, updated: 0, skipped: 0, errors: 1, improved: 0 };
    }

    const accepted = asArray(data?.accepted || []).map(normalizeAcceptedRowToFlat);
    logE(`[Fix] Accepted events returned: ${accepted.length}`);

    if (dryRun) {
      logE(`[Fix] DryRun=true: no writes performed.`);
      return { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };
    }

    const wr = await writeAcceptedEventsToCampDemo(accepted, runIso);
    logE(`[Fix] Re-ingest writes done. created=${wr.created} updated=${wr.updated} skipped=${wr.skipped} errors=${wr.errors} improved=${wr.improved}`);
    return wr;
  };

  const fixSchoolSiteThenCleanThenReingest = async () => {
    const sid = safeString(fixSchoolId);
    const url = safeString(fixCampSiteUrl);
    if (!sid || !url) return logE("[Fix] Missing school_id or camp_site_url.");
    setFixWorking(true);
    try {
      await saveFixCampSiteUrlOnly();
      await cleanupCampDemoForFixSchool({ dryRun: !!fixDryRun });
      await reingestForFixSchool({ dryRun: !!fixDryRun });
      if (!fixDryRun) {
        await refreshQualityCounters({ improvedThisRun: 0 });
        await loadNoCampSites();
      }
    } catch (e) {
      logE(`[Fix] ERROR: ${String(e?.message || e)}`);
    } finally {
      setFixWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">Admin Import</div>
            <div className="text-sm text-slate-600">Ingest targeting + quality filters + dedup + fix panel.</div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => nav("/Workspace")}>Back to Workspace</Button>
            <Button onClick={() => nav("/Home")}>Home</Button>
          </div>
        </div>

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
                  setSelectedSportName(hit?.name || "");
                }}
                disabled={sportsLoading || campsWorking}
              >
                <option value="">Select…</option>
                {sports.map((sx) => (
                  <option key={sx.id} value={sx.id}>
                    {sx.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <Button onClick={loadSports} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button onClick={refreshCrawlCounters} disabled={countersWorking || !selectedSportId}>
                {countersWorking ? "Refreshing…" : "Refresh Crawl Counters"}
              </Button>
              <Button onClick={() => refreshQualityCounters()} disabled={qualityWorking || !selectedSportId}>
                {qualityWorking ? "Refreshing…" : "Refresh Quality Counters"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="font-semibold text-slate-900">2) Crawl Counters</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">Active Sites</div>
                <div className="text-lg font-semibold">{siteCounters.active}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">Done</div>
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
            </div>
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">Counters Log</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-44">{logCounters || "—"}</pre>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-semibold text-slate-900">3) Quality Counters</div>
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
            </div>
            <div className="mt-2 rounded-lg border border-slate-200 p-2">
              <div className="text-xs text-slate-500">Improved This Run</div>
              <div className="text-lg font-semibold">{qualityCounters.improvedThisRun}</div>
            </div>
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">Quality Log</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-44">{logQuality || "—"}</pre>
            </div>
          </Card>
        </div>

        <Card className="p-4">
          <div className="font-semibold text-slate-900">4) Ingest Camps (SportsUSA)</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={campsDryRun} onChange={(e) => setCampsDryRun(e.target.checked)} disabled={campsWorking} />
              <span className="text-sm text-slate-700">Dry Run</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun Mode</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={rerunMode} onChange={(e) => setRerunMode(e.target.value)}>
                {RERUN_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quality Mode</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={qualityMode} onChange={(e) => setQualityMode(e.target.value)}>
                <option value="none">No quality filter</option>
                <option value="schools_any_cleanup">{QUALITY_VOCAB.schools_any_cleanup}</option>
                <option value="schools_name_format">{QUALITY_VOCAB.schools_name_format}</option>
                <option value="schools_bad_name">{QUALITY_VOCAB.schools_bad_name}</option>
                <option value="schools_missing_price">{QUALITY_VOCAB.schools_missing_price}</option>
                <option value="no_camps">{QUALITY_VOCAB.no_camps}</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking}>
                {campsWorking ? "Running…" : "Run Ingest"}
              </Button>
              <Button onClick={() => setLogCamps("")} disabled={campsWorking}>
                Clear Log
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites per batch</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxSites} onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max regs per site</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxRegsPerSite} onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxEvents} onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} />
              <span className="text-sm text-slate-700">fastMode</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={runBatches} onChange={(e) => setRunBatches(e.target.checked)} />
              <span className="text-sm text-slate-700">Run batches</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max batches per click</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={maxBatches} onChange={(e) => setMaxBatches(Number(e.target.value || 0))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={writeDelayMs} onChange={(e) => setWriteDelayMs(Number(e.target.value || 0))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={batchDelayMs} onChange={(e) => setBatchDelayMs(Number(e.target.value || 0))} />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={autoDedupOnWrite} onChange={(e) => setAutoDedupOnWrite(e.target.checked)} />
            <span className="text-sm text-slate-700">Auto dedup on write (same event_key)</span>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Ingest Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-72">{logCamps || "—"}</pre>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-semibold text-slate-900">5) Dedup Sweep (CampDemo)</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={dedupDryRun} onChange={(e) => setDedupDryRun(e.target.checked)} disabled={dedupWorking} />
              <span className="text-sm text-slate-700">Dry Run</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit rows scanned</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={dedupLimit} onChange={(e) => setDedupLimit(Number(e.target.value || 0))} />
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
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logDedup || "—"}</pre>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-semibold text-slate-900">6) No Camps Remaining (Fix workflow)</div>
          <div className="text-sm text-slate-600 mt-1">Lists schools with no CampDemo rows. Fix camp_site_url, cleanup, then re-ingest.</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={editorLimit} onChange={(e) => setEditorLimit(Number(e.target.value || 0))} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={loadNoCampSites} disabled={!selectedSportId || editorWorking}>
                {editorWorking ? "Loading…" : "Load No Camps"}
              </Button>
              <Button onClick={() => setLogEditor("")} disabled={editorWorking}>
                Clear Log
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="p-2 border-b border-slate-200">School</th>
                  <th className="p-2 border-b border-slate-200">school_id</th>
                  <th className="p-2 border-b border-slate-200">site_id</th>
                  <th className="p-2 border-b border-slate-200">camp_site_url</th>
                  <th className="p-2 border-b border-slate-200">crawl_status</th>
                  <th className="p-2 border-b border-slate-200 w-44">Actions</th>
                </tr>
              </thead>
              <tbody>
                {noCampSites.length ? (
                  noCampSites.map((s) => (
                    <tr key={String(s.id)} className="border-b border-slate-100">
                      <td className="p-2">{schoolLabel(s.school_id) || "—"}</td>
                      <td className="p-2">{String(s.school_id || "")}</td>
                      <td className="p-2">{String(s.id || "")}</td>
                      <td className="p-2">
                        <a className="text-blue-600 underline" href={s.camp_site_url || "#"} target="_blank" rel="noreferrer">
                          {truncate(String(s.camp_site_url || ""), 80)}
                        </a>
                      </td>
                      <td className="p-2">{String(s.crawl_status || "")}</td>
                      <td className="p-2">
                        <Button onClick={() => openFixPanelForSchoolId(s.school_id)} disabled={fixWorking}>
                          Fix camp_site_url
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-3 text-slate-500">
                      {selectedSportId ? (editorWorking ? "Loading…" : "No rows loaded yet. Click Load No Camps.") : "Select a sport first."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {fixPanelOpen ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-semibold text-slate-900">Fix School Camp Page (SchoolSportSite)</div>
                  <div className="text-xs text-slate-600 mt-1">Updates camp_site_url, deletes that school’s CampDemo rows, then re-ingests from corrected page.</div>
                </div>
                <Button
                  onClick={() => {
                    setFixPanelOpen(false);
                    setFixSiteRow(null);
                    setFixCampSiteUrl("");
                    setFixSchoolId("");
                  }}
                  disabled={fixWorking}
                >
                  Close
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700">school_id</div>
                  <div className="text-sm text-slate-800">{fixSchoolId ? `${schoolLabel(fixSchoolId) || "—"} (${fixSchoolId})` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700">SchoolSportSite id</div>
                  <div className="text-sm text-slate-800">{fixSiteRow?.id ? String(fixSiteRow.id) : "—"}</div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">camp_site_url</label>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={fixCampSiteUrl} onChange={(e) => setFixCampSiteUrl(e.target.value)} />
                  {safeString(fixCampSiteUrl) ? (
                    <a className="text-xs text-blue-600 underline break-all" href={fixCampSiteUrl} target="_blank" rel="noreferrer">
                      Open camp_site_url
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!fixDryRun} onChange={(e) => setFixDryRun(e.target.checked)} disabled={fixWorking} />
                  Dry Run
                </label>
                <Button onClick={saveFixCampSiteUrlOnly} disabled={fixWorking || !fixSiteRow?.id || !safeString(fixCampSiteUrl)}>
                  Save camp_site_url
                </Button>
                <Button onClick={() => cleanupCampDemoForFixSchool({ dryRun: true })} disabled={fixWorking || !fixSchoolId}>
                  Preview Cleanup
                </Button>
                <Button onClick={fixSchoolSiteThenCleanThenReingest} disabled={fixWorking || !fixSchoolId || !safeString(fixCampSiteUrl)}>
                  {fixWorking ? "Working…" : "Fix + Clean + Re-ingest"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Editor Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logEditor || "—"}</pre>
          </div>
        </Card>

        <div className="text-center text-xs text-slate-500">Reminder: to hide inactive camps in the app, list queries must filter for <b>active === true</b>.</div>
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
