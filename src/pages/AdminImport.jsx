// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Inline helpers (safe)
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

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSchoolNameKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
};

/* ----------------------------
   Ryzer ActivityTypeId mapping (MVP)
----------------------------- */
const RYZER_ACTIVITY_TYPE_BY_SPORTNAME = {
  Football: "A8ADF526-3822-4261-ADCF-1592CF4BB7FF",
};

/* ----------------------------
   SportsUSA directory defaults (editable in UI)
----------------------------- */
const SPORTSUSA_DIRECTORY_BY_SPORTNAME = {
  Football: "https://www.footballcampsusa.com/",
  // Baseball: "https://www.baseballcampsusa.com/",
  // Soccer: "https://www.soccercampsusa.com/",
};

export default function AdminImport() {
  const nav = useNavigate();

  /* ----------------------------
     Logs per section
  ----------------------------- */
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logRyzer, setLogRyzer] = useState("");
  const [logSeed, setLogSeed] = useState("");
  const [logPromote, setLogPromote] = useState("");
  const [logSportsAdmin, setLogSportsAdmin] = useState("");

  function append(setter, line) {
    setter((prev) => (prev ? prev + "\n" + line : line));
  }

  /* ----------------------------
     Stats
  ----------------------------- */
  const [workingPromote, setWorkingPromote] = useState(false);
  const [promoteStats, setPromoteStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  const [seedWorking, setSeedWorking] = useState(false);
  const [seedStats, setSeedStats] = useState({ attempted: 0, created: 0, updated: 0, errors: 0 });

  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);

  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerRecordsPerPage, setRyzerRecordsPerPage] = useState(25);
  const [ryzerMaxPages, setRyzerMaxPages] = useState(10);
  const [ryzerMaxEvents, setRyzerMaxEvents] = useState(200);
  const [ryzerActivityTypeId, setRyzerActivityTypeId] = useState("");

  /* ----------------------------
     Sport selection (single source of truth)
  ----------------------------- */
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);

  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  const [sportsUSADirectoryUrl, setSportsUSADirectoryUrl] = useState("");

  /* ----------------------------
     Entities
  ----------------------------- */
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;
  const SchoolEntity = base44?.entities?.School || base44?.entities?.Schools || null;
  const SchoolSportSiteEntity =
    base44?.entities?.SchoolSportSite || base44?.entities?.SchoolSportSites || null;
  const CampDemoEntity = base44?.entities?.CampDemo || null;

  /* ----------------------------
     Derived
  ----------------------------- */
  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  // When sport changes, auto-fill Ryzer ActivityTypeId if known
  useEffect(() => {
    const guess = RYZER_ACTIVITY_TYPE_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setRyzerActivityTypeId(guess);
  }, [selectedSportName]);

  // When sport changes, auto-fill SportsUSA directory if known (user can still edit)
  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setSportsUSADirectoryUrl(guess);
  }, [selectedSportName]);

  /* ----------------------------
     Load sports
  ----------------------------- */
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
     Positions refresh when sport changes
  ----------------------------- */
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const [positionsEdit, setPositionsEdit] = useState({});
  const [positionAddCode, setPositionAddCode] = useState("");
  const [positionAddName, setPositionAddName] = useState("");
  const [positionAddWorking, setPositionAddWorking] = useState(false);
  const [positionSaveWorking, setPositionSaveWorking] = useState(false);
  const [positionDeleteWorking, setPositionDeleteWorking] = useState("");

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
        (a, b) => (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || "")
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
      if (!selectedSportId) return;
      await loadPositionsForSport(selectedSportId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* ----------------------------
     Manual Position Manager (CRUD)
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
    setLogSeed("");
    setSeedWorking(true);
    setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });

    append(setLogSeed, `[Seed] Starting: Seed Positions @ ${runIso}`);

    if (!selectedSportId) {
      append(setLogSeed, "[Seed] ERROR: Select a sport first.");
      setSeedWorking(false);
      return;
    }

    const list = seedListForSelectedSport;
    if (!list.length) {
      append(setLogSeed, `[Seed] ERROR: No default seed list found for sport "${selectedSportName || "?"}".`);
      setSeedWorking(false);
      return;
    }

    append(setLogSeed, `[Seed] Sport: ${selectedSportName} (${selectedSportId})`);
    append(setLogSeed, `[Seed] Seed rows: ${list.length}`);

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

        if ((i + 1) % 10 === 0) append(setLogSeed, `[Seed] Progress: ${i + 1}/${list.length}`);
        await sleep(25);
      } catch (e) {
        setSeedStats((s) => ({ ...s, errors: s.errors + 1 }));
        append(setLogSeed, `[Seed] ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    append(setLogSeed, "[Seed] Done.");
    setSeedWorking(false);
    await loadPositionsForSport(selectedSportId);
  }

  async function addPosition() {
    if (!PositionEntity?.create) {
      append(setLogSeed, "[Seed] ERROR: Position entity not available for create.");
      return;
    }
    if (!selectedSportId) return append(setLogSeed, "[Seed] ERROR: Select a sport first.");

    const code = safeString(positionAddCode)?.toUpperCase();
    const name = safeString(positionAddName);

    if (!code) return append(setLogSeed, "[Seed] ERROR: Position code is required.");
    if (!name) return append(setLogSeed, "[Seed] ERROR: Position name is required.");

    setPositionAddWorking(true);
    try {
      const result = await upsertPositionBySportAndCode({ sportId: selectedSportId, code, name });
      append(setLogSeed, result === "created" ? `[Seed] Created Position ${code}` : `[Seed] Updated Position ${code}`);
      setPositionAddCode("");
      setPositionAddName("");
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      append(setLogSeed, `[Seed] ERROR add Position: ${String(e?.message || e)}`);
    } finally {
      setPositionAddWorking(false);
    }
  }

  async function savePositionRow(positionId) {
    if (!PositionEntity?.update) {
      append(setLogSeed, "[Seed] ERROR: Position entity not available for update.");
      return;
    }
    const row = positionsEdit?.[positionId];
    if (!row) return;

    const code = safeString(row.code)?.toUpperCase();
    const name = safeString(row.name);

    if (!selectedSportId) return append(setLogSeed, "[Seed] ERROR: Select a sport first.");
    if (!code) return append(setLogSeed, "[Seed] ERROR: Position code is required.");
    if (!name) return append(setLogSeed, "[Seed] ERROR: Position name is required.");

    setPositionSaveWorking(true);
    try {
      await PositionEntity.update(String(positionId), {
        sport_id: selectedSportId,
        position_code: code,
        position_name: name,
      });
      append(setLogSeed, `[Seed] Saved Position: ${code}`);
      await loadPositionsForSport(selectedSportId);
    } catch (e) {
      append(setLogSeed, `[Seed] FAILED save Position: ${String(e?.message || e)}`);
    } finally {
      setPositionSaveWorking(false);
    }
  }

  async function deletePosition(positionId) {
    if (!positionId) return;
    if (!PositionEntity) {
      append(setLogSeed, "[Seed] ERROR: Position entity missing.");
      return;
    }

    const hit = positions.find((p) => p.id === positionId);
    const label = hit?.code ? `${hit.code} — ${hit.name || ""}` : positionId;

    setPositionDeleteWorking(positionId);
    try {
      const ok = await tryDelete(PositionEntity, positionId);
      append(setLogSeed, ok ? `[Seed] Deleted Position: ${label}` : `[Seed] FAILED delete Position: ${label}`);
      await loadPositionsForSport(selectedSportId);
    } finally {
      setPositionDeleteWorking("");
    }
  }

  /* ----------------------------
     SportsUSA Seed Schools
     - Calls /functions/sportsUSASeedSchools
     - Upserts School + SchoolSportSite
  ----------------------------- */
  async function upsertSchoolBySourceKeyOrName(payload) {
    if (!SchoolEntity?.filter || !SchoolEntity?.create || !SchoolEntity?.update) {
      throw new Error("School entity not available (expected entities.School).");
    }

    const source_key = safeString(payload?.source_key);
    const school_name = safeString(payload?.school_name);
    const normalized_name = safeString(payload?.normalized_name) || (school_name ? normalizeSchoolNameKey(school_name) : null);

    if (!school_name) throw new Error("Missing school_name for School upsert.");

    // 1) Try source_key
    if (source_key) {
      try {
        const hits = asArray(await SchoolEntity.filter({ source_key }));
        if (hits.length && hits[0]?.id) {
          await SchoolEntity.update(String(hits[0].id), payload);
          return { id: String(hits[0].id), action: "updated" };
        }
      } catch {}
    }

    // 2) Try normalized_name
    if (normalized_name) {
      try {
        const hits = asArray(await SchoolEntity.filter({ normalized_name }));
        if (hits.length && hits[0]?.id) {
          await SchoolEntity.update(String(hits[0].id), payload);
          return { id: String(hits[0].id), action: "updated" };
        }
      } catch {}
    }

    // 3) Fallback: school_name exact
    try {
      const hits = asArray(await SchoolEntity.filter({ school_name }));
      if (hits.length && hits[0]?.id) {
        await SchoolEntity.update(String(hits[0].id), payload);
        return { id: String(hits[0].id), action: "updated" };
      }
    } catch {}

    const created = await SchoolEntity.create(payload);
    const createdId = created?.id ? String(created.id) : null;
    return { id: createdId, action: "created" };
  }

  async function upsertSchoolSportSite(payload) {
    if (!SchoolSportSiteEntity?.filter || !SchoolSportSiteEntity?.create || !SchoolSportSiteEntity?.update) {
      throw new Error("SchoolSportSite entity not available (expected entities.SchoolSportSite).");
    }

    const school_id = safeString(payload?.school_id);
    const sport_id = safeString(payload?.sport_id);
    const camp_site_url = safeString(payload?.camp_site_url);
    const source_key = safeString(payload?.source_key);

    if (!school_id || !sport_id || !camp_site_url || !source_key) {
      throw new Error("Missing required fields for SchoolSportSite upsert (school_id, sport_id, camp_site_url, source_key).");
    }

    // Prefer source_key dedupe
    try {
      const hits = asArray(await SchoolSportSiteEntity.filter({ source_key }));
      if (hits.length && hits[0]?.id) {
        await SchoolSportSiteEntity.update(String(hits[0].id), payload);
        return "updated";
      }
    } catch {}

    // fallback dedupe: school_id + sport_id + camp_site_url
    try {
      const hits = asArray(await SchoolSportSiteEntity.filter({ school_id, sport_id, camp_site_url }));
      if (hits.length && hits[0]?.id) {
        await SchoolSportSiteEntity.update(String(hits[0].id), payload);
        return "updated";
      }
    } catch {}

    await SchoolSportSiteEntity.create(payload);
    return "created";
  }

  function looksLikeGenericLogo(url) {
    const u = lc(url || "");
    if (!u) return false;
    // footballcampsusa historically uses a generic placeholder sometimes;
    // keep it, but mark needs_review
    return u.includes("logo-athletic.png") || u.includes("images/logo");
  }

  async function runSportsUSASeedSchools() {
    if (!selectedSportId) return append(setLogSportsUSA, "[SportsUSA] ERROR: Select a sport first.");
    if (!SchoolEntity?.filter) return append(setLogSportsUSA, "[SportsUSA] ERROR: School entity not available.");
    if (!SchoolSportSiteEntity) return append(setLogSportsUSA, "[SportsUSA] ERROR: SchoolSportSite entity not available.");

    const runIso = new Date().toISOString();
    setLogSportsUSA("");

    setSportsUSAWorking(true);
    append(setLogSportsUSA, `[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName}) @ ${runIso}`);
    append(setLogSportsUSA, `[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);

    const siteUrl = safeString(sportsUSADirectoryUrl);
    if (!siteUrl) {
      append(setLogSportsUSA, "[SportsUSA] ERROR: Missing SportsUSA directory URL (siteUrl).");
      setSportsUSAWorking(false);
      return;
    }

    try {
      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl,
          limit: sportsUSALimit,
          dryRun: sportsUSADryRun,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        append(setLogSportsUSA, `[SportsUSA] ERROR: SportsUSA function ERROR (HTTP ${res.status})`);
        append(setLogSportsUSA, JSON.stringify(data || {}, null, 2));
        append(
          setLogSportsUSA,
          `[SportsUSA] NOTE: Ensure you have functions/sportsUSASeedSchools.js deployed (function name must match URL).`
        );
        return;
      }

      const found = data?.stats?.schools_found ?? 0;
      const http = data?.stats?.http ?? "n/a";
      append(setLogSportsUSA, `[SportsUSA] SportsUSA fetched: schools_found=${found} | http=${http}`);

      const sample = asArray(data?.schools).slice(0, 3);
      if (sample.length) {
        append(setLogSportsUSA, `[SportsUSA] SportsUSA sample (first ${sample.length}):`);
        for (const s of sample) {
          append(
            setLogSportsUSA,
            `- name="${s?.school_name || ""}" | logo="${s?.logo_url || ""}" | view="${s?.view_site_url || ""}"`
          );
        }
      }

      if (sportsUSADryRun) {
        append(setLogSportsUSA, "[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      const rows = asArray(data?.schools);
      if (!rows.length) {
        append(setLogSportsUSA, "[SportsUSA] No schools returned to write.");
        return;
      }

      let createdSchools = 0;
      let updatedSchools = 0;
      let createdSites = 0;
      let updatedSites = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        const school_name = safeString(r?.school_name);
        const logo_url = safeString(r?.logo_url);
        const view_site_url = safeString(r?.view_site_url);
        const source_key = safeString(r?.source_key) || (view_site_url ? `sportsusa:view:${lc(view_site_url)}` : null);

        if (!school_name || !source_key) {
          skipped += 1;
          continue;
        }

        const needs_review = looksLikeGenericLogo(logo_url) ? true : true; // default true for all automation, safer

        const schoolPayload = {
          school_name,
          normalized_name: normalizeSchoolNameKey(school_name),
          aliases_json: JSON.stringify([]),
          school_type: "College/University",
          active: true,
          needs_review,
          division: "Unknown",
          conference: null,
          city: null,
          state: null,
          country: "US",
          logo_url: logo_url || null,
          website_url: null,
          source_platform: "sportsusa",
          source_school_url: view_site_url || siteUrl,
          source_key,
          last_seen_at: runIso,
        };

        try {
          const up = await upsertSchoolBySourceKeyOrName(schoolPayload);
          if (up.action === "created") createdSchools += 1;
          if (up.action === "updated") updatedSchools += 1;

          const schoolId = up.id;
          if (!schoolId || !view_site_url) {
            skipped += 1;
            continue;
          }

          const sitePayload = {
            school_id: schoolId,
            sport_id: selectedSportId,
            camp_site_url: view_site_url,   // ✅ matches your schema
            logo_url: logo_url || null,
            source_platform: "sportsusa",
            source_key: `sportsusa:${selectedSportId}:${lc(view_site_url)}`, // stable per sport+url
            active: true,
            needs_review: true,
            last_seen_at: runIso,
          };

          const siteAction = await upsertSchoolSportSite(sitePayload);
          if (siteAction === "created") createdSites += 1;
          if (siteAction === "updated") updatedSites += 1;
        } catch (e) {
          errors += 1;
          append(setLogSportsUSA, `[SportsUSA] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
        }

        if ((i + 1) % 25 === 0) {
          append(setLogSportsUSA, `[SportsUSA] Write progress: ${i + 1}/${rows.length}`);
          await sleep(25);
        }
      }

      append(
        setLogSportsUSA,
        `[SportsUSA] Writes done. Schools: created=${createdSchools} updated=${updatedSchools} | Sites: created=${createdSites} updated=${updatedSites} | skipped=${skipped} errors=${errors}`
      );
    } catch (e) {
      append(setLogSportsUSA, `[SportsUSA] ERROR: ${String(e?.message || e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Promote CampDemo -> Camp (unchanged core logic)
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

    setWorkingPromote(true);
    setLogPromote("");
    setPromoteStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    append(setLogPromote, `[Promote] Starting: Promote CampDemo → Camp @ ${runIso}`);

    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({}));
    } catch (e) {
      append(setLogPromote, `[Promote] ERROR reading CampDemo: ${String(e?.message || e)}`);
      setWorkingPromote(false);
      return;
    }

    append(setLogPromote, `[Promote] Found CampDemo rows: ${demoRows.length}`);
    setPromoteStats((s) => ({ ...s, read: demoRows.length }));

    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];

      try {
        const built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          setPromoteStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          append(setLogPromote, `[Promote] SKIP #${i + 1}: ${built.error}`);
          continue;
        }

        const result = await upsertCampByEventKey(built.payload);

        if (result === "created") setPromoteStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setPromoteStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) append(setLogPromote, `[Promote] Progress: ${i + 1}/${demoRows.length}`);
        await sleep(40);
      } catch (e) {
        setPromoteStats((s) => ({ ...s, errors: s.errors + 1 }));
        append(setLogPromote, `[Promote] ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    append(setLogPromote, "[Promote] Done.");
    setWorkingPromote(false);
  }

  /* ----------------------------
     Ryzer ingestion runner (kept as-is; you may deprecate later)
  ----------------------------- */
  async function runRyzerIngestion() {
    setLogRyzer("");

    if (!selectedSportId) return append(setLogRyzer, "[Ryzer] ERROR: Select a sport first.");
    if (!safeString(ryzerActivityTypeId)) return append(setLogRyzer, "[Ryzer] ERROR: Provide Ryzer ActivityTypeId GUID.");
    if (!SchoolEntity?.filter) return append(setLogRyzer, "[Ryzer] ERROR: School entity not available.");
    if (!CampDemoEntity) return append(setLogRyzer, "[Ryzer] ERROR: CampDemo entity not available.");

    const runIso = new Date().toISOString();

    setRyzerWorking(true);
    append(setLogRyzer, `[Ryzer] Starting: Ryzer ingestion (${selectedSportName}) @ ${runIso}`);
    append(
      setLogRyzer,
      `[Ryzer] DryRun=${ryzerDryRun ? "true" : "false"} | RPP=${ryzerRecordsPerPage} | Pages=${ryzerMaxPages} | MaxEvents=${ryzerMaxEvents}`
    );

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

      append(setLogRyzer, `[Ryzer] Loaded Schools: ${schools.length}`);

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
        append(setLogRyzer, `[Ryzer] ERROR: Ryzer function ERROR (HTTP ${res.status})`);
        append(setLogRyzer, JSON.stringify(data || {}, null, 2));
        return;
      }

      append(
        setLogRyzer,
        `[Ryzer] Ryzer results: accepted=${data?.stats?.accepted ?? 0}, rejected=${data?.stats?.rejected ?? 0}, errors=${data?.stats?.errors ?? 0}`
      );
      append(setLogRyzer, `[Ryzer] Ryzer processed: ${data?.stats?.processed ?? 0}`);
      append(setLogRyzer, `[Ryzer] Ryzer debug version: ${data?.debug?.version || "MISSING"}`);

      const p0 = asArray(data?.debug?.pages)[0] || null;
      if (p0) {
        append(setLogRyzer, `[Ryzer] p0 http=${p0.http ?? "n/a"} rowCount=${p0.rowCount ?? "n/a"} total=${p0.total ?? "n/a"}`);
        append(setLogRyzer, `[Ryzer] p0 rowsArrayPath=${p0.rowsArrayPath || "n/a"}`);
        append(setLogRyzer, `[Ryzer] p0 uniqueActivityNames=${JSON.stringify(p0.uniqueActivityNames || [])}`);
      }

      if (ryzerDryRun) {
        append(setLogRyzer, "[Ryzer] DryRun=true: no DB writes performed.");
        return;
      }

      append(setLogRyzer, "[Ryzer] NOTE: You currently have cross-sport leakage in Ryzer eventSearch; consider deprecating this path.");
    } catch (e) {
      append(setLogRyzer, `[Ryzer] ERROR: ${String(e?.message || e)}`);
    } finally {
      setRyzerWorking(false);
    }
  }

  /* ----------------------------
     Page UI
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">Admin tools for sports/positions + SportsUSA seeding + promotion.</div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* ✅ Single sport selector (top of page) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Active sport</div>
          <div className="text-sm text-slate-600 mt-1">All sections below run against this sport selection.</div>

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
                  setSelectedSportName(hit?.name || "");
                }}
                disabled={sportsLoading || seedWorking || sportsUSAWorking || ryzerWorking || workingPromote}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport"}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadSports()} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh sports"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setLogSportsUSA("");
                  setLogRyzer("");
                  setLogSeed("");
                  setLogPromote("");
                  setLogSportsAdmin("");
                }}
                disabled={seedWorking || sportsUSAWorking || ryzerWorking || workingPromote}
              >
                Clear logs
              </Button>
            </div>
          </div>
        </Card>

        {/* ✅ SportsUSA seeding */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA Seed Schools + Sites</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls the Sport directory (like footballcampsusa.com) and writes:
            <b> School</b> + <b>SchoolSportSite</b> (camp_site_url per school per sport).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsUSADirectoryUrl}
                onChange={(e) => setSportsUSADirectoryUrl(e.target.value)}
                placeholder="https://www.footballcampsusa.com/"
                disabled={sportsUSAWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                This is the directory page that lists all school tiles for the sport.
              </div>
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
                  max={3000}
                  disabled={sportsUSAWorking}
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={sportsUSADryRun}
                    onChange={(e) => setSportsUSADryRun(e.target.checked)}
                    disabled={sportsUSAWorking}
                  />
                  Dry Run
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={runSportsUSASeedSchools}
              disabled={sportsUSAWorking || !selectedSportId || seedWorking || ryzerWorking || workingPromote}
            >
              {sportsUSAWorking ? "Running…" : sportsUSADryRun ? "Run SportsUSA (Dry Run)" : "Run SportsUSA → Write School + Site"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logSportsUSA || "—"}
            </pre>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            If you see KeyError: 'sportsUSASeedSchools' then the backend function is missing or not named correctly.
            File must be <b>functions/sportsUSASeedSchools.js</b> and called via <b>/functions/sportsUSASeedSchools</b>.
          </div>
        </Card>

        {/* ✅ Ryzer ingestion (kept, but likely deprecated) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Ryzer Ingestion (diagnostic)</div>
          <div className="text-sm text-slate-600 mt-1">
            This path is currently leaking cross-sport results even with ActivityTypes. Keep for debugging only.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ryzer ActivityTypeId (GUID)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ryzerActivityTypeId}
                onChange={(e) => setRyzerActivityTypeId(e.target.value)}
                placeholder="A8ADF526-3822-4261-ADCF-1592CF4BB7FF"
                disabled={ryzerWorking}
              />
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
            <Button
              onClick={runRyzerIngestion}
              disabled={ryzerWorking || seedWorking || sportsUSAWorking || workingPromote}
            >
              {ryzerWorking ? "Running…" : "Run Ryzer (Dry Run recommended)"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logRyzer || "—"}
            </pre>
          </div>
        </Card>

        {/* ✅ Positions Manager (uses top sport selection) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Manage Positions</div>
          <div className="text-sm text-slate-600 mt-1">
            Uses the selected sport above. Auto-seed defaults or manage positions manually.
          </div>

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <div className="text-sm text-slate-700">
              <b>Sport:</b> {selectedSportName || "—"}
            </div>

            <Button
              onClick={seedPositionsForSport}
              disabled={seedWorking || sportsUSAWorking || ryzerWorking || workingPromote || !selectedSportId}
            >
              {seedWorking ? "Seeding…" : "Auto-seed positions"}
            </Button>

            <Button
              variant="outline"
              onClick={() => loadPositionsForSport(selectedSportId)}
              disabled={!selectedSportId || positionsLoading}
            >
              {positionsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
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
                                    name: prev[p.id]?.name ?? p.name,
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
                                    code: prev[p.id]?.code ?? p.code,
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

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-64">
              {logSeed || "—"}
            </pre>
          </div>
        </Card>

        {/* Promote CampDemo -> Camp */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>. Payload is fully type-safe for Camp schema.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={workingPromote || seedWorking || sportsUSAWorking || ryzerWorking}>
              {workingPromote ? "Running…" : "Run Promotion"}
            </Button>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {promoteStats.read}</span>
              <span><b>Created:</b> {promoteStats.created}</span>
              <span><b>Updated:</b> {promoteStats.updated}</span>
              <span><b>Skipped:</b> {promoteStats.skipped}</span>
              <span><b>Errors:</b> {promoteStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logPromote || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => nav(ROUTES.Home)}
            disabled={seedWorking || sportsUSAWorking || ryzerWorking || workingPromote}
          >
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
