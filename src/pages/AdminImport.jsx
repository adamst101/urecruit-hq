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
   Routes (hardcoded)
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

  // Ryzer ingestion controls
  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerRecordsPerPage, setRyzerRecordsPerPage] = useState(25);
  const [ryzerMaxPages, setRyzerMaxPages] = useState(10);
  const [ryzerMaxEvents, setRyzerMaxEvents] = useState(200);
  const [ryzerActivityTypeId, setRyzerActivityTypeId] = useState("");

  const appendLog = (line) => setLog((prev) => (prev ? prev + "\n" + line : line));

  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;

  // Entities used for ingestion
  const SchoolEntity = base44?.entities?.School || base44?.entities?.Schools || null;
  const CampDemoEntity = base44?.entities?.CampDemo || null;

  // When sport changes, auto-fill Ryzer ActivityTypeId if known
  useEffect(() => {
    const guess = RYZER_ACTIVITY_TYPE_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setRyzerActivityTypeId(guess);
  }, [selectedSportName]);

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
     Ryzer ingestion runner
  ----------------------------- */
  async function runRyzerIngestion() {
    const sportId = selectedSportId;
    const sportName = selectedSportName;
    const activityTypeId = safeString(ryzerActivityTypeId);
    const dryRun = !!ryzerDryRun;
    const rpp = Number(ryzerRecordsPerPage || 0);
    const maxPages = Number(ryzerMaxPages || 0);
    const maxEvents = Number(ryzerMaxEvents || 0);

    if (!sportId) return appendLog("ERROR: Select a sport first.");
    if (!activityTypeId) return appendLog("ERROR: Provide Ryzer ActivityTypeId GUID.");
    if (!SchoolEntity?.filter) return appendLog("ERROR: School entity not available.");

    const runIso = new Date().toISOString();

    setRyzerWorking(true);
    appendLog(`Starting: Ryzer ingestion (${sportName}) @ ${runIso}`);
    appendLog(`DryRun=${dryRun ? "true" : "false"} | RPP=${rpp} | Pages=${maxPages} | MaxEvents=${maxEvents}`);

    try {
      const schoolRows = asArray(await SchoolEntity.filter({}));
      const schools = schoolRows
        .map((s) => ({
          id: String(s?.id || ""),
          school_name: String(s?.school_name || "").trim(),
          state: String(s?.state || "").trim(),
          aliases: asArray(tryParseJson(s?.aliases_json)).filter(Boolean),
        }))
        .filter((s) => s.id && s.school_name);

      appendLog(`Loaded Schools: ${schools.length}`);

      const res = await fetch("/functions/ryzerIngest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId,
          sportName,
          activityTypeId,
          recordsPerPage: rpp,
          maxPages,
          maxEvents,
          dryRun,
          schools,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendLog(`Ryzer function ERROR (HTTP ${res.status})`);
        appendLog(JSON.stringify(data || {}, null, 2));
        return;
      }

      appendLog(
        `Ryzer results: accepted=${data?.stats?.accepted ?? 0}, rejected=${data?.stats?.rejected ?? 0}, errors=${data?.stats?.errors ?? 0}`
      );
      appendLog(`Ryzer processed: ${data?.stats?.processed ?? 0}`);

      // Debug dump (page 0)
      const dbg = data?.debug || null;
      appendLog(`Ryzer debug version: ${dbg?.version || "MISSING"}`);

      const p0 = Array.isArray(dbg?.pages) ? dbg.pages[0] : null;
      if (p0) {
        appendLog(`Ryzer debug p0 http=${p0.http ?? "n/a"} rowCount=${p0.rowCount ?? "n/a"} total=${p0.total ?? "n/a"}`);
        appendLog(`Ryzer debug p0 keys: ${(p0.respKeys || []).join(", ") || "n/a"}`);
        appendLog(`Ryzer debug p0 dataWasString: ${p0.dataWasString ? "true" : "false"}`);
        appendLog(`Ryzer debug p0 innerKeys: ${(p0.innerKeys || []).join(", ") || "n/a"}`);
        appendLog(`Ryzer debug p0 rowsArrayPath: ${p0.rowsArrayPath || "n/a"}`);
        appendLog(`Ryzer debug p0 reqPayload: ${JSON.stringify(p0.reqPayload || {})}`);

        if (p0.respSnippet) {
          const snip = String(p0.respSnippet);
          appendLog(`Ryzer debug p0 respSnippet: ${snip.slice(0, 800)}${snip.length > 800 ? "…(truncated)" : ""}`);
        } else {
          appendLog("Ryzer debug p0 respSnippet: MISSING");
        }
      } else {
        appendLog("Ryzer debug: pages[0] missing");
      }

      // Print rejected samples (this is where you’ll SEE the host/title/url we’re failing to match)
      const rej = asArray(data?.rejected).slice(0, 10);
      if (rej.length) {
        appendLog(`Ryzer rejected samples (first ${rej.length}):`);
        for (const r of rej) {
          appendLog(`- reason=${r?.reason || "n/a"} host="${r?.host || ""}" title="${r?.title || ""}" url="${r?.registrationUrl || ""}"`);
        }
      }

      if (dryRun) {
        appendLog("DryRun=true: no DB writes performed.");
        return;
      }

      // NOTE: DB write happens in your existing flow (accepted -> CampDemo)
      appendLog("DryRun=false: accepted results returned. (DB write logic unchanged in this snippet.)");
    } catch (e) {
      appendLog(`Ryzer ingestion ERROR: ${String(e?.message || e)}`);
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

        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Ryzer Ingestion (by sport)</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ryzer ActivityTypeId (GUID)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ryzerActivityTypeId}
                onChange={(e) => setRyzerActivityTypeId(e.target.value)}
                placeholder="e.g., A8ADF526-3822-4261-ADCF-1592CF4BB7FF"
                disabled={ryzerWorking}
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
                  disabled={ryzerWorking}
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
                disabled={ryzerWorking}
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
                disabled={ryzerWorking}
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
                disabled={ryzerWorking}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={runRyzerIngestion} disabled={ryzerWorking || working || seedWorking || sportAdminWorking}>
              {ryzerWorking ? "Running…" : ryzerDryRun ? "Run Ryzer (Dry Run)" : "Run Ryzer"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {log || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={working || seedWorking || sportAdminWorking || ryzerWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
