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

// ✅ FIX: null/"" should stay null, not become 0
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
   ✅ Truncate helper (needed for robust debug logs)
----------------------------- */
function truncate(s, n) {
  const str = String(s ?? "");
  const max = Number(n ?? 500);
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
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
     One Sport selection to rule them all
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

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "sportsusa") setLogSportsUSA(add);
    if (which === "camps") setLogCamps(add);
    if (which === "promote") setLogPromote(add);
    if (which === "positions") setLogPositions(add);
  }

  /* ----------------------------
     Work flags
  ----------------------------- */
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  const [campsWorking, setCampsWorking] = useState(false);
  const [promoteWorking, setPromoteWorking] = useState(false);
  const [seedWorking, setSeedWorking] = useState(false);

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
  const [campsMaxSites, setCampsMaxSites] = useState(5);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(5);
  const [campsMaxEvents, setCampsMaxEvents] = useState(25);

  // ✅ NEW: runtime knobs (match v16 function defaults)
  const [campsFastMode, setCampsFastMode] = useState(true);
  const [campsMaxMs, setCampsMaxMs] = useState(45000);
  const [campsSiteTimeoutMs, setCampsSiteTimeoutMs] = useState(12000);
  const [campsRegTimeoutMs, setCampsRegTimeoutMs] = useState(12000);
  const [campsNameTimeoutMs, setCampsNameTimeoutMs] = useState(6000);
  const [campsMaxRegFetchTotal, setCampsMaxRegFetchTotal] = useState(250);

  // Test mode
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [testSchoolId, setTestSchoolId] = useState("");

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

  // auto-fill SportsUSA directory for sport
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
     SportsUSA Seed Schools
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
          appendLog("sportsusa", `- name="${sample[i].school_name || ""}" | logo="${sample[i].logo_url || ""}" | view="${sample[i].view_site_url || ""}"`);
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
    } catch (e) {
      appendLog("sportsusa", `[SportsUSA] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Camps ingest: SchoolSportSite -> CampDemo
  ----------------------------- */
  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity || !CampDemoEntity.create || !CampDemoEntity.update) {
      throw new Error("CampDemo entity not available (expected entities.CampDemo).");
    }
    const key = payload && payload.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    let existing = [];
    try {
      existing = await entityList(CampDemoEntity, { event_key: key });
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

  async function runSportsUSACampsIngest() {
    const runIso = new Date().toISOString();
    setCampsWorking(true);
    setLogCamps("");

    appendLog("camps", `[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);

    try {
      if (!selectedSportId) {
        appendLog("camps", "[Camps] ERROR: Select a sport first.");
        return;
      }
      if (!SchoolSportSiteEntity) {
        appendLog("camps", "[Camps] ERROR: SchoolSportSite entity not available.");
        return;
      }
      if (!CampDemoEntity) {
        appendLog("camps", "[Camps] ERROR: CampDemo entity not available.");
        return;
      }

      const tUrl = safeString(testSiteUrl);
      const tSchool = safeString(testSchoolId);

      // Guardrail: test mode should never crawl multiple sites
      const maxSitesEffective = tUrl ? 1 : Number(campsMaxSites || 5);

      appendLog(
        "camps",
        `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${maxSitesEffective} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents} | fastMode=${campsFastMode ? "true" : "false"}`
      );
      appendLog(
        "camps",
        `[Camps] Runtime: maxMs=${campsMaxMs} siteTimeoutMs=${campsSiteTimeoutMs} regTimeoutMs=${campsRegTimeoutMs} nameTimeoutMs=${campsNameTimeoutMs} maxRegFetchTotal=${campsMaxRegFetchTotal}`
      );

      const siteRows = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${siteRows.length} (active)`);

      const sites = asArray(siteRows)
        .map((r) => ({
          school_id: r && r.school_id ? String(r.school_id) : null,
          sport_id: r && r.sport_id ? String(r.sport_id) : selectedSportId,
          camp_site_url: r && r.camp_site_url ? String(r.camp_site_url) : null,
        }))
        .filter((x) => !!x.camp_site_url);

      if (tUrl && !campsDryRun && !tSchool) {
        appendLog("camps", "[Camps] ERROR: For non-dry-run with Test Site URL, you must provide Test School ID.");
        return;
      }

      // IMPORTANT: If testSiteUrl is set, do NOT send the full sites list
      const sitesToSend = tUrl ? [] : sites;

      appendLog("camps", `[Camps] Prepared sites payload: ${sites.length} (non-null camp_site_url)`);
      if (sites.length) {
        appendLog("camps", `[Camps] Sample site: school_id=${sites[0].school_id || ""} url=${sites[0].camp_site_url || ""}`);
      }
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

          maxSites: maxSitesEffective,
          maxRegsPerSite: Number(campsMaxRegsPerSite || 5),
          maxEvents: Number(campsMaxEvents || 25),

          // ✅ new knobs (v16)
          fastMode: !!campsFastMode,
          maxMs: Number(campsMaxMs || 45000),
          siteTimeoutMs: Number(campsSiteTimeoutMs || 12000),
          regTimeoutMs: Number(campsRegTimeoutMs || 12000),
          nameTimeoutMs: Number(campsNameTimeoutMs || 6000),
          maxRegFetchTotal: Number(campsMaxRegFetchTotal || 250),

          sites: sitesToSend,
          testSiteUrl: tUrl || null,
          testSchoolId: tSchool || null,
        }),
      });

      // Robust parse: capture raw response if not JSON
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
        if (!data && rawText) appendLog("camps", `[Camps] Raw response (first 500 chars): ${truncate(rawText, 500)}`);
        return;
      }

      if (!data) {
        appendLog("camps", `[Camps] WARNING: Response was not JSON. HTTP ${res.status}`);
        if (rawText) appendLog("camps", `[Camps] Raw response (first 500 chars): ${truncate(rawText, 500)}`);
        return;
      }

      appendLog("camps", `[Camps] Function version: ${data && data.version ? data.version : "MISSING"}`);
      appendLog(
        "camps",
        `[Camps] Function stats: processedSites=${data && data.stats ? data.stats.processedSites : 0} processedRegs=${
          data && data.stats ? data.stats.processedRegs : 0
        } accepted=${data && data.stats ? data.stats.accepted : 0} rejected=${data && data.stats ? data.stats.rejected : 0} errors=${
          data && data.stats ? data.stats.errors : 0
        }`
      );

      if (data && data.debug && data.debug.received) {
        const rcv = data.debug.received;
        appendLog(
          "camps",
          `[Camps] Function received: testSiteUrl=${rcv.testSiteUrl || "no"} sitesCount=${rcv.sitesCount || 0} siteUrlsCount=${rcv.siteUrlsCount || 0}`
        );
      }

      // ✅ KPI keys updated: support both older and v16
      if (data && data.debug && data.debug.kpi) {
        const k = data.debug.kpi;
        const listing = k.datesParsedFromListing ?? 0;

        // v14/v15 used datesParsedFromRyzer, v16 uses datesParsedFromDetail
        const detail = k.datesParsedFromDetail ?? k.datesParsedFromRyzer ?? 0;
        const missing = k.datesMissing ?? 0;

        const namesFromListing = k.namesFromListing ?? 0;
        const namesFromDetail = k.namesFromDetail ?? 0;
        const namesMissing = k.namesMissing ?? 0;
        const namesRejected = k.namesRejectedByQualityGate ?? 0;

        appendLog("camps", `[Camps] Date KPI: listing=${listing} detail=${detail} missing=${missing}`);
        if (namesFromListing || namesFromDetail || namesMissing || namesRejected) {
          appendLog(
            "camps",
            `[Camps] Name KPI: listing=${namesFromListing} detail=${namesFromDetail} missing=${namesMissing} qualityReject=${namesRejected}`
          );
        }
      }

      const siteDbg = asArray(data && data.debug && data.debug.siteDebug ? data.debug.siteDebug : []).slice(0, 1);
      if (siteDbg.length) {
        appendLog("camps", "[Camps] Site debug (first 1):");
        for (let i = 0; i < siteDbg.length; i++) {
          const sd = siteDbg[i] || {};
          appendLog(
            "camps",
            `- siteUrl=${sd.siteUrl || ""} http=${sd.http || "n/a"} html=${sd.htmlType || ""} regLinks=${sd.regLinks || 0} sample=${sd.sample || ""}`
          );
          if (sd.notes) appendLog("camps", `  notes=${String(sd.notes)}`);
        }

        const firstHtml = data && data.debug ? data.debug.firstSiteHtmlSnippet : null;
        if (firstHtml) {
          appendLog("camps", "[Camps] First site HTML snippet (debug):");
          appendLog("camps", String(firstHtml));
        }
      }

      const acceptedRaw = asArray(data && data.accepted ? data.accepted : []);
      const accepted = acceptedRaw.map((x) => normalizeAcceptedRowToFlat(x));

      if (!accepted.length) {
        appendLog("camps", "[Camps] No accepted events returned from function.");
        return;
      }

      const missingSchoolIdCount = accepted.filter((a) => !safeString(a.school_id) && !tUrl).length;
      if (missingSchoolIdCount > 0) {
        appendLog("camps", `[Camps] GUARDRAIL: accepted rows missing school_id = ${missingSchoolIdCount}`);
        appendLog("camps", `[Camps] This usually means the function did not receive sites[] with school_id mapping.`);
        if (!campsDryRun) {
          appendLog("camps", "[Camps] ABORTING WRITES (DryRun=false) to prevent null school_id events in CampDemo.");
          return;
        }
      }

      appendLog("camps", `[Camps] Accepted events returned: ${accepted.length}`);
      appendLog("camps", `[Camps] Sample (first 5):`);
      for (let i = 0; i < Math.min(5, accepted.length); i++) {
        const a = accepted[i] || {};
        appendLog("camps", `- camp="${a.camp_name || ""}" start=${a.start_date || "n/a"} url=${a.link_url || a.registration_url || ""}`);
      }

      if (campsDryRun) {
        appendLog("camps", "[Camps] DryRun=true: no CampDemo writes performed.");
        return;
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < accepted.length; i++) {
        const a = accepted[i] || {};

        const school_id = safeString(a.school_id) || (tUrl ? safeString(tSchool) : null);
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
          const r = await upsertCampDemoByEventKey(payload);
          if (r === "created") created += 1;
          if (r === "updated") updated += 1;
        } catch (e) {
          errors += 1;
          appendLog("camps", `[Camps] WRITE ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`);
        }

        if ((i + 1) % 25 === 0) appendLog("camps", `[Camps] Write progress: ${i + 1}/${accepted.length}`);
        await sleep(30);
      }

      appendLog("camps", `[Camps] CampDemo writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } catch (e) {
      appendLog("camps", `[Camps] ERROR: ${String(e && e.message ? e.message : e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     Promote CampDemo -> Camp (kept minimal)
  ----------------------------- */
  async function upsertCampByEventKey(payload) {
    if (!CampEntity || !CampEntity.create || !CampEntity.update) {
      throw new Error("Camp entity not available (base44.entities.Camp missing or not exported).");
    }

    const key = payload && payload.event_key ? payload.event_key : null;
    if (!key) throw new Error("Missing event_key for upsert");

    let existing = [];
    try {
      existing = await entityList(CampEntity, { event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0] && arr[0].id) {
      await CampEntity.update(arr[0].id, payload);
      return "updated";
    }

    await CampEntity.create(payload);
    return "created";
  }

  function buildSafeCampPayloadFromDemoRow(r, runIso) {
    const school_id = safeString(r && r.school_id);
    const sport_id = safeString(r && r.sport_id);
    const camp_name = safeString(r && (r.camp_name || r.name));
    const start_date = toISODate(r && r.start_date);
    const end_date = toISODate(r && r.end_date);

    if (!school_id || !sport_id || !camp_name || !start_date) {
      return { error: "Missing required fields (school_id, sport_id, camp_name, start_date)" };
    }

    const city = safeString(r && r.city);
    const state = safeString(r && r.state);
    const position_ids = normalizeStringArray(r && r.position_ids);

    const price = safeNumber(r && r.price) ?? safeNumber(r && r.price_max) ?? safeNumber(r && r.price_min);

    const link_url = safeString(r && (r.link_url || r.url));
    const source_url = safeString(r && r.source_url) || link_url;

    const season_year = safeNumber(r && r.season_year) ?? safeNumber(computeSeasonYearFootball(start_date));

    const source_platform = safeString(r && r.source_platform) || "seed";
    const program_id = safeString(r && r.program_id) || `seed:${String(school_id)}:${slugify(camp_name)}`;

    const event_key =
      safeString(r && r.event_key) ||
      buildEventKey({
        source_platform,
        program_id,
        start_date,
        link_url,
        source_url,
      });

    const content_hash =
      safeString(r && r.content_hash) ||
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
    setPromoteWorking(true);
    setLogPromote("");

    appendLog("promote", `[Promote] Starting: Promote CampDemo → Camp @ ${runIso}`);

    if (!CampDemoEntity) {
      appendLog("promote", "[Promote] ERROR: CampDemo entity not available.");
      setPromoteWorking(false);
      return;
    }

    if (!CampEntity) {
      appendLog("promote", "[Promote] ERROR: Camp entity not available (base44.entities.Camp missing).");
      appendLog("promote", "[Promote] Fix: ensure Camp table exists and Base44 exports entities.Camp.");
      setPromoteWorking(false);
      return;
    }

    let demoRows = [];
    try {
      demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
    } catch (e) {
      appendLog("promote", `[Promote] ERROR reading CampDemo: ${String(e && e.message ? e.message : e)}`);
      setPromoteWorking(false);
      return;
    }

    appendLog("promote", `[Promote] Found CampDemo rows for sport: ${demoRows.length}`);

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

        if ((i + 1) % 20 === 0) appendLog("promote", `[Promote] Progress: ${i + 1}/${demoRows.length}`);
        await sleep(35);
      } catch (e) {
        errors += 1;
        appendLog("promote", `[Promote] ERROR #${i + 1}: ${String(e && e.message ? e.message : e)}`);
      }
    }

    appendLog("promote", `[Promote] Done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    setPromoteWorking(false);
  }

  /* ----------------------------
     UI
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">SportsUSA seeding + camp ingestion + promotion.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* Global Sport Selector */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">1) Select Sport</div>
          <div className="text-sm text-slate-600 mt-1">This selection drives Seed Schools, Camps Ingest, Positions, and Promote.</div>

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
                disabled={sportsLoading || sportsUSAWorking || campsWorking || promoteWorking || seedWorking}
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
            </div>
          </div>
        </Card>

        {/* SportsUSA Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">2) Seed Schools from SportsUSA (School + SchoolSportSite)</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls the sport directory (e.g., footballcampsusa.com) and seeds your canonical universities + their per-sport camp site URL.
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

        {/* Camps ingest */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">3) Ingest Camps (from SchoolSportSite → CampDemo)</div>
          <div className="text-sm text-slate-600 mt-1">
            Crawls per-school camp sites and discovers Ryzer registration pages. Writes accepted occurrences into <b>CampDemo</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites</label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxEvents}
                onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))}
                min={5}
                max={5000}
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

          {/* ✅ Runtime knobs */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={campsFastMode} onChange={(e) => setCampsFastMode(e.target.checked)} disabled={campsWorking} />
                fastMode (skip detail fetch when listing has date)
              </label>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">maxMs</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxMs}
                onChange={(e) => setCampsMaxMs(Number(e.target.value || 0))}
                min={5000}
                max={120000}
                disabled={campsWorking}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">maxRegFetchTotal</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxRegFetchTotal}
                onChange={(e) => setCampsMaxRegFetchTotal(Number(e.target.value || 0))}
                min={10}
                max={2000}
                disabled={campsWorking}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">siteTimeoutMs</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsSiteTimeoutMs}
                onChange={(e) => setCampsSiteTimeoutMs(Number(e.target.value || 0))}
                min={2000}
                max={60000}
                disabled={campsWorking}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">regTimeoutMs</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsRegTimeoutMs}
                onChange={(e) => setCampsRegTimeoutMs(Number(e.target.value || 0))}
                min={2000}
                max={60000}
                disabled={campsWorking}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">nameTimeoutMs</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsNameTimeoutMs}
                onChange={(e) => setCampsNameTimeoutMs(Number(e.target.value || 0))}
                min={1000}
                max={20000}
                disabled={campsWorking}
              />
            </div>
          </div>

          {/* Test Mode */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test Site URL (optional)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSiteUrl}
                onChange={(e) => setTestSiteUrl(e.target.value)}
                placeholder="https://www.montanafootballcamps.com/register.cfm"
                disabled={campsWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">If set, runs single-site mode. Dry run works even if it’s not in SchoolSportSite.</div>
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
              <div className="mt-1 text-[11px] text-slate-500">Only required if you turn Dry Run off while using a Test Site URL.</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking || sportsUSAWorking || promoteWorking || seedWorking}>
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
          <div className="font-semibold text-deep-navy">4) Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">Upserts by <b>event_key</b>. (Runs for the currently selected sport.)</div>

          <div className="mt-3 flex gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={!selectedSportId || promoteWorking || sportsUSAWorking || campsWorking || seedWorking}>
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

        {/* Positions (optional) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Positions (optional)</div>
          <div className="text-sm text-slate-600 mt-1">Auto-seed a default set, or manually add/edit/delete positions per sport.</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={seedPositionsForSport} disabled={!selectedSportId || seedWorking || sportsUSAWorking || campsWorking || promoteWorking}>
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
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={sportsUSAWorking || campsWorking || promoteWorking || seedWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
