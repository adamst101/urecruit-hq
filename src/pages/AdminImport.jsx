// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Small helpers (safe + boring)
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
  if (x == null) return null;
  if (typeof x === "string" && !x.trim()) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ----------------------------
   Base44 entity query helper
----------------------------- */
async function entityList(Entity, whereObj) {
  if (!Entity) throw new Error("Entity is null/undefined.");
  const where = whereObj || {};

  if (typeof Entity.filter === "function") return asArray(await Entity.filter(where));

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

  if (typeof Entity.all === "function") return asArray(await Entity.all());

  throw new Error("Entity has no supported list method (filter/list/findMany/all).");
}

/* ----------------------------
   Routes (hardcoded)
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
  AdminCamps: "/AdminCamps",
};

/* ----------------------------
   Crawl-state normalization
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
    active: typeof (r && r.active) === "boolean" ? r.active : !!(r && r.active),
    crawl_status: statusOf(r),
    last_crawled_at: safeString(r && r.last_crawled_at),
    next_crawl_at: safeString(r && r.next_crawl_at),
    crawl_error: safeString(r && r.crawl_error),
    last_crawl_run_id: safeString(r && r.last_crawl_run_id),
    last_seen_at: safeString(r && r.last_seen_at),
    raw: r,
  };
}

/* ----------------------------
   Camp quality rules
----------------------------- */
function looksLikeBadCampName(name) {
  const t = lc(name || "");
  if (!t) return true;
  if (t === "register") return true;
  if (t === "register now") return true;
  if (t === "view details" || t === "details") return true;
  if (t === "camp") return true;

  // names that are just money like "$475.00" or "475.00"
  if (/^\$?\s*\d{1,6}(\.\d{2})?\s*$/.test(String(name || "").trim())) return true;

  // common junk lines
  if (t.includes("as of fall")) return true;

  return false;
}
function isMissingPrice(row) {
  const p = safeNumber(row && (row.price ?? row.price_max ?? row.price_min));
  return p == null || p === 0;
}

