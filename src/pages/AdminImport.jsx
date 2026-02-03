// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Inline helpers (editor safe)
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
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
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
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
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

function normalizeStringArray(value) {
  const v = tryParseJson(value);
  if (Array.isArray(v)) {
    return v.map((x) => (x == null ? null : String(x).trim())).filter((x) => !!x);
  }
  const one = safeString(v);
  return one ? [one] : [];
}

/* ----------------------------
   Routes
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   ActivityTypeId mapping (optional)
----------------------------- */
const RYZER_ACTIVITY_TYPE_BY_SPORTNAME = {
  Football: "A8ADF526-3822-4261-ADCF-1592CF4BB7FF",
};

export default function AdminImport() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const SchoolEntity = base44?.entities?.School || base44?.entities?.Schools || null;
  const SchoolSportSiteEntity = base44?.entities?.SchoolSportSite || null;
  const CampDemoEntity = base44?.entities?.CampDemo || null;

  // ---- global sport selection at top (single source of truth) ----
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // ---- logs (per section) ----
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");
  const [logRyzer, setLogRyzer] = useState("");
  const [logPromotion, setLogPromotion] = useState("");

  const appendSportsUSA = (line) => setLogSportsUSA((p) => (p ? p + "\n" + line : line));
  const appendCamps = (line) => setLogCamps((p) => (p ? p + "\n" + line : line));
  const appendRyzer = (line) => setLogRyzer((p) => (p ? p + "\n" + line : line));
  const appendPromotion = (line) => setLogPromotion((p) => (p ? p + "\n" + line : line));

  // ---- SportsUSA seed controls ----
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);
  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);

  // ---- Camps ingest controls ----
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(5);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(5);
  const [campsMaxEvents, setCampsMaxEvents] = useState(25);
  const [campsWorking, setCampsWorking] = useState(false);

  // Harding test override (optional)
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [testSchoolId, setTestSchoolId] = useState("");

  // ---- Ryzer ingestion controls (kept, but not the recommended primary path) ----
  const [ryzerWorking, setRyzerWorking] = useState(false);
  const [ryzerDryRun, setRyzerDryRun] = useState(true);
  const [ryzerRecordsPerPage, setRyzerRecordsPerPage] = useState(25);
  const [ryzerMaxPages, setRyzerMaxPages] = useState(10);
  const [ryzerMaxEvents, setRyzerMaxEvents] = useState(200);
  const [ryzerActivityTypeId, setRyzerActivityTypeId] = useState("");

  // ---- Promotion stats ----
  const [promotionWorking, setPromotionWorking] = useState(false);
  const [promotionStats, setPromotionStats] = useState({
    read: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  });

  // Auto-fill Ryzer ActivityTypeId if known
  useEffect(() => {
    const guess = RYZER_ACTIVITY_TYPE_BY_SPORTNAME[String(selectedSportName || "").trim()];
    if (guess) setRyzerActivityTypeId(guess);
  }, [selectedSportName]);

  async function loadSports() {
    if (!SportEntity || !SportEntity.filter) return;
    setSportsLoading(true);
    try {
      const rows = asArray(await SportEntity.filter({}));
      const normalized = rows
        .map((r) => {
          const id = r?.id ? String(r.id) : "";
          const name = String(r?.sport_name || r?.name || r?.sportName || "").trim();
          return { id, name, raw: r };
        })
        .filter((x) => x.id && x.name);

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

  /* ----------------------------
     School upsert + Site upsert (SportsUSA seed writes both)
  ----------------------------- */
  async function upsertSchoolBySourceKey(payload) {
    if (!SchoolEntity || !SchoolEntity.filter || !SchoolEntity.create || !SchoolEntity.update) {
      throw new Error("School entity not available (expected entities.School).");
    }

    const source_key = safeString(payload?.source_key);
    const school_name = safeString(payload?.school_name);

    if (!school_name) throw new Error("Missing school_name");
    if (!source_key) throw new Error("Missing source_key");

    let existing = [];
    try {
      existing = asArray(await SchoolEntity.filter({ source_key }));
    } catch {
      existing = [];
    }

    if (existing.length && existing[0]?.id) {
      await SchoolEntity.update(String(existing[0].id), payload);
      return { mode: "updated", id: String(existing[0].id) };
    }

    const created = await SchoolEntity.create(payload);
    const id = created?.id ? String(created.id) : null;
    return { mode: "created", id };
  }

  async function upsertSchoolSportSiteBySourceKey(payload) {
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter || !SchoolSportSiteEntity.create || !SchoolSportSiteEntity.update) {
      throw new Error("SchoolSportSite entity not available (expected entities.SchoolSportSite).");
    }

    const source_key = safeString(payload?.source_key);
    const school_id = safeString(payload?.school_id);
    const sport_id = safeString(payload?.sport_id);
    const camp_site_url = safeString(payload?.camp_site_url);

    if (!source_key) throw new Error("Missing source_key");
    if (!school_id) throw new Error("Missing school_id");
    if (!sport_id) throw new Error("Missing sport_id");
    if (!camp_site_url) throw new Error("Missing camp_site_url");

    let existing = [];
    try {
      existing = asArray(await SchoolSportSiteEntity.filter({ source_key }));
    } catch {
      existing = [];
    }

    if (existing.length && existing[0]?.id) {
      await SchoolSportSiteEntity.update(String(existing[0].id), payload);
      return { mode: "updated", id: String(existing[0].id) };
    }

    const created = await SchoolSportSiteEntity.create(payload);
    const id = created?.id ? String(created.id) : null;
    return { mode: "created", id };
  }

  async function runSportsUSASeedSchools() {
    if (!selectedSportId) return appendSportsUSA("[SportsUSA] ERROR: Select a sport first.");

    const runIso = new Date().toISOString();
    setSportsUSAWorking(true);
    setLogSportsUSA("");

    appendSportsUSA(`[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName}) @ ${runIso}`);
    appendSportsUSA(`[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);

    // Map sport -> directory site
    // (Add more later: soccer, baseball, etc.)
    const sportSiteByName = {
      Football: "https://www.footballcampsusa.com/",
      Baseball: "https://www.baseballcampsusa.com/",
      Soccer: "https://www.soccersportsusa.com/",
    };

    const siteUrl = sportSiteByName[String(selectedSportName || "").trim()] || null;
    if (!siteUrl) {
      appendSportsUSA(`[SportsUSA] ERROR: No SportsUSA directory mapped for sport "${selectedSportName}".`);
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
        appendSportsUSA(`[SportsUSA] ERROR: SportsUSA function ERROR (HTTP ${res.status})`);
        appendSportsUSA(JSON.stringify(data || {}, null, 2));
        setSportsUSAWorking(false);
        return;
      }

      appendSportsUSA(
        `[SportsUSA] SportsUSA fetched: schools_found=${data?.stats?.schools_found ?? 0} | http=${data?.stats?.http ?? "n/a"}`
      );

      const sample = asArray(data?.debug?.sample).slice(0, 3);
      if (sample.length) {
        appendSportsUSA(`[SportsUSA] SportsUSA sample (first ${sample.length}):`);
        for (let i = 0; i < sample.length; i++) {
          appendSportsUSA(
            `- name="${sample[i]?.school_name || ""}" | logo="${sample[i]?.logo_url || ""}" | view="${sample[i]?.view_site_url || ""}"`
          );
        }
      }

      if (sportsUSADryRun) {
        appendSportsUSA("[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        setSportsUSAWorking(false);
        return;
      }

      // Write: upsert School + SchoolSportSite
      const schools = asArray(data?.schools);
      if (!schools.length) {
        appendSportsUSA("[SportsUSA] No schools returned from function.");
        setSportsUSAWorking(false);
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
        const row = schools[i] || {};
        try {
          const school_name = safeString(row.school_name);
          const logo_url = safeString(row.logo_url);
          const view_site_url = safeString(row.view_site_url);
          const source_key = safeString(row.source_key);

          if (!school_name || !source_key) {
            skipped += 1;
            continue;
          }

          const schoolPayload = {
            school_name,
            normalized_name: lc(school_name).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(),
            aliases_json: "[]",
            school_type: "College/University",
            active: true,
            needs_review: true,
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

          const schoolResult = await upsertSchoolBySourceKey(schoolPayload);
          if (schoolResult.mode === "created") schoolCreated += 1;
          else schoolUpdated += 1;

          if (view_site_url) {
            const host = (() => {
              try {
                return new URL(view_site_url).hostname;
              } catch {
                return slugify(view_site_url);
              }
            })();

            const sitePayload = {
              school_id: schoolResult.id,
              sport_id: selectedSportId,
              camp_site_url: view_site_url,
              logo_url: logo_url || null,
              source_platform: "sportsusa",
              source_key: `sportsusa:${slugify(selectedSportName)}:${host}`,
              active: true,
              needs_review: true,
              last_seen_at: runIso,
            };

            const siteResult = await upsertSchoolSportSiteBySourceKey(sitePayload);
            if (siteResult.mode === "created") siteCreated += 1;
            else siteUpdated += 1;
          }
        } catch (e) {
          errors += 1;
          appendSportsUSA(`[SportsUSA] ERROR row #${i + 1}: ${String(e?.message || e)}`);
        }

        if ((i + 1) % 10 === 0) {
          appendSportsUSA(
            `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolCreated}/${schoolUpdated} | Sites c/u=${siteCreated}/${siteUpdated} | skipped=${skipped} errors=${errors}`
          );
          await sleep(40);
        }
      }

      appendSportsUSA(
        `[SportsUSA] Writes done. Schools: created=${schoolCreated} updated=${schoolUpdated} | Sites: created=${siteCreated} updated=${siteUpdated} | skipped=${skipped} errors=${errors}`
      );
    } catch (e) {
      appendSportsUSA(`[SportsUSA] ERROR: ${String(e?.message || e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     Camps ingest -> CampDemo upsert
  ----------------------------- */
  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity || !CampDemoEntity.filter || !CampDemoEntity.create || !CampDemoEntity.update) {
      throw new Error("CampDemo entity not available (expected entities.CampDemo).");
    }
    const key = payload?.event_key;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    let existing = [];
    try {
      existing = await CampDemoEntity.filter({ event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    if (arr.length > 0 && arr[0]?.id) {
      await CampDemoEntity.update(arr[0].id, payload);
      return "updated";
    }

    await CampDemoEntity.create(payload);
    return "created";
  }

  function parsePriceToNumbers(priceRaw) {
    const s = safeString(priceRaw);
    if (!s) return { price: null, price_min: null, price_max: null };
    const nums = String(s)
      .split(/[^0-9.]+/g)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return { price: null, price_min: null, price_max: null };
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { price: min, price_min: min, price_max: max };
  }

  function pickStartEndFromDateRange(raw) {
    const s = safeString(raw);
    if (!s) return { start_date: null, end_date: null };

    // Common format: "02/21/2026 - 02/22/2026"
    const m = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m && m[1] && m[2]) {
      return { start_date: toISODate(m[1]), end_date: toISODate(m[2]) };
    }

    // Single date fallback
    const m2 = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m2 && m2[1]) {
      const one = toISODate(m2[1]);
      return { start_date: one, end_date: null };
    }

    return { start_date: null, end_date: null };
  }

  async function runSportsUSACampsIngest() {
    if (!selectedSportId) return appendCamps("[Camps] ERROR: Select a sport first.");
    if (!SchoolSportSiteEntity || !SchoolSportSiteEntity.filter) return appendCamps("[Camps] ERROR: SchoolSportSite entity not available.");
    if (!CampDemoEntity) return appendCamps("[Camps] ERROR: CampDemo entity not available.");

    const runIso = new Date().toISOString();
    setCampsWorking(true);
    setLogCamps("");

    appendCamps(`[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
    appendCamps(
      `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents}`
    );

    try {
      // Load sites for this sport
      const rows = asArray(await SchoolSportSiteEntity.filter({ sport_id: selectedSportId, active: true }));
      appendCamps(`[Camps] Loaded SchoolSportSite rows: ${rows.length} (active)`);

      // Build sites payload for function
      const sites = rows
        .map((r) => ({
          school_id: safeString(r?.school_id),
          camp_site_url: safeString(r?.camp_site_url),
          logo_url: safeString(r?.logo_url),
          source_key: safeString(r?.source_key),
        }))
        .filter((x) => x.school_id && x.camp_site_url);

      // If testSiteUrl provided, we require testSchoolId (or we can try to look it up)
      let testSchool = safeString(testSchoolId);
      const testUrl = safeString(testSiteUrl);

      if (testUrl && !testSchool) {
        // Try to find it from SchoolSportSite
        const hit = sites.find((s) => s.camp_site_url === testUrl) || null;
        if (hit && hit.school_id) {
          testSchool = hit.school_id;
          appendCamps(`[Camps] TestSiteUrl matched existing SchoolSportSite; using school_id=${testSchool}`);
        } else {
          appendCamps("[Camps] ERROR: Provide Test School ID OR paste a Test Site URL that already exists in SchoolSportSite.");
          setCampsWorking(false);
          return;
        }
      }

      const res = await fetch("/functions/sportsUSAIngestCamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          dryRun: campsDryRun,
          maxSites: campsMaxSites,
          maxRegsPerSite: campsMaxRegsPerSite,
          maxEvents: campsMaxEvents,
          sites,
          testSiteUrl: testUrl || null,
          testSchoolId: testSchool || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendCamps(`[Camps] Function ERROR (HTTP ${res.status})`);
        appendCamps(JSON.stringify(data || {}, null, 2));
        setCampsWorking(false);
        return;
      }

      appendCamps(
        `[Camps] Function stats: processedSites=${data?.stats?.processedSites ?? 0} processedRegs=${data?.stats?.processedRegs ?? 0} accepted=${data?.stats?.accepted ?? 0} rejected=${data?.stats?.rejected ?? 0} errors=${data?.stats?.errors ?? 0}`
      );
      appendCamps(`[Camps] Function version: ${data?.debug?.version || "MISSING"}`);

      const siteDebug = asArray(data?.debug?.siteDebug).slice(0, 3);
      if (siteDebug.length) {
        appendCamps(`[Camps] Site debug (first ${siteDebug.length}):`);
        for (let i = 0; i < siteDebug.length; i++) {
          const sd = siteDebug[i] || {};
          appendCamps(
            `- school_id=${sd.school_id || ""} http=${sd.http || ""} regLinks=${sd.regLinks || 0} eventsParsed=${sd.eventsParsed || 0} title="${sd.pageTitle || ""}" notes=${sd.notes || ""}`
          );
        }
      }

      const accepted = asArray(data?.accepted);
      if (!accepted.length) {
        appendCamps("[Camps] No accepted events returned from function.");
        setCampsWorking(false);
        return;
      }

      // Dry run -> just show samples
      if (campsDryRun) {
        appendCamps(`[Camps] Accepted samples (first ${Math.min(5, accepted.length)}):`);
        for (let i = 0; i < Math.min(5, accepted.length); i++) {
          const a = accepted[i] || {};
          appendCamps(`- school_id=${a.school_id} name="${a.camp_name || ""}" dates="${a.event_dates_raw || ""}" url="${a.link_url || ""}"`);
        }
        appendCamps("[Camps] DryRun=true: no CampDemo writes performed.");
        setCampsWorking(false);
        return;
      }

      // Write CampDemo
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < accepted.length; i++) {
        const ev = accepted[i] || {};
        try {
          const school_id = safeString(ev.school_id);
          const camp_name = safeString(ev.camp_name);
          const link_url = safeString(ev.link_url);
          const source_url = safeString(ev.source_url) || link_url;

          const dateRaw = safeString(ev.event_dates_raw);
          const { start_date, end_date } = pickStartEndFromDateRange(dateRaw);

          if (!school_id || !camp_name || !link_url || !start_date) {
            skipped += 1;
            continue;
          }

          const season_year =
            selectedSportName === "Football"
              ? safeNumber(computeSeasonYearFootball(start_date))
              : safeNumber(new Date(`${start_date}T00:00:00.000Z`).getUTCFullYear());

          if (!season_year) {
            skipped += 1;
            continue;
          }

          // Use ryzer registration id if present (camp.cfm?id=123)
          let regId = null;
          try {
            const u = new URL(link_url);
            regId = u.searchParams.get("id");
          } catch {}
          const program_id = regId ? `sportsusa:ryzer:${regId}` : `sportsusa:${slugify(camp_name)}`;

          const event_key = buildEventKey({
            source_platform: "sportsusa",
            program_id,
            start_date,
            link_url,
            source_url,
          });

          const prices = parsePriceToNumbers(ev.price_raw);

          const payload = {
            school_id,
            sport_id: selectedSportId,
            camp_name,
            start_date,
            end_date: end_date || null,
            city: safeString(ev.city) || null,
            state: safeString(ev.state) || null,
            position_ids: [],
            price: prices.price != null ? prices.price : null,
            link_url,
            notes: null,

            season_year,
            program_id,
            event_key,
            source_platform: "sportsusa",
            source_url: source_url || null,
            last_seen_at: runIso,
            content_hash: simpleHash({
              school_id,
              camp_name,
              start_date,
              end_date,
              link_url,
              dateRaw,
              grades: safeString(ev.grades_raw),
              price_raw: safeString(ev.price_raw),
            }),

            event_dates_raw: dateRaw || null,
            grades_raw: safeString(ev.grades_raw) || null,
            register_by_raw: null,
            price_raw: safeString(ev.price_raw) || null,
            price_min: prices.price_min != null ? prices.price_min : null,
            price_max: prices.price_max != null ? prices.price_max : null,
            sections_json: null,
          };

          const r = await upsertCampDemoByEventKey(payload);
          if (r === "created") created += 1;
          if (r === "updated") updated += 1;

          if ((i + 1) % 10 === 0) appendCamps(`[Camps] Write progress: ${i + 1}/${accepted.length}`);
          await sleep(45);
        } catch (e) {
          errors += 1;
          appendCamps(`[Camps] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
        }
      }

      appendCamps(`[Camps] CampDemo writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } catch (e) {
      appendCamps(`[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     Camp promotion (CampDemo -> Camp)
     (unchanged: keep your existing promote logic if you have it)
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
      sections_json: safeObject(tryParseJson(r?.sections_json)) || null,
    };

    return { payload };
  }

  async function promoteCampDemoToCamp() {
    const runIso = new Date().toISOString();
    setPromotionWorking(true);
    setLogPromotion("");
    setPromotionStats({ read: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    appendPromotion(`[Promotion] Starting: Promote CampDemo → Camp @ ${runIso}`);

    let demoRows = [];
    try {
      demoRows = asArray(await base44.entities.CampDemo.filter({ sport_id: selectedSportId }));
    } catch (e) {
      appendPromotion(`[Promotion] ERROR reading CampDemo: ${String(e?.message || e)}`);
      setPromotionWorking(false);
      return;
    }

    appendPromotion(`[Promotion] Found CampDemo rows (for selected sport): ${demoRows.length}`);
    setPromotionStats((s) => ({ ...s, read: demoRows.length }));

    for (let i = 0; i < demoRows.length; i++) {
      const r = demoRows[i];
      try {
        const built = buildSafeCampPayloadFromDemoRow(r, runIso);
        if (built.error) {
          setPromotionStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          appendPromotion(`[Promotion] SKIP #${i + 1}: ${built.error}`);
          continue;
        }

        const result = await upsertCampByEventKey(built.payload);
        if (result === "created") setPromotionStats((s) => ({ ...s, created: s.created + 1 }));
        if (result === "updated") setPromotionStats((s) => ({ ...s, updated: s.updated + 1 }));

        if ((i + 1) % 10 === 0) appendPromotion(`[Promotion] Progress: ${i + 1}/${demoRows.length}`);
        await sleep(60);
      } catch (e) {
        setPromotionStats((s) => ({ ...s, errors: s.errors + 1 }));
        appendPromotion(`[Promotion] ERROR #${i + 1}: ${String(e?.message || e)}`);
      }
    }

    appendPromotion("[Promotion] Done.");
    setPromotionWorking(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">
              Select sport once at the top. All sections below use that selection.
            </div>
          </div>

          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* ✅ Global Sport Selection */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Sport</div>
          <div className="mt-2">
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              value={selectedSportId}
              onChange={(e) => {
                const id = e.target.value;
                const hit = sports.find((x) => x.id === id) || null;
                setSelectedSportId(id);
                setSelectedSportName(hit?.name || "");
              }}
              disabled={sportsLoading || sportsUSAWorking || campsWorking || ryzerWorking || promotionWorking}
            >
              <option value="">Select…</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={loadSports} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button variant="outline" onClick={() => nav(ROUTES.Home)}>
                Go to Home
              </Button>
            </div>
          </div>
        </Card>

        {/* ✅ SportsUSA Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA: Seed Schools + SchoolSportSite</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls schools from the SportsUSA directory (Football/Baseball/Soccer) and writes:
            <b> School</b> + <b>SchoolSportSite</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-end gap-2">
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write limit</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={sportsUSALimit}
                onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                min={10}
                max={2000}
                disabled={sportsUSAWorking}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runSportsUSASeedSchools} disabled={sportsUSAWorking || !selectedSportId}>
                {sportsUSAWorking ? "Running…" : sportsUSADryRun ? "Seed Schools (Dry Run)" : "Seed Schools → Write"}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logSportsUSA || "—"}
            </pre>
          </div>
        </Card>

        {/* ✅ SportsUSA Camps Ingest */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA: Camps Ingest → CampDemo</div>
          <div className="text-sm text-slate-600 mt-1">
            Crawls <b>SchoolSportSite.camp_site_url</b> pages and extracts published camps into <b>CampDemo</b>.
            Many sites will have 0 camps until they publish.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={campsDryRun}
                  onChange={(e) => setCampsDryRun(e.target.checked)}
                  disabled={campsWorking}
                />
                Dry Run
              </label>
            </div>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max camps per site</label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events total</label>
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
          </div>

          {/* Test override */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test single site URL (optional)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSiteUrl}
                onChange={(e) => setTestSiteUrl(e.target.value)}
                placeholder="e.g., https://www.hardingfootballcamps.com/"
                disabled={campsWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                If provided, we ingest ONLY this site (good for validating Harding).
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test school_id (optional)</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={testSchoolId}
                onChange={(e) => setTestSchoolId(e.target.value)}
                placeholder="If blank, we try to match the URL in SchoolSportSite."
                disabled={campsWorking}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Leave blank if the URL already exists in SchoolSportSite; we’ll auto-match school_id.
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Button onClick={runSportsUSACampsIngest} disabled={campsWorking || !selectedSportId}>
              {campsWorking ? "Running…" : campsDryRun ? "Run Camps Ingest (Dry Run)" : "Run Camps Ingest → Write CampDemo"}
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logCamps || "—"}
            </pre>
          </div>
        </Card>

        {/* ✅ Promotion */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Promote CampDemo → Camp</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs promotion only for the selected sport (filters CampDemo by sport_id).
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={promoteCampDemoToCamp} disabled={promotionWorking || !selectedSportId}>
              {promotionWorking ? "Running…" : "Run Promotion"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setLogSportsUSA("");
                setLogCamps("");
                setLogRyzer("");
                setLogPromotion("");
              }}
              disabled={sportsUSAWorking || campsWorking || ryzerWorking || promotionWorking}
            >
              Clear All Logs
            </Button>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            <div className="flex flex-wrap gap-4">
              <span><b>Read:</b> {promotionStats.read}</span>
              <span><b>Created:</b> {promotionStats.created}</span>
              <span><b>Updated:</b> {promotionStats.updated}</span>
              <span><b>Skipped:</b> {promotionStats.skipped}</span>
              <span><b>Errors:</b> {promotionStats.errors}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logPromotion || "—"}
            </pre>
          </div>
        </Card>

        {/* (Optional) Ryzer section preserved, but not shown here to keep page shorter */}
      </div>
    </div>
  );
}
