// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Helpers
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

function normalizeSchoolNameForMatch(name) {
  const s = String(name || "").toLowerCase();
  return s
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

/* ----------------------------
   Routes
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   Position default seeds
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
   Main Page
----------------------------- */
export default function AdminImport() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;
  const SchoolEntity = base44?.entities?.School || base44?.entities?.Schools || null;
  const SchoolSportSiteEntity =
    base44?.entities?.SchoolSportSite || base44?.entities?.SchoolSportSites || null;

  const CampDemoEntity = base44?.entities?.CampDemo || null;

  /* ----------------------------
     Shared Sport selection (ONE selector drives all)
  ----------------------------- */
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);

  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  const selectedSport = useMemo(() => {
    return sports.find((s) => s.id === selectedSportId) || null;
  }, [sports, selectedSportId]);

  /* ----------------------------
     Logs (unique per tool/section)
  ----------------------------- */
  const [sportsusaLog, setSportsusaLog] = useState("");
  const [ryzerLog, setRyzerLog] = useState("");
  const [positionsLog, setPositionsLog] = useState("");
  const [promoteLog, setPromoteLog] = useState("");

  const appendSportsUSALog = (line) =>
    setSportsusaLog((p) => (p ? p + "\n" + line : line));
  const appendRyzerLog = (line) => setRyzerLog((p) => (p ? p + "\n" + line : line));
  const appendPositionsLog = (line) =>
    setPositionsLog((p) => (p ? p + "\n" + line : line));
  const appendPromoteLog = (line) =>
    setPromoteLog((p) => (p ? p + "\n" + line : line));

  /* ----------------------------
     Load sports
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
          sportsusa_directory_url:
            safeString(r?.sportsusa_directory_url) ||
            safeString(r?.sportsUSA_directory_url) ||
            safeString(r?.sportsusaDirectoryUrl) ||
            null,
          ryzer_activity_type_id:
            safeString(r?.ryzer_activity_type_id) ||
            safeString(r?.ryzerActivityTypeId) ||
            safeString(r?.ryzer_activitytypeid) ||
            null,
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
    const hit = sports.find((s) => s.id === selectedSportId);
    if (hit) setSelectedSportName(hit.name);
  }, [selectedSportId, sports]);

  /* ----------------------------
     SportsUSA config + seed schools
  ----------------------------- */
  const [sportsusaWorking, setSportsusaWorking] = useState(false);
  const [sportsusaDryRun, setSportsusaDryRun] = useState(true);
  const [sportsusaLimit, setSportsusaLimit] = useState(300);

  // IMPORTANT: this URL is stored on Sport.sportsusa_directory_url
  const [sportsusaDirectoryUrl, setSportsusaDirectoryUrl] = useState("");

  useEffect(() => {
    setSportsusaDirectoryUrl(selectedSport?.sportsusa_directory_url || "");
  }, [selectedSport?.sportsusa_directory_url, selectedSportId]);

  async function saveSportsUSADirectoryUrl() {
    const runIso = new Date().toISOString();
    setSportsusaLog("");
    appendSportsUSALog(`[SportsUSA] Mapping: Save directory URL @ ${runIso}`);

    if (!selectedSportId) return appendSportsUSALog("[SportsUSA] ERROR: Select a sport first.");
    if (!SportEntity?.update) return appendSportsUSALog("[SportsUSA] ERROR: Sport entity missing update().");

    const url = safeString(sportsusaDirectoryUrl);
    if (!url) return appendSportsUSALog("[SportsUSA] ERROR: Directory URL is required.");

    // Try multiple field names for safety, but your schema should be sportsusa_directory_url
    const ok = await tryUpdateWithPayloads(SportEntity, selectedSportId, [
      { sportsusa_directory_url: url },
      { sportsUSA_directory_url: url },
      { sportsusaDirectoryUrl: url },
    ]);

    appendSportsUSALog(ok ? `[SportsUSA] OK: Saved directory URL = ${url}` : "[SportsUSA] ERROR: Save failed (field mismatch?).");
    await loadSports();
  }

  async function upsertSchoolFromSportsUSAItem(item, runIso) {
    if (!SchoolEntity?.filter || !SchoolEntity?.create || !SchoolEntity?.update) {
      throw new Error("School entity not available (expected entities.School).");
    }

    const school_name = safeString(item?.school_name);
    if (!school_name) return { status: "skipped", reason: "missing_school_name" };

    const normalized_name = normalizeSchoolNameForMatch(school_name);
    const source_key = safeString(item?.source_key);
    const logo_url = safeString(item?.logo_url);
    const website_url = safeString(item?.view_site_url);
    const source_school_url = safeString(item?.source_school_url) || website_url;

    // Dedupe strategy:
    // 1) source_key exact match (best)
    // 2) normalized_name match (fallback)
    let existing = [];

    if (source_key) {
      try {
        existing = asArray(await SchoolEntity.filter({ source_key }));
      } catch {
        existing = [];
      }
    }

    if (!existing.length && normalized_name) {
      try {
        // If your schema uses normalized_name, this works.
        existing = asArray(await SchoolEntity.filter({ normalized_name }));
      } catch {
        existing = [];
      }
    }

    const payload = {
      school_name,
      normalized_name,
      school_type: "College/University",
      active: true,
      needs_review: false,
      logo_url: logo_url || null,
      website_url: website_url || null,
      source_platform: "sportsusa",
      source_school_url: source_school_url || null,
      source_key: source_key || null,
      last_seen_at: runIso,
    };

    if (existing.length && existing[0]?.id) {
      const id = String(existing[0].id);

      // Only overwrite logo_url if new one exists AND existing is blank OR clearly generic
      const existingLogo = safeString(existing[0]?.logo_url);
      const looksGeneric =
        existingLogo && existingLogo.includes("logo-athletic.png"); // SportsUSA generic placeholder
      const finalLogo =
        logo_url && (!existingLogo || looksGeneric) ? logo_url : (existingLogo || null);

      const updatePayload = { ...payload, logo_url: finalLogo };

      await SchoolEntity.update(id, updatePayload);
      return { status: "updated", school_id: id, school_name };
    }

    const created = await tryCreateWithPayloads(SchoolEntity, [
      payload,
      // fallback payloads in case schema differs slightly
      {
        school_name,
        active: true,
        logo_url: logo_url || null,
        website_url: website_url || null,
        source_platform: "sportsusa",
        source_key: source_key || null,
        last_seen_at: runIso,
      },
    ]);

    // Base44 sometimes returns the created object, sometimes truthy
    if (created && created.id) {
      return { status: "created", school_id: String(created.id), school_name };
    }

    // If created is truthy but no id, do a best-effort re-fetch by source_key
    if (source_key) {
      try {
        const post = asArray(await SchoolEntity.filter({ source_key }));
        if (post.length && post[0]?.id) {
          return { status: "created", school_id: String(post[0].id), school_name };
        }
      } catch {}
    }

    return { status: "error", reason: "create_failed_no_id" };
  }

  async function upsertSchoolSportSite({ school_id, sport_id, camp_site_url, logo_url, source_key }, runIso) {
    if (!SchoolSportSiteEntity?.filter || !SchoolSportSiteEntity?.create || !SchoolSportSiteEntity?.update) {
      throw new Error("SchoolSportSite entity not available (expected entities.SchoolSportSite).");
    }

    const sk = safeString(source_key) || `sportsusa:${sport_id}:${lc(camp_site_url || "")}`;
    const payload = {
      school_id,
      sport_id,
      camp_site_url,
      logo_url: logo_url || null,
      source_platform: "sportsusa",
      source_key: sk,
      active: true,
      needs_review: false,
      last_seen_at: runIso,
    };

    // Prefer dedupe by (school_id, sport_id)
    let existing = [];
    try {
      existing = asArray(await SchoolSportSiteEntity.filter({ school_id, sport_id }));
    } catch {
      existing = [];
    }

    if (!existing.length) {
      // fallback dedupe by source_key if available
      try {
        existing = asArray(await SchoolSportSiteEntity.filter({ source_key: sk }));
      } catch {
        existing = [];
      }
    }

    if (existing.length && existing[0]?.id) {
      await SchoolSportSiteEntity.update(String(existing[0].id), payload);
      return "updated";
    }

    await SchoolSportSiteEntity.create(payload);
    return "created";
  }

  async function seedSchoolsFromSportsUSA() {
    const runIso = new Date().toISOString();
    setSportsusaWorking(true);
    setSportsusaLog("");

    appendSportsUSALog(`[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName || "?"}) @ ${runIso}`);
    appendSportsUSALog(`[SportsUSA] DryRun=${sportsusaDryRun ? "true" : "false"} | Limit=${sportsusaLimit}`);

    try {
      if (!selectedSportId) {
        appendSportsUSALog("[SportsUSA] ERROR: Select a sport first.");
        return;
      }

      const siteUrl = safeString(sportsusaDirectoryUrl) || safeString(selectedSport?.sportsusa_directory_url);
      if (!siteUrl) {
        appendSportsUSALog("[SportsUSA] ERROR: No SportsUSA directory URL set for this sport.");
        appendSportsUSALog("[SportsUSA] Fix: Enter the directory URL above (e.g., https://www.footballcampsusa.com) then click Save.");
        return;
      }

      // Must call server-side function to avoid CORS
      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl,
          limit: sportsusaLimit,
          dryRun: true, // collector dryRun is informational; DB writes happen here in AdminImport
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendSportsUSALog(`[SportsUSA] ERROR: Function call failed (HTTP ${res.status}).`);
        appendSportsUSALog(JSON.stringify(data || {}, null, 2));
        appendSportsUSALog("[SportsUSA] NOTE: If you see KeyError:'sportsUSASeedSchools', the function is not deployed/named correctly in Base44.");
        return;
      }

      const schools = asArray(data?.schools);
      appendSportsUSALog(`[SportsUSA] SportsUSA fetched: schools_found=${schools.length} | http=${data?.stats?.http ?? "n/a"}`);

      if (schools.length) {
        appendSportsUSALog(`[SportsUSA] SportsUSA sample (first ${Math.min(3, schools.length)}):`);
        schools.slice(0, 3).forEach((s) => {
          appendSportsUSALog(`- name="${s?.school_name || ""}" | logo="${s?.logo_url || ""}" | view="${s?.view_site_url || ""}"`);
        });
      } else {
        appendSportsUSALog("[SportsUSA] WARNING: No schools parsed. Site HTML structure may have changed.");
        return;
      }

      if (sportsusaDryRun) {
        appendSportsUSALog("[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      if (!SchoolEntity || !SchoolSportSiteEntity) {
        appendSportsUSALog("[SportsUSA] ERROR: Missing School or SchoolSportSite entity.");
        return;
      }

      let createdSchools = 0;
      let updatedSchools = 0;
      let createdSites = 0;
      let updatedSites = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < schools.length; i++) {
        const item = schools[i];

        try {
          const viewUrl = safeString(item?.view_site_url);
          const name = safeString(item?.school_name);

          if (!name || !viewUrl) {
            skipped += 1;
            appendSportsUSALog(`[SportsUSA] SKIP #${i + 1}: missing school_name or view_site_url`);
            continue;
          }

          const sres = await upsertSchoolFromSportsUSAItem(item, runIso);
          if (sres.status === "created") createdSchools += 1;
          if (sres.status === "updated") updatedSchools += 1;
          if (!sres.school_id) {
            errors += 1;
            appendSportsUSALog(`[SportsUSA] ERROR #${i + 1}: School upsert failed for "${name}" (${sres.reason || "unknown"})`);
            continue;
          }

          // Upsert SchoolSportSite for this sport
          const siteRes = await upsertSchoolSportSite(
            {
              school_id: sres.school_id,
              sport_id: selectedSportId,
              camp_site_url: viewUrl,
              logo_url: safeString(item?.logo_url),
              source_key: safeString(item?.source_key),
            },
            runIso
          );

          if (siteRes === "created") createdSites += 1;
          if (siteRes === "updated") updatedSites += 1;

          if ((i + 1) % 25 === 0) appendSportsUSALog(`[SportsUSA] Progress: ${i + 1}/${schools.length}`);
          await sleep(25);
        } catch (e) {
          errors += 1;
          appendSportsUSALog(`[SportsUSA] ERROR #${i + 1}: ${String(e?.message || e)}`);
        }
      }

      appendSportsUSALog(
        `[SportsUSA] Done. schools created=${createdSchools} updated=${updatedSchools} | sites created=${createdSites} updated=${updatedSites} | skipped=${skipped} errors=${errors}`
      );
    } catch (e) {
      appendSportsUSALog(`[SportsUSA] ERROR: ${String(e?.message || e)}`);
    } finally {
      setSportsusaWorking(false);
    }
  }

  /* ----------------------------
     Positions (seed + CRUD minimal)
  ----------------------------- */
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [seedPositionsWorking, setSeedPositionsWorking] = useState(false);
  const [seedStats, setSeedStats] = useState({ attempted: 0, created: 0, updated: 0, errors: 0 });

  const seedListForSelectedSport = useMemo(() => {
    const name = String(selectedSportName || "").trim();
    if (!name) return [];
    return DEFAULT_POSITION_SEEDS[name] || [];
  }, [selectedSportName]);

  async function loadPositionsForSport(sportId) {
    if (!PositionEntity?.filter || !sportId) {
      setPositions([]);
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
        }))
        .filter((p) => p.id);

      normalized.sort((a, b) => (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || ""));
      setPositions(normalized);
    } catch {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedSportId) loadPositionsForSport(selectedSportId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  async function upsertPositionBySportAndCode({ sportId, code, name }) {
    if (!PositionEntity?.filter || !PositionEntity?.create || !PositionEntity?.update) {
      throw new Error("Position entity not available (expected entities.Position).");
    }

    const position_code = String(code || "").trim().toUpperCase();
    const position_name = String(name || "").trim();

    if (!sportId) throw new Error("Missing sport_id for Position upsert.");
    if (!position_code) throw new Error("Missing position_code.");
    if (!position_name) throw new Error("Missing position_name.");

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
    setSeedPositionsWorking(true);
    setSeedStats({ attempted: 0, created: 0, updated: 0, errors: 0 });
    setPositionsLog("");

    appendPositionsLog(`[Positions] Starting: Seed Positions (${selectedSportName || "?"}) @ ${runIso}`);

    try {
      if (!selectedSportId) {
        appendPositionsLog("[Positions] ERROR: Select a sport first.");
        return;
      }
      const list = seedListForSelectedSport;
      if (!list.length) {
        appendPositionsLog(`[Positions] ERROR: No default seed list found for sport "${selectedSportName || "?"}".`);
        return;
      }

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

          if ((i + 1) % 5 === 0) appendPositionsLog(`[Positions] Progress: ${i + 1}/${list.length}`);
          await sleep(30);
        } catch (e) {
          setSeedStats((s) => ({ ...s, errors: s.errors + 1 }));
          appendPositionsLog(`[Positions] ERROR #${i + 1}: ${String(e?.message || e)}`);
        }
      }

      appendPositionsLog("[Positions] Done.");
      await loadPositionsForSport(selectedSportId);
    } finally {
      setSeedPositionsWorking(false);
    }
  }

  /* ----------------------------
     Promote CampDemo -> Camp (kept simple)
  ----------------------------- */
  const [promoteWorking, setPromoteWorking] = useState(false);
  const [promoteStats, setPromoteStats] = useState({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

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

    const position_ids = normalizeStringArray(r?.position_ids);
    const price = safeNumber(r?.price);
    const link_url = safeString(r?.link_url || r?.url) || null;
    const source_url = safeString(r?.source_url) || link_url;

    const season_year =
      safeNumber(r?.season_year) ??
      safeNumber(computeSeasonYearFootball(start_date));

    const source_platform = safeString(r?.source_platform) || "seed";
    const program_id = safeString(r?.program_id) || `seed:${school_id}:${slugify(camp_name)}`;

    const event_key =
      safeString(r?.event_key) ||
      `${source_platform}:${program_id}:${start_date}:${link_url || source_url || "na"}`;

    const content_hash =
      safeString(r?.content_hash) ||
      simpleHash({ school_id, sport_id, camp_name, start_date, end_date, position_ids, price, link_url });

    return {
      payload: {
        school_id,
        sport_id,
        camp_name,
        start_date,
        end_date: end_date || null,
        city: safeString(r?.city) || null,
        state: safeString(r?.state) || null,
        position_ids,
        price: price != null ? price : null,
        link_url,
        notes: safeString(r?.notes) || null,

        season_year: season_year != null ? season_year : null,
        program_id,
        event_key,
        source_platform,
        source_url: source_url || null,
        last_seen_at: runIso,
        content_hash,

        event_dates_raw: safeString(r?.event_dates_raw) || null,
        grades_raw: safeString(r?.grades_raw) || null,
        register_by_raw: safeString(r?.register_by_raw) || null,
        price_raw: safeString(r?.price_raw) || null,
        price_min: safeNumber(r?.price_min),
        price_max: safeNumber(r?.price_max),
        sections_json: tryParseJson(r?.sections_json) || null,
      },
    };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setPromoteWorking(true);
    setPromoteLog("");
    setPromoteStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendPromoteLog(`[Promote] Starting: Promote CampDemo → Camp @ ${runIso}`);

    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({}));
    } catch (e) {
      appendPromoteLog(`[Promote] ERROR reading CampDemo: ${String(e?.message || e)}`);
      setPromoteWorking(false);
      return;
    }

    appendPromoteLog(`[Promote] Found CampDemo rows: ${demoRows.length}`);
    setPromoteStats((s) => ({ ...s, read: demoRows.length }));

    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];

      try {
        const built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          setPromoteStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendPromoteLog(`[Promote] SKIP #${i + 1}: ${built.error}`);
          continue;
        }

        const result = await upsertCampByEventKey(built.payload);
        if (result === "created") setPromoteStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setPromoteStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 20 === 0) appendPromoteLog(`[Promote] Progress: ${i + 1}/${demoRows.length}`);
        await sleep(40);
      } catch (e) {
        setPromoteStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendPromoteLog(`[Promote] ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    appendPromoteLog("[Promote] Done.");
    setPromoteWorking(false);
  }

  /* ----------------------------
     Render
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">Sport-driven admin tools for seeding + promotion.</div>
          </div>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* ONE Sport selector drives everything */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport Selection</div>
          <div className="text-sm text-slate-600 mt-1">Choose the sport once. All sections below use this selection.</div>

          <div className="mt-3 flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sport</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={selectedSportId}
                onChange={(e) => setSelectedSportId(e.target.value)}
                disabled={sportsLoading}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
            </div>

            <Button variant="outline" onClick={loadSports} disabled={sportsLoading}>
              {sportsLoading ? "Refreshing…" : "Refresh Sports"}
            </Button>
          </div>
        </Card>

        {/* SportsUSA Config + Seed */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA School Seeding</div>
          <div className="text-sm text-slate-600 mt-1">
            Stores the directory URL on <b>Sport</b>, then calls <b>/functions/sportsUSASeedSchools</b> to parse tiles and upsert
            <b> School</b> + <b>SchoolSportSite</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA directory URL (saved on Sport)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsusaDirectoryUrl}
                onChange={(e) => setSportsusaDirectoryUrl(e.target.value)}
                placeholder="https://www.footballcampsusa.com"
                disabled={sportsusaWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Example: Football = https://www.footballcampsusa.com
              </div>
            </div>

            <div className="flex items-end gap-3">
              <Button onClick={saveSportsUSADirectoryUrl} disabled={!selectedSportId || sportsusaWorking}>
                Save Directory URL
              </Button>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={sportsusaDryRun}
                  onChange={(e) => setSportsusaDryRun(e.target.checked)}
                  disabled={sportsusaWorking}
                />
                Dry Run
              </label>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                min={10}
                max={5000}
                value={sportsusaLimit}
                onChange={(e) => setSportsusaLimit(Number(e.target.value || 0))}
                disabled={sportsusaWorking}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={seedSchoolsFromSportsUSA}
                disabled={!selectedSportId || sportsusaWorking}
              >
                {sportsusaWorking ? "Running…" : sportsusaDryRun ? "Run Seed (Dry Run)" : "Run Seed → Write Schools"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setSportsusaLog("")}
                disabled={sportsusaWorking}
              >
                Clear Log
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">SportsUSA Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {sportsusaLog || "—"}
            </pre>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            If you see <b>KeyError: 'sportsUSASeedSchools'</b>, the backend function is not deployed/named correctly in Base44.
          </div>
        </Card>

        {/* Positions */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Positions</div>
          <div className="text-sm text-slate-600 mt-1">
            Auto-seed default positions for the selected sport.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={seedPositionsForSport}
              disabled={!selectedSportId || seedPositionsWorking}
            >
              {seedPositionsWorking ? "Seeding…" : "Auto-seed positions"}
            </Button>

            <Button
              variant="outline"
              onClick={() => selectedSportId && loadPositionsForSport(selectedSportId)}
              disabled={!selectedSportId || positionsLoading}
            >
              {positionsLoading ? "Refreshing…" : "Refresh"}
            </Button>

            <Button
              variant="outline"
              onClick={() => setPositionsLog("")}
              disabled={seedPositionsWorking}
            >
              Clear Log
            </Button>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Attempted:</b> {seedStats.attempted}</span>
              <span><b>Created:</b> {seedStats.created}</span>
              <span><b>Updated:</b> {seedStats.updated}</span>
              <span><b>Errors:</b> {seedStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Positions Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {positionsLog || "—"}
            </pre>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">Current Positions</div>
            <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2 border-b border-slate-200 w-28">Code</th>
                    <th className="p-2 border-b border-slate-200">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length ? (
                    positions.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="p-2">{p.code}</td>
                        <td className="p-2">{p.name}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="p-3 text-slate-500">
                        {selectedSportId ? (positionsLoading ? "Loading…" : "No positions found.") : "Select a sport first."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Promote */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Upserts by <b>event_key</b>. Use after you have CampDemo rows.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={promoteWorking}>
              {promoteWorking ? "Running…" : "Run Promotion"}
            </Button>

            <Button variant="outline" onClick={() => setPromoteLog("")} disabled={promoteWorking}>
              Clear Log
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
            <div className="text-xs text-slate-500 mb-1">Promote Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {promoteLog || "—"}
            </pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