/* ----------------------------
   FULL PAGE
----------------------------- */
export default function AdminImport() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const SchoolSportSiteEntity = base44?.entities?.SchoolSportSite || base44?.entities?.SchoolSportSites || null;
  const CampDemoEntity = base44?.entities?.CampDemo || null;

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
  const [logCamps, setLogCamps] = useState("");
  const [logCounters, setLogCounters] = useState("");
  const [logQuality, setLogQuality] = useState("");

  function appendLog(which, line) {
    const add = (prev) => (prev ? prev + "\n" + line : line);
    if (which === "camps") setLogCamps(add);
    if (which === "counters") setLogCounters(add);
    if (which === "quality") setLogQuality(add);
  }

  /* ----------------------------
     Working flags
  ----------------------------- */
  const [campsWorking, setCampsWorking] = useState(false);
  const [countersWorking, setCountersWorking] = useState(false);
  const [qualityWorking, setQualityWorking] = useState(false);
  const [resetWorking, setResetWorking] = useState(false);

  /* ----------------------------
     Controls (Camps ingest)
  ----------------------------- */
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(25);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(10);
  const [campsMaxEvents, setCampsMaxEvents] = useState(300);
  const [fastMode, setFastMode] = useState(false);

  // batch runner
  const [batchRunnerOn, setBatchRunnerOn] = useState(true);
  const [maxBatches, setMaxBatches] = useState(10);
  const [batchDelayMs, setBatchDelayMs] = useState(400);
  const [writeDelayMs, setWriteDelayMs] = useState(100);

  // Rerun mode (site selection by crawl-state)
  const RERUN_MODES = [
    { id: "due", label: "Due only (normal)" },
    { id: "all", label: "Force recrawl ALL active" },
    { id: "error", label: "Recrawl ERROR only" },
    { id: "no_events", label: "Recrawl NO_EVENTS only" },
    { id: "ok", label: "Recrawl OK only" },
    { id: "ready", label: "Recrawl READY only" },
  ];
  const [rerunMode, setRerunMode] = useState("due");

  // ✅ Quality mode (what YOU asked for; matches the dropdown in the screenshot)
  const QUALITY_MODES = [
    { id: "none", label: "No quality filter (use rerun mode only)" },
    { id: "bad_name", label: 'Only schools with camp_name="Register" (bad name)' },
    { id: "missing_price", label: "Only schools with missing price" },
    { id: "no_camps", label: "Only schools with NO camps" },
    { id: "any_cleanup", label: "Schools needing cleanup (bad name OR missing price OR no camps)" },
  ];
  const [qualityMode, setQualityMode] = useState("any_cleanup");

  /* ----------------------------
     Crawl Counters (site state)
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
      appendLog("counters", `[Counters] Refreshed @ ${nowIso} | Sites: active=${active} done=${done} (${pct}%) ready=${ready} ok=${ok} no_events=${no_events} error=${error} dueNow=${dueNow}`);
    } catch (e) {
      appendLog("counters", `[Counters] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCountersWorking(false);
    }
  }

  /* ----------------------------
     ✅ Quality Counters (data quality)
     These are the STOP signals you asked for.
  ----------------------------- */
  const [qualityCounters, setQualityCounters] = useState({
    registerNamesRemaining: 0,
    missingPriceRemaining: 0,
    noCampsRemaining: 0,
    improvedThisRun: 0, // only from last run (best-effort)
    schoolsNeedingBadNameFix: 0,
    schoolsNeedingPriceFix: 0,
    schoolsNeedingAnyCleanup: 0,
  });

  // we keep last-run improved count in memory (not persisted)
  const [lastImproved, setLastImproved] = useState(0);

  async function refreshQualityCounters() {
    const nowIso = new Date().toISOString();
    setQualityWorking(true);

    try {
      if (!selectedSportId) {
        setQualityCounters({
          registerNamesRemaining: 0,
          missingPriceRemaining: 0,
          noCampsRemaining: 0,
          improvedThisRun: lastImproved || 0,
          schoolsNeedingBadNameFix: 0,
          schoolsNeedingPriceFix: 0,
          schoolsNeedingAnyCleanup: 0,
        });
        appendLog("quality", `[Quality] Select a sport first.`);
        return;
      }
      if (!CampDemoEntity || !SchoolSportSiteEntity) {
        appendLog("quality", `[Quality] ERROR: CampDemo or SchoolSportSite entity missing.`);
        return;
      }

      // All active sites for sport (defines “schools universe”)
      const siteRows = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const sites = siteRows.map(normalizeSiteRow);

      // All CampDemo rows for sport
      const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });

      // Map school_id -> demo rows
      const bySchool = new Map();
      for (const r of demoRows) {
        const sid = safeString(r?.school_id);
        if (!sid) continue;
        if (!bySchool.has(sid)) bySchool.set(sid, []);
        bySchool.get(sid).push(r);
      }

      let registerNamesRemaining = 0;
      let missingPriceRemaining = 0;

      // per-school flags
      let schoolsNeedingBadNameFix = 0;
      let schoolsNeedingPriceFix = 0;
      let schoolsNeedingAnyCleanup = 0;
      let noCampsRemaining = 0;

      for (const s of sites) {
        const sid = s.school_id;
        const rows = sid ? (bySchool.get(sid) || []) : [];

        if (!rows.length) {
          noCampsRemaining += 1;
          // If a school has no camps, it counts as “needs cleanup” only for the any_cleanup/no_camps target
          schoolsNeedingAnyCleanup += 1;
          continue;
        }

        let hasBadName = false;
        let hasMissingPrice = false;

        for (const r of rows) {
          if (looksLikeBadCampName(r?.camp_name)) {
            registerNamesRemaining += 1;
            hasBadName = true;
          }
          if (isMissingPrice(r)) {
            missingPriceRemaining += 1;
            hasMissingPrice = true;
          }
        }

        if (hasBadName) schoolsNeedingBadNameFix += 1;
        if (hasMissingPrice) schoolsNeedingPriceFix += 1;
        if (hasBadName || hasMissingPrice) schoolsNeedingAnyCleanup += 1;
      }

      setQualityCounters({
        registerNamesRemaining,
        missingPriceRemaining,
        noCampsRemaining,
        improvedThisRun: lastImproved || 0,
        schoolsNeedingBadNameFix,
        schoolsNeedingPriceFix,
        schoolsNeedingAnyCleanup,
      });

      appendLog(
        "quality",
        `[Quality] Refreshed @ ${nowIso} | RegisterNamesRemaining=${registerNamesRemaining} | MissingPriceRemaining=${missingPriceRemaining} | NoCampsRemaining=${noCampsRemaining} | Schools(badName)=${schoolsNeedingBadNameFix} | Schools(price)=${schoolsNeedingPriceFix} | Schools(anyCleanup)=${schoolsNeedingAnyCleanup}`
      );
    } catch (e) {
      appendLog("quality", `[Quality] ERROR: ${String(e?.message || e)}`);
    } finally {
      setQualityWorking(false);
    }
  }

  /* ----------------------------
     Load Sports (selector)
  ----------------------------- */
  async function loadSports() {
    setSportsLoading(true);
    try {
      if (!SportEntity) throw new Error("Sport entity not available (base44.entities.Sport missing).");
      const rows = await entityList(SportEntity, {});
      const normalized = asArray(rows)
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
          name: safeString(r?.sport_name || r?.name || r?.sportName) || "",
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
    } catch (e) {
      setSports([]);
      setSelectedSportId("");
      setSelectedSportName("");
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

  // refresh counters when sport changes
  useEffect(() => {
    if (!selectedSportId) return;
    refreshCrawlCounters();
    refreshQualityCounters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  /* ----------------------------
     Reset crawl state (READY for all)
  ----------------------------- */
  async function resetCrawlStateForSport() {
    const runIso = new Date().toISOString();
    setResetWorking(true);
    appendLog("camps", `[Camps] Reset crawl-state requested @ ${runIso}`);

    try {
      if (!selectedSportId) return appendLog("camps", "[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity?.update) return appendLog("camps", "[Camps] ERROR: SchoolSportSite update not available.");

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
     Rerun + Quality filtering (site selection)
  ----------------------------- */
  function pickSitesByRerunMode(sites) {
    const arr = asArray(sites);
    if (rerunMode === "all") return arr;
    if (rerunMode === "error") return arr.filter((s) => statusOf(s) === "error");
    if (rerunMode === "no_events") return arr.filter((s) => statusOf(s) === "no_events");
    if (rerunMode === "ok") return arr.filter((s) => statusOf(s) === "ok");
    if (rerunMode === "ready") return arr.filter((s) => statusOf(s) === "ready");
    return arr.filter((s) => isDueNow(s)); // due
  }

  async function applyQualityFilterToSites(sites) {
    // IMPORTANT: quality filtering depends on CampDemo (DB state).
    // If you only ran DryRun historically, CampDemo may not reflect reality.
    // That’s expected.

    if (!CampDemoEntity) return sites;

    if (qualityMode === "none") return sites;

    const demoRows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
    const bySchool = new Map();
    for (const r of demoRows) {
      const sid = safeString(r?.school_id);
      if (!sid) continue;
      if (!bySchool.has(sid)) bySchool.set(sid, []);
      bySchool.get(sid).push(r);
    }

    function schoolHasBadName(sid) {
      const rows = bySchool.get(sid) || [];
      return rows.some((r) => looksLikeBadCampName(r?.camp_name));
    }
    function schoolHasMissingPrice(sid) {
      const rows = bySchool.get(sid) || [];
      return rows.some((r) => isMissingPrice(r));
    }
    function schoolHasNoCamps(sid) {
      const rows = bySchool.get(sid) || [];
      return !rows.length;
    }

    const out = [];
    for (const s of sites) {
      const sid = s.school_id;
      if (!sid) continue;

      const badName = schoolHasBadName(sid);
      const missingPrice = schoolHasMissingPrice(sid);
      const noCamps = schoolHasNoCamps(sid);

      if (qualityMode === "bad_name" && badName) out.push(s);
      else if (qualityMode === "missing_price" && missingPrice) out.push(s);
      else if (qualityMode === "no_camps" && noCamps) out.push(s);
      else if (qualityMode === "any_cleanup" && (badName || missingPrice || noCamps)) out.push(s);
    }
    return out;
  }

  /* ----------------------------
     CampDemo upsert with retry (rate limit / network)
  ----------------------------- */
  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity?.create || !CampDemoEntity?.update) throw new Error("CampDemo entity not available.");

    const key = payload?.event_key ? String(payload.event_key) : null;
    if (!key) throw new Error("Missing event_key for CampDemo upsert");

    // find existing
    let existing = [];
    try {
      existing = await entityList(CampDemoEntity, { event_key: key });
    } catch {
      existing = [];
    }

    const arr = asArray(existing);
    const doWrite = async () => {
      if (arr.length && arr[0]?.id) {
        await CampDemoEntity.update(String(arr[0].id), payload);
        return "updated";
      }
      await CampDemoEntity.create(payload);
      return "created";
    };

    // retry loop for rate limits / transient network
    const maxAttempts = 5;
    let attempt = 0;
    let lastErr = null;

    while (attempt < maxAttempts) {
      try {
        return await doWrite();
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e);

        const isRate = msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("429");
        const isNet = msg.toLowerCase().includes("network");

        if (!isRate && !isNet) throw e;

        // backoff
        const backoff = Math.min(1500, 200 + attempt * 250);
        await sleep(backoff);
        attempt += 1;
      }
    }

    throw lastErr || new Error("Write failed after retries");
  }

  /* ----------------------------
     Main runner (batch / single click)
  ----------------------------- */
  async function runSportsUSACampsIngest() {
    const runIso = new Date().toISOString();
    const runId = `run_${runIso.replace(/[:.]/g, "").slice(0, 15)}`;
    setCampsWorking(true);
    setLogCamps("");
    setLastImproved(0);

    appendLog("camps", `[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName || "?"}) @ ${runIso}`);
    appendLog("camps", `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents} | fastMode=${fastMode ? "true" : "false"}`);
    appendLog("camps", `[Camps] QualityMode=${qualityMode} | RerunMode=${rerunMode} | BatchRunner=${batchRunnerOn ? "ON" : "OFF"} maxBatches=${maxBatches}`);

    try {
      if (!selectedSportId) return appendLog("camps", "[Camps] ERROR: Select a sport first.");
      if (!SchoolSportSiteEntity) return appendLog("camps", "[Camps] ERROR: SchoolSportSite entity not available.");
      if (!CampDemoEntity) return appendLog("camps", "[Camps] ERROR: CampDemo entity not available.");

      const siteRowsRaw = await entityList(SchoolSportSiteEntity, { sport_id: selectedSportId, active: true });
      const siteRows = siteRowsRaw.map(normalizeSiteRow);
      appendLog("camps", `[Camps] Loaded SchoolSportSite rows: ${siteRows.length} (active)`);

      const rerunFiltered = pickSitesByRerunMode(siteRows);
      appendLog("camps", `[Camps] Rerun filtered sites: ${rerunFiltered.length}`);

      const qualityFiltered = await applyQualityFilterToSites(rerunFiltered);
      appendLog("camps", `[Camps] Quality filtered sites: ${qualityFiltered.length}`);

      if (!qualityFiltered.length) {
        appendLog("camps", `[Camps] Nothing to do for this selection. (Try different rerunMode / qualityMode.)`);
        await refreshCrawlCounters();
        await refreshQualityCounters();
        return;
      }

      const maxSitesPerBatch = Math.max(1, Number(campsMaxSites || 25));
      const maxB = batchRunnerOn ? Math.max(1, Number(maxBatches || 1)) : 1;

      let cursor = 0;
      let totals = { created: 0, updated: 0, skipped: 0, errors: 0, improved: 0 };

      for (let b = 1; b <= maxB; b++) {
        const batch = qualityFiltered.slice(cursor, cursor + maxSitesPerBatch);
        if (!batch.length) break;

        const remainingAfterThis = Math.max(0, qualityFiltered.length - (cursor + batch.length));
        appendLog("camps", ``);
        appendLog("camps", `[Camps] ---- Batch ${b} ----`);
        appendLog("camps", `[Camps] Batch size=${batch.length} | remainingAfterThis=${remainingAfterThis}`);

        // call backend function
        appendLog("camps", `[Camps] Calling /functions/sportsUSAIngestCamps (payload: sites=${batch.length}, testSiteUrl=no)`);

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
            sites: batch.map((r) => ({
              id: r.id,
              school_id: r.school_id,
              sport_id: r.sport_id,
              camp_site_url: r.camp_site_url,
            })),
          }),
        });

        let data = null;
        let rawText = null;
        try {
          data = await res.json();
        } catch {
          rawText = await res.text().catch(() => null);
        }

        if (!res.ok || !data) {
          appendLog("camps", `[Camps] Function ERROR (HTTP ${res.status})`);
          if (rawText) appendLog("camps", rawText.slice(0, 500));
          totals.errors += 1;
          cursor += batch.length;
          if (batchRunnerOn) await sleep(batchDelayMs);
          continue;
        }

        appendLog("camps", `[Camps] Function version: ${data?.version || "MISSING"}`);
        appendLog(
          "camps",
          `[Camps] Function stats: processedSites=${data?.stats?.processedSites || 0} processedRegs=${data?.stats?.processedRegs || 0} accepted=${data?.stats?.accepted || 0} rejected=${data?.stats?.rejected || 0} errors=${data?.stats?.errors || 0}`
        );

        if (data?.debug?.kpi) {
          const k = data.debug.kpi;
          appendLog("camps", `[Camps] Date KPI: listing=${k.datesParsedFromListing || 0} detail=${k.datesParsedFromDetail || 0} missing=${k.datesMissing || 0}`);
          appendLog("camps", `[Camps] Name KPI: listing=${k.namesFromListing || 0} detail=${k.namesFromDetail || 0} missing=${k.namesMissing || 0} qualityReject=${k.namesRejectedByQualityGate || 0}`);
          appendLog("camps", `[Camps] Price KPI: detail=${k.pricesFromDetail || 0} missing=${k.pricesMissing || 0}`);
        }

        const accepted = asArray(data?.accepted || []);
        appendLog("camps", `[Camps] Accepted events returned: ${accepted.length}`);

        if (accepted.length) {
          appendLog("camps", `[Camps] Sample (first 5):`);
          for (let i = 0; i < Math.min(5, accepted.length); i++) {
            const a = accepted[i] || {};
            appendLog("camps", `- camp="${a.camp_name || ""}" start=${a.start_date || "n/a"} price=${a.price != null ? a.price : "n/a"} url=${a.link_url || ""}`);
          }
        }

        // crawl-state update
        if (campsDryRun) {
          appendLog("camps", `[Camps] DryRun=true: crawl-state update skipped.`);
        } else if (SchoolSportSiteEntity?.update) {
          const outcome = accepted.length ? "ok" : "no_events";
          let updated = 0;
          let errors = 0;

          const patch = {
            crawl_status: outcome,
            crawl_error: null,
            last_crawled_at: runIso,
            // weekly refresh schedule (7 days)
            next_crawl_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            last_crawl_run_id: runId,
            last_seen_at: runIso,
          };

          for (const s of batch) {
            try {
              await SchoolSportSiteEntity.update(String(s.id), patch);
              updated += 1;
            } catch {
              errors += 1;
            }
            await sleep(10);
          }
          appendLog("camps", `[Camps] Updated crawl-state for batch sites: ${updated} (${outcome}) errors=${errors}`);
        }

        // CampDemo writes
        if (campsDryRun) {
          appendLog("camps", `[Camps] DryRun=true: no CampDemo writes performed.`);
          cursor += batch.length;
          if (batchRunnerOn) await sleep(batchDelayMs);
          continue;
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        let improved = 0;

        for (let i = 0; i < accepted.length; i++) {
          const a = accepted[i] || {};

          const school_id = safeString(a.school_id);
          const sport_id = selectedSportId;
          const camp_name = safeString(a.camp_name);
          const start_date = safeString(a.start_date);
          const end_date = safeString(a.end_date);
          const link_url = safeString(a.link_url || a.registration_url || a.source_url);
          const event_key = safeString(a.event_key);

          if (!school_id || !sport_id || !camp_name || !start_date || !event_key) {
            skipped += 1;
            continue;
          }

          const beforeHash = safeString(a.content_hash) || null;

          const payload = {
            school_id,
            sport_id,
            camp_name,
            start_date,
            end_date: end_date || null,
            city: safeString(a.city) || null,
            state: safeString(a.state) || null,
            position_ids: asArray(a.position_ids || []),
            price: safeNumber(a.price ?? a.price_max ?? a.price_min),
            link_url: link_url || null,
            notes: safeString(a.notes) || null,
            season_year: safeNumber(a.season_year) || null,
            program_id: safeString(a.program_id) || null,
            event_key,
            source_platform: safeString(a.source_platform) || "sportsusa",
            source_url: safeString(a.source_url) || link_url || null,
            last_seen_at: runIso,
            content_hash: beforeHash || null,
            event_dates_raw: safeString(a.event_dates_raw) || null,
            grades_raw: safeString(a.grades_raw) || null,
            register_by_raw: safeString(a.register_by_raw) || null,
            price_raw: safeString(a.price_raw) || null,
            price_min: safeNumber(a.price_min),
            price_max: safeNumber(a.price_max),
            sections_json: a.sections_json ?? null,
          };

          try {
            const r = await upsertCampDemoByEventKey(payload);
            if (r === "created") created += 1;
            if (r === "updated") updated += 1;

            // best-effort: count improvements against obvious issues
            const fixedName = looksLikeBadCampName(a.camp_name) && !looksLikeBadCampName(payload.camp_name);
            const fixedPrice = isMissingPrice(a) && !isMissingPrice(payload);
            if (fixedName || fixedPrice) improved += 1;
          } catch (e) {
            errors += 1;
            appendLog("camps", `[Camps] WRITE ERROR #${i + 1}: ${String(e?.message || e)}`);
          }

          if ((i + 1) % 25 === 0) appendLog("camps", `[Camps] Write progress: ${i + 1}/${accepted.length}`);
          await sleep(Math.max(0, Number(writeDelayMs || 0)));
        }

        appendLog("camps", `[Camps] Batch ${b} writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors} improved=${improved}`);

        totals.created += created;
        totals.updated += updated;
        totals.skipped += skipped;
        totals.errors += errors;
        totals.improved += improved;

        cursor += batch.length;
        if (batchRunnerOn) await sleep(batchDelayMs);
      }

      setLastImproved(totals.improved);
      appendLog("camps", ``);
      appendLog("camps", `[Camps] DONE (this click). totals: created=${totals.created} updated=${totals.updated} skipped=${totals.skipped} errors=${totals.errors} improved=${totals.improved}`);
      appendLog("camps", `[Camps] Stop rule: When your target Remaining counter stops dropping for 2 clicks, you’re done for that mode.`);

      await refreshCrawlCounters();
      await refreshQualityCounters();
    } catch (e) {
      appendLog("camps", `[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  /* ----------------------------
     UI
  ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">Admin Import</div>
            <div className="text-sm text-slate-600">SportsUSA camps ingestion + cleanup targeting.</div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => nav(ROUTES.AdminCamps)}>
              Admin Camps Table
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
              Back to Workspace
            </Button>
          </div>
        </div>

        {/* Sport selector */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">1) Select Sport</div>
          <div className="text-sm text-slate-600 mt-1">Everything below is scoped to the selected sport.</div>

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
              <div className="mt-1 text-[11px] text-slate-500">{sportsLoading ? "Loading sports…" : selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport"}</div>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={loadSports} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
              <Button variant="outline" onClick={refreshCrawlCounters} disabled={countersWorking || !selectedSportId}>
                {countersWorking ? "Refreshing…" : "Refresh Crawl"}
              </Button>
              <Button variant="outline" onClick={refreshQualityCounters} disabled={qualityWorking || !selectedSportId}>
                {qualityWorking ? "Refreshing…" : "Refresh Quality"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Crawl counters */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">Crawl Counters (site state)</div>
          <div className="text-sm text-slate-600 mt-1">These show crawl state. They do not tell you if Register/prices got fixed.</div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-7 gap-2 text-sm">
            {[
              ["Active", siteCounters.active],
              ["Done", siteCounters.done],
              ["Due Now", siteCounters.dueNow],
              ["Ready", siteCounters.ready],
              ["OK", siteCounters.ok],
              ["No Events", siteCounters.no_events],
              ["Error", siteCounters.error],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={resetCrawlStateForSport} disabled={!selectedSportId || resetWorking || campsWorking}>
              {resetWorking ? "Resetting…" : "Reset crawl state (READY for all)"}
            </Button>
            <Button variant="outline" onClick={() => setLogCounters("")} disabled={countersWorking}>
              Clear Crawl Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Crawl Counters Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-48">{logCounters || "—"}</pre>
          </div>
        </Card>

        {/* Quality counters */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">Quality Counters (your STOP signals)</div>
          <div className="text-sm text-slate-600 mt-1">These should trend down as cleanup runs succeed. Stop when they stop dropping.</div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[
              ["Register names remaining", qualityCounters.registerNamesRemaining],
              ["Missing price remaining", qualityCounters.missingPriceRemaining],
              ["Schools with no camps", qualityCounters.noCampsRemaining],
              ["Improved this run", qualityCounters.improvedThisRun],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            {[
              ["Schools needing Register fix", qualityCounters.schoolsNeedingBadNameFix],
              ["Schools needing price fix", qualityCounters.schoolsNeedingPriceFix],
              ["Schools needing any cleanup", qualityCounters.schoolsNeedingAnyCleanup],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white border border-slate-200 p-2">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setLogQuality("")} disabled={qualityWorking}>
              Clear Quality Log
            </Button>
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Quality Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-48">{logQuality || "—"}</pre>
          </div>
        </Card>

        {/* Ingest */}
        <Card className="p-4">
          <div className="font-semibold text-slate-900">2) Ingest Camps (SchoolSportSite → CampDemo)</div>
          <div className="text-sm text-slate-600 mt-1">Batches through sites based on your targeting so you’re not blindly rerunning.</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quality Mode (cleanup targeting)</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={qualityMode} onChange={(e) => setQualityMode(e.target.value)} disabled={campsWorking}>
                {QUALITY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">This decides which schools to include. Use it as your “smart batch” selector.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rerun mode (crawl-state)</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={rerunMode} onChange={(e) => setRerunMode(e.target.value)} disabled={campsWorking}>
                {RERUN_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">For cleanup most people run: <b>Force recrawl ALL</b> + quality targeting.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max sites/batch</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxSites} onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))} min={1} max={500} disabled={campsWorking} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max regs/site</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxRegsPerSite} onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))} min={1} max={50} disabled={campsWorking} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max events/call</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={campsMaxEvents} onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))} min={10} max={5000} disabled={campsWorking} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Write delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={writeDelayMs} onChange={(e) => setWriteDelayMs(Number(e.target.value || 0))} min={0} max={2000} disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">If you see rate limits, set 100–150ms.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch delay (ms)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={batchDelayMs} onChange={(e) => setBatchDelayMs(Number(e.target.value || 0))} min={0} max={10000} disabled={campsWorking} />
              <div className="mt-1 text-[11px] text-slate-500">Pause between batches.</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-6 items-center">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={campsDryRun} onChange={(e) => setCampsDryRun(e.target.checked)} disabled={campsWorking} />
              Dry Run
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} disabled={campsWorking} />
              fastMode (fewer detail fetches; faster but can miss deep fields)
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={batchRunnerOn} onChange={(e) => setBatchRunnerOn(e.target.checked)} disabled={campsWorking} />
              Run multiple batches per click
            </label>

            <div className="flex items-center gap-2">
              <div className="text-sm text-slate-700">Max batches per click</div>
              <input className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" value={maxBatches} onChange={(e) => setMaxBatches(Number(e.target.value || 0))} min={1} max={100} disabled={campsWorking || !batchRunnerOn} />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking}>
              {campsWorking ? "Running…" : campsDryRun ? "Run Camps Ingest (Dry Run)" : "Run Camps Ingest → Write CampDemo"}
            </Button>
            <Button variant="outline" onClick={() => setLogCamps("")} disabled={campsWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Camps Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-[480px]">{logCamps || "—"}</pre>
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={campsWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
