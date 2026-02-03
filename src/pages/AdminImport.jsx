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

// ✅ URL normalization for fuzzy matching (http/https, www, trailing slash)
function normalizeUrlKey(u) {
  const s = safeString(u);
  if (!s) return null;
  let x = s.trim().toLowerCase();
  x = x.replace(/^https?:\/\//, "");
  x = x.replace(/^www\./, "");
  x = x.replace(/\/+$/, "");
  return x;
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

function lc(x) {
  return String(x || "").toLowerCase().trim();
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
  Vollyball: [
    { position_code: "S", position_name: "Setter" },
    { position_code: "OH", position_name: "Outside Hitter" },
    { position_code: "MB", position_name: "Middle Blocker" },
    { position_code: "OPP", position_name: "Opposite" },
    { position_code: "L", position_name: "Libero" },
    { position_code: "DS", position_name: "Defensive Specialist" },
  ],
  Volleyball: [
    { position_code: "S", position_name: "Setter" },
    { position_code: "OH", position_name: "Outside Hitter" },
    { position_code: "MB", position_name: "Middle Blocker" },
    { position_code: "OPP", position_name: "Opposite" },
    { position_code: "L", position_name: "Libero" },
    { position_code: "DS", position_name: "Defensive Specialist" },
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
  Soccer: [
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
  return String((r && (r.sport_name || r.name || r.sportName)) || "").trim();
}

function readActiveFlag(row) {
  if (row && typeof row.active === "boolean") return row.active;
  if (row && typeof row.is_active === "boolean") return row.is_active;
  if (row && typeof row.isActive === "boolean") return row.isActive;
  const st = String((row && row.status) || "").toLowerCase().trim();
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
----------------------------- */
const RYZER_ACTIVITY_TYPE_BY_SPORTNAME = {
  Football: "A8ADF526-3822-4261-ADCF-1592CF4BB7FF",
};

export default function AdminImport() {
  const nav = useNavigate();

  const [logMain, setLogMain] = useState("");
  const appendMain = (line) => setLogMain((p) => (p ? p + "\n" + line : line));

  // ✅ Unique logs per section
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");
  const [logPromote, setLogPromote] = useState("");
  const [logAdmin, setLogAdmin] = useState("");

  const appendSportsUSA = (line) => setLogSportsUSA((p) => (p ? p + "\n" + line : line));
  const appendCamps = (line) => setLogCamps((p) => (p ? p + "\n" + line : line));
  const appendPromote = (line) => setLogPromote((p) => (p ? p + "\n" + line : line));
  const appendAdmin = (line) => setLogAdmin((p) => (p ? p + "\n" + line : line));

  // Global "working" flags
  const [working, setWorking] = useState(false);
  const [seedWorking, setSeedWorking] = useState(false);
  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [sportAdminWorking, setSportAdminWorking] = useState(false);

  // Stats for promotion
  const [stats, setStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  // Sports
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // Positions
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsEdit, setPositionsEdit] = useState({});
  const [positionAddCode, setPositionAddCode] = useState("");
  const [positionAddName, setPositionAddName] = useState("");
  const [positionAddWorking, setPositionAddWorking] = useState(false);
  const [positionSaveWorking, setPositionSaveWorking] = useState(false);
  const [positionDeleteWorking, setPositionDeleteWorking] = useState("");
  const [seedStats, setSeedStats] = useState({ attempted: 0, created: 0, updated: 0, errors: 0 });

  // Sport admin actions
  const [sportAdminResult, setSportAdminResult] = useState("");

  // Manual Sport Manager
  const [newSportName, setNewSportName] = useState("");
  const [sportsEdit, setSportsEdit] = useState({});
  const [sportSaveWorking, setSportSaveWorking] = useState(false);
  const [sportCreateWorking, setSportCreateWorking] = useState(false);
  const [sportDeleteWorking, setSportDeleteWorking] = useState("");

  // Ryzer ingestion controls
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerRecordsPerPage, setRyzerRecordsPerPage] = useState(25);
  const [ryzerMaxPages, setRyzerMaxPages] = useState(10);
  const [ryzerMaxEvents, setRyzerMaxEvents] = useState(200);
  const [ryzerActivityTypeId, setRyzerActivityTypeId] = useState("");

  // SportsUSA seed controls
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);
  const [sportsUSASiteUrl, setSportsUSASiteUrl] = useState("");

  // SportsUSA camps ingest controls
  const [campsWorking, setCampsWorking] = useState(false);
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(5);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(5);
  const [campsMaxEvents, setCampsMaxEvents] = useState(25);
  const [testSchoolId, setTestSchoolId] = useState("");
  const [testSiteUrl, setTestSiteUrl] = useState("");

  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  // Entities
  const SportEntity = (base44 && base44.entities && (base44.entities.Sport || base44.entities.Sports)) || null;
  const PositionEntity = (base44 && base44.entities && (base44.entities.Position || base44.entities.Positions)) || null;
  const SchoolEntity = (base44 && base44.entities && (base44.entities.School || base44.entities.Schools)) || null;
  const SchoolSportSiteEntity =
    (base44 && base44.entities && (base44.entities.SchoolSportSite || base44.entities.SchoolSportSites)) || null;
  const CampDemoEntity = (base44 && base44.entities && base44.entities.CampDemo) || null;

  // When sport changes, auto-fill Ryzer ActivityTypeId if known + SportsUSA site URL if empty
  useEffect(() => {
    const guess = RYZER_ACTIVITY_TYPE_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setRyzerActivityTypeId(guess);

    // ✅ Auto-fill SportsUSA directory by sport name (no SchoolSportSite pre-req)
    const sn = String(selectedSportName || "").trim();
    if (sn === "Football") setSportsUSASiteUrl("https://www.footballcampsusa.com/");
    else if (sn === "Baseball") setSportsUSASiteUrl("https://www.baseballcampsusa.com/");
    else if (sn === "Softball") setSportsUSASiteUrl("https://www.softballcampsusa.com/");
    else if (sn === "Soccer" || sn === "Men's Soccer" || sn === "Women's Soccer")
      setSportsUSASiteUrl("https://www.soccercampsusa.com/");
    else if (sn === "Basketball") setSportsUSASiteUrl("https://www.basketballcampsusa.com/");
    else if (sn === "Volleyball") setSportsUSASiteUrl("https://www.volleyballcampsusa.com/");
  }, [selectedSportName]);

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
      for (const s of normalized) {
        nextEdit[s.id] = { name: s.name, active: !!s.active };
      }
      setSportsEdit(nextEdit);

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
          code: String((r && r.position_code) || "").trim(),
          name: String((r && r.position_name) || "").trim(),
          raw: r,
        }))
        .filter((p) => p.id);

      normalized.sort(
        (a, b) => (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || "")
      );
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

  // positions refresh when sport changes
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
     Camp promotion
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    const key = payload && payload.event_key;
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

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r && r.school_id);
    const sport_id = safeString(r && r.sport_id);
    const camp_name = safeString((r && (r.camp_name || r.name)) || null);

    const start_date = toISODate(r && r.start_date);
    const end_date = toISODate(r && r.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date) {
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };
    }

    const city = safeString(r && r.city);
    const state = safeString(r && r.state);
    const position_ids = normalizeStringArray(r && r.position_ids);

    const price = safeNumber(r && r.price);

    const link_url = safeString((r && (r.link_url || r.url)) || null);
    const source_url = safeString((r && r.source_url) || null) || link_url;

    const season_year = safeNumber((r && r.season_year) || null) ?? safeNumber(computeSeasonYearFootball(start_date));

    const source_platform = safeString((r && r.source_platform) || null) || "seed";
    const program_id = safeString((r && r.program_id) || null) || seedProgramId({ school_id, camp_name });

    const event_key =
      safeString((r && r.event_key) || null) ||
      buildEventKey({ source_platform, program_id, start_date, link_url, source_url });

    const content_hash =
      safeString((r && r.content_hash) || null) ||
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
        notes: safeString(r && r.notes),
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
      notes: safeString(r && r.notes) || null,

      season_year: season_year != null ? season_year : null,
      program_id,
      event_key,
      source_platform,
      source_url: source_url || null,
      last_seen_at: runIso,
      content_hash,

      event_dates_raw: safeString(r && r.event_dates_raw) || null,
      grades_raw: safeString(r && r.grades_raw) || null,
      register_by_raw: safeString(r && r.register_by_raw) || null,
      price_raw: safeString(r && r.price_raw) || null,
      price_min: safeNumber(r && r.price_min),
      price_max: safeNumber(r && r.price_max),
      sections_json: safeObject(tryParseJson(r && r.sections_json)) || null,
    };

    return { payload };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();

    setWorking(true);
    setLogPromote("");
    setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendPromote(`Starting: Promote CampDemo → Camp @ ${runIso}`);

    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({}));
    } catch (e) {
      appendPromote(`ERROR reading CampDemo: ${String((e && e.message) || e)}`);
      setWorking(false);
      return;
    }

    appendPromote(`Found CampDemo rows: ${demoRows.length}`);
    setStats((s) => ({ ...s, read: demoRows.length }));

    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];
      try {
        const built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendPromote(`SKIP #${i + 1}: ${built.error}`);
          continue;
        }

        const result = await upsertCampByEventKey(built.payload);
        if (result === "created") setStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) appendPromote(`Progress: ${i + 1}/${demoRows.length}`);
        await sleep(60);
      } catch (e) {
        setStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendPromote(`ERROR #${i + 1}: ${String((e && e.message) || e)}`);
      }
    }

    appendPromote("Done.");
    setWorking(false);
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

    const hit = existing.find((r) => String((r && r.position_code) || "").trim().toUpperCase() === position_code);
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
    setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });
    appendAdmin(`Starting: Seed Positions @ ${runIso}`);

    if (!selectedSportId) {
      appendAdmin("ERROR: Select a sport first.");
      setSeedWorking(false);
      return;
    }

    const list = seedListForSelectedSport;
    if (!list.length) {
      appendAdmin(`ERROR: No default seed list found for sport "${selectedSportName || "?"}".`);
      setSeedWorking(false);
      return;
    }

    appendAdmin(`Sport: ${selectedSportName} (${selectedSportId})`);
    appendAdmin(`Seed rows: ${list.length}`);

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

        if ((i + 1) % 10 === 0) appendAdmin(`Seed progress: ${i + 1}/${list.length}`);
        await sleep(40);
      } catch (e) {
        setSeedStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendAdmin(`SEED ERROR #${i + 1}: ${String((e && e.message) || e)}`);
      }
    }

    appendAdmin("Seed Positions done.");
    setSeedWorking(false);
    await loadPositionsForSport(selectedSportId);
  }

  /* ----------------------------
     SportsUSA Seed Schools (client -> server function -> DB writes)
  ----------------------------- */
  function makeNormalizedSchoolName(name) {
    const s = safeString(name);
    if (!s) return null;
    return s
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  async function upsertSchoolByName(school_name, logo_url, source_school_url, runIso) {
    if (!SchoolEntity || !SchoolEntity.filter || !SchoolEntity.create || !SchoolEntity.update) {
      throw new Error("School entity not available (expected entities.School).");
    }

    const name = safeString(school_name);
    if (!name) throw new Error("Missing school_name.");

    const normalized_name = makeNormalizedSchoolName(name);

    let existing = [];
    try {
      existing = asArray(await SchoolEntity.filter({ school_name: name }));
    } catch {
      existing = [];
    }

    const payload = {
      school_name: name,
      normalized_name: normalized_name || null,
      logo_url: safeString(logo_url) || null,
      source_platform: "sportsusa",
      source_school_url: safeString(source_school_url) || null,
      active: true,
      needs_review: true,
      last_seen_at: runIso,
    };

    if (existing.length && existing[0] && existing[0].id) {
      await SchoolEntity.update(String(existing[0].id), payload);
      return { status: "updated", id: String(existing[0].id) };
    }

    const created = await SchoolEntity.create(payload);
    const id = created && created.id ? String(created.id) : null;
    return { status: "created", id };
  }

  async function upsertSchoolSportSite(school_id, sport_id, camp_site_url, logo_url, runIso) {
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter || !SchoolSportSiteEntity.create || !SchoolSportSiteEntity.update) {
      throw new Error("SchoolSportSite entity not available (expected entities.SchoolSportSite).");
    }

    const schoolId = safeString(school_id);
    const sportId = safeString(sport_id);
    const url = safeString(camp_site_url);

    if (!schoolId || !sportId || !url) throw new Error("Missing school_id/sport_id/camp_site_url for SchoolSportSite.");

    // Dedup key: sportsusa:<sport_id>:<normalized url key>
    const source_key = `sportsusa:${sportId}:${normalizeUrlKey(url) || slugify(url)}`;

    let existing = [];
    try {
      existing = asArray(await SchoolSportSiteEntity.filter({ school_id: schoolId, sport_id: sportId }));
    } catch {
      existing = [];
    }

    // try match by url normalized
    let hit = null;
    const wanted = normalizeUrlKey(url);
    for (let i = 0; i < existing.length; i++) {
      const row = existing[i] || {};
      const have = normalizeUrlKey(row.camp_site_url);
      if (have && wanted && have === wanted) {
        hit = row;
        break;
      }
    }

    const payload = {
      school_id: schoolId,
      sport_id: sportId,
      camp_site_url: url,
      logo_url: safeString(logo_url) || null,
      source_platform: "sportsusa",
      source_key,
      active: true,
      needs_review: true,
      last_seen_at: runIso,
    };

    if (hit && hit.id) {
      await SchoolSportSiteEntity.update(String(hit.id), payload);
      return { status: "updated", id: String(hit.id) };
    }

    const created = await SchoolSportSiteEntity.create(payload);
    const id = created && created.id ? String(created.id) : null;
    return { status: "created", id };
  }

  async function runSportsUSASeedSchools() {
    if (!selectedSportId) return appendSportsUSA("[SportsUSA] ERROR: Select a sport first.");
    if (!safeString(sportsUSASiteUrl)) return appendSportsUSA("[SportsUSA] ERROR: Provide a SportsUSA directory URL.");

    const runIso = new Date().toISOString();

    setLogSportsUSA("");
    appendSportsUSA(`[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName}) @ ${runIso}`);
    appendSportsUSA(`[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);

    try {
      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl: sportsUSASiteUrl,
          limit: sportsUSALimit,
          dryRun: sportsUSADryRun,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendSportsUSA(`[SportsUSA] ERROR: SportsUSA function ERROR (HTTP ${res.status})`);
        appendSportsUSA(JSON.stringify(data || {}, null, 2));
        appendSportsUSA("[SportsUSA] NOTE: If you don't have /functions/sportsUSASeedSchools yet, you must add it (server-side scrape to avoid CORS).");
        return;
      }

      appendSportsUSA(
        `[SportsUSA] SportsUSA fetched: schools_found=${(data && data.stats && data.stats.schools_found) || 0} | http=${(data && data.stats && data.stats.http) || "n/a"}`
      );

      const schools = asArray(data && data.schools);

      const sample = schools.slice(0, 3);
      if (sample.length) {
        appendSportsUSA("[SportsUSA] SportsUSA sample (first 3):");
        for (let i = 0; i < sample.length; i++) {
          const s = sample[i] || {};
          appendSportsUSA(
            `- name="${s.school_name || ""}" | logo="${s.logo_url || ""}" | view="${s.view_site_url || ""}"`
          );
        }
      }

      if (sportsUSADryRun) {
        appendSportsUSA("[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      if (!SchoolEntity || !SchoolSportSiteEntity) {
        appendSportsUSA("[SportsUSA] ERROR: Missing School and/or SchoolSportSite entities in Base44.");
        return;
      }

      appendSportsUSA(`[SportsUSA] Writing ${schools.length} rows to School + SchoolSportSite…`);

      let schoolCreated = 0;
      let schoolUpdated = 0;
      let siteCreated = 0;
      let siteUpdated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < schools.length; i++) {
        const s = schools[i] || {};
        const school_name = safeString(s.school_name);
        const logo_url = safeString(s.logo_url);
        const view_site_url = safeString(s.view_site_url);

        if (!school_name || !view_site_url) {
          skipped += 1;
          continue;
        }

        try {
          const sch = await upsertSchoolByName(school_name, logo_url, view_site_url, runIso);
          if (sch.status === "created") schoolCreated += 1;
          else schoolUpdated += 1;

          const sid = sch.id;
          if (!sid) {
            skipped += 1;
            continue;
          }

          const site = await upsertSchoolSportSite(sid, selectedSportId, view_site_url, logo_url, runIso);
          if (site.status === "created") siteCreated += 1;
          else siteUpdated += 1;
        } catch (e) {
          errors += 1;
          appendSportsUSA(`[SportsUSA] ERROR row #${i + 1}: ${String((e && e.message) || e)}`);
        }

        if ((i + 1) % 10 === 0) {
          appendSportsUSA(
            `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolCreated}/${schoolUpdated} | Sites c/u=${siteCreated}/${siteUpdated} | skipped=${skipped} errors=${errors}`
          );
          await sleep(25);
        }
      }

      appendSportsUSA(
        `[SportsUSA] Writes done. Schools: created=${schoolCreated} updated=${schoolUpdated} | Sites: created=${siteCreated} updated=${siteUpdated} | skipped=${skipped} errors=${errors}`
      );
    } catch (e) {
      appendSportsUSA(`[SportsUSA] ERROR: ${String((e && e.message) || e)}`);
    }
  }

  /* ----------------------------
     SportsUSA Camps Ingest
     ✅ Update #2: Allow testSiteUrl without testSchoolId when DryRun=true
     ✅ Update #1: Fuzzy match testSiteUrl to SchoolSportSite using normalizeUrlKey
  ----------------------------- */
  async function runSportsUSACampsIngest() {
    if (!selectedSportId) return appendCamps("[Camps] ERROR: Select a sport first.");
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter) return appendCamps("[Camps] ERROR: SchoolSportSite entity not available.");
    if (!CampDemoEntity) return appendCamps("[Camps] ERROR: CampDemo entity not available.");

    const runIso = new Date().toISOString();

    setLogCamps("");
    setCampsWorking(true);

    appendCamps(`[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
    appendCamps(
      `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents}`
    );

    try {
      const siteRowsAll = asArray(await SchoolSportSiteEntity.filter({ sport_id: selectedSportId, active: true }));
      appendCamps(`[Camps] Loaded SchoolSportSite rows: ${siteRowsAll.length} (active)`);

      // Build selected sites
      let sites = siteRowsAll.slice(0, Math.max(1, Number(campsMaxSites || 1)));

      const tUrl = safeString(testSiteUrl);
      const tSchool = safeString(testSchoolId);

      if (tUrl) {
        // Replace site list with just the test URL
        sites = [
          {
            school_id: tSchool || null,
            sport_id: selectedSportId,
            camp_site_url: tUrl,
          },
        ];
        appendCamps("[Camps] Using TEST single site mode.");
      }

      // ✅ UPDATED guardrail
      if (tUrl && !tSchool) {
        const wantedKey = normalizeUrlKey(tUrl);
        let hit = null;

        for (let i = 0; i < siteRowsAll.length; i++) {
          const row = siteRowsAll[i] || {};
          const haveKey = normalizeUrlKey(row.camp_site_url);
          if (haveKey && wantedKey && haveKey === wantedKey) {
            hit = row;
            break;
          }
        }

        if (hit && hit.school_id) {
          sites[0].school_id = String(hit.school_id);
          appendCamps(`[Camps] TestSiteUrl matched SchoolSportSite (normalized); using school_id=${String(hit.school_id)}`);
        } else {
          if (campsDryRun) {
            sites[0].school_id = "__TEST_SCHOOL_ID__";
            appendCamps("[Camps] NOTE: TestSiteUrl not found in SchoolSportSite. DryRun=true so continuing with placeholder school_id.");
          } else {
            appendCamps("[Camps] ERROR: TestSiteUrl not found in SchoolSportSite. Provide Test School ID (required when DryRun=false).");
            setCampsWorking(false);
            return;
          }
        }
      }

      // Call server-side collector
      const res = await fetch("/functions/sportsUSAIngestCamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          dryRun: campsDryRun,
          maxRegsPerSite: Number(campsMaxRegsPerSite || 5),
          maxEvents: Number(campsMaxEvents || 25),
          sites: sites.map((s) => ({
            school_id: safeString(s.school_id),
            sport_id: selectedSportId,
            camp_site_url: safeString(s.camp_site_url),
            logo_url: safeString(s.logo_url) || null,
          })),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendCamps(`[Camps] ERROR: SportsUSAIngestCamps function ERROR (HTTP ${res.status})`);
        appendCamps(JSON.stringify(data || {}, null, 2));
        setCampsWorking(false);
        return;
      }

      appendCamps(
        `[Camps] Function stats: processedSites=${(data && data.stats && data.stats.processedSites) || 0} processedRegs=${(data && data.stats && data.stats.processedRegs) || 0} accepted=${(data && data.stats && data.stats.accepted) || 0} rejected=${(data && data.stats && data.stats.rejected) || 0} errors=${(data && data.stats && data.stats.errors) || 0}`
      );
      appendCamps(`[Camps] Function version: ${(data && data.debug && data.debug.version) || "n/a"}`);

      const siteDebug = asArray(data && data.debug && data.debug.sites);
      if (siteDebug.length) {
        appendCamps(`[Camps] Site debug (first ${Math.min(3, siteDebug.length)}):`);
        for (let i = 0; i < Math.min(3, siteDebug.length); i++) {
          const sd = siteDebug[i] || {};
          appendCamps(
            `- school_id=${sd.school_id || ""} http=${sd.http || ""} html=${sd.htmlType || ""} regLinks=${sd.regLinks || 0} sample=${sd.sampleRegLink || ""}`
          );
          if (sd.notes) appendCamps(`  notes=${sd.notes}`);
        }
      }

      const accepted = asArray(data && data.accepted);
      if (!accepted.length) {
        appendCamps("[Camps] No accepted events returned from function.");
        const firstSnippet = safeString(data && data.debug && data.debug.firstSiteHtmlSnippet);
        if (firstSnippet) {
          appendCamps("[Camps] First site HTML snippet (debug):");
          appendCamps(firstSnippet);
        }
        setCampsWorking(false);
        return;
      }

      if (campsDryRun) {
        appendCamps("[Camps] DryRun=true: no CampDemo writes performed.");
        setCampsWorking(false);
        return;
      }

      // Write accepted into CampDemo
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      async function upsertCampDemoByEventKey(payload) {
        const key = payload && payload.event_key;
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

      for (let i = 0; i < accepted.length; i++) {
        const item = accepted[i] || {};
        const school_id = safeString(item.school_id);
        const link_url = safeString(item.link_url || item.registration_url);

        const start_date = toISODate(item.start_date);
        if (!school_id || !start_date) {
          skipped += 1;
          continue;
        }

        const camp_name = safeString(item.camp_name || "Camp");
        const season_year = safeNumber(computeSeasonYearFootball(start_date));
        const source_platform = safeString(item.source_platform) || "sportsusa";
        const program_id = safeString(item.program_id) || `sportsusa:${slugify(camp_name)}`;

        const event_key =
          safeString(item.event_key) ||
          buildEventKey({
            source_platform,
            program_id,
            start_date,
            link_url,
            source_url: safeString(item.source_url) || link_url,
          });

        const payload = {
          school_id,
          sport_id: selectedSportId,
          camp_name,
          start_date,
          end_date: toISODate(item.end_date),
          city: safeString(item.city),
          state: safeString(item.state),
          position_ids: [],
          price: safeNumber(item.price),
          link_url: link_url,
          notes: safeString(item.notes),

          season_year: season_year != null ? season_year : null,
          program_id,
          event_key,
          source_platform,
          source_url: safeString(item.source_url) || link_url,
          last_seen_at: runIso,
          content_hash: safeString(item.content_hash) || simpleHash({ school_id, camp_name, start_date, link_url }),

          event_dates_raw: safeString(item.event_dates_raw),
          grades_raw: safeString(item.grades_raw),
          register_by_raw: safeString(item.register_by_raw),
          price_raw: safeString(item.price_raw),
          price_min: safeNumber(item.price_min),
          price_max: safeNumber(item.price_max),
          sections_json: safeObject(item.sections_json),
        };

        try {
          const r = await upsertCampDemoByEventKey(payload);
          if (r === "created") created += 1;
          else updated += 1;
        } catch (e) {
          errors += 1;
          appendCamps(`[Camps] WRITE ERROR #${i + 1}: ${String((e && e.message) || e)}`);
        }

        if ((i + 1) % 10 === 0) appendCamps(`[Camps] Write progress: ${i + 1}/${accepted.length}`);
        await sleep(35);
      }

      appendCamps(`[Camps] CampDemo writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } catch (e) {
      appendCamps(`[Camps] ERROR: ${String((e && e.message) || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     Sport Admin (normalize + split)
  ----------------------------- */
  async function ensureSoccerVariants() {
    setSportAdminWorking(true);
    setSportAdminResult("");

    if (!SportEntity || !SportEntity.filter || !SportEntity.update || !SportEntity.create) {
      setSportAdminResult("ERROR: Sport entity not available (expected entities.Sport).");
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

      setSportAdminResult(actions.join(" | "));
      appendAdmin(`Sport Admin: ${actions.join(" | ")}`);

      await loadSports();
    } catch (e) {
      const msg = `ERROR: ${String((e && e.message) || e)}`;
      setSportAdminResult(msg);
      appendAdmin(`Sport Admin ERROR: ${msg}`);
    } finally {
      setSportAdminWorking(false);
    }
  }

  async function normalizeVolleyballSpelling() {
    setSportAdminWorking(true);
    setSportAdminResult("");

    if (!SportEntity || !SportEntity.filter || !SportEntity.update) {
      setSportAdminResult("ERROR: Sport entity not available (expected entities.Sport).");
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

      setSportAdminResult(actions.join(" | "));
      appendAdmin(`Sport Admin: ${actions.join(" | ")}`);

      await loadSports();
    } catch (e) {
      const msg = `ERROR: ${String((e && e.message) || e)}`;
      setSportAdminResult(msg);
      appendAdmin(`Sport Admin ERROR: ${msg}`);
    } finally {
      setSportAdminWorking(false);
    }
  }

  /* ----------------------------
     Manual Sport Manager (CRUD + Active/Inactive)
  ----------------------------- */
  async function saveSportRow(sportId) {
    if (!SportEntity || !SportEntity.update) {
      appendAdmin("ERROR: Sport entity not available for update.");
      return;
    }

    const row = sportsEdit && sportsEdit[sportId];
    if (!row) return;

    const name = safeString(row.name);
    const active = !!row.active;

    if (!name) {
      appendAdmin("ERROR: Sport name is required.");
      return;
    }

    setSportSaveWorking(true);
    try {
      const okName = await tryUpdateWithPayloads(SportEntity, sportId, [{ sport_name: name }, { name }, { sportName: name }]);

      const okActive = await tryUpdateWithPayloads(SportEntity, sportId, [
        { active },
        { is_active: active },
        { isActive: active },
        { status: active ? "Active" : "Inactive" },
      ]);

      appendAdmin(`Saved Sport: ${name} | name=${okName ? "OK" : "FAIL"} | active=${okActive ? "OK" : "FAIL"}`);
      await loadSports();
    } finally {
      setSportSaveWorking(false);
    }
  }

  async function createSport() {
    if (!SportEntity || !SportEntity.create) {
      appendAdmin("ERROR: Sport entity not available for create.");
      return;
    }

    const name = safeString(newSportName);
    if (!name) return appendAdmin("ERROR: New sport name is required.");

    setSportCreateWorking(true);
    try {
      const created = await tryCreateWithPayloads(SportEntity, [
        { sport_name: name, active: true },
        { name, active: true },
        { sportName: name, active: true },
        { sport_name: name, status: "Active" },
        { name, status: "Active" },
      ]);

      appendAdmin(created ? `Created Sport: ${name}` : `FAILED create Sport: ${name}`);
      setNewSportName("");
      await loadSports();
    } finally {
      setSportCreateWorking(false);
    }
  }

  async function deleteSport(sportId) {
    if (!sportId) return;
    if (!SportEntity) {
      appendAdmin("ERROR: Sport entity missing.");
      return;
    }

    const hit = sports.find((s) => s.id === sportId);
    const label = (hit && hit.name) || sportId;

    let hasPositions = false;
    try {
      if (PositionEntity && PositionEntity.filter) {
        const rows = asArray(await PositionEntity.filter({ sport_id: sportId }));
        hasPositions = rows.length > 0;
      }
    } catch {}

    if (hasPositions) {
      appendAdmin(`BLOCKED delete Sport "${label}": positions exist. Mark Inactive instead.`);
      return;
    }

    setSportDeleteWorking(sportId);
    try {
      const ok = await tryDelete(SportEntity, sportId);
      appendAdmin(ok ? `Deleted Sport: ${label}` : `FAILED delete Sport: ${label}`);
      await loadSports();
    } finally {
      setSportDeleteWorking("");
    }
  }

  async function backfillSportActiveTrue() {
    if (!SportEntity || !SportEntity.filter || !SportEntity.update) {
      appendAdmin("ERROR: Sport entity not available for backfill.");
      return;
    }

    appendAdmin("Backfill: setting active=true on all sports...");
    const rows = asArray(await SportEntity.filter({}));

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const id = r.id ? String(r.id) : "";
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

      if ((i + 1) % 10 === 0) appendAdmin(`Backfill progress: ${i + 1}/${rows.length}`);
      await sleep(25);
    }

    appendAdmin(`Backfill done. OK=${ok} FAIL=${fail}`);
    await loadSports();
  }

  /* ----------------------------
     Manual Position Manager (CRUD)
  ----------------------------- */
  async function addPosition() {
    if (!PositionEntity || !PositionEntity.create) {
      appendAdmin("ERROR: Position entity not available for create.");
      return;
    }
    if (!selectedSportId) return appendAdmin("ERROR: Select a sport first.");

    const code = safeString(positionAddCode);
    const name = safeString(positionAddName);

    if (!code) return appendAdmin("ERROR: Position code is required.");
    if (!name) return appendAdmin("ERROR: Position name is required.");

    setPositionAddWorking(true);
    try {
      const result = await upsertPositionBySportAndCode({ sportId: selectedSportId, code: code.toUpperCase(), name });
      appendAdmin(result === "created" ? `Created Position ${code.toUpperCase()}` : `Updated Position ${code.toUpperCase()}`);
      setPositionAddCode("");
      setPositionAddName("");
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendAdmin(`ERROR add Position: ${String((e && e.message) || e)}`);
    } finally {
      setPositionAddWorking(false);
    }
  }

  async function savePositionRow(positionId) {
    if (!PositionEntity || !PositionEntity.update) {
      appendAdmin("ERROR: Position entity not available for update.");
      return;
    }
    const row = positionsEdit && positionsEdit[positionId];
    if (!row) return;

    const code = safeString(row.code);
    const name = safeString(row.name);

    if (!selectedSportId) return appendAdmin("ERROR: Select a sport first.");
    if (!code) return appendAdmin("ERROR: Position code is required.");
    if (!name) return appendAdmin("ERROR: Position name is required.");

    setPositionSaveWorking(true);
    try {
      await PositionEntity.update(String(positionId), {
        sport_id: selectedSportId,
        position_code: code.toUpperCase(),
        position_name: name,
      });
      appendAdmin(`Saved Position: ${code.toUpperCase()}`);
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendAdmin(`FAILED save Position: ${String((e && e.message) || e)}`);
    } finally {
      setPositionSaveWorking(false);
    }
  }

  async function deletePosition(positionId) {
    if (!positionId) return;
    if (!PositionEntity) {
      appendAdmin("ERROR: Position entity missing.");
      return;
    }

    const hit = positions.find((p) => p.id === positionId);
    const label = hit && hit.code ? `${hit.code} — ${hit.name || ""}` : positionId;

    setPositionDeleteWorking(positionId);
    try {
      const ok = await tryDelete(PositionEntity, positionId);
      appendAdmin(ok ? `Deleted Position: ${label}` : `FAILED delete Position: ${label}`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setPositionDeleteWorking("");
    }
  }

  // convenience: clear all logs
  function clearAllLogs() {
    setLogMain("");
    setLogSportsUSA("");
    setLogCamps("");
    setLogPromote("");
    setLogAdmin("");
    setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
    setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });
    setSportAdminResult("");
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">
              One sport selection drives all sections. SportsUSA seed → School/Site, Camps ingest → CampDemo, Promote → Camp.
            </div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* ✅ Sport selection (single selector at top) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport Selection</div>
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
                  setSelectedSportName((hit && hit.name) || "");
                }}
                disabled={seedWorking || working || sportAdminWorking || sportsLoading || campsWorking || ryzerWorking}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport to activate the tools below."}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadSports()} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button variant="outline" onClick={clearAllLogs}>
                Clear Logs
              </Button>
            </div>
          </div>
        </Card>

        {/* ✅ SportsUSA Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA: Seed Schools + SchoolSportSite</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls directory (e.g., footballcampsusa.com) and writes:
            <b> School</b> (canonical institution + logo) and <b>SchoolSportSite</b> (sport-specific camp site URL).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsUSASiteUrl}
                onChange={(e) => setSportsUSASiteUrl(e.target.value)}
                placeholder="e.g., https://www.footballcampsusa.com/"
                disabled={seedWorking || !selectedSportId}
              />
              <div className="mt-1 text-[11px] text-slate-500">Auto-fills for common sports when you select a sport.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={sportsUSALimit}
                  onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                  min={10}
                  max={5000}
                  disabled={seedWorking || !selectedSportId}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={sportsUSADryRun}
                    onChange={(e) => setSportsUSADryRun(e.target.checked)}
                    disabled={seedWorking || !selectedSportId}
                  />
                  Dry Run
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={runSportsUSASeedSchools} disabled={seedWorking || !selectedSportId}>
              {seedWorking ? "Running…" : sportsUSADryRun ? "Run Seed (Dry Run)" : "Run Seed → Write School + Sites"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">SportsUSA Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logSportsUSA || "—"}
            </pre>
          </div>
        </Card>

        {/* ✅ SportsUSA Camps Ingest */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Camps: Ingest from SchoolSportSite → CampDemo</div>
          <div className="text-sm text-slate-600 mt-1">
            Crawls each <b>SchoolSportSite.camp_site_url</b> and extracts registration pages and event fields into <b>CampDemo</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxSites}
                onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))}
                min={1}
                max={2000}
                disabled={campsWorking || !selectedSportId}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max regs per site</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxRegsPerSite}
                onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))}
                min={1}
                max={100}
                disabled={campsWorking || !selectedSportId}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxEvents}
                onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))}
                min={1}
                max={5000}
                disabled={campsWorking || !selectedSportId}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test single site URL (optional)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSiteUrl}
                onChange={(e) => setTestSiteUrl(e.target.value)}
                placeholder="e.g., https://www.hardingfootballcamps.com/"
                disabled={campsWorking || !selectedSportId}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                If DryRun=true, you can test any URL (no school_id needed).
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test School ID (required only when DryRun=false)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSchoolId}
                onChange={(e) => setTestSchoolId(e.target.value)}
                placeholder="Optional on DryRun"
                disabled={campsWorking || !selectedSportId}
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={campsDryRun}
                  onChange={(e) => setCampsDryRun(e.target.checked)}
                  disabled={campsWorking || !selectedSportId}
                />
                Dry Run
              </label>

              <Button onClick={runSportsUSACampsIngest} disabled={campsWorking || !selectedSportId}>
                {campsWorking ? "Running…" : campsDryRun ? "Run Camps (Dry Run)" : "Run Camps → Write CampDemo"}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Camps Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logCamps || "—"}
            </pre>
          </div>
        </Card>

        {/* Promote CampDemo -> Camp */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">Upserts by <b>event_key</b>.</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={working || seedWorking || sportAdminWorking || campsWorking || ryzerWorking}>
              {working ? "Running…" : "Run Promotion"}
            </Button>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {stats.read}</span>
              <span><b>Created:</b> {stats.created}</span>
              <span><b>Updated:</b> {stats.updated}</span>
              <span><b>Skipped:</b> {stats.skipped}</span>
              <span><b>Errors:</b> {stats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Promotion Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logPromote || "—"}
            </pre>
          </div>
        </Card>

        {/* Positions + Sports Admin */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Admin Utilities (Sports + Positions)</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={ensureSoccerVariants}
              disabled={!selectedSportId || sportAdminWorking || working || seedWorking || sportCreateWorking || sportSaveWorking}
            >
              {sportAdminWorking ? "Updating…" : "Ensure Men's/Women's Soccer"}
            </Button>

            <Button
              onClick={normalizeVolleyballSpelling}
              disabled={!selectedSportId || sportAdminWorking || working || seedWorking || sportCreateWorking || sportSaveWorking}
            >
              {sportAdminWorking ? "Updating…" : "Normalize Volleyball spelling"}
            </Button>

            <Button
              variant="outline"
              onClick={backfillSportActiveTrue}
              disabled={sportAdminWorking || sportsLoading || sportSaveWorking || sportCreateWorking}
            >
              Backfill Active=True
            </Button>
          </div>

          {sportAdminResult ? (
            <div className="mt-3 text-xs text-slate-700">
              <b>Result:</b> {sportAdminResult}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="font-semibold text-slate-800">Auto-seed positions</div>
              <div className="text-[11px] text-slate-500 mt-1">
                Uses DEFAULT_POSITION_SEEDS for the selected sport.
              </div>

              <div className="mt-2 flex gap-2">
                <Button onClick={seedPositionsForSport} disabled={seedWorking || working || sportAdminWorking || !selectedSportId}>
                  {seedWorking ? "Seeding…" : "Auto-seed positions"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => loadPositionsForSport(selectedSportId)}
                  disabled={!selectedSportId || positionsLoading}
                >
                  {positionsLoading ? "Refreshing…" : "Refresh positions"}
                </Button>
              </div>

              <div className="mt-3 text-sm text-slate-700">
                <div className="flex flex-wrap gap-4">
                  <span><b>Seed Attempted:</b> {seedStats.attempted}</span>
                  <span><b>Seed Created:</b> {seedStats.created}</span>
                  <span><b>Seed Updated:</b> {seedStats.updated}</span>
                  <span><b>Seed Errors:</b> {seedStats.errors}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-800">Add / edit positions</div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
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
                          const edit = (positionsEdit && positionsEdit[p.id]) || { code: p.code, name: p.name };
                          return (
                            <tr key={p.id} className="border-b border-slate-100">
                              <td className="p-2">
                                <input
                                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                                  value={edit.code || ""}
                                  onChange={(e) =>
                                    setPositionsEdit((prev) => ({
                                      ...prev,
                                      [p.id]: { ...(prev[p.id] || {}), code: e.target.value, name: (prev[p.id] && prev[p.id].name) || p.name },
                                    }))
                                  }
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                                  value={edit.name || ""}
                                  onChange={(e) =>
                                    setPositionsEdit((prev) => ({
                                      ...prev,
                                      [p.id]: { ...(prev[p.id] || {}), name: e.target.value, code: (prev[p.id] && prev[p.id].code) || p.code },
                                    }))
                                  }
                                />
                              </td>
                              <td className="p-2">
                                <div className="flex gap-2">
                                  <Button variant="outline" onClick={() => savePositionRow(p.id)} disabled={positionSaveWorking}>
                                    Save
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => deletePosition(p.id)}
                                    disabled={positionDeleteWorking === p.id}
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
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Admin Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logAdmin || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={working || seedWorking || sportAdminWorking || campsWorking || ryzerWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
