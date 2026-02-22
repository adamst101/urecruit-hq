// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";
const NCAA_CURSOR_KEY_PREFIX = "adminops_ncaa_cursor_v2:";
const ADMINOPS_SESSION_STATE_KEY = "adminops_session_state_v3";

// Dedupe (by org+seasonYear) cursor (group index)
const DEDUPE_CURSOR_KEY_PREFIX = "adminops_dedupe_cursor_v1:";

const ROUTES = {
  Workspace: "/Workspace",
  Discover: "/Discover",
  Profile: "/Profile",
  AdminSeedSchoolsMaster: "/AdminSeedSchoolsMaster",
  AdminImport: "/AdminImport",
  AdminFactoryReset: "/AdminFactoryReset",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
function safeStr(x) {
  return x == null ? "" : String(x);
}
function lc(x) {
  return safeStr(x).toLowerCase().trim();
}
function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}
function truncate(x, n = 1800) {
  const t = typeof x === "string" ? x : safeJson(x);
  return t.length > n ? t.slice(0, n) + "\n...<truncated>..." : t;
}
function unwrapInvokeResponse(resp) {
  return resp?.data ?? resp ?? null;
}
function loadSessionState() {
  try {
    const raw = sessionStorage.getItem(ADMINOPS_SESSION_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSessionState(state) {
  try {
    sessionStorage.setItem(ADMINOPS_SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
function pickEntityFromSDK(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}
function isRetryableInvokeError(e) {
  const msg = lc(e?.message || e);
  if (msg.includes("status code 502")) return true;
  if (msg.includes("status code 503")) return true;
  if (msg.includes("status code 504")) return true;
  if (msg.includes("status code 429")) return true;
  if (msg.includes("rate limit")) return true;
  return false;
}
async function invokeWithRetry(invokeFn, { tries = 5, baseDelayMs = 700, jitterMs = 250, onRetry } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await invokeFn();
    } catch (e) {
      lastErr = e;
      const retryable = isRetryableInvokeError(e);
      if (!retryable || i === tries - 1) throw e;

      const backoff = Math.min(10_000, Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * jitterMs));
      onRetry?.({ attempt: i + 1, tries, backoffMs: backoff, error: safeStr(e?.message || e) });
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function getId(r) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v == null ? null : String(v);
}
function toIso(x) {
  if (!x) return null;
  try {
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("overview");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  const stopRunRef = useRef(false);

  // NCAA controls (names match function params)
  const [dryRun, setDryRun] = useState(true);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [startAt, setStartAt] = useState(0);
  const [maxRows, setMaxRows] = useState(200); // function param: maxRows
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.92); // function param: confidenceThreshold
  const [throttleMs, setThrottleMs] = useState(8); // function param: throttleMs
  const [timeBudgetMs, setTimeBudgetMs] = useState(22000); // function param: timeBudgetMs
  const [sourcePlatform] = useState("ncaa-api");

  // Run-until-done (NCAA)
  const [maxBatches, setMaxBatches] = useState(20);
  const [pauseMs, setPauseMs] = useState(900);
  const [haltOnBatchErrorsOver, setHaltOnBatchErrorsOver] = useState(60);

  // Unmatched queue visibility
  const [unmatchedBusy, setUnmatchedBusy] = useState(false);
  const [unmatchedSummary, setUnmatchedSummary] = useState(null);
  const [unmatchedSamples, setUnmatchedSamples] = useState([]);
  const [unmatchedOrg, setUnmatchedOrg] = useState("ncaa");
  const [unmatchedLimit, setUnmatchedLimit] = useState(25);

  // Dedupe controls
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeOrg, setDedupeOrg] = useState("ncaa");
  const [dedupeSeasonYear, setDedupeSeasonYear] = useState(new Date().getFullYear());
  const [startAtGroup, setStartAtGroup] = useState(0);
  const [maxGroups, setMaxGroups] = useState(120);
  const [maxDelete, setMaxDelete] = useState(200);
  const [dedupeThrottleMs, setDedupeThrottleMs] = useState(80);
  const [dedupeTimeBudgetMs, setDedupeTimeBudgetMs] = useState(22000);
  const [dedupeTries, setDedupeTries] = useState(6);

  // Camps (CampDemo → Camp) promotion + post-ingest health check
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteDryRun, setPromoteDryRun] = useState(true);
  const [promoteBatchSize, setPromoteBatchSize] = useState(600);
  const [promoteThrottleMs, setPromoteThrottleMs] = useState(8);
  const [promoteTimeBudgetMs, setPromoteTimeBudgetMs] = useState(22000);
  const [promoteStartAt, setPromoteStartAt] = useState(0);
  const [promoteMaxBatches, setPromoteMaxBatches] = useState(25);
  const [promotePauseMs, setPromotePauseMs] = useState(250);
  const [promoteHaltOnErrorsOver, setPromoteHaltOnErrorsOver] = useState(50);

  const [postIngestBusy, setPostIngestBusy] = useState(false);
  const [postIngestLast, setPostIngestLast] = useState(null);

  const [campHealthBusy, setCampHealthBusy] = useState(false);
  const [campHealthSeasonYear, setCampHealthSeasonYear] = useState(new Date().getFullYear());
  const [campHealthSportId, setCampHealthSportId] = useState("");
  const [campHealthResult, setCampHealthResult] = useState(null);

  const POST_INGEST_LAST_KEY = "adminops_post_ingest_last_v1";

  const cursorStorageKey = useMemo(() => `${NCAA_CURSOR_KEY_PREFIX}${seasonYear}`, [seasonYear]);
  const dedupeCursorStorageKey = useMemo(
    () => `${DEDUPE_CURSOR_KEY_PREFIX}${dedupeOrg}:${dedupeSeasonYear}`,
    [dedupeOrg, dedupeSeasonYear]
  );

  const [hasRecoveredSession, setHasRecoveredSession] = useState(false);
  const [showRecoverBanner, setShowRecoverBanner] = useState(false);

  // Load admin mode + restore session
  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");
    const ss = loadSessionState();
    if (ss && !hasRecoveredSession) {
      if (Array.isArray(ss.log)) setLog(ss.log);
      if (typeof ss.tab === "string") setTab(ss.tab);

      // NCAA
      if (typeof ss.dryRun === "boolean") setDryRun(ss.dryRun);
      if (Number.isFinite(ss.seasonYear)) setSeasonYear(ss.seasonYear);
      if (Number.isFinite(ss.maxRows)) setMaxRows(ss.maxRows);
      if (Number.isFinite(ss.confidenceThreshold)) setConfidenceThreshold(ss.confidenceThreshold);
      if (Number.isFinite(ss.throttleMs)) setThrottleMs(ss.throttleMs);
      if (Number.isFinite(ss.timeBudgetMs)) setTimeBudgetMs(ss.timeBudgetMs);
      if (Number.isFinite(ss.maxBatches)) setMaxBatches(ss.maxBatches);
      if (Number.isFinite(ss.pauseMs)) setPauseMs(ss.pauseMs);
      if (Number.isFinite(ss.haltOnBatchErrorsOver)) setHaltOnBatchErrorsOver(ss.haltOnBatchErrorsOver);
      if (Number.isFinite(ss.startAt)) setStartAt(ss.startAt);

      // Unmatched
      if (typeof ss.unmatchedOrg === "string") setUnmatchedOrg(ss.unmatchedOrg);
      if (Number.isFinite(ss.unmatchedLimit)) setUnmatchedLimit(ss.unmatchedLimit);

      // Dedupe
      if (typeof ss.dedupeDryRun === "boolean") setDedupeDryRun(ss.dedupeDryRun);
      if (typeof ss.dedupeOrg === "string") setDedupeOrg(ss.dedupeOrg);
      if (Number.isFinite(ss.dedupeSeasonYear)) setDedupeSeasonYear(ss.dedupeSeasonYear);
      if (Number.isFinite(ss.startAtGroup)) setStartAtGroup(ss.startAtGroup);
      if (Number.isFinite(ss.maxGroups)) setMaxGroups(ss.maxGroups);
      if (Number.isFinite(ss.maxDelete)) setMaxDelete(ss.maxDelete);
      if (Number.isFinite(ss.dedupeThrottleMs)) setDedupeThrottleMs(ss.dedupeThrottleMs);
      if (Number.isFinite(ss.dedupeTimeBudgetMs)) setDedupeTimeBudgetMs(ss.dedupeTimeBudgetMs);
      if (Number.isFinite(ss.dedupeTries)) setDedupeTries(ss.dedupeTries);

      // Camps
      if (typeof ss.promoteDryRun === "boolean") setPromoteDryRun(ss.promoteDryRun);
      if (Number.isFinite(ss.promoteBatchSize)) setPromoteBatchSize(ss.promoteBatchSize);
      if (Number.isFinite(ss.promoteThrottleMs)) setPromoteThrottleMs(ss.promoteThrottleMs);
      if (Number.isFinite(ss.promoteTimeBudgetMs)) setPromoteTimeBudgetMs(ss.promoteTimeBudgetMs);
      if (Number.isFinite(ss.promoteStartAt)) setPromoteStartAt(ss.promoteStartAt);
      if (Number.isFinite(ss.promoteMaxBatches)) setPromoteMaxBatches(ss.promoteMaxBatches);
      if (Number.isFinite(ss.promotePauseMs)) setPromotePauseMs(ss.promotePauseMs);
      if (Number.isFinite(ss.promoteHaltOnErrorsOver)) setPromoteHaltOnErrorsOver(ss.promoteHaltOnErrorsOver);

      if (Number.isFinite(ss.campHealthSeasonYear)) setCampHealthSeasonYear(ss.campHealthSeasonYear);
      if (typeof ss.campHealthSportId === "string") setCampHealthSportId(ss.campHealthSportId);

      setHasRecoveredSession(true);
      setShowRecoverBanner(true);
    }
  }, [hasRecoveredSession]);

  // Load NCAA cursor per season
  useEffect(() => {
    const saved = Number(localStorage.getItem(cursorStorageKey) || 0);
    if (Number.isFinite(saved)) setStartAt(saved);
  }, [cursorStorageKey]);

  // Load Dedupe cursor per org+season
  useEffect(() => {
    const saved = Number(localStorage.getItem(dedupeCursorStorageKey) || 0);
    if (Number.isFinite(saved)) setStartAtGroup(saved);
  }, [dedupeCursorStorageKey]);

  // Load Post-ingest last summary
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POST_INGEST_LAST_KEY);
      if (raw) setPostIngestLast(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Persist session state
  useEffect(() => {
    saveSessionState({
      tab,
      log,

      // NCAA
      dryRun,
      seasonYear,
      startAt,
      maxRows,
      confidenceThreshold,
      throttleMs,
      timeBudgetMs,
      maxBatches,
      pauseMs,
      haltOnBatchErrorsOver,

      // Unmatched
      unmatchedOrg,
      unmatchedLimit,

      // Dedupe
      dedupeDryRun,
      dedupeOrg,
      dedupeSeasonYear,
      startAtGroup,
      maxGroups,
      maxDelete,
      dedupeThrottleMs,
      dedupeTimeBudgetMs,
      dedupeTries,

      // Camps
      promoteDryRun,
      promoteBatchSize,
      promoteThrottleMs,
      promoteTimeBudgetMs,
      promoteStartAt,
      promoteMaxBatches,
      promotePauseMs,
      promoteHaltOnErrorsOver,
      campHealthSeasonYear,
      campHealthSportId,

      savedAt: new Date().toISOString(),
    });
  }, [
    tab,
    log,
    dryRun,
    seasonYear,
    startAt,
    maxRows,
    confidenceThreshold,
    throttleMs,
    timeBudgetMs,
    maxBatches,
    pauseMs,
    haltOnBatchErrorsOver,
    unmatchedOrg,
    unmatchedLimit,
    dedupeDryRun,
    dedupeOrg,
    dedupeSeasonYear,
    startAtGroup,
    maxGroups,
    maxDelete,
    dedupeThrottleMs,
    dedupeTimeBudgetMs,
    dedupeTries,

    promoteDryRun,
    promoteBatchSize,
    promoteThrottleMs,
    promoteTimeBudgetMs,
    promoteStartAt,
    promoteMaxBatches,
    promotePauseMs,
    promoteHaltOnErrorsOver,
    campHealthSeasonYear,
    campHealthSportId,
  ]);

  // Auto-scroll log
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Warn on refresh while busy
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!busy && !unmatchedBusy && !dedupeBusy && !promoteBusy && !postIngestBusy && !campHealthBusy) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy, unmatchedBusy, dedupeBusy, promoteBusy, postIngestBusy, campHealthBusy]);

  function pushLog(line) {
    setLog((prev) => {
      const next = [...prev, `[${new Date().toISOString()}] ${line}`];
      if (next.length > 900) return next.slice(next.length - 900);
      return next;
    });
  }

  function toggleAdminMode() {
    const next = !adminEnabled;
    localStorage.setItem(ADMIN_MODE_KEY, next ? "true" : "false");
    setAdminEnabled(next);
    pushLog(`Admin Mode ${next ? "ENABLED" : "DISABLED"}`);
  }

  function saveCursor(nextStartAt) {
    const v = Math.max(0, Number(nextStartAt || 0));
    localStorage.setItem(cursorStorageKey, String(v));
    setStartAt(v);
  }

  function resetCursor() {
    localStorage.setItem(cursorStorageKey, "0");
    setStartAt(0);
    pushLog(`NCAA cursor reset for season ${seasonYear}. startAt=0`);
  }

  function saveDedupeCursor(nextGroupIdx) {
    const v = Math.max(0, Number(nextGroupIdx || 0));
    localStorage.setItem(dedupeCursorStorageKey, String(v));
    setStartAtGroup(v);
  }

  function resetDedupeCursor() {
    localStorage.setItem(dedupeCursorStorageKey, "0");
    setStartAtGroup(0);
    pushLog(`Dedupe cursor reset for org=${dedupeOrg} seasonYear=${dedupeSeasonYear}. startAtGroup=0`);
  }

  async function invokeNcaaOnce({ startAtOverride } = {}) {
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available.");
      return { ok: false, error: "invoke not available" };
    }

    const cursor = Number.isFinite(startAtOverride) ? Math.max(0, Number(startAtOverride)) : Math.max(0, Number(startAt || 0));

    const payload = {
      dryRun,
      seasonYear,
      startAt: cursor,
      maxRows,
      confidenceThreshold,
      throttleMs,
      timeBudgetMs,
      sourcePlatform,
    };

    pushLog(
      `NCAA sync start. dryRun=${payload.dryRun} seasonYear=${payload.seasonYear} startAt=${payload.startAt} maxRows=${payload.maxRows} confidenceThreshold=${payload.confidenceThreshold} throttleMs=${payload.throttleMs} timeBudgetMs=${payload.timeBudgetMs}`
    );

    const raw = await invokeWithRetry(
      () => base44.functions.invoke("ncaaMembershipSync", payload),
      {
        tries: 5,
        baseDelayMs: 800,
        jitterMs: 250,
        onRetry: ({ attempt, tries, backoffMs, error }) => {
          pushLog(`↻ invoke retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`);
        },
      }
    );

    const res = unwrapInvokeResponse(raw);

    if (res?.error) {
      pushLog(`❌ NCAA sync error: ${safeStr(res.error)}`);
      return { ok: false, error: safeStr(res.error), res };
    }

    if (res?.ok !== true) {
      pushLog("❌ NCAA sync failed (no ok=true).");
      return { ok: false, error: "no ok=true", res };
    }

    const st = res?.stats || {};
    const next = Number(res?.nextStartAt ?? cursor);
    const done = !!res?.done;

    pushLog(
      `✅ NCAA sync complete. scanned=${st.scanned} created=${st.created} updated=${st.updated} staged_unmatched=${st.staged_unmatched} errors=${st.errors} dryRun=${!!res?.dryRun} nextStartAt=${next} done=${done} stoppedEarly=${!!res?.debug?.stoppedEarly}`
    );

    saveCursor(next);

    return { ok: true, res, nextStartAt: next, done, stats: st };
  }

  async function runNextBatch() {
    setBusy(true);
    try {
      await invokeNcaaOnce();
    } catch (e) {
      pushLog(`❌ NCAA invoke exception: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runUntilDone() {
    if (dryRun) return pushLog("❌ Run-until-done is disabled in Dry run. Switch to Write.");

    setBusy(true);
    stopRunRef.current = false;

    try {
      let cursor = Math.max(0, Number(startAt || 0));
      pushLog(`▶ Run until done: startingCursor=${cursor} maxRowsPerBatch=${maxRows} maxBatches=${maxBatches} pauseMs=${pauseMs}`);

      let loops = 0;
      let done = false;
      let totalErrors = 0;

      while (!done && loops < Math.max(1, Number(maxBatches || 1))) {
        if (stopRunRef.current) {
          pushLog("⏹ Run stopped by user.");
          break;
        }

        loops += 1;
        pushLog(`--- Batch ${loops} ---`);

        const out = await invokeNcaaOnce({ startAtOverride: cursor });
        if (!out?.ok) {
          pushLog(`❌ Batch ${loops} failed. Halting.`);
          break;
        }

        totalErrors += Number(out?.stats?.errors || 0);
        if (totalErrors > Math.max(0, Number(haltOnBatchErrorsOver || 0))) {
          pushLog(`⛔ Halted: errors=${totalErrors} exceeded threshold=${haltOnBatchErrorsOver}`);
          break;
        }

        cursor = Math.max(cursor, Number(out.nextStartAt || cursor));
        saveCursor(cursor);

        done = !!out.done;

        await sleep(Math.max(0, Number(pauseMs || 0)));
      }

      if (done) pushLog("🏁 Run-until-done complete: done=true");
      else pushLog(`⏸ Halted. Cursor saved at startAt=${cursor}`);
    } catch (e) {
      pushLog(`❌ Run-until-done exception: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  function clearLogs() {
    setLog([]);
  }

  async function refreshUnmatched() {
    setUnmatchedBusy(true);
    try {
      const Unmatched = pickEntityFromSDK("UnmatchedAthleticsRow");
      if (!Unmatched) {
        pushLog("❌ UnmatchedAthleticsRow entity not available.");
        return;
      }

      const orgFilter = unmatchedOrg && unmatchedOrg !== "all" ? unmatchedOrg : null;

      const rows = await (typeof Unmatched.filter === "function"
        ? Unmatched.filter(orgFilter ? { org: orgFilter } : {})
        : Unmatched.list
        ? Unmatched.list(orgFilter ? { where: { org: orgFilter } } : {})
        : []);

      const arr = Array.isArray(rows) ? rows : [];
      const counts = {
        total: arr.length,
        no_match: arr.filter((r) => r?.reason === "no_match").length,
        ambiguous: arr.filter((r) => r?.reason === "ambiguous").length,
        other: arr.filter((r) => r?.reason && !["no_match", "ambiguous"].includes(r.reason)).length,
      };

      const sample = arr.slice(0, Math.max(1, Number(unmatchedLimit || 25))).map((r) => ({
        id: getId(r),
        org: r?.org,
        reason: r?.reason,
        raw_school_name: r?.raw_school_name,
        raw_state: r?.raw_state,
        raw_city: r?.raw_city,
        raw_source_key: r?.raw_source_key,
        source_url: r?.source_url,
        created_at: toIso(r?.created_at || r?.createdAt || r?.created),
      }));

      setUnmatchedSummary({ org: orgFilter || "(all)", counts });
      setUnmatchedSamples(sample);

      pushLog(
        `📌 Unmatched refreshed: org=${orgFilter || "ALL"} total=${counts.total} no_match=${counts.no_match} ambiguous=${counts.ambiguous} other=${counts.other}`
      );
    } catch (e) {
      pushLog(`❌ Unmatched refresh failed: ${safeStr(e?.message || e)}`);
    } finally {
      setUnmatchedBusy(false);
    }
  }

  async function invokeDedupeOnce({ startAtGroupOverride } = {}) {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return { ok: false, error: "admin off" };
    }
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available.");
      return { ok: false, error: "invoke not available" };
    }

    const cursor = Number.isFinite(startAtGroupOverride)
      ? Math.max(0, Number(startAtGroupOverride))
      : Math.max(0, Number(startAtGroup || 0));

    const payload = {
      dryRun: dedupeDryRun,
      org: dedupeOrg,
      seasonYear: dedupeSeasonYear,
      startAtGroup: cursor,
      maxGroups,
      maxDelete,
      throttleMs: dedupeThrottleMs,
      timeBudgetMs: dedupeTimeBudgetMs,
      tries: dedupeTries,
    };

    pushLog(
      `AthleticsMembership dedupe sweep start. dryRun=${payload.dryRun} org=${payload.org} seasonYear=${payload.seasonYear} startAtGroup=${payload.startAtGroup} maxGroups=${payload.maxGroups} maxDelete=${payload.maxDelete} throttleMs=${payload.throttleMs} timeBudgetMs=${payload.timeBudgetMs} tries=${payload.tries}`
    );

    const raw = await invokeWithRetry(
      () => base44.functions.invoke("athleticsMembershipDedupeSweep", payload),
      {
        tries: 5,
        baseDelayMs: 800,
        jitterMs: 250,
        onRetry: ({ attempt, tries, backoffMs, error }) => {
          pushLog(`↻ dedupe invoke retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`);
        },
      }
    );

    const res = unwrapInvokeResponse(raw);
    pushLog(`dedupe invoke data:\n${truncate(res, 1400)}`);

    if (res?.error) {
      pushLog(`❌ Dedupe failed: ${safeStr(res.error)}`);
      return { ok: false, error: safeStr(res.error), res };
    }
    if (res?.ok !== true) {
      pushLog("❌ Dedupe failed (no ok=true).");
      return { ok: false, error: "no ok=true", res };
    }

    const st = res?.stats || {};
    const next = Number(res?.nextStartAtGroup ?? cursor);
    const done = !!res?.done;

    pushLog(
      `✅ Dedupe complete. scanned=${st.scanned} groups=${st.groups} dupGroups=${st.dupGroups} kept=${st.kept} deleted=${st.deleted} errors=${st.errors} dryRun=${!!res?.dryRun} nextStartAtGroup=${next} done=${done} stoppedEarly=${!!res?.debug?.stoppedEarly}`
    );

    saveDedupeCursor(next);

    return { ok: true, res, nextStartAtGroup: next, done, stats: st };
  }

  async function runDedupeNext() {
    setDedupeBusy(true);
    try {
      await invokeDedupeOnce();
    } catch (e) {
      pushLog(`❌ Dedupe exception: ${safeStr(e?.message || e)}`);
    } finally {
      setDedupeBusy(false);
    }
  }

  async function runDedupeUntilDone() {
    if (dedupeDryRun) return pushLog("❌ Dedupe run-until-done is disabled in Dry run. Switch to Write.");

    setDedupeBusy(true);
    try {
      let cursor = Math.max(0, Number(startAtGroup || 0));
      pushLog(`▶ Dedupe run until done: startingCursor=${cursor} maxGroupsPerBatch=${maxGroups} maxDeletePerBatch=${maxDelete}`);

      let loops = 0;
      let done = false;

      while (!done && loops < 25) {
        loops += 1;
        pushLog(`--- Dedupe Batch ${loops} ---`);

        const out = await invokeDedupeOnce({ startAtGroupOverride: cursor });
        if (!out?.ok) {
          pushLog(`❌ Dedupe batch ${loops} failed. Halting.`);
          break;
        }

        cursor = Math.max(cursor, Number(out.nextStartAtGroup || cursor));
        saveDedupeCursor(cursor);

        done = !!out.done;

        await sleep(600);
      }

      if (done) pushLog("🏁 Dedupe run-until-done complete: done=true");
      else pushLog(`⏸ Dedupe halted. Cursor saved at startAtGroup=${cursor}`);
    } catch (e) {
      pushLog(`❌ Dedupe run-until-done exception: ${safeStr(e?.message || e)}`);
    } finally {
      setDedupeBusy(false);
    }
  }

  /* ----------------------------
     Camps: Promote ALL + Health Check
  ----------------------------- */

  function savePostIngestLast(obj) {
    try {
      localStorage.setItem(POST_INGEST_LAST_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
    setPostIngestLast(obj);
  }

  async function invokePromoteCampsOnce({ startAtOverride, dryRunOverride } = {}) {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return { ok: false, error: "admin off" };
    }
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available.");
      return { ok: false, error: "invoke not available" };
    }

    const cursor = Number.isFinite(startAtOverride) ? Math.max(0, Number(startAtOverride)) : Math.max(0, Number(promoteStartAt || 0));
    const dry = typeof dryRunOverride === "boolean" ? dryRunOverride : !!promoteDryRun;

    const payload = {
      sportId: "*",
      startAt: cursor,
      batchSize: Math.max(1, Math.min(2000, Number(promoteBatchSize || 600))),
      throttleMs: Math.max(0, Number(promoteThrottleMs || 0)),
      timeBudgetMs: Math.max(2000, Math.min(55_000, Number(promoteTimeBudgetMs || 22_000))),
      dryRun: dry,
    };

    pushLog(
      `Promote ALL start. dryRun=${payload.dryRun} startAt=${payload.startAt} batchSize=${payload.batchSize} throttleMs=${payload.throttleMs} timeBudgetMs=${payload.timeBudgetMs}`
    );

    const raw = await invokeWithRetry(() => base44.functions.invoke("promoteCampsFromCampDemo", payload), {
      tries: 6,
      baseDelayMs: 800,
      jitterMs: 250,
      onRetry: ({ attempt, tries, backoffMs, error }) => {
        pushLog(`↻ promote retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`);
      },
    });

    const res = unwrapInvokeResponse(raw);
    pushLog(`promote invoke data:\n${truncate(res, 1500)}`);

    if (res?.ok !== true) {
      const err = safeStr(res?.error || "no ok=true");
      pushLog(`❌ Promote ALL failed: ${err}`);
      return { ok: false, error: err, res };
    }

    const totals = res?.totals || {};
    const nextStartAt = Number(res?.next?.nextStartAt ?? cursor);
    const done = !!res?.next?.done;

    setPromoteStartAt(nextStartAt);

    pushLog(
      `✅ Promote ALL batch complete. processed=${totals.processed} created=${totals.created} updated=${totals.updated} skipped=${totals.skipped} errors=${totals.errors} nextStartAt=${nextStartAt} done=${done}`
    );

    return { ok: true, totals, nextStartAt, done, res };
  }

  async function runPromoteAllUntilDone({ forceWrite = false } = {}) {
    setPromoteBusy(true);
    stopRunRef.current = false;

    try {
      let cursor = Math.max(0, Number(promoteStartAt || 0));
      let loops = 0;
      let totalErrors = 0;

      const dry = forceWrite ? false : !!promoteDryRun;

      pushLog(`▶ Promote ALL run until done: dryRun=${dry} startingCursor=${cursor} maxBatches=${promoteMaxBatches}`);

      while (loops < Math.max(1, Number(promoteMaxBatches || 1))) {
        if (stopRunRef.current) {
          pushLog("⏹ Promote ALL stopped by user.");
          break;
        }

        loops += 1;
        pushLog(`--- Promote ALL Batch ${loops} ---`);

        const out = await invokePromoteCampsOnce({ startAtOverride: cursor, dryRunOverride: dry });
        if (!out?.ok) {
          pushLog(`❌ Promote ALL batch ${loops} failed. Halting.`);
          break;
        }

        totalErrors += Number(out?.totals?.errors || 0);
        if (totalErrors > Math.max(0, Number(promoteHaltOnErrorsOver || 0))) {
          pushLog(`⛔ Promote ALL halted: errors=${totalErrors} exceeded threshold=${promoteHaltOnErrorsOver}`);
          break;
        }

        cursor = Math.max(cursor, Number(out.nextStartAt || cursor));
        setPromoteStartAt(cursor);

        if (out.done) {
          pushLog("🏁 Promote ALL complete: done=true");
          break;
        }

        await sleep(Math.max(0, Number(promotePauseMs || 0)));
      }
    } finally {
      setPromoteBusy(false);
    }
  }

  async function runCampHealthCheck({ seasonYearOverride, sportIdOverride } = {}) {
    setCampHealthBusy(true);
    try {
      const Camp = pickEntityFromSDK("Camp");
      if (!Camp?.filter) {
        pushLog("❌ Camp entity not available.");
        setCampHealthResult({ ok: false, error: "Camp entity not available" });
        return { ok: false };
      }

      const sy = Number.isFinite(Number(seasonYearOverride)) ? Number(seasonYearOverride) : Number(campHealthSeasonYear || 0);
      const sportId = safeStr(sportIdOverride ?? campHealthSportId).trim();

      const queries = [];
      if (sportId) {
        queries.push({ season_year: sy, sport_id: sportId });
        queries.push({ season_year: String(sy), sport_id: sportId });
      } else {
        queries.push({ season_year: sy });
        queries.push({ season_year: String(sy) });
      }

      let rows = [];
      let matchedOn = null;
      for (const q of queries) {
        try {
          const r = await Camp.filter(q);
          if (Array.isArray(r)) {
            rows = r;
            matchedOn = q;
            break;
          }
        } catch {
          // try next
        }
      }

      const total = Array.isArray(rows) ? rows.length : 0;
      const active = Array.isArray(rows) ? rows.filter((r) => r?.active !== false).length : 0;
      const sample = Array.isArray(rows)
        ? rows.slice(0, 5).map((r) => ({
            id: r?.id,
            event_key: r?.event_key,
            camp_name: r?.camp_name,
            start_date: r?.start_date,
            school_id: r?.school_id,
            sport_id: r?.sport_id,
            season_year: r?.season_year,
            active: r?.active,
          }))
        : [];

      const out = { ok: true, season_year: sy, sport_id: sportId || null, matchedOn, total, active, sample };
      setCampHealthResult(out);
      pushLog(`✅ Camp health: seasonYear=${sy} sportId=${sportId || "(all)"} total=${total} active=${active}`);
      return out;
    } catch (e) {
      const msg = safeStr(e?.message || e);
      pushLog(`❌ Camp health check failed: ${msg}`);
      const out = { ok: false, error: msg };
      setCampHealthResult(out);
      return out;
    } finally {
      setCampHealthBusy(false);
    }
  }

  async function runPostIngest() {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return;
    }
    setPostIngestBusy(true);
    stopRunRef.current = false;

    const startedAt = new Date().toISOString();
    const season = Number(campHealthSeasonYear || new Date().getFullYear());

    try {
      pushLog(`🚀 Post-ingest start: Promote ALL (WRITE) + Camp health check (seasonYear=${season})`);

      // Step 1: Promote ALL (force write)
      await runPromoteAllUntilDone({ forceWrite: true });

      // Step 2: Camp health check
      const health = await runCampHealthCheck({ seasonYearOverride: season });

      const summary = {
        startedAt,
        finishedAt: new Date().toISOString(),
        seasonYear: season,
        promote: {
          sportId: "*",
          batchSize: promoteBatchSize,
          throttleMs: promoteThrottleMs,
          timeBudgetMs: promoteTimeBudgetMs,
          maxBatches: promoteMaxBatches,
        },
        health,
      };

      savePostIngestLast(summary);
      pushLog("✅ Post-ingest complete.");
    } catch (e) {
      const msg = safeStr(e?.message || e);
      pushLog(`❌ Post-ingest failed: ${msg}`);
      savePostIngestLast({ startedAt, finishedAt: new Date().toISOString(), seasonYear: season, ok: false, error: msg });
    } finally {
      setPostIngestBusy(false);
    }
  }

  const lastSavedCursor = useMemo(() => Number(localStorage.getItem(cursorStorageKey) || 0), [cursorStorageKey, startAt]);
  const lastSavedDedupeCursor = useMemo(
    () => Number(localStorage.getItem(dedupeCursorStorageKey) || 0),
    [dedupeCursorStorageKey, startAtGroup]
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">Checkpointed pipelines with telemetry.</div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => nav(ROUTES.Profile)}
            disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
          >
            Profile
          </Button>
          <Button
            variant="outline"
            onClick={() => nav(ROUTES.Workspace)}
            disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
          >
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}>
            Admin Mode: {adminEnabled ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {showRecoverBanner && (
        <Card className="p-3 border border-blue-200 bg-blue-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Recovered Admin Ops state after refresh</div>
              <div className="text-sm text-gray-700">
                NCAA cursor (season {seasonYear}) last saved at <span className="font-mono">{String(lastSavedCursor || 0)}</span>. Dedupe cursor ({dedupeOrg}:{dedupeSeasonYear}) last saved at{" "}
                <span className="font-mono">{String(lastSavedDedupeCursor || 0)}</span>.
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setShowRecoverBanner(false)}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {!adminEnabled && (
        <Card className="p-4 border border-amber-300 bg-amber-50">
          <div className="font-medium">Admin Mode is OFF</div>
          <div className="text-sm text-gray-700 mt-1">Turn it on to run pipelines.</div>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "overview" ? "default" : "outline"}
              onClick={() => setTab("overview")}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Overview
            </Button>
            <Button
              variant={tab === "athletics" ? "default" : "outline"}
              onClick={() => setTab("athletics")}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Athletics
            </Button>
            <Button
              variant={tab === "camps" ? "default" : "outline"}
              onClick={() => setTab("camps")}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Camps
            </Button>
            <Button
              variant={tab === "diagnostics" ? "default" : "outline"}
              onClick={() => setTab("diagnostics")}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {tab === "overview" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Admin Ops hub</div>
          <div className="text-sm text-gray-700 mt-2">
            Use Athletics for NCAA enrichment + dedupe + unmatched. Use Camps for Promote ALL + health checks.
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => nav(ROUTES.AdminSeedSchoolsMaster)}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Seed Schools (Scorecard)
            </Button>
            <Button
              variant="outline"
              onClick={() => nav(ROUTES.AdminImport)}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Admin Import
            </Button>
            <Button
              variant="outline"
              onClick={() => nav(ROUTES.Discover)}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Discover
            </Button>
            <Button
              variant="outline"
              onClick={() => nav(ROUTES.AdminFactoryReset)}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Factory Reset
            </Button>
          </div>
        </Card>
      )}

      {tab === "athletics" && (
        <div className="space-y-4">
          {/* NCAA */}
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">NCAA enrichment (batch + resume)</div>
            <div className="text-sm text-gray-600">Labels match function params exactly.</div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant={dryRun ? "default" : "outline"}
                onClick={() => setDryRun(true)}
                disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
              >
                DryRun
              </Button>
              <Button
                variant={!dryRun ? "default" : "outline"}
                onClick={() => setDryRun(false)}
                disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
              >
                Write
              </Button>

              <Button variant="outline" onClick={() => (stopRunRef.current = true)} disabled={!busy}>
                Stop
              </Button>

              <Button variant="outline" onClick={resetCursor} disabled={busy}>
                Reset cursor
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">seasonYear</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(Number(e.target.value || 0))}
                  disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">startAt (cursor)</span>
                <input
                  className="border rounded px-2 py-1 w-28"
                  type="number"
                  value={startAt}
                  onChange={(e) => setStartAt(Math.max(0, Number(e.target.value || 0)))}
                  disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">maxRows</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={maxRows}
                  onChange={(e) => setMaxRows(Number(e.target.value || 0))}
                  disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">confidenceThreshold</span>
                <input
                  className="border rounded px-2 py-1 w-28"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value || 0))}
                  disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">throttleMs</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={throttleMs}
                  onChange={(e) => setThrottleMs(Number(e.target.value || 0))}
                  disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">timeBudgetMs</span>
                <input
                  className="border rounded px-2 py-1 w-28"
                  type="number"
                  value={timeBudgetMs}
                  onChange={(e) => setTimeBudgetMs(Number(e.target.value || 0))}
                  disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={runNextBatch}
                disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy || !adminEnabled}
              >
                Run next batch
              </Button>
              <Button
                variant="outline"
                onClick={runUntilDone}
                disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy || !adminEnabled}
              >
                Run until done
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="font-medium">Payload preview</div>
                <pre className="text-xs overflow-auto mt-2">
                  {safeJson({
                    dryRun,
                    seasonYear,
                    startAt,
                    maxRows,
                    confidenceThreshold,
                    throttleMs,
                    timeBudgetMs,
                    sourcePlatform,
                  })}
                </pre>
              </Card>

              <Card className="p-3">
                <div className="font-medium">Run-until-done controls</div>
                <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-600">maxBatches</span>
                    <input
                      className="border rounded px-2 py-1 w-24"
                      type="number"
                      value={maxBatches}
                      onChange={(e) => setMaxBatches(Number(e.target.value || 0))}
                      disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-600">pauseMs</span>
                    <input
                      className="border rounded px-2 py-1 w-24"
                      type="number"
                      value={pauseMs}
                      onChange={(e) => setPauseMs(Number(e.target.value || 0))}
                      disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                    />
                  </label>
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-gray-600">haltOnBatchErrorsOver</span>
                    <input
                      className="border rounded px-2 py-1 w-28"
                      type="number"
                      value={haltOnBatchErrorsOver}
                      onChange={(e) => setHaltOnBatchErrorsOver(Number(e.target.value || 0))}
                      disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                    />
                  </label>
                </div>
              </Card>
            </div>
          </Card>

          {/* Unmatched */}
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Unmatched queue</div>
            <div className="text-sm text-gray-600">Visibility into staged rows to triage matching issues.</div>

            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Org</span>
                <select
                  className="border rounded px-2 py-1"
                  value={unmatchedOrg}
                  onChange={(e) => setUnmatchedOrg(e.target.value)}
                  disabled={unmatchedBusy || busy || promoteBusy || postIngestBusy || campHealthBusy}
                >
                  <option value="all">all</option>
                  <option value="ncaa">ncaa</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Limit</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={unmatchedLimit}
                  onChange={(e) => setUnmatchedLimit(Number(e.target.value || 0))}
                  disabled={unmatchedBusy || busy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <Button onClick={refreshUnmatched} disabled={unmatchedBusy || promoteBusy || postIngestBusy || campHealthBusy}>
                Refresh
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="font-medium">Summary</div>
                <pre className="text-xs overflow-auto mt-2">{safeJson(unmatchedSummary || { note: "(none yet)" })}</pre>
              </Card>

              <Card className="p-3">
                <div className="font-medium">Samples</div>
                <div className="mt-2 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">reason</th>
                        <th className="p-2">raw_school_name</th>
                        <th className="p-2">raw_city</th>
                        <th className="p-2">raw_state</th>
                        <th className="p-2">source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedSamples.length ? (
                        unmatchedSamples.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="p-2 font-mono">{r.reason}</td>
                            <td className="p-2">{r.raw_school_name}</td>
                            <td className="p-2">{r.raw_city}</td>
                            <td className="p-2">{r.raw_state}</td>
                            <td className="p-2">
                              {r.source_url ? (
                                <a className="text-blue-700 underline" href={r.source_url} target="_blank" rel="noreferrer">
                                  open
                                </a>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr className="border-t">
                          <td className="p-2 text-gray-500" colSpan={5}>
                            (no samples loaded)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </Card>

          {/* Dedupe */}
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">AthleticsMembership dedupe sweep</div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant={dedupeDryRun ? "default" : "outline"}
                onClick={() => setDedupeDryRun(true)}
                disabled={dedupeBusy || !adminEnabled || promoteBusy || postIngestBusy || campHealthBusy}
              >
                DryRun
              </Button>
              <Button
                variant={!dedupeDryRun ? "default" : "outline"}
                onClick={() => setDedupeDryRun(false)}
                disabled={dedupeBusy || !adminEnabled || promoteBusy || postIngestBusy || campHealthBusy}
              >
                Write
              </Button>

              <Button variant="outline" onClick={resetDedupeCursor} disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}>
                Reset cursor
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">org</span>
                <input
                  className="border rounded px-2 py-1"
                  value={dedupeOrg}
                  onChange={(e) => setDedupeOrg(e.target.value)}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">seasonYear</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={dedupeSeasonYear}
                  onChange={(e) => setDedupeSeasonYear(Number(e.target.value || 0))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">startAtGroup</span>
                <input
                  className="border rounded px-2 py-1 w-28"
                  type="number"
                  value={startAtGroup}
                  onChange={(e) => setStartAtGroup(Math.max(0, Number(e.target.value || 0)))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">maxGroups</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={maxGroups}
                  onChange={(e) => setMaxGroups(Number(e.target.value || 0))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">maxDelete</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={maxDelete}
                  onChange={(e) => setMaxDelete(Number(e.target.value || 0))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">throttleMs</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={dedupeThrottleMs}
                  onChange={(e) => setDedupeThrottleMs(Number(e.target.value || 0))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">timeBudgetMs</span>
                <input
                  className="border rounded px-2 py-1 w-28"
                  type="number"
                  value={dedupeTimeBudgetMs}
                  onChange={(e) => setDedupeTimeBudgetMs(Number(e.target.value || 0))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-gray-600">tries</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={dedupeTries}
                  onChange={(e) => setDedupeTries(Number(e.target.value || 0))}
                  disabled={dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runDedupeNext} disabled={dedupeBusy || !adminEnabled || promoteBusy || postIngestBusy || campHealthBusy}>
                Run next batch
              </Button>
              <Button
                variant="outline"
                onClick={runDedupeUntilDone}
                disabled={dedupeBusy || !adminEnabled || promoteBusy || postIngestBusy || campHealthBusy}
              >
                Run until done
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "camps" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Post-ingest</div>
            <div className="text-sm text-gray-700">
              One button to stabilize paid Discover after ingest: <span className="font-mono">Promote ALL (CampDemo → Camp)</span> then run a{" "}
              <span className="font-mono">Camp health check</span>.
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={runPostIngest} disabled={!adminEnabled || postIngestBusy || promoteBusy || campHealthBusy}>
                {postIngestBusy ? "Running post-ingest…" : "Run Post-ingest (WRITE + Health Check)"}
              </Button>
              <Button variant="outline" onClick={() => (stopRunRef.current = true)} disabled={!postIngestBusy && !promoteBusy}>
                Stop
              </Button>
              <Button variant="outline" onClick={() => nav(ROUTES.Discover)} disabled={postIngestBusy || promoteBusy}>
                Open Discover
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">seasonYear (health)</span>
                <input
                  className="border rounded px-2 py-1 w-28"
                  type="number"
                  value={campHealthSeasonYear}
                  onChange={(e) => setCampHealthSeasonYear(Number(e.target.value || 0))}
                  disabled={postIngestBusy || promoteBusy || campHealthBusy}
                />
              </label>
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-gray-600">sportId (optional)</span>
                <input
                  className="border rounded px-2 py-1 font-mono"
                  placeholder="(blank = all sports)"
                  value={campHealthSportId}
                  onChange={(e) => setCampHealthSportId(e.target.value)}
                  disabled={postIngestBusy || promoteBusy || campHealthBusy}
                />
              </label>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="font-medium">Last post-ingest</div>
                <pre className="text-xs overflow-auto mt-2">{safeJson(postIngestLast || { note: "(none yet)" })}</pre>
              </Card>
              <Card className="p-3">
                <div className="font-medium">Current health</div>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" onClick={() => runCampHealthCheck()} disabled={postIngestBusy || promoteBusy || campHealthBusy}>
                    {campHealthBusy ? "Checking…" : "Run health check"}
                  </Button>
                  <Button variant={promoteDryRun ? "default" : "outline"} onClick={() => setPromoteDryRun(true)} disabled={postIngestBusy || promoteBusy}>
                    DryRun
                  </Button>
                  <Button variant={!promoteDryRun ? "default" : "outline"} onClick={() => setPromoteDryRun(false)} disabled={postIngestBusy || promoteBusy}>
                    Write
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-600">batchSize</span>
                    <input className="border rounded px-2 py-1" type="number" value={promoteBatchSize} onChange={(e) => setPromoteBatchSize(Number(e.target.value || 0))} disabled={postIngestBusy || promoteBusy} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-600">throttleMs</span>
                    <input className="border rounded px-2 py-1" type="number" value={promoteThrottleMs} onChange={(e) => setPromoteThrottleMs(Number(e.target.value || 0))} disabled={postIngestBusy || promoteBusy} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-600">timeBudgetMs</span>
                    <input className="border rounded px-2 py-1" type="number" value={promoteTimeBudgetMs} onChange={(e) => setPromoteTimeBudgetMs(Number(e.target.value || 0))} disabled={postIngestBusy || promoteBusy} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-gray-600">maxBatches</span>
                    <input className="border rounded px-2 py-1" type="number" value={promoteMaxBatches} onChange={(e) => setPromoteMaxBatches(Number(e.target.value || 0))} disabled={postIngestBusy || promoteBusy} />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Button onClick={() => invokePromoteCampsOnce()} disabled={!adminEnabled || postIngestBusy || promoteBusy}>
                    Run Promote ALL (one batch)
                  </Button>
                  <Button variant="outline" onClick={() => runPromoteAllUntilDone()} disabled={!adminEnabled || postIngestBusy || promoteBusy}>
                    Run Promote ALL until done
                  </Button>
                </div>

                <pre className="text-xs overflow-auto mt-3">{safeJson(campHealthResult || { note: "(no health check yet)" })}</pre>
              </Card>
            </div>
          </Card>
        </div>
      )}

      {tab === "diagnostics" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Entities available</div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.keys(base44?.entities || {})
              .sort()
              .map((k) => (
                <div key={k} className="border rounded px-2 py-1 font-mono">
                  {k}
                </div>
              ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Run log</div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRecoverBanner(true)}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Show recover info
            </Button>
            <Button
              variant="outline"
              onClick={clearLogs}
              disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy || postIngestBusy || campHealthBusy}
            >
              Clear
            </Button>
          </div>
        </div>
        <div ref={logRef} className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto" style={{ maxHeight: 460 }}>
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}