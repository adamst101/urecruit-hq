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

// ✅ null/"" should stay null, not become 0
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
    active: typeof r && typeof r.active === "boolean" ? r.active : !!(r && r.active),
    crawl_status: statusOf(r),
    last_crawled_at: safeString(r && r.last_crawled_at),
    next_crawl_at: safeString(r && r.next_crawl_at),
    crawl_error: safeString(r && r.crawl_error),
    last_crawl_run_id: safeString(r && r.last_crawl_run_id),
    raw: r,
  };
}

/* ----------------------------
   ✅ Camp quality helpers (for review)
----------------------------- */
function isMoneyLikeName(name) {
  const t = safeString(name);
  if (!t) return false;
  return /^\s*\$\s*\d/.test(t) || /^\s*\d+\.\d{2}\s*$/.test(t);
}

function isBadName(name) {
  const t = lc(name || "");
  if (!t) return true;
  if (t === "register") return true;
  if (t === "details") return true;
  if (t === "view details") return true;
  if (t === "view detail") return true;
  if (t === "register now") return true;
  if (t === "camp") return true;
  if (isMoneyLikeName(name)) return true;
  return false;
}

function isMissingPriceRow(r) {
  const p = safeNumber(r && r.price);
  const pmin = safeNumber(r && r.price_min);
  const pmax = safeNumber(r && r.price_max);

  const pZeroOrNull = p == null || p === 0;
  const minZeroOrNull = pmin == null || pmin === 0;
  const maxZeroOrNull = pmax == null || pmax === 0;

  return pZeroOrNull && minZeroOrNull && maxZeroOrNull;
}

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
  const [logReview, setLogReview] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "positions") setLogPositions(add);
    if (which === "counters") setLogCounters(add);
    if (which === "review") setLogReview(add);
  }

  /* ----------------------------
     Work flags
  ----------------------------- */
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  const [campsWorking, setCampsWorking] = useState(false);
  const [promoteWorking, setPromoteWorking] = useState(false);
  const [seedWorking, setSeedWorking] = useState(false);
  const [countersWorking, setCountersWorking] = useState(false);
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

  useEffect(() => {
    if (!selectedSportId) return;
    refreshCrawlCounters();
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
     Positions manager
  ----------------------------- */
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsEdit, setPositionsEdit] = useState({});
  const [positionAddCode, setPositionAddCode] = useState("");
  const [positionAddName, setPositionAddName] = useState("");
  const [positionAddWorking, setPositionAddWorking] = useState(false);
  const [positionSaveWorking, setPositionSaveWorking] = useState(false);
  const [positionDeleteWorking, setPositionDeleteWorking] = useState("");

  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

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

  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSASiteUrl(guess);
  }, [selectedSportName]);

  /* ----------------------------
     Positions: load per sport
  ----------------------------- */
  async function loadPositionsForSport(sportId) {
    if (!PositionEntity || !sportId) {
      setPositions([]);
      setPositionsEdit({});
      return;
    }

    setPositionsLoading(true);
    try {
      const rows = await entityList(PositionEntity, { sport_id: sportId });
      const normalized = asArray(rows)
        .map((r) => ({
          id: r && r.id ? String(r.id) : "",
          code: String(r && r.position_code ? r.position_code : "").trim(),
          name: String(r && r.position_name ? r.position_name : "").trim(),
          raw: r,
        }))
        .filter((p) => p.id);

      normalized.sort((a, b) => (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || ""));

      setPositions(normalized);

      const nextEdit = {};
      for (const p of normalized) nextEdit[p.id] = { code: p.code, name: p.name };
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
      await loadPositionsForSport(selectedSportId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  async function upsertPositionBySportAndCode({ sportId, code, name }) {
    if (!PositionEntity || !PositionEntity.create || !PositionEntity.update) {
      throw new Error("Position entity not available (expected entities.Position).");
    }

    const position_code = String(code || "").trim().toUpperCase();
    const position_name = String(name || "").trim();

    if (!sportId) throw new Error("Missing sport_id for Position upsert.");
    if (!position_code) throw new Error("Missing position_code for Position upsert.");
    if (!position_name) throw new Error("Missing position_name for Position upsert.");

    let existing = [];
    try {
      existing = await entityList(PositionEntity, { sport_id: sportId });
    } catch {
      existing = [];
    }

    const hit = asArray(existing).find((r) => String(r && r.position_code ? r.position_code : "").trim().toUpperCase() === position_code);

    const payload = { sport_id: sportId, position_code, position_name };

    if (hit && hit.id) {
      await PositionEntity.update(String(hit.id), payload);
      return "updated";
    }

    await PositionEntity.create(payload);
    return "created";
  }

  async function seedPositionsForSport() {
    const runIso = new Date().toISOString();
    setSeedWorking(true);
    appendLog("positions", `[Positions] Starting: Seed Positions (${selectedSportName}) @ ${runIso}`);

    try {
      if (!selectedSportId) {
        appendLog("positions", "[Positions] ERROR: Select a sport first.");
        return;
      }

      const list = seedListForSelectedSport;
      if (!list.length) {
        appendLog("positions", `[Positions] ERROR: No default seed list for "${selectedSportName}".`);
        return;
      }

      appendLog("positions", `[Positions] Seed rows: ${list.length}`);

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        try {
          const result = await upsertPositionBySportAndCode({
            sportId: selectedSportId,
            code: row.position_code,
            name: row.position_name,
          });
          if (result === "created") created += 1;
          if (result === "updated") updated += 1;
        } catch (e) {
          errors += 1;
          appendLog("positions", `[Positions] ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`);
        }
        if ((i + 1) % 10 === 0) appendLog("positions", `[Positions] Progress: ${i + 1}/${list.length}`);
        await sleep(25);
      }

      appendLog("positions", `[Positions] Done. created=${created} updated=${updated} errors=${errors}`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setSeedWorking(false);
    }
  }

  async function addPosition() {
    if (!PositionEntity || !PositionEntity.create) {
      appendLog("positions", "[Positions] ERROR: Position entity not available for create.");
      return;
    }
    if (!selectedSportId) return appendLog("positions", "[Positions] ERROR: Select a sport first.");

    const code = safeString(positionAddCode);
    const name = safeString(positionAddName);

    if (!code) return appendLog("positions", "[Positions] ERROR: Position code is required.");
    if (!name) return appendLog("positions", "[Positions] ERROR: Position name is required.");

    setPositionAddWorking(true);
    try {
      const result = await upsertPositionBySportAndCode({
        sportId: selectedSportId,
        code: code.toUpperCase(),
        name: name,
      });
      appendLog("positions", result === "created" ? `[Positions] Created ${code.toUpperCase()}` : `[Positions] Updated ${code.toUpperCase()}`);
      setPositionAddCode("");
      setPositionAddName("");
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendLog("positions", `[Positions] ERROR add: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setPositionAddWorking(false);
    }
  }

  async function savePositionRow(positionId) {
    if (!PositionEntity || !PositionEntity.update) {
      appendLog("positions", "[Positions] ERROR: Position entity not available for update.");
      return;
    }

    const row = positionsEdit && positionsEdit[positionId] ? positionsEdit[positionId] : null;
    if (!row) return;

    const code = safeString(row.code);
    const name = safeString(row.name);

    if (!selectedSportId) return appendLog("positions", "[Positions] ERROR: Select a sport first.");
    if (!code) return appendLog("positions", "[Positions] ERROR: Position code is required.");
    if (!name) return appendLog("positions", "[Positions] ERROR: Position name is required.");

    setPositionSaveWorking(true);
    try {
      await PositionEntity.update(String(positionId), {
        sport_id: selectedSportId,
        position_code: code.toUpperCase(),
        position_name: name,
      });
      appendLog("positions", `[Positions] Saved: ${code.toUpperCase()}`);
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendLog("positions", `[Positions] FAILED save: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setPositionSaveWorking(false);
    }
  }

  async function deletePosition(positionId) {
    if (!positionId) return;
    if (!PositionEntity) {
      appendLog("positions", "[Positions] ERROR: Position entity missing.");
      return;
    }

    setPositionDeleteWorking(positionId);
    try {
      const ok = await tryDelete(PositionEntity, positionId);
      appendLog("positions", ok ? `[Positions] Deleted: ${positionId}` : `[Positions] FAILED delete: ${positionId}`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setPositionDeleteWorking("");
    }
  }

  /* ----------------------------
     SportsUSA Seed Schools (unchanged)
  ----------------------------- */
  async function upsertSchoolBySourceKey({ school_name, logo_url, source_key, source_school_url }) {
    if (!SchoolEntity || !SchoolEntity.create || !SchoolEntity.update) {
      throw new Error("School entity not available (expected entities.School).");
    }

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

    if (existing.length && existing[0] && existing[0].id) {
      await SchoolEntity.update(String(existing[0].id), payload);
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await SchoolEntity.create(payload);
    const newId = created && created.id ? String(created.id) : null;
    return { id: newId, mode: "created" };
  }

  async function upsertSchoolSportSiteByKey({ school_id, sport_id, camp_site_url, logo_url, source_key }) {
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.create || !SchoolSportSiteEntity.update) {
      throw new Error("SchoolSportSite entity not available (expected entities.SchoolSportSite).");
    }

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

    if (existing.length && existing[0] && existing[0].id) {
      await SchoolSportSiteEntity.update(String(existing[0].id), payload);
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await SchoolSportSiteEntity.create(payload);
    const newId = created && created.id ? String(created.id) : null;
    return { id: newId, mode: "created" };
  }

  async function runSportsUSASeedSchools() {
    const runIso = new Date().toISOString();
    setSportsUSAWorking(true);
    setLogSportsUSA("");

    appendLog("sportsusa", `[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName}) @ ${runIso}`);
    appendLog("sportsusa", `[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);

    try {
      if (!selectedSportId) {
        appendLog("sportsusa", "[SportsUSA] ERROR: Select a sport first.");
        return;
      }
      const siteUrl = safeString(sportsUSASiteUrl);
      if (!siteUrl) {
        appendLog("sportsusa", "[SportsUSA] ERROR: Missing SportsUSA directory site URL.");
        return;
      }
      if (!SchoolEntity) {
        appendLog("sportsusa", "[SportsUSA] ERROR: School entity not available.");
        return;
      }
      if (!SchoolSportSiteEntity) {
        appendLog("sportsusa", "[SportsUSA] ERROR: SchoolSportSite entity not available.");
        return;
      }

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
        appendLog("sportsusa", `[SportsUSA] SportsUSA function ERROR (HTTP ${res.status})`);
        if (data) appendLog("sportsusa", JSON.stringify(data || {}, null, 2));
        if (!data && rawText) appendLog("sportsusa", `[SportsUSA] Raw response (first 500 chars): ${truncate(rawText, 500)}`);
        appendLog("sportsusa", "[SportsUSA] NOTE: Verify your function name is EXACTLY sportsUSASeedSchools.js");
        return;
      }

      if (!data) {
        appendLog("sportsusa", `[SportsUSA] WARNING: Response was not JSON. HTTP ${res.status}`);
        if (rawText) appendLog("sportsusa", `[SportsUSA] Raw response (first 500 chars): ${truncate(rawText, 500)}`);
        return;
      }

      const schools = asArray(data && data.schools ? data.schools : []);
      appendLog(
        "sportsusa",
        `[SportsUSA] SportsUSA fetched: schools_found=${schools.length} | http=${data && data.stats && data.stats.http ? data.stats.http : res.status}`
      );

      const sample = schools.slice(0, 3);
      if (sample.length) {
        appendLog("sportsusa", `[SportsUSA] SportsUSA sample (first ${sample.length}):`);
        for (let i = 0; i < sample.length; i++) {
          appendLog(
            "sportsusa",
            `- name="${sample[i].school_name || ""}" | logo="${sample[i].logo_url || ""}" | view="${sample[i].view_site_url || ""}"`
          );
        }
      }

      if (sportsUSADryRun) {
        appendLog("sportsusa", "[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      appendLog("sportsusa", `[SportsUSA] Writing ${schools.length} rows to School + SchoolSportSite…`);

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
          appendLog("sportsusa", `[SportsUSA] ERROR row #${i + 1}: ${String(e && e.message ? e.message : e)}`);
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
        `[SportsUSA] Writes done. Schools: created=${schoolsCreated} updated=${schoolsUpdated} | Sites: created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`
      );

      await refreshCrawlCounters();
    } catch (e) {
      appendLog("sportsusa", `[SportsUSA] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Camps ingest (kept as-is here)
     (You already have your batch runner + quality modes in your current file.
     If you want, paste your current Camps ingest section and I'll merge cleanly.)
  ----------------------------- */

  /* ----------------------------
     Promote CampDemo -> Camp (kept as-is in your current version)
  ----------------------------- */

  /* =======================================================================
     ✅ NEW: CampDemo Review & Edit (Bad Names / Missing Price)
  ======================================================================= */
  const REVIEW_MODES = [
    { id: "bad_name", label: "Bad names" },
    { id: "missing_price", label: "Missing price" },
    { id: "all", label: "All camps" },
  ];

  const [reviewMode, setReviewMode] = useState("bad_name");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPageSize, setReviewPageSize] = useState(25);
  const [reviewPage, setReviewPage] = useState(1);

  const [reviewWorking, setReviewWorking] = useState(false);
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewEdit, setReviewEdit] = useState({});
  const [reviewSaveWorking, setReviewSaveWorking] = useState("");

  function normalizeCampDemoRow(r) {
    return {
      id: r && r.id ? String(r.id) : "",
      camp_name: safeString(r && r.camp_name),
      start_date: safeString(r && r.start_date),
      end_date: safeString(r && r.end_date),
      city: safeString(r && r.city),
      state: safeString(r && r.state),
      price: safeNumber(r && r.price),
      price_min: safeNumber(r && r.price_min),
      price_max: safeNumber(r && r.price_max),
      link_url: safeString(r && r.link_url),
      notes: safeString(r && r.notes),
      event_key: safeString(r && r.event_key),
      source_url: safeString(r && r.source_url),
      program_id: safeString(r && r.program_id),
      raw: r,
    };
  }

  function rowMatchesReviewMode(r) {
    if (reviewMode === "all") return true;
    if (reviewMode === "bad_name") return isBadName(r && r.camp_name);
    if (reviewMode === "missing_price") return isMissingPriceRow(r);
    return true;
  }

  function rowMatchesSearch(r) {
    const q = lc(reviewSearch);
    if (!q) return true;
    const name = lc(r && r.camp_name);
    const url = lc(r && (r.link_url || r.source_url));
    return (name && name.includes(q)) || (url && url.includes(q));
  }

  async function loadReviewRows() {
    const runIso = new Date().toISOString();
    setReviewWorking(true);
    setLogReview("");

    try {
      if (!selectedSportId) {
        appendLog("review", `[Review] Select a sport first.`);
        setReviewRows([]);
        setReviewEdit({});
        return;
      }
      if (!CampDemoEntity) {
        appendLog("review", `[Review] ERROR: CampDemo entity not available.`);
        return;
      }

      appendLog("review", `[Review] Loading CampDemo rows @ ${runIso} …`);

      const rows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const normalized = asArray(rows).map(normalizeCampDemoRow).filter((x) => x.id);

      const filtered = normalized.filter((r) => rowMatchesReviewMode(r) && rowMatchesSearch(r));

      // default sort: bad_name first, then start date
      filtered.sort((a, b) => {
        const ab = isBadName(a.camp_name) ? 0 : 1;
        const bb = isBadName(b.camp_name) ? 0 : 1;
        if (ab !== bb) return ab - bb;
        return String(a.start_date || "").localeCompare(String(b.start_date || ""));
      });

      setReviewRows(filtered);
      setReviewPage(1);

      const nextEdit = {};
      for (const r of filtered) {
        nextEdit[r.id] = {
          camp_name: r.camp_name ?? "",
          start_date: r.start_date ?? "",
          end_date: r.end_date ?? "",
          city: r.city ?? "",
          state: r.state ?? "",
          price: r.price ?? "",
          price_min: r.price_min ?? "",
          price_max: r.price_max ?? "",
          link_url: r.link_url ?? "",
          notes: r.notes ?? "",
        };
      }
      setReviewEdit(nextEdit);

      appendLog("review", `[Review] Loaded total=${normalized.length} | filtered=${filtered.length} | mode=${reviewMode} | search="${reviewSearch || ""}"`);
      if (filtered.length) {
        appendLog("review", `[Review] Sample:`);

        for (let i = 0; i < Math.min(5, filtered.length); i++) {
          const r = filtered[i];
          appendLog("review", `- ${r.camp_name || "(blank)"} | ${r.start_date || "n/a"} | price=${r.price ?? "n/a"} | ${r.link_url || ""}`);
        }
      }
    } catch (e) {
      appendLog("review", `[Review] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setReviewWorking(false);
    }
  }

  // reload review list when sport changes
  useEffect(() => {
    if (!selectedSportId) return;
    // leave it manual by default, but initial load is helpful
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  const reviewTotal = reviewRows.length;
  const reviewTotalPages = Math.max(1, Math.ceil(reviewTotal / Number(reviewPageSize || 25)));
  const reviewPageSafe = Math.min(Math.max(1, reviewPage), reviewTotalPages);

  const reviewPageRows = useMemo(() => {
    const size = Number(reviewPageSize || 25);
    const start = (reviewPageSafe - 1) * size;
    const end = start + size;
    return reviewRows.slice(start, end);
  }, [reviewRows, reviewPageSafe, reviewPageSize]);

  async function saveReviewRow(rowId) {
    const runIso = new Date().toISOString();
    if (!rowId) return;
    if (!CampDemoEntity || !CampDemoEntity.update) {
      appendLog("review", `[Review] ERROR: CampDemo update not available.`);
      return;
    }

    const ed = reviewEdit && reviewEdit[rowId] ? reviewEdit[rowId] : null;
    if (!ed) return;

    setReviewSaveWorking(rowId);
    try {
      const payload = {
        camp_name: safeString(ed.camp_name) || null,
        start_date: toISODate(ed.start_date) || null,
        end_date: toISODate(ed.end_date) || null,
        city: safeString(ed.city) || null,
        state: safeString(ed.state) || null,
        price: safeNumber(ed.price),
        price_min: safeNumber(ed.price_min),
        price_max: safeNumber(ed.price_max),
        link_url: safeString(ed.link_url) || null,
        notes: safeString(ed.notes) || null,
        last_seen_at: runIso,
      };

      // If they set price but left min/max blank, fill min with price.
      if (payload.price != null && (payload.price_min == null || payload.price_min === 0)) {
        payload.price_min = payload.price;
      }
      // If they set max < min, clear max
      if (payload.price_max != null && payload.price_min != null && payload.price_max < payload.price_min) {
        payload.price_max = null;
      }

      await CampDemoEntity.update(String(rowId), payload);

      appendLog("review", `[Review] Saved row ${rowId} @ ${runIso}`);
      // refresh list to update “remaining” instantly
      await loadReviewRows();
    } catch (e) {
      appendLog("review", `[Review] SAVE ERROR ${rowId}: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setReviewSaveWorking("");
    }
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
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">SportsUSA seeding + camp ingestion + promotion + review/edit.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* Global Sport Selector */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">1) Select Sport</div>
          <div className="text-sm text-slate-600 mt-1">This selection drives Seed Schools, Camps Ingest, Positions, Promote, and Review.</div>

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
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking || seedWorking || reviewWorking}
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
                {countersWorking ? "Refreshing…" : "Refresh Counters"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Crawl Counters Panel */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Crawl Counters</div>

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
              Clear Counters Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Counters Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logCounters || "—"}</pre>
          </div>
        </Card>

        {/* 2) Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">2) Seed Schools from SportsUSA (School + SchoolSportSite)</div>

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
              <div className="mt-1 text-[11px] text-slate-500">Default auto-fills based on sport. You can override if needed.</div>
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
            <Button onClick={runSportsUSASeedSchools} disabled={!selectedSportId || sportsUSAWorking || campsWorking || promoteWorking || seedWorking}>
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

        {/* 5) NEW: Review & Edit CampDemo */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">5) Camps Review (Edit CampDemo directly)</div>
          <div className="text-sm text-slate-600 mt-1">
            Use this to fix the last “bad names” and “missing price” without re-running ingest.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Review filter</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={reviewMode}
                onChange={(e) => setReviewMode(e.target.value)}
                disabled={reviewWorking}
              >
                {REVIEW_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                Bad name includes Register/Details/Camp and money-as-name like “$475.00”.
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Search (name or URL)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={reviewSearch}
                onChange={(e) => setReviewSearch(e.target.value)}
                placeholder='e.g., "register.ryzer.com" or "prospect camp"'
                disabled={reviewWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Page size</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={reviewPageSize}
                onChange={(e) => setReviewPageSize(Number(e.target.value))}
                disabled={reviewWorking}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={loadReviewRows} disabled={!selectedSportId || reviewWorking}>
              {reviewWorking ? "Loading…" : "Load / Refresh list"}
            </Button>
            <Button variant="outline" onClick={() => setLogReview("")} disabled={reviewWorking}>
              Clear Review Log
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-slate-700">
            <div>
              Showing <b>{reviewTotal ? (reviewPageSafe - 1) * reviewPageSize + 1 : 0}</b>–<b>{Math.min(reviewTotal, reviewPageSafe * reviewPageSize)}</b> of{" "}
              <b>{reviewTotal}</b>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setReviewPage(1)} disabled={reviewWorking || reviewPageSafe <= 1}>
                First
              </Button>
              <Button variant="outline" onClick={() => setReviewPage((p) => Math.max(1, p - 1))} disabled={reviewWorking || reviewPageSafe <= 1}>
                Prev
              </Button>
              <div className="text-xs text-slate-600">
                Page <b>{reviewPageSafe}</b> / <b>{reviewTotalPages}</b>
              </div>
              <Button
                variant="outline"
                onClick={() => setReviewPage((p) => Math.min(reviewTotalPages, p + 1))}
                disabled={reviewWorking || reviewPageSafe >= reviewTotalPages}
              >
                Next
              </Button>
              <Button variant="outline" onClick={() => setReviewPage(reviewTotalPages)} disabled={reviewWorking || reviewPageSafe >= reviewTotalPages}>
                Last
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="p-2 border-b border-slate-200 w-24">Save</th>
                  <th className="p-2 border-b border-slate-200 w-[340px]">Camp Name</th>
                  <th className="p-2 border-b border-slate-200 w-28">Start</th>
                  <th className="p-2 border-b border-slate-200 w-28">End</th>
                  <th className="p-2 border-b border-slate-200 w-24">City</th>
                  <th className="p-2 border-b border-slate-200 w-16">State</th>
                  <th className="p-2 border-b border-slate-200 w-20">Price</th>
                  <th className="p-2 border-b border-slate-200 w-20">Min</th>
                  <th className="p-2 border-b border-slate-200 w-20">Max</th>
                  <th className="p-2 border-b border-slate-200 w-[320px]">Link</th>
                </tr>
              </thead>
              <tbody>
                {reviewPageRows.length ? (
                  reviewPageRows.map((r) => {
                    const ed = reviewEdit[r.id] || {};
                    const bad = isBadName(ed.camp_name || r.camp_name);
                    const missPrice = isMissingPriceRow({
                      price: ed.price,
                      price_min: ed.price_min,
                      price_max: ed.price_max,
                    });

                    return (
                      <tr key={r.id} className="border-b border-slate-100 align-top">
                        <td className="p-2">
                          <Button onClick={() => saveReviewRow(r.id)} disabled={reviewSaveWorking === r.id || reviewWorking} className="w-full">
                            {reviewSaveWorking === r.id ? "Saving…" : "Save"}
                          </Button>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {bad ? "Bad name" : "—"} {missPrice ? " • Missing price" : ""}
                          </div>
                        </td>

                        <td className="p-2">
                          <input
                            className={`w-full rounded-md border px-2 py-1 text-sm ${bad ? "border-amber-300" : "border-slate-200"}`}
                            value={ed.camp_name ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), camp_name: e.target.value },
                              }))
                            }
                          />
                          <div className="mt-1 text-[11px] text-slate-500 break-all">
                            id: {r.id} {r.event_key ? `• key: ${r.event_key}` : ""}
                          </div>
                          <textarea
                            className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                            rows={2}
                            value={ed.notes ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), notes: e.target.value },
                              }))
                            }
                            placeholder="Notes (optional)"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.start_date ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), start_date: e.target.value },
                              }))
                            }
                            placeholder="YYYY-MM-DD"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.end_date ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), end_date: e.target.value },
                              }))
                            }
                            placeholder="YYYY-MM-DD"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.city ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), city: e.target.value },
                              }))
                            }
                            placeholder="City"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.state ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), state: e.target.value },
                              }))
                            }
                            placeholder="ST"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className={`w-full rounded-md border px-2 py-1 text-sm ${missPrice ? "border-rose-300" : "border-slate-200"}`}
                            value={ed.price ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), price: e.target.value },
                              }))
                            }
                            placeholder="e.g., 199"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.price_min ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), price_min: e.target.value },
                              }))
                            }
                            placeholder="min"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.price_max ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), price_max: e.target.value },
                              }))
                            }
                            placeholder="max"
                          />
                        </td>

                        <td className="p-2">
                          <input
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                            value={ed.link_url ?? ""}
                            onChange={(e) =>
                              setReviewEdit((prev) => ({
                                ...prev,
                                [r.id]: { ...(prev[r.id] || {}), link_url: e.target.value },
                              }))
                            }
                            placeholder="https://..."
                          />
                          <div className="mt-1 text-[11px] text-slate-500">
                            {ed.link_url ? (
                              <a className="underline" href={ed.link_url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            ) : (
                              "—"
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="p-3 text-slate-500">
                      {selectedSportId ? (reviewWorking ? "Loading…" : "No rows. Click “Load / Refresh list”.") : "Select a sport first."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Review Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logReview || "—"}</pre>
          </div>
        </Card>

        {/* Positions (optional) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Positions (optional)</div>
          <div className="text-sm text-slate-600 mt-1">Auto-seed a default set, or manually add/edit/delete positions per sport.</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={seedPositionsForSport} disabled={!selectedSportId || seedWorking || sportsUSAWorking || campsWorking || promoteWorking || reviewWorking}>
              {seedWorking ? "Seeding…" : "Auto-seed positions"}
            </Button>

            <Button variant="outline" onClick={() => loadPositionsForSport(selectedSportId)} disabled={!selectedSportId || positionsLoading}>
              {positionsLoading ? "Refreshing…" : "Refresh"}
            </Button>

            <Button variant="outline" onClick={() => setLogPositions("")} disabled={seedWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={positionAddCode}
                onChange={(e) => setPositionAddCode(e.target.value)}
                placeholder="e.g., QB"
                disabled={!selectedSportId}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={positionAddName}
                onChange={(e) => setPositionAddName(e.target.value)}
                placeholder="e.g., Quarterback"
                disabled={!selectedSportId}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addPosition} disabled={!selectedSportId || positionAddWorking}>
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
                              value={edit.code ?? ""}
                              onChange={(e) =>
                                setPositionsEdit((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...(prev[p.id] || {}),
                                    code: e.target.value,
                                    name: prev[p.id] && prev[p.id].name != null ? prev[p.id].name : p.name,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.name ?? ""}
                              onChange={(e) =>
                                setPositionsEdit((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...(prev[p.id] || {}),
                                    name: e.target.value,
                                    code: prev[p.id] && prev[p.id].code != null ? prev[p.id].code : p.code,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => savePositionRow(p.id)} disabled={positionSaveWorking}>
                                Save
                              </Button>
                              <Button variant="outline" onClick={() => deletePosition(p.id)} disabled={positionDeleteWorking === p.id}>
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

            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-1">Positions Log</div>
              <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-56">{logPositions || "—"}</pre>
            </div>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={sportsUSAWorking || campsWorking || promoteWorking || seedWorking || reviewWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

