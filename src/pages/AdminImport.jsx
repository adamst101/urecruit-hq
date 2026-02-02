// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Inline helpers (type safe)
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

/* ----------------------------
   Dates / season rules
----------------------------- */
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

/* ----------------------------
   IDs + hashes
----------------------------- */
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

function seedProgramId({ school_id, camp_name }) {
  return `seed:${String(school_id || "na")}:${slugify(camp_name || "camp")}`;
}

function buildEventKey({ source_platform, program_id, start_date, link_url, source_url }) {
  const platform = source_platform || "seed";
  const disc = link_url || source_url || "na";
  return `${platform}:${program_id}:${start_date || "na"}:${disc}`;
}

/* ----------------------------
   Routes (hardcoded; no createPageUrl)
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   Positions seeding defaults
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
   Entity field helpers (best-effort)
----------------------------- */
function normalizeSportNameFromRow(r) {
  return String(r && (r.sport_name || r.name || r.sportName) ? (r.sport_name || r.name || r.sportName) : "")
    .trim();
}

function readActiveFlag(row) {
  if (row && typeof row.active === "boolean") return row.active;
  if (row && typeof row.is_active === "boolean") return row.is_active;
  if (row && typeof row.isActive === "boolean") return row.isActive;
  const st = String(row && row.status ? row.status : "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;
  return true;
}

async function tryUpdateWithPayloads(Entity, id, payloads) {
  for (const p of payloads) {
    try {
      await Entity.update(String(id), p);
      return true;
    } catch {}
  }
  return false;
}

async function tryCreateWithPayloads(Entity, payloads) {
  for (const p of payloads) {
    try {
      const created = await Entity.create(p);
      return created || true;
    } catch {}
  }
  return null;
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
    } catch {}
  }
  return false;
}

/* ----------------------------
   Ryzer ActivityTypeId mapping (MVP)
   (Add more as you discover GUIDs)
----------------------------- */
const RYZER_ACTIVITY_TYPE_BY_SPORTNAME = {
  Football: "A8ADF526-3822-4261-ADCF-1592CF4BB7FF",
};

/* ----------------------------
   Log helpers (per-section + run feed)
----------------------------- */
const SECTION = {
  Feed: "Feed",
  SportsUSA: "SportsUSA Seed Schools",
  Ryzer: "Ryzer Ingestion",
  Promote: "Promote CampDemo → Camp",
  Positions: "Positions",
  SportAdmin: "Sport Admin",
  Sports: "Sports Manager",
};

function nowIso() {
  return new Date().toISOString();
}

function capLines(text, maxLines) {
  const lines = String(text || "").split("\n");
  if (lines.length <= maxLines) return String(text || "");
  return lines.slice(lines.length - maxLines).join("\n");
}

function LogPanel({ title, value, onClear }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{title}</div>
        {onClear ? (
          <button className="text-[11px] text-slate-600 hover:text-slate-900" onClick={onClear} type="button">
            Clear
          </button>
        ) : null}
      </div>
      <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
        {value || "—"}
      </pre>
    </div>
  );
}

