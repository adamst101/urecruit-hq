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
  return String(r?.sport_name || r?.name || r?.sportName || "").trim();
}

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;
  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;
  return true;
}

async function tryUpdateWithPayloads(Entity, id, payloads) {
  for (const p of payloads) {
    try {
      await Entity.update(String(id), p);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function tryCreateWithPayloads(Entity, payloads) {
  for (const p of payloads) {
    try {
      const created = await Entity.create(p);
      return created || true;
    } catch {
      // try next
    }
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
    } catch {
      // try next
    }
  }
  return false;
}

/* ---------------------------- */

export default function AdminImport() {
  const nav = useNavigate();

  const [working, setWorking] = useState(false);
  const [log, setLog] = useState("");
  const [stats, setStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  // Sports
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);

  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // Seed Positions
  const [seedWorking, setSeedWorking] = useState(false);
  const [seedStats, setSeedStats] = useState({ attempted: 0, created: 0, updated: 0, errors: 0 });

  // Sport admin actions
  const [sportAdminWorking, setSportAdminWorking] = useState(false);
  const [sportAdminResult, setSportAdminResult] = useState("");

  // Manual Sport Manager
  const [newSportName, setNewSportName] = useState("");
  const [sportsEdit, setSportsEdit] = useState({});
  const [sportSaveWorking, setSportSaveWorking] = useState(false);
  const [sportCreateWorking, setSportCreateWorking] = useState(false);
  const [sportDeleteWorking, setSportDeleteWorking] = useState("");

  // Manual Position Manager
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsEdit, setPositionsEdit] = useState({});
  const [positionAddCode, setPositionAddCode] = useState("");
  const [positionAddName, setPositionAddName] = useState("");
  const [positionAddWorking, setPositionAddWorking] = useState(false);
  const [positionSaveWorking, setPositionSaveWorking] = useState(false);
  const [positionDeleteWorking, setPositionDeleteWorking] = useState("");

  // ✅ NEW: Ryzer ingestion controls
  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerMaxPrograms, setRyzerMaxPrograms] = useState(120);
  const [ryzerMaxCampUrls, setRyzerMaxCampUrls] = useState(600);

  const appendLog = (line) => setLog((prev) => (prev ? prev + "\n" + line : line));

  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;

  async function loadSports() {
    if (!SportEntity?.filter) return;

    setSportsLoading(true);
    try {
      const rows = asArray(await SportEntity.filter({}));
      const normalized = rows
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
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
    if (!PositionEntity?.filter || !sportId) {
      setPositions([]);
      setPositionsEdit({});
      return;
    }

    setPositionsLoading(true);
    try {
      const rows = asArray(await PositionEntity.filter({ sport_id: sportId }));
      const normalized = rows
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
          code: String(r?.position_code || "").trim(),
          name: String(r?.position_name || "").trim(),
          raw: r,
        }))
        .filter((p) => p.id);

      normalized.sort(
        (a, b) =>
          (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || "")
      );
      setPositions(normalized);

      const nextEdit = {};
      for (const p of normalized) {
        nextEdit[p.id] = { code: p.code, name: p.name };
      }
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
      await loadSports();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
     Camp promotion (unchanged)
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    const key = payload?.event_key;
    if (!key) throw new Error("Missing event_key for upsert");

    let existing = [];
    try {
      existing = await base44.entities.Camp.filter({ event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0]?.id) {
      await base44.entities.Camp.update(arr[0].id, payload);
      return "updated";
    }

    await base44.entities.Camp.create(payload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r?.school_id);
    const sport_id = safeString(r?.sport_id);
    const camp_name = safeString(r?.camp_name || r?.name);

    const start_date = toISODate(r?.start_date);
    const end_date = toISODate(r?.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date) {
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };
    }

    const city = safeString(r?.city);
    const state = safeString(r?.state);
    const position_ids = normalizeStringArray(r?.position_ids);

    const price = safeNumber(r?.price);

    const link_url = safeString(r?.link_url || r?.url);
    const source_url = safeString(r?.source_url) || link_url;

    const season_year = safeNumber(r?.season_year) ?? safeNumber(computeSeasonYearFootball(start_date));

    const source_platform = safeString(r?.source_platform) || "seed";
    const program_id = safeString(r?.program_id) || seedProgramId({ school_id, camp_name });

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

    const event_dates_raw = safeString(r?.event_dates_raw);
    const grades_raw = safeString(r?.grades_raw);
    const register_by_raw = safeString(r?.register_by_raw);
    const price_raw = safeString(r?.price_raw);

    const price_min = safeNumber(r?.price_min);
    const price_max = safeNumber(r?.price_max);

    const sections_json = safeObject(tryParseJson(r?.sections_json));
    const notes = safeString(r?.notes);

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
      notes: notes || null,

      season_year: season_year != null ? season_year : null,
      program_id,
      event_key,
      source_platform,
      source_url: source_url || null,
      last_seen_at: runIso,
      content_hash,

      event_dates_raw: event_dates_raw || null,
      grades_raw: grades_raw || null,
      register_by_raw: register_by_raw || null,
      price_raw: price_raw || null,
      price_min: price_min != null ? price_min : null,
      price_max: price_max != null ? price_max : null,
      sections_json: sections_json || null,
    };

    return { payload };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();

    setWorking(true);
    setLog("");
    setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendLog(`Starting: Promote CampDemo → Camp @ ${runIso}`);

    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({}));
    } catch (e) {
      appendLog(`ERROR reading CampDemo: ${String(e?.message || e)}`);
      setWorking(false);
      return;
    }

    appendLog(`Found CampDemo rows: ${demoRows.length}`);
    setStats((s) => ({ ...s, read: demoRows.length }));

    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];

      try {
        const built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendLog(`SKIP #${i + 1}: ${built.error}`);
          continue;
        }

        const result = await upsertCampByEventKey(built.payload);

        if (result === "created") setStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) appendLog(`Progress: ${i + 1}/${demoRows.length}`);
        await sleep(60);
      } catch (e) {
        setStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendLog(`ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    appendLog("Done.");
    setWorking(false);
  }

  /* ----------------------------
     Seed Positions (unchanged)
  ----------------------------- */
  async function upsertPositionBySportAndCode({ sportId, code, name }) {
    if (!PositionEntity?.filter || !PositionEntity?.create || !PositionEntity?.update) {
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

    const hit = existing.find((r) => String(r?.position_code || "").trim().toUpperCase() === position_code);

    const payload = { sport_id: sportId, position_code, position_name };

    if (hit?.id) {
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

    appendLog(`Starting: Seed Positions @ ${runIso}`);

    if (!selectedSportId) {
      appendLog("ERROR: Select a sport first.");
      setSeedWorking(false);
      return;
    }

    const list = seedListForSelectedSport;
    if (!list.length) {
      appendLog(`ERROR: No default seed list found for sport "${selectedSportName || "?" }".`);
      setSeedWorking(false);
      return;
    }

    appendLog(`Sport: ${selectedSportName} (${selectedSportId})`);
    appendLog(`Seed rows: ${list.length}`);

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

        if ((i + 1) % 10 === 0) appendLog(`Seed progress: ${i + 1}/${list.length}`);
        await sleep(40);
      } catch (e) {
        setSeedStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendLog(`SEED ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    appendLog("Seed Positions done.");
    setSeedWorking(false);

    await loadPositionsForSport(selectedSportId);
  }

  /* ----------------------------
     Sport Admin actions (unchanged)
  ----------------------------- */
  async function ensureSoccerVariants() {
    setSportAdminWorking(true);
    setSportAdminResult("");

    if (!SportEntity?.filter || !SportEntity?.update || !SportEntity?.create) {
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

      let actions = [];

      if (soccer?.id) {
        const ok = await tryUpdateWithPayloads(SportEntity, soccer.id, [
          { sport_name: "Men's Soccer" },
          { name: "Men's Soccer" },
          { sportName: "Men's Soccer" },
        ]);
        actions.push(ok ? "Renamed: Soccer → Men's Soccer" : "FAILED rename: Soccer → Men's Soccer");
      } else if (mens?.id) {
        actions.push("Men's Soccer already exists");
      } else {
        const created = await tryCreateWithPayloads(SportEntity, [
          { sport_name: "Men's Soccer", active: true },
          { name: "Men's Soccer", active: true },
          { sportName: "Men's Soccer", active: true },
        ]);
        actions.push(created ? "Created: Men's Soccer" : "FAILED create: Men's Soccer");
      }

      if (womens?.id) {
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
      appendLog(`Sport Admin: ${actions.join(" | ")}`);

      await loadSports();
    } catch (e) {
      const msg = `ERROR: ${String(e?.message || e)}`;
      setSportAdminResult(msg);
      appendLog(`Sport Admin ERROR: ${msg}`);
    } finally {
      setSportAdminWorking(false);
    }
  }

  async function normalizeVolleyballSpelling() {
    setSportAdminWorking(true);
    setSportAdminResult("");

    if (!SportEntity?.filter || !SportEntity?.update) {
      setSportAdminResult("ERROR: Sport entity not available (expected entities.Sport).");
      setSportAdminWorking(false);
      return;
    }

    try {
      const rows = asArray(await SportEntity.filter({}));
      const byName = new Map(rows.map((r) => [lc(normalizeSportNameFromRow(r)), r]));

      const volly = byName.get("vollyball");
      const volley = byName.get("volleyball");

      let actions = [];

      if (volley?.id) {
        actions.push("Volleyball already exists");
      } else if (volly?.id) {
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
      appendLog(`Sport Admin: ${actions.join(" | ")}`);

      await loadSports();
    } catch (e) {
      const msg = `ERROR: ${String(e?.message || e)}`;
      setSportAdminResult(msg);
      appendLog(`Sport Admin ERROR: ${msg}`);
    } finally {
      setSportAdminWorking(false);
    }
  }

  /* ----------------------------
     Manual Sport Manager (unchanged)
  ----------------------------- */
  async function saveSportRow(sportId) {
    if (!SportEntity?.update) {
      appendLog("ERROR: Sport entity not available for update.");
      return;
    }

    const row = sportsEdit?.[sportId];
    if (!row) return;

    const name = safeString(row.name);
    const active = !!row.active;

    if (!name) {
      appendLog("ERROR: Sport name is required.");
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
        `Saved Sport: ${name} | name=${okName ? "OK" : "FAIL"} | active=${okActive ? "OK" : "FAIL"}`
      );

      await loadSports();
    } finally {
      setSportSaveWorking(false);
    }
  }

  async function createSport() {
    if (!SportEntity?.create) {
      appendLog("ERROR: Sport entity not available for create.");
      return;
    }

    const name = safeString(newSportName);
    if (!name) return appendLog("ERROR: New sport name is required.");

    setSportCreateWorking(true);
    try {
      const created = await tryCreateWithPayloads(SportEntity, [
        { sport_name: name, active: true },
        { name, active: true },
        { sportName: name, active: true },
        { sport_name: name, status: "Active" },
        { name, status: "Active" },
      ]);

      appendLog(created ? `Created Sport: ${name}` : `FAILED create Sport: ${name}`);
      setNewSportName("");
      await loadSports();
    } finally {
      setSportCreateWorking(false);
    }
  }

  async function deleteSport(sportId) {
    if (!sportId) return;
    if (!SportEntity) {
      appendLog("ERROR: Sport entity missing.");
      return;
    }

    const hit = sports.find((s) => s.id === sportId);
    const label = hit?.name || sportId;

    let hasPositions = false;
    try {
      if (PositionEntity?.filter) {
        const rows = asArray(await PositionEntity.filter({ sport_id: sportId }));
        hasPositions = rows.length > 0;
      }
    } catch {}

    if (hasPositions) {
      appendLog(`BLOCKED delete Sport "${label}": positions exist. Mark Inactive instead.`);
      return;
    }

    setSportDeleteWorking(sportId);
    try {
      const ok = await tryDelete(SportEntity, sportId);
      appendLog(ok ? `Deleted Sport: ${label}` : `FAILED delete Sport: ${label}`);
      await loadSports();
    } finally {
      setSportDeleteWorking("");
    }
  }

  async function backfillSportActiveTrue() {
    if (!SportEntity?.filter || !SportEntity?.update) {
      appendLog("ERROR: Sport entity not available for backfill.");
      return;
    }

    appendLog("Backfill: setting active=true on all sports...");
    const rows = asArray(await SportEntity.filter({}));

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const id = r?.id ? String(r.id) : "";
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

      if ((i + 1) % 10 === 0) appendLog(`Backfill progress: ${i + 1}/${rows.length}`);
      await sleep(25);
    }

    appendLog(`Backfill done. OK=${ok} FAIL=${fail}`);
    await loadSports();
  }

  /* ----------------------------
     Manual Position Manager (unchanged)
  ----------------------------- */
  async function addPosition() {
    if (!PositionEntity?.create) {
      appendLog("ERROR: Position entity not available for create.");
      return;
    }
    if (!selectedSportId) return appendLog("ERROR: Select a sport first.");

    const code = safeString(positionAddCode)?.toUpperCase();
    const name = safeString(positionAddName);

    if (!code) return appendLog("ERROR: Position code is required.");
    if (!name) return appendLog("ERROR: Position name is required.");

    setPositionAddWorking(true);
    try {
      const result = await upsertPositionBySportAndCode({ sportId: selectedSportId, code, name });
      appendLog(result === "created" ? `Created Position ${code}` : `Updated Position ${code}`);
      setPositionAddCode("");
      setPositionAddName("");
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendLog(`ERROR add Position: ${String(e?.message || e)}`);
    } finally {
      setPositionAddWorking(false);
    }
  }

  async function savePositionRow(positionId) {
    if (!PositionEntity?.update) {
      appendLog("ERROR: Position entity not available for update.");
      return;
    }
    const row = positionsEdit?.[positionId];
    if (!row) return;

    const code = safeString(row.code)?.toUpperCase();
    const name = safeString(row.name);

    if (!selectedSportId) return appendLog("ERROR: Select a sport first.");
    if (!code) return appendLog("ERROR: Position code is required.");
    if (!name) return appendLog("ERROR: Position name is required.");

    setPositionSaveWorking(true);
    try {
      await PositionEntity.update(String(positionId), {
        sport_id: selectedSportId,
        position_code: code,
        position_name: name,
      });
      appendLog(`Saved Position: ${code}`);
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      appendLog(`FAILED save Position: ${String(e?.message || e)}`);
    } finally {
      setPositionSaveWorking(false);
    }
  }

  async function deletePosition(positionId) {
    if (!positionId) return;
    if (!PositionEntity) {
      appendLog("ERROR: Position entity missing.");
      return;
    }

    const hit = positions.find((p) => p.id === positionId);
    const label = hit?.code ? `${hit.code} — ${hit.name || ""}` : positionId;

    setPositionDeleteWorking(positionId);
    try {
      const ok = await tryDelete(PositionEntity, positionId);
      appendLog(ok ? `Deleted Position: ${label}` : `FAILED delete Position: ${label}`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setPositionDeleteWorking("");
    }
  }

  /* ----------------------------
     ✅ NEW: Ryzer ingest runner (by sport)
  ----------------------------- */
  async function runRyzerIngest() {
    if (ryzerWorking) return;
    if (!selectedSportId || !selectedSportName) {
      appendLog("ERROR: Select a sport first (for Ryzer ingestion).");
      return;
    }

    // ⚠️ Set this to your deployed function URL:
    // Example: https://<PROJECT_REF>.supabase.co/functions/v1/ryzer-ingest
    const FUNCTION_URL = safeString(import.meta?.env?.VITE_RYZER_INGEST_URL) || "";

    if (!FUNCTION_URL) {
      appendLog("ERROR: Missing VITE_RYZER_INGEST_URL (set it to your Supabase Edge Function endpoint).");
      return;
    }

    setRyzerWorking(true);
    appendLog(`Starting Ryzer ingest for ${selectedSportName}... dryRun=${ryzerDryRun}`);

    try {
      // If your Edge Function is protected with a JWT, pass an auth token here.
      // Base44 auth token retrieval may differ; leaving simple for now.
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          dryRun: !!ryzerDryRun,
          maxPrograms: Number(ryzerMaxPrograms) || 120,
          maxCampUrls: Number(ryzerMaxCampUrls) || 600,
        }),
      });

      const txt = await res.text();
      let obj = null;
      try {
        obj = JSON.parse(txt);
      } catch {
        obj = { raw: txt };
      }

      if (!res.ok) {
        appendLog(`Ryzer ingest FAILED: HTTP ${res.status}`);
        appendLog(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
        return;
      }

      appendLog("Ryzer ingest result:");
      appendLog(JSON.stringify(obj, null, 2));
    } catch (e) {
      appendLog(`Ryzer ingest ERROR: ${String(e?.message || e)}`);
    } finally {
      setRyzerWorking(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">Admin tools for sports/positions + demo promotion.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* ✅ NEW: Ryzer ingestion */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Ryzer Ingestion (by Sport)</div>
          <div className="text-sm text-slate-600 mt-1">
            Server-side crawl + parse registration pages → upsert into <b>CampDemo</b> (fail-closed on School verification).
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                disabled={ryzerWorking || sportsLoading}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>

              <div className="mt-1 text-[11px] text-slate-500">
                Requires VITE_RYZER_INGEST_URL env var (Edge Function endpoint).
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={runRyzerIngest} disabled={ryzerWorking || !selectedSportId}>
                {ryzerWorking ? "Running…" : "Run Ryzer Ingest"}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setRyzerDryRun((v) => !v);
                }}
                disabled={ryzerWorking}
              >
                DryRun: {ryzerDryRun ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max programs to scan</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ryzerMaxPrograms}
                onChange={(e) => setRyzerMaxPrograms(Number(e.target.value || 0))}
                type="number"
                min={10}
                max={2000}
                disabled={ryzerWorking}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max camp URLs to parse</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ryzerMaxCampUrls}
                onChange={(e) => setRyzerMaxCampUrls(Number(e.target.value || 0))}
                type="number"
                min={50}
                max={10000}
                disabled={ryzerWorking}
              />
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            Recommended flow: run with DryRun ON first → verify samples → then run with DryRun OFF.
          </div>
        </Card>

        {/* Sport Admin (quick fixes) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport Admin (quick fixes)</div>
          <div className="text-sm text-slate-600 mt-1">One-click utilities for known corrections.</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={ensureSoccerVariants}
              disabled={sportAdminWorking || working || seedWorking || sportCreateWorking || sportSaveWorking}
            >
              {sportAdminWorking ? "Updating…" : "Ensure Men's/Women's Soccer"}
            </Button>

            <Button
              onClick={normalizeVolleyballSpelling}
              disabled={sportAdminWorking || working || seedWorking || sportCreateWorking || sportSaveWorking}
            >
              {sportAdminWorking ? "Updating…" : "Normalize Volleyball spelling"}
            </Button>

            <Button variant="outline" onClick={() => loadSports()} disabled={sportAdminWorking || sportsLoading}>
              {sportsLoading ? "Refreshing…" : "Refresh Sports"}
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

          <div className="mt-3 text-[11px] text-slate-500">
            Note: Active/Inactive only persists once the <b>Sport.active</b> boolean field exists in your data model.
          </div>
        </Card>

        {/* (rest of your file unchanged: Manage Sports, Manage Positions, Promote CampDemo -> Camp, Log, Home button) */}
        {/* For brevity here, keep your existing sections below exactly as-is. */}
        {/* --- START: existing sections below --- */}

        {/* Manage Sports */}
        {/* ... KEEP YOUR CURRENT Manage Sports CARD EXACTLY ... */}

        {/* Manage Positions */}
        {/* ... KEEP YOUR CURRENT Manage Positions CARD EXACTLY ... */}

        {/* Promote CampDemo -> Camp */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>. Payload is fully type-safe for Camp schema.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={working || seedWorking || sportAdminWorking || ryzerWorking}>
              {working ? "Running…" : "Run Promotion"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setLog("");
                setStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
                setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });
                setSportAdminResult("");
              }}
              disabled={working || seedWorking || sportAdminWorking || ryzerWorking}
            >
              Clear
            </Button>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {stats.read}</span>
              <span><b>Created:</b> {stats.created}</span>
              <span><b>Updated:</b> {stats.updated}</span>
              <span><b>Skipped:</b> {stats.skipped}</span>
              <span><b>Errors:</b> {stats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {log || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => nav(ROUTES.Home)}
            disabled={working || seedWorking || sportAdminWorking || ryzerWorking}
          >
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