export default function AdminImport() {
  const nav = useNavigate();

  // ---- Entities
  const SportEntity = (base44 && base44.entities && (base44.entities.Sport || base44.entities.Sports)) || null;
  const PositionEntity = (base44 && base44.entities && (base44.entities.Position || base44.entities.Positions)) || null;
  const SchoolEntity = (base44 && base44.entities && (base44.entities.School || base44.entities.Schools)) || null;
  const CampDemoEntity = (base44 && base44.entities && base44.entities.CampDemo) || null;

  // ---- Global: sports list + single selected sport (drives ALL sections)
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);

  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // ---- Logs (per section) + feed
  const [feed, setFeed] = useState([]); // [{ts, section, level, msg}]
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logRyzer, setLogRyzer] = useState("");
  const [logPromote, setLogPromote] = useState("");
  const [logPositions, setLogPositions] = useState("");
  const [logSportAdmin, setLogSportAdmin] = useState("");
  const [logSportsManager, setLogSportsManager] = useState("");

  const LOG_MAX_LINES = 600;

  function pushFeed(section, level, msg) {
    const entry = { ts: nowIso(), section, level, msg: String(msg || "") };
    setFeed((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 120);
    });
  }

  function appendLog(setter, sectionName, line, level) {
    const lvl = level || "info";
    setter((prev) => capLines(prev ? prev + "\n" + line : line, LOG_MAX_LINES));
    pushFeed(sectionName, lvl, line);
  }

  // ---- Derived seed list for selected sport
  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  // ---- When sport changes, auto-fill Ryzer ActivityTypeId if known
  const [ryzerActivityTypeId, setRyzerActivityTypeId] = useState("");
  useEffect(() => {
    const guess = RYZER_ACTIVITY_TYPE_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setRyzerActivityTypeId(guess);
  }, [selectedSportName]);

  // ---- Ryzer ingestion controls
  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerRecordsPerPage, setRyzerRecordsPerPage] = useState(25);
  const [ryzerMaxPages, setRyzerMaxPages] = useState(10);
  const [ryzerMaxEvents, setRyzerMaxEvents] = useState(200);

  // ---- SportsUSA seed controls
  const [sportsusaWorking, setSportsusaWorking] = useState(false);
  const [sportsusaDryRun, setSportsusaDryRun] = useState(true);
  const [sportsusaLimit, setSportsusaLimit] = useState(300);

  // ---- Seed Positions
  const [seedWorking, setSeedWorking] = useState(false);
  const [seedStats, setSeedStats] = useState({ attempted: 0, created: 0, updated: 0, errors: 0 });

  // ---- Positions manager
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsEdit, setPositionsEdit] = useState({});
  const [positionAddCode, setPositionAddCode] = useState("");
  const [positionAddName, setPositionAddName] = useState("");
  const [positionAddWorking, setPositionAddWorking] = useState(false);
  const [positionSaveWorking, setPositionSaveWorking] = useState(false);
  const [positionDeleteWorking, setPositionDeleteWorking] = useState("");

  // ---- Sports admin actions (soccer split, volleyball normalize)
  const [sportAdminWorking, setSportAdminWorking] = useState(false);
  const [sportAdminResult, setSportAdminResult] = useState("");

  // ---- Sports manager CRUD
  const [newSportName, setNewSportName] = useState("");
  const [sportsEdit, setSportsEdit] = useState({});
  const [sportSaveWorking, setSportSaveWorking] = useState(false);
  const [sportCreateWorking, setSportCreateWorking] = useState(false);
  const [sportDeleteWorking, setSportDeleteWorking] = useState("");

  // ---- Promotion (CampDemo → Camp)
  const [promoteWorking, setPromoteWorking] = useState(false);
  const [promoteStats, setPromoteStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  /* ----------------------------
     Load Sports (and set selected)
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

      const nextEdit = {};
      for (const s of normalized) nextEdit[s.id] = { name: s.name, active: !!s.active };
      setSportsEdit(nextEdit);

      // Keep selection stable, else default to first active
      if (!selectedSportId && normalized.length) {
        const firstActive = normalized.find((x) => x.active) || normalized[0];
        setSelectedSportId(firstActive.id);
        setSelectedSportName(firstActive.name);
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

  // initial load
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
     Positions load
  ----------------------------- */
  async function loadPositionsForSport(sportId) {
    if (!PositionEntity || !PositionEntity.filter || !sportId) {
      setPositions([]);
      setPositionsEdit({});
      return;
    }

    setPositionsLoading(true);
    try {
      const rows = asArray(await PositionEntity.filter({ sport_id: sportId }));
      const normalized = rows
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

  // positions refresh when selected sport changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedSportId) {
        setPositions([]);
        setPositionsEdit({});
        return;
      }
      await loadPositionsForSport(selectedSportId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* ----------------------------
     Camp upsert helpers
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    const key = payload && payload.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for upsert");

    let existing = [];
    try {
      existing = await base44.entities.Camp.filter({ event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0] && arr[0].id) {
      await base44.entities.Camp.update(arr[0].id, payload);
      return "updated";
    }

    await base44.entities.Camp.create(payload);
    return "created";
  }

  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity || !CampDemoEntity.filter || !CampDemoEntity.create || !CampDemoEntity.update) {
      throw new Error("CampDemo entity not available (expected entities.CampDemo).");
    }
    const key = payload && payload.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    let existing = [];
    try {
      existing = await CampDemoEntity.filter({ event_key: key });
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
    const position_ids = normalizeStringArray(r && r.position_ids ? r.position_ids : null);

    const price = safeNumber(r && r.price != null ? r.price : null);

    const link_url = safeString(r && (r.link_url || r.url) ? (r.link_url || r.url) : null);
    const source_url = safeString(r && r.source_url ? r.source_url : null) || link_url;

    const season_year = safeNumber(r && r.season_year != null ? r.season_year : null) ?? safeNumber(computeSeasonYearFootball(start_date));

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

  /* ----------------------------
     SportsUSA Seed Schools (per selected sport)
     Requires backend function: /functions/sportsUSASeedSchools
  ----------------------------- */
  async function runSportsUSASeedSchools() {
    if (!selectedSportId || !selectedSportName) {
      appendLog(setLogSportsUSA, SECTION.SportsUSA, "ERROR: Select a sport first.", "error");
      return;
    }

    setSportsusaWorking(true);
    setLogSportsUSA("");
    const runIso = nowIso();

    appendLog(setLogSportsUSA, SECTION.SportsUSA, `Starting: SportsUSA School Seed (${selectedSportName}) @ ${runIso}`);
    appendLog(
      setLogSportsUSA,
      SECTION.SportsUSA,
      `DryRun=${sportsusaDryRun ? "true" : "false"} | Limit=${sportsusaLimit}`
    );

    try {
      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          dryRun: sportsusaDryRun,
          limit: Number(sportsusaLimit || 0) || 300,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendLog(setLogSportsUSA, SECTION.SportsUSA, `SportsUSA function ERROR (HTTP ${res.status})`, "error");
        appendLog(setLogSportsUSA, SECTION.SportsUSA, JSON.stringify(data || {}, null, 2), "error");
        return;
      }

      const stats = (data && data.stats) ? data.stats : {};
      appendLog(
        setLogSportsUSA,
        SECTION.SportsUSA,
        `SportsUSA fetched: schools_found=${stats.schools_found ?? "n/a"} | http=${stats.http ?? res.status}`
      );
      if (typeof stats.created === "number" || typeof stats.updated === "number" || typeof stats.skipped === "number") {
        appendLog(
          setLogSportsUSA,
          SECTION.SportsUSA,
          `Writes: created=${stats.created ?? 0} updated=${stats.updated ?? 0} skipped=${stats.skipped ?? 0} errors=${stats.errors ?? 0}`
        );
      }

      const sample = asArray(data && (data.sample || data.schools_sample || data.schools)).slice(0, 8);
      if (sample.length) {
        appendLog(setLogSportsUSA, SECTION.SportsUSA, `SportsUSA sample (first ${sample.length}):`);
        for (const s of sample) {
          appendLog(
            setLogSportsUSA,
            SECTION.SportsUSA,
            `- name="${s && (s.school_name || s.name) ? (s.school_name || s.name) : ""}" | logo="${s && s.logo_url ? s.logo_url : ""}" | view="${s && (s.source_school_url || s.view_url || s.view) ? (s.source_school_url || s.view_url || s.view) : ""}"`
          );
        }
      } else {
        appendLog(setLogSportsUSA, SECTION.SportsUSA, "No sample rows returned.");
      }

      if (sportsusaDryRun) {
        appendLog(setLogSportsUSA, SECTION.SportsUSA, "DryRun=true: no School writes performed.");
      } else {
        appendLog(setLogSportsUSA, SECTION.SportsUSA, "Done.");
      }

      // Refresh schools list not needed here; but refresh sports list for safety (in case sport active toggles)
      await loadSports();
    } catch (e) {
      appendLog(setLogSportsUSA, SECTION.SportsUSA, `ERROR: ${String(e && e.message ? e.message : e)}`, "error");
    } finally {
      setSportsusaWorking(false);
    }
  }

  /* ----------------------------
     Seed Positions (upsert by sport_id + position_code)
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
      existing = asArray(await PositionEntity.filter({ sport_id: sportId }));
    } catch {
      existing = [];
    }

    const hit = existing.find((r) => String(r && r.position_code ? r.position_code : "").trim().toUpperCase() === position_code);
    const payload = { sport_id: sportId, position_code, position_name };

    if (hit && hit.id) {
      await PositionEntity.update(String(hit.id), payload);
      return "updated";
    }

    await PositionEntity.create(payload);
    return "created";
  }

  async function seedPositionsForSport() {
    const runIso = nowIso();
    setSeedWorking(true);
    setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });
    setLogPositions("");

    appendLog(setLogPositions, SECTION.Positions, `Starting: Seed Positions @ ${runIso}`);
    if (!selectedSportId) {
      appendLog(setLogPositions, SECTION.Positions, "ERROR: Select a sport first.", "error");
      setSeedWorking(false);
      return;
    }

    const list = seedListForSelectedSport;
    if (!list.length) {
      appendLog(setLogPositions, SECTION.Positions, `ERROR: No default seed list found for sport "${selectedSportName || "?"}".`, "error");
      setSeedWorking(false);
      return;
    }

    appendLog(setLogPositions, SECTION.Positions, `Sport: ${selectedSportName} (${selectedSportId})`);
    appendLog(setLogPositions, SECTION.Positions, `Seed rows: ${list.length}`);

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

        if ((i + 1) % 10 === 0) appendLog(setLogPositions, SECTION.Positions, `Seed progress: ${i + 1}/${list.length}`);
        await sleep(40);
      } catch (e) {
        setSeedStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendLog(setLogPositions, SECTION.Positions, `SEED ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`, "error");
      }
    }

    appendLog(setLogPositions, SECTION.Positions, "Seed Positions done.");
    setSeedWorking(false);

    await loadPositionsForSport(selectedSportId);
  }

  /* ----------------------------
     Manual Position Manager (CRUD)
  ----------------------------- */
  async function addPosition() {
    setPositionAddWorking(true);
    try {
      if (!PositionEntity || !PositionEntity.create) {
        appendLog(setLogPositions, SECTION.Positions, "ERROR: Position entity not available for create.", "error");
        return;
      }
      if (!selectedSportId) {
        appendLog(setLogPositions, SECTION.Positions, "ERROR: Select a sport first.", "error");
        return;
      }

      const code = safeString(positionAddCode);
      const name = safeString(positionAddName);
      if (!code) return appendLog(setLogPositions, SECTION.Positions, "ERROR: Position code is required.", "error");
      if (!name) return appendLog(setLogPositions, SECTION.Positions, "ERROR: Position name is required.", "error");

      const result = await upsertPositionBySportAndCode({ sportId: selectedSportId, code: code.toUpperCase(), name });
      appendLog(setLogPositions, SECTION.Positions, result === "created" ? `Created Position ${code.toUpperCase()}` : `Updated Position ${code.toUpperCase()}`);

      setPositionAddCode("");
      setPositionAddName("");
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendLog(setLogPositions, SECTION.Positions, `ERROR add Position: ${String(e && e.message ? e.message : e)}`, "error");
    } finally {
      setPositionAddWorking(false);
    }
  }

  async function savePositionRow(positionId) {
    if (!PositionEntity || !PositionEntity.update) {
      appendLog(setLogPositions, SECTION.Positions, "ERROR: Position entity not available for update.", "error");
      return;
    }
    const row = positionsEdit && positionsEdit[positionId] ? positionsEdit[positionId] : null;
    if (!row) return;

    const code = safeString(row.code);
    const name = safeString(row.name);

    if (!selectedSportId) return appendLog(setLogPositions, SECTION.Positions, "ERROR: Select a sport first.", "error");
    if (!code) return appendLog(setLogPositions, SECTION.Positions, "ERROR: Position code is required.", "error");
    if (!name) return appendLog(setLogPositions, SECTION.Positions, "ERROR: Position name is required.", "error");

    setPositionSaveWorking(true);
    try {
      await PositionEntity.update(String(positionId), {
        sport_id: selectedSportId,
        position_code: code.toUpperCase(),
        position_name: name,
      });
      appendLog(setLogPositions, SECTION.Positions, `Saved Position: ${code.toUpperCase()}`);
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendLog(setLogPositions, SECTION.Positions, `FAILED save Position: ${String(e && e.message ? e.message : e)}`, "error");
    } finally {
      setPositionSaveWorking(false);
    }
  }

  async function deletePosition(positionId) {
    if (!positionId) return;
    if (!PositionEntity) {
      appendLog(setLogPositions, SECTION.Positions, "ERROR: Position entity missing.", "error");
      return;
    }

    const hit = positions.find((p) => p.id === positionId) || null;
    const label = hit && hit.code ? `${hit.code} — ${hit.name || ""}` : positionId;

    setPositionDeleteWorking(positionId);
    try {
      const ok = await tryDelete(PositionEntity, positionId);
      appendLog(setLogPositions, SECTION.Positions, ok ? `Deleted Position: ${label}` : `FAILED delete Position: ${label}`, ok ? "info" : "error");
      await loadPositionsForSport(selectedSportId);
    } finally {
      setPositionDeleteWorking("");
    }
  }

  /* ----------------------------
     Sport Admin actions (normalize + split)
  ----------------------------- */
  async function ensureSoccerVariants() {
    setSportAdminWorking(true);
    setSportAdminResult("");
    setLogSportAdmin("");

    if (!SportEntity || !SportEntity.filter || !SportEntity.update || !SportEntity.create) {
      setSportAdminResult("ERROR: Sport entity not available (expected entities.Sport).");
      appendLog(setLogSportAdmin, SECTION.SportAdmin, "ERROR: Sport entity not available (expected entities.Sport).", "error");
      setSportAdminWorking(false);
      return;
    }

    try {
      const rows = asArray(await SportEntity.filter({}));
      const byName = new Map(rows.map((r) => [lc(normalizeSportNameFromRow(r)), r]));

      const soccer = byName.get("soccer");
      const mens = byName.get("men's soccer");
      const womens = byName.get("women's soccer");

      const actions = [];

      if (soccer && soccer.id) {
        const ok = await tryUpdateWithPayloads(SportEntity, soccer.id, [
          { sport_name: "Men's Soccer" },
          { name: "Men's Soccer" },
          { sportName: "Men's Soccer" },
        ]);
        actions.push(ok ? "Renamed: Soccer → Men's Soccer" : "FAILED rename: Soccer → Men's Soccer");
      } else if (mens && mens.id) {
        actions.push("Men's Soccer already exists");
      } else {
        const created = await tryCreateWithPayloads(SportEntity, [
          { sport_name: "Men's Soccer", active: true },
          { name: "Men's Soccer", active: true },
          { sportName: "Men's Soccer", active: true },
        ]);
        actions.push(created ? "Created: Men's Soccer" : "FAILED create: Men's Soccer");
      }

      if (womens && womens.id) {
        actions.push("Women's Soccer already exists");
      } else {
        const created = await tryCreateWithPayloads(SportEntity, [
          { sport_name: "Women's Soccer", active: true },
          { name: "Women's Soccer", active: true },
          { sportName: "Women's Soccer", active: true },
        ]);
        actions.push(created ? "Created: Women's Soccer" : "FAILED create: Women's Soccer");
      }

      const msg = actions.join(" | ");
      setSportAdminResult(msg);
      appendLog(setLogSportAdmin, SECTION.SportAdmin, msg);

      await loadSports();
    } catch (e) {
      const msg = `ERROR: ${String(e && e.message ? e.message : e)}`;
      setSportAdminResult(msg);
      appendLog(setLogSportAdmin, SECTION.SportAdmin, msg, "error");
    } finally {
      setSportAdminWorking(false);
    }
  }

  async function normalizeVolleyballSpelling() {
    setSportAdminWorking(true);
    setSportAdminResult("");
    setLogSportAdmin("");

    if (!SportEntity || !SportEntity.filter || !SportEntity.update) {
      setSportAdminResult("ERROR: Sport entity not available (expected entities.Sport).");
      appendLog(setLogSportAdmin, SECTION.SportAdmin, "ERROR: Sport entity not available (expected entities.Sport).", "error");
      setSportAdminWorking(false);
      return;
    }

    try {
      const rows = asArray(await SportEntity.filter({}));
      const byName = new Map(rows.map((r) => [lc(normalizeSportNameFromRow(r)), r]));

      const volly = byName.get("vollyball");
      const volley = byName.get("volleyball");
      const actions = [];

      if (volley && volley.id) {
        actions.push("Volleyball already exists");
      } else if (volly && volly.id) {
        const ok = await tryUpdateWithPayloads(SportEntity, volly.id, [
          { sport_name: "Volleyball" },
          { name: "Volleyball" },
          { sportName: "Volleyball" },
        ]);
        actions.push(ok ? "Renamed: Vollyball → Volleyball" : "FAILED rename: Vollyball → Volleyball");
      } else {
        actions.push('No "Vollyball" or "Volleyball" sport found');
      }

      const msg = actions.join(" | ");
      setSportAdminResult(msg);
      appendLog(setLogSportAdmin, SECTION.SportAdmin, msg);

      await loadSports();
    } catch (e) {
      const msg = `ERROR: ${String(e && e.message ? e.message : e)}`;
      setSportAdminResult(msg);
      appendLog(setLogSportAdmin, SECTION.SportAdmin, msg, "error");
    } finally {
      setSportAdminWorking(false);
    }
  }

  /* ----------------------------
     Manual Sport Manager (CRUD + Active/Inactive)
  ----------------------------- */
  async function saveSportRow(sportId) {
    if (!SportEntity || !SportEntity.update) {
      appendLog(setLogSportsManager, SECTION.Sports, "ERROR: Sport entity not available for update.", "error");
      return;
    }

    const row = sportsEdit && sportsEdit[sportId] ? sportsEdit[sportId] : null;
    if (!row) return;

    const name = safeString(row.name);
    const active = !!row.active;

    if (!name) {
      appendLog(setLogSportsManager, SECTION.Sports, "ERROR: Sport name is required.", "error");
      return;
    }

    setSportSaveWorking(true);
    try {
      const okName = await tryUpdateWithPayloads(SportEntity, sportId, [
        { sport_name: name },
        { name },
        { sportName: name },
      ]);

      const okActive = await tryUpdateWithPayloads(SportEntity, sportId, [
        { active },
        { is_active: active },
        { isActive: active },
        { status: active ? "Active" : "Inactive" },
      ]);

      appendLog(
        setLogSportsManager,
        SECTION.Sports,
        `Saved Sport: ${name} | name=${okName ? "OK" : "FAIL"} | active=${okActive ? "OK" : "FAIL"}`,
        okName && okActive ? "info" : "error"
      );

      await loadSports();
    } finally {
      setSportSaveWorking(false);
    }
  }

  async function createSport() {
    if (!SportEntity || !SportEntity.create) {
      appendLog(setLogSportsManager, SECTION.Sports, "ERROR: Sport entity not available for create.", "error");
      return;
    }

    const name = safeString(newSportName);
    if (!name) return appendLog(setLogSportsManager, SECTION.Sports, "ERROR: New sport name is required.", "error");

    setSportCreateWorking(true);
    try {
      const created = await tryCreateWithPayloads(SportEntity, [
        { sport_name: name, active: true },
        { name, active: true },
        { sportName: name, active: true },
        { sport_name: name, status: "Active" },
        { name, status: "Active" },
      ]);

      appendLog(setLogSportsManager, SECTION.Sports, created ? `Created Sport: ${name}` : `FAILED create Sport: ${name}`, created ? "info" : "error");
      setNewSportName("");
      await loadSports();
    } finally {
      setSportCreateWorking(false);
    }
  }

  async function deleteSport(sportId) {
    if (!sportId) return;
    if (!SportEntity) {
      appendLog(setLogSportsManager, SECTION.Sports, "ERROR: Sport entity missing.", "error");
      return;
    }

    const hit = sports.find((s) => s.id === sportId) || null;
    const label = (hit && hit.name) ? hit.name : sportId;

    let hasPositions = false;
    try {
      if (PositionEntity && PositionEntity.filter) {
        const rows = asArray(await PositionEntity.filter({ sport_id: sportId }));
        hasPositions = rows.length > 0;
      }
    } catch {}

    if (hasPositions) {
      appendLog(setLogSportsManager, SECTION.Sports, `BLOCKED delete Sport "${label}": positions exist. Mark Inactive instead.`, "error");
      return;
    }

    setSportDeleteWorking(sportId);
    try {
      const ok = await tryDelete(SportEntity, sportId);
      appendLog(setLogSportsManager, SECTION.Sports, ok ? `Deleted Sport: ${label}` : `FAILED delete Sport: ${label}`, ok ? "info" : "error");
      await loadSports();

      // If you deleted the currently selected sport, pick a new one
      if (selectedSportId === sportId) {
        setSelectedSportId("");
        setSelectedSportName("");
      }
    } finally {
      setSportDeleteWorking("");
    }
  }

  async function backfillSportActiveTrue() {
    if (!SportEntity || !SportEntity.filter || !SportEntity.update) {
      appendLog(setLogSportsManager, SECTION.Sports, "ERROR: Sport entity not available for backfill.", "error");
      return;
    }

    appendLog(setLogSportsManager, SECTION.Sports, "Backfill: setting active=true on all sports...");
    const rows = asArray(await SportEntity.filter({}));

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const id = r && r.id ? String(r.id) : "";
      if (!id) continue;

      try {
        const did = await tryUpdateWithPayloads(SportEntity, id, [
          { active: true },
          { is_active: true },
          { isActive: true },
          { status: "Active" },
        ]);
        if (did) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }

      if ((i + 1) % 10 === 0) appendLog(setLogSportsManager, SECTION.Sports, `Backfill progress: ${i + 1}/${rows.length}`);
      await sleep(25);
    }

    appendLog(setLogSportsManager, SECTION.Sports, `Backfill done. OK=${ok} FAIL=${fail}`);
    await loadSports();
  }

  /* ----------------------------
     Ryzer ingestion runner
     Writes accepted results into CampDemo (so Promote flow works)
----------------------------- */
  function parsePriceRangeFromText(priceText) {
    const raw = String(priceText || "");
    const nums = raw
      .split(/[^0-9.]+/g)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return { price_min: null, price_max: null, price_best: null };
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { price_min: min, price_max: max, price_best: min };
  }

  async function runRyzerIngestion() {
    if (!selectedSportId) return appendLog(setLogRyzer, SECTION.Ryzer, "ERROR: Select a sport first.", "error");
    if (!safeString(ryzerActivityTypeId)) return appendLog(setLogRyzer, SECTION.Ryzer, "ERROR: Provide Ryzer ActivityTypeId GUID.", "error");

    if (!SchoolEntity || !SchoolEntity.filter) return appendLog(setLogRyzer, SECTION.Ryzer, "ERROR: School entity not available.", "error");
    if (!CampDemoEntity) return appendLog(setLogRyzer, SECTION.Ryzer, "ERROR: CampDemo entity not available.", "error");

    const runIso = nowIso();
    setRyzerWorking(true);
    setLogRyzer("");

    appendLog(setLogRyzer, SECTION.Ryzer, `Starting: Ryzer ingestion (${selectedSportName}) @ ${runIso}`);
    appendLog(
      setLogRyzer,
      SECTION.Ryzer,
      `DryRun=${ryzerDryRun ? "true" : "false"} | RPP=${ryzerRecordsPerPage} | Pages=${ryzerMaxPages} | MaxEvents=${ryzerMaxEvents}`
    );

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

      appendLog(setLogRyzer, SECTION.Ryzer, `Loaded Schools: ${schools.length} (indexed=${schools.length})`);

      const res = await fetch("/functions/ryzerIngest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          activityTypeId: ryzerActivityTypeId,
          recordsPerPage: ryzerRecordsPerPage,
          maxPages: ryzerMaxPages,
          maxEvents: ryzerMaxEvents,
          dryRun: ryzerDryRun,
          schools,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer function ERROR (HTTP ${res.status})`, "error");
        appendLog(setLogRyzer, SECTION.Ryzer, JSON.stringify(data || {}, null, 2), "error");
        return;
      }

      appendLog(
        setLogRyzer,
        SECTION.Ryzer,
        `Ryzer results: accepted=${(data && data.stats && data.stats.accepted) ?? 0}, rejected=${(data && data.stats && data.stats.rejected) ?? 0}, errors=${(data && data.stats && data.stats.errors) ?? 0}`
      );
      appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer processed: ${(data && data.stats && data.stats.processed) ?? 0}`);

      // Optional stats detail (if function provides them)
      if (data && data.stats) {
        const s = data.stats;
        if (typeof s.rejectedMissingHost === "number" || typeof s.rejectedWrongSport === "number" || typeof s.rejectedJunkHost === "number") {
          appendLog(
            setLogRyzer,
            SECTION.Ryzer,
            `Ryzer stats detail: missingHost=${s.rejectedMissingHost ?? 0}, junkHost=${s.rejectedJunkHost ?? 0}, wrongSport=${s.rejectedWrongSport ?? 0}`
          );
        }
      }

      appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug version: ${(data && data.debug && data.debug.version) || "MISSING"}`);

      const pages = asArray(data && data.debug ? data.debug.pages : []);
      const p0 = pages.length ? pages[0] : null;
      if (p0) {
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 http=${p0.http ?? "n/a"} rowCount=${p0.rowCount ?? "n/a"} total=${p0.total ?? "n/a"}`);
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 keys: ${(p0.respKeys || []).join(", ") || "n/a"}`);
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 dataWasString: ${p0.dataWasString ? "true" : "false"}`);
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 innerKeys: ${(p0.innerKeys || []).join(", ") || "n/a"}`);
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 rowsArrayPath: ${p0.rowsArrayPath || "n/a"}`);
        if (p0.uniqueActivityNames && p0.uniqueActivityNames.length) {
          appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 uniqueActivityNames: ${JSON.stringify(p0.uniqueActivityNames)}`);
        }
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer debug p0 reqPayload: ${JSON.stringify(p0.reqPayload || {})}`);
      }

      // Rejected samples (if present)
      const rej = asArray(data && (data.rejected || data.rejected_samples)).slice(0, 10);
      if (rej.length) {
        appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer rejected samples (first ${rej.length}):`);
        for (const r of rej) {
          appendLog(
            setLogRyzer,
            SECTION.Ryzer,
            `- reason=${r && r.reason ? r.reason : "n/a"} host="${r && (r.host || r.host_guess) ? (r.host || r.host_guess) : ""}" title="${r && r.title ? r.title : ""}" url="${r && (r.registrationUrl || r.url) ? (r.registrationUrl || r.url) : ""}"`
          );
        }
      }

      // DryRun => stop here
      if (ryzerDryRun) {
        appendLog(setLogRyzer, SECTION.Ryzer, "DryRun=true: no DB writes performed.");
        return;
      }

      const accepted = asArray(data && data.accepted ? data.accepted : []);
      if (!accepted.length) {
        appendLog(setLogRyzer, SECTION.Ryzer, "No accepted results to write.");
        return;
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (let i = 0; i < accepted.length; i++) {
        const item = accepted[i];

        const school_id =
          safeString(item && item.school && item.school.school_id ? item.school.school_id : null) ||
          safeString(item && item.school_id ? item.school_id : null);

        const ev = item && item.event ? item.event : item;

        const camp_name =
          safeString(ev && (ev.eventTitle || ev.event_title || ev.searchRowTitle) ? (ev.eventTitle || ev.event_title || ev.searchRowTitle) : null) ||
          "Camp";

        // Parse date from eventDates / daterange / startdate string best-effort
        let start_date = null;
        const rawDates = safeString(ev && (ev.eventDates || ev.daterange || ev.startdate || ev.start_date) ? (ev.eventDates || ev.daterange || ev.startdate || ev.start_date) : null);
        const m = rawDates ? rawDates.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) : null;
        if (m) start_date = toISODate(m[1]);

        if (!school_id || !start_date) {
          skipped += 1;
          appendLog(setLogRyzer, SECTION.Ryzer, `SKIP write: missing school_id or start_date | ${camp_name}`, "error");
          continue;
        }

        const link_url = safeString(ev && (ev.registrationUrl || ev.rlink || ev.url) ? (ev.registrationUrl || ev.rlink || ev.url) : null) || null;

        const { price_min, price_max, price_best } = parsePriceRangeFromText(ev && (ev.price || ev.cost) ? (ev.price || ev.cost) : null);

        const season_year = safeNumber(computeSeasonYearFootball(start_date));
        const source_platform = "ryzer";
        const program_id = safeString(ev && ev.programLabel ? ev.programLabel : null)
          ? `ryzer:${slugify(ev.programLabel)}`
          : `ryzer:${slugify(camp_name)}`;

        const event_key = buildEventKey({
          source_platform,
          program_id,
          start_date,
          link_url,
          source_url: link_url,
        });

        const payload = {
          school_id,
          sport_id: selectedSportId,
          camp_name,
          start_date,
          end_date: null,

          city: safeString(ev && ev.city ? ev.city : null) || null,
          state: safeString(ev && ev.state ? ev.state : null) || (item && item.school && item.school.state ? item.school.state : null) || null,

          position_ids: [],
          price: price_best != null ? price_best : null,
          link_url,
          notes: null,

          season_year: season_year != null ? season_year : null,
          program_id,
          event_key,
          source_platform,
          source_url: link_url,
          last_seen_at: runIso,
          content_hash: simpleHash({ school_id, camp_name, start_date, link_url, rawDates }),

          event_dates_raw: rawDates || null,
          grades_raw: safeString(ev && ev.grades ? ev.grades : null) || null,
          register_by_raw: safeString(ev && ev.registerBy ? ev.registerBy : null) || safeString(ev && ev.regEndDate ? ev.regEndDate : null) || null,
          price_raw: safeString(ev && (ev.price || ev.cost) ? (ev.price || ev.cost) : null) || null,
          price_min,
          price_max,
          sections_json: safeObject(ev && ev.sections ? ev.sections : null) || null,
        };

        const r = await upsertCampDemoByEventKey(payload);
        if (r === "created") created += 1;
        if (r === "updated") updated += 1;

        if ((i + 1) % 10 === 0) appendLog(setLogRyzer, SECTION.Ryzer, `Write progress: ${i + 1}/${accepted.length}`);
        await sleep(50);
      }

      appendLog(setLogRyzer, SECTION.Ryzer, `CampDemo writes done. created=${created} updated=${updated} skipped=${skipped}`);
    } catch (e) {
      appendLog(setLogRyzer, SECTION.Ryzer, `Ryzer ingestion ERROR: ${String(e && e.message ? e.message : e)}`, "error");
    } finally {
      setRyzerWorking(false);
    }
  }

  /* ----------------------------
     Promote CampDemo → Camp
  ----------------------------- */
  async function promoteCampDemoToCamp() {
    const runIso = nowIso();
    setPromoteWorking(true);
    setLogPromote("");
    setPromoteStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendLog(setLogPromote, SECTION.Promote, `Starting: Promote CampDemo → Camp @ ${runIso}`);

    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({}));
    } catch (e) {
      appendLog(setLogPromote, SECTION.Promote, `ERROR reading CampDemo: ${String(e && e.message ? e.message : e)}`, "error");
      setPromoteWorking(false);
      return;
    }

    appendLog(setLogPromote, SECTION.Promote, `Found CampDemo rows: ${demoRows.length}`);
    setPromoteStats((s) => ({ ...s, read: demoRows.length }));

    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];

      try {
        const built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          setPromoteStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendLog(setLogPromote, SECTION.Promote, `SKIP #${i + 1}: ${built.error}`, "error");
          continue;
        }

        const result = await upsertCampByEventKey(built.payload);

        if (result === "created") setPromoteStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setPromoteStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) appendLog(setLogPromote, SECTION.Promote, `Progress: ${i + 1}/${demoRows.length}`);
        await sleep(60);
      } catch (e) {
        setPromoteStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendLog(setLogPromote, SECTION.Promote, `ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`, "error");
      }
    }

    appendLog(setLogPromote, SECTION.Promote, "Done.");
    setPromoteWorking(false);
  }

  /* ----------------------------
     UI
  ----------------------------- */
  const anyWorking = sportsusaWorking || ryzerWorking || promoteWorking || seedWorking || sportAdminWorking;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">
              One sport selection drives Schools seeding, positions, ingestion, and promotion.
            </div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* =========================
            TOP: Single Sport Selector
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport selection</div>
          <div className="text-sm text-slate-600 mt-1">
            Pick the sport once. All tools below operate against this sport.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
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
                disabled={anyWorking || sportsLoading}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport to enable the tools below."}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => loadSports()} disabled={sportsLoading || anyWorking}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFeed([]);
                  setLogSportsUSA("");
                  setLogRyzer("");
                  setLogPromote("");
                  setLogPositions("");
                  setLogSportAdmin("");
                  setLogSportsManager("");
                  setSportAdminResult("");
                  setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });
                  setPromoteStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
                }}
                disabled={anyWorking}
              >
                Clear Logs
              </Button>
            </div>
          </div>

          {/* Run Feed */}
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">Run feed (most recent first)</div>
            <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200 w-44">Time</th>
                    <th className="p-2 border-b border-slate-200 w-44">Section</th>
                    <th className="p-2 border-b border-slate-200 w-20">Level</th>
                    <th className="p-2 border-b border-slate-200">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.length ? (
                    feed.map((f, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2 whitespace-nowrap">{f.ts}</td>
                        <td className="p-2 whitespace-nowrap">{f.section}</td>
                        <td className="p-2 whitespace-nowrap">{f.level}</td>
                        <td className="p-2">{f.msg}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-3 text-slate-500">
                        — No runs yet —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* =========================
            1) SportsUSA seed schools
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA Seed Schools</div>
          <div className="text-sm text-slate-600 mt-1">
            Seeds the <b>School</b> table for the selected sport (logo + view-site link).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={sportsusaDryRun}
                  onChange={(e) => setSportsusaDryRun(e.target.checked)}
                  disabled={sportsusaWorking || anyWorking}
                />
                Dry Run
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={sportsusaLimit}
                onChange={(e) => setSportsusaLimit(Number(e.target.value || 0))}
                min={50}
                max={5000}
                disabled={sportsusaWorking || anyWorking}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={runSportsUSASeedSchools} disabled={sportsusaWorking || anyWorking || !selectedSportId}>
                {sportsusaWorking ? "Running…" : sportsusaDryRun ? "Seed Schools (Dry Run)" : "Seed Schools → Write"}
              </Button>
            </div>
          </div>

          <LogPanel title="SportsUSA log" value={logSportsUSA} onClear={() => setLogSportsUSA("")} />
        </Card>

        {/* =========================
            2) Positions (seed + manage)
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Positions</div>
          <div className="text-sm text-slate-600 mt-1">
            Seed defaults or manage positions for <b>{selectedSportName || "the selected sport"}</b>.
          </div>

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <Button onClick={seedPositionsForSport} disabled={seedWorking || anyWorking || !selectedSportId}>
              {seedWorking ? "Seeding…" : "Auto-seed positions"}
            </Button>

            <Button
              variant="outline"
              onClick={() => loadPositionsForSport(selectedSportId)}
              disabled={!selectedSportId || positionsLoading || anyWorking}
            >
              {positionsLoading ? "Refreshing…" : "Refresh positions"}
            </Button>

            <div className="text-[11px] text-slate-500">
              {selectedSportName
                ? seedListForSelectedSport.length
                  ? `Default seeds available: ${seedListForSelectedSport.length}`
                  : "No default seeds for this sport (add to DEFAULT_POSITION_SEEDS)"
                : "Pick a sport at the top."}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={positionAddCode}
                onChange={(e) => setPositionAddCode(e.target.value)}
                placeholder="e.g., QB"
                disabled={!selectedSportId || anyWorking}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={positionAddName}
                onChange={(e) => setPositionAddName(e.target.value)}
                placeholder="e.g., Quarterback"
                disabled={!selectedSportId || anyWorking}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addPosition} disabled={!selectedSportId || positionAddWorking || anyWorking}>
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
                      const edit = (positionsEdit && positionsEdit[p.id]) ? positionsEdit[p.id] : { code: p.code, name: p.name };
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
                                    name: (prev[p.id] && prev[p.id].name != null) ? prev[p.id].name : p.name,
                                  },
                                }))
                              }
                              disabled={anyWorking}
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
                                    code: (prev[p.id] && prev[p.id].code != null) ? prev[p.id].code : p.code,
                                  },
                                }))
                              }
                              disabled={anyWorking}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                onClick={() => savePositionRow(p.id)}
                                disabled={positionSaveWorking || anyWorking}
                              >
                                Save
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => deletePosition(p.id)}
                                disabled={positionDeleteWorking === p.id || anyWorking}
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

            <div className="mt-4 text-sm text-slate-700">
              <div className="flex flex-wrap gap-4">
                <span><b>Seed Attempted:</b> {seedStats.attempted}</span>
                <span><b>Seed Created:</b> {seedStats.created}</span>
                <span><b>Seed Updated:</b> {seedStats.updated}</span>
                <span><b>Seed Errors:</b> {seedStats.errors}</span>
              </div>
            </div>
          </div>

          <LogPanel title="Positions log" value={logPositions} onClear={() => setLogPositions("")} />
        </Card>

        {/* =========================
            3) Ryzer ingestion
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Ryzer Ingestion</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls events from Ryzer and writes accepted results into <b>CampDemo</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ryzer ActivityTypeId (GUID)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ryzerActivityTypeId}
                onChange={(e) => setRyzerActivityTypeId(e.target.value)}
                placeholder='e.g., A8ADF526-3822-4261-ADCF-1592CF4BB7FF'
                disabled={ryzerWorking || anyWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Capture from DevTools → eventSearch payload field <b>ActivityTypes[0]</b>.
              </div>
            </div>

            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={ryzerDryRun}
                  onChange={(e) => setRyzerDryRun(e.target.checked)}
                  disabled={ryzerWorking || anyWorking}
                />
                Dry Run
              </label>
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
                disabled={ryzerWorking || anyWorking}
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
                disabled={ryzerWorking || anyWorking}
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
                disabled={ryzerWorking || anyWorking}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={runRyzerIngestion} disabled={ryzerWorking || anyWorking || !selectedSportId}>
              {ryzerWorking ? "Running…" : ryzerDryRun ? "Run Ryzer (Dry Run)" : "Run Ryzer → Write CampDemo"}
            </Button>
          </div>

          <LogPanel title="Ryzer log" value={logRyzer} onClear={() => setLogRyzer("")} />

          <div className="mt-2 text-[11px] text-slate-500">
            If you see auth errors (401/403), confirm Base44 Secret <b>RYZER_AUTH</b> is set to your DevTools authorization JWT.
          </div>
        </Card>

        {/* =========================
            4) Promote CampDemo → Camp
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>. Payload is normalized to the Camp schema.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={promoteWorking || anyWorking}>
              {promoteWorking ? "Running…" : "Run Promotion"}
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

          <LogPanel title="Promotion log" value={logPromote} onClear={() => setLogPromote("")} />
        </Card>

        {/* =========================
            5) Sport Admin quick fixes
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport Admin (quick fixes)</div>
          <div className="text-sm text-slate-600 mt-1">One-click utilities for known corrections.</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={ensureSoccerVariants} disabled={sportAdminWorking || anyWorking}>
              {sportAdminWorking ? "Updating…" : "Ensure Men's/Women's Soccer"}
            </Button>

            <Button onClick={normalizeVolleyballSpelling} disabled={sportAdminWorking || anyWorking}>
              {sportAdminWorking ? "Updating…" : "Normalize Volleyball spelling"}
            </Button>

            <Button variant="outline" onClick={backfillSportActiveTrue} disabled={sportAdminWorking || anyWorking}>
              Backfill Active=True
            </Button>
          </div>

          {sportAdminResult ? (
            <div className="mt-3 text-xs text-slate-700">
              <b>Result:</b> {sportAdminResult}
            </div>
          ) : null}

          <LogPanel title="Sport Admin log" value={logSportAdmin} onClear={() => setLogSportAdmin("")} />

          <div className="mt-3 text-[11px] text-slate-500">
            Note: Active/Inactive only persists once the <b>Sport.active</b> boolean field exists in your data model.
          </div>
        </Card>

        {/* =========================
            6) Sports Manager (CRUD)
           ========================= */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Manage Sports</div>
          <div className="text-sm text-slate-600 mt-1">
            Add/rename sports and control visibility with <b>Active/Inactive</b>.
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">New sport name</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={newSportName}
                onChange={(e) => setNewSportName(e.target.value)}
                placeholder="e.g., Lacrosse"
                disabled={anyWorking}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={createSport} disabled={sportCreateWorking || anyWorking || !safeString(newSportName)}>
                {sportCreateWorking ? "Creating…" : "Create Sport"}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">Sports</div>

            <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200 w-20">Active</th>
                    <th className="p-2 border-b border-slate-200">Sport name</th>
                    <th className="p-2 border-b border-slate-200 w-44">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sports.length ? (
                    sports.map((s) => {
                      const edit = (sportsEdit && sportsEdit[s.id]) ? sportsEdit[s.id] : { name: s.name, active: s.active };
                      return (
                        <tr key={s.id} className="border-b border-slate-100">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={!!edit.active}
                              onChange={(e) =>
                                setSportsEdit((prev) => ({
                                  ...prev,
                                  [s.id]: {
                                    ...(prev[s.id] || {}),
                                    active: e.target.checked,
                                    name: (prev[s.id] && prev[s.id].name != null) ? prev[s.id].name : s.name,
                                  },
                                }))
                              }
                              disabled={anyWorking}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                              value={edit.name ?? ""}
                              onChange={(e) =>
                                setSportsEdit((prev) => ({
                                  ...prev,
                                  [s.id]: {
                                    ...(prev[s.id] || {}),
                                    name: e.target.value,
                                    active: (prev[s.id] && prev[s.id].active != null) ? prev[s.id].active : s.active,
                                  },
                                }))
                              }
                              disabled={anyWorking}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => saveSportRow(s.id)} disabled={sportSaveWorking || anyWorking}>
                                Save
                              </Button>
                              <Button variant="outline" onClick={() => deleteSport(s.id)} disabled={sportDeleteWorking === s.id || anyWorking}>
                                {sportDeleteWorking === s.id ? "Deleting…" : "Delete"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-3 text-slate-500">
                        {sportsLoading ? "Loading…" : "No sports found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Best practice: use <b>Inactive</b> instead of delete once the sport is in use.
            </div>
          </div>

          <LogPanel title="Sports manager log" value={logSportsManager} onClear={() => setLogSportsManager("")} />
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={anyWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
