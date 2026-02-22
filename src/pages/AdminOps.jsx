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

// Camp promotion cursor (sport index + startAt)
const PROMOTE_CURSOR_KEY = "adminops_promote_camps_cursor_v1";

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

  // Cached sports list for promote-all runner
  const [sportsList, setSportsList] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const SportEntity = pickEntityFromSDK("Sport");
        if (!SportEntity) return;
        const rows = (typeof SportEntity.filter === "function") ? await SportEntity.filter({}) : (SportEntity.list ? await SportEntity.list({}) : []);
        if (!mounted) return;
        setSportsList(Array.isArray(rows) ? rows : []);
      } catch {
        if (!mounted) return;
        setSportsList([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  // Camp promotion controls (CampDemo -> Camp)
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteDryRun, setPromoteDryRun] = useState(true);
  const [promoteBatchSize, setPromoteBatchSize] = useState(600);
  const [promoteThrottleMs, setPromoteThrottleMs] = useState(8);
  const [promoteTimeBudgetMs, setPromoteTimeBudgetMs] = useState(22000);
  const [promoteOnlySportId, setPromoteOnlySportId] = useState(""); // empty = run all sports
  const [promoteMaxBatches, setPromoteMaxBatches] = useState(50);
  const [promotePauseMs, setPromotePauseMs] = useState(400);
  const [promoteHaltOnErrorsOver, setPromoteHaltOnErrorsOver] = useState(120);
  const [promoteStatus, setPromoteStatus] = useState(null);
  const [promoteCursor, setPromoteCursor] = useState({ sportIndex: 0, startAt: 0 });

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

      // Promote
      if (typeof ss.promoteDryRun === "boolean") setPromoteDryRun(ss.promoteDryRun);
      if (Number.isFinite(ss.promoteBatchSize)) setPromoteBatchSize(ss.promoteBatchSize);
      if (Number.isFinite(ss.promoteThrottleMs)) setPromoteThrottleMs(ss.promoteThrottleMs);
      if (Number.isFinite(ss.promoteTimeBudgetMs)) setPromoteTimeBudgetMs(ss.promoteTimeBudgetMs);
      if (typeof ss.promoteOnlySportId === "string") setPromoteOnlySportId(ss.promoteOnlySportId);
      if (Number.isFinite(ss.promoteMaxBatches)) setPromoteMaxBatches(ss.promoteMaxBatches);
      if (Number.isFinite(ss.promotePauseMs)) setPromotePauseMs(ss.promotePauseMs);
      if (Number.isFinite(ss.promoteHaltOnErrorsOver)) setPromoteHaltOnErrorsOver(ss.promoteHaltOnErrorsOver);

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

  // Load Promote cursor
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROMOTE_CURSOR_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const sportIndex = Math.max(0, Number(parsed?.sportIndex ?? 0));
      const startAt = Math.max(0, Number(parsed?.startAt ?? 0));
      setPromoteCursor({ sportIndex, startAt });
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

      // Promote
      promoteDryRun,
      promoteBatchSize,
      promoteThrottleMs,
      promoteTimeBudgetMs,
      promoteOnlySportId,
      promoteMaxBatches,
      promotePauseMs,
      promoteHaltOnErrorsOver,

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
    promoteOnlySportId,
    promoteMaxBatches,
    promotePauseMs,
    promoteHaltOnErrorsOver,
  ]);

  // Auto-scroll log
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Warn on refresh while busy
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!busy && !unmatchedBusy && !dedupeBusy && !promoteBusy) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy, unmatchedBusy, dedupeBusy, promoteBusy]);

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

  function savePromoteCursor(next) {
    const sportIndex = Math.max(0, Number(next?.sportIndex ?? 0));
    const startAt2 = Math.max(0, Number(next?.startAt ?? 0));
    const v = { sportIndex, startAt: startAt2 };
    try {
      localStorage.setItem(PROMOTE_CURSOR_KEY, JSON.stringify(v));
    } catch {
      // ignore
    }
    setPromoteCursor(v);
  }

  function resetPromoteCursor() {
    const v = { sportIndex: 0, startAt: 0 };
    try {
      localStorage.setItem(PROMOTE_CURSOR_KEY, JSON.stringify(v));
    } catch {
      // ignore
    }
    setPromoteCursor(v);
    setPromoteStatus(null);
    pushLog("Promote cursor reset. sportIndex=0 startAt=0");
  }

  const payloadPreview = useMemo(() => {
    return {
      dryRun,
      seasonYear,
      startAt,
      maxRows,
      confidenceThreshold,
      throttleMs,
      timeBudgetMs,
      sourcePlatform,
    };
  }, [dryRun, seasonYear, startAt, maxRows, confidenceThreshold, throttleMs, timeBudgetMs, sourcePlatform]);

  const dedupePayloadPreview = useMemo(() => {
    return {
      dryRun: dedupeDryRun,
      org: dedupeOrg,
      seasonYear: dedupeSeasonYear,
      startAtGroup,
      maxGroups,
      maxDelete,
      throttleMs: dedupeThrottleMs,
      timeBudgetMs: dedupeTimeBudgetMs,
      tries: dedupeTries,
    };
  }, [
    dedupeDryRun,
    dedupeOrg,
    dedupeSeasonYear,
    startAtGroup,
    maxGroups,
    maxDelete,
    dedupeThrottleMs,
    dedupeTimeBudgetMs,
    dedupeTries,
  ]);

  const promotePayloadPreview = useMemo(() => {
    return {
      dryRun: promoteDryRun,
      // per-sport function param
      sportId: promoteOnlySportId || "(run-all uses current sport index)",
      startAt: promoteCursor.startAt,
      batchSize: promoteBatchSize,
      throttleMs: promoteThrottleMs,
      timeBudgetMs: promoteTimeBudgetMs,
    };
  }, [promoteDryRun, promoteOnlySportId, promoteCursor.startAt, promoteBatchSize, promoteThrottleMs, promoteTimeBudgetMs]);

  async function invokeNcaaOnce({ startAtOverride } = {}) {
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available.");
      return { ok: false, error: "invoke not available" };
    }

    const cursor = Number.isFinite(startAtOverride) ? Math.max(0, Number(startAtOverride)) : Math.max(0, Number(startAt || 0));

    const payload = {
      ...payloadPreview,
      startAt: cursor,
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

    pushLog(`invoke data:\n${truncate(res, 1400)}`);

    if (res?.error) {
      pushLog(`❌ NCAA sync failed: ${safeStr(res.error)}`);
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
      `✅ NCAA sync complete. processed=${st.processed} matched=${st.matched} created=${st.created} updated=${st.updated} noMatch=${st.noMatch} ambiguous=${st.ambiguous} missingName=${st.missingName} errors=${st.errors} skippedDryRun=${st.skippedDryRun} nextStartAt=${next} done=${done} stoppedEarly=${!!res?.debug?.stoppedEarly}`
    );

    saveCursor(next);

    return { ok: true, res, nextStartAt: next, done, stats: st };
  }

  async function runNextBatch() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    setBusy(true);
    stopRunRef.current = false;
    try {
      await invokeNcaaOnce();
    } catch (e) {
      pushLog(`❌ NCAA sync exception: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runUntilDone() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (dryRun) return pushLog("❌ Run-until-done is disabled in Dry run. Switch to Write.");

    setBusy(true);
    stopRunRef.current = false;

    try {
      let cursor = Math.max(0, Number(startAt || 0));
      pushLog(`▶ Run until done: maxBatches=${maxBatches} pauseMs=${pauseMs} startingCursor=${cursor} haltOnBatchErrorsOver=${haltOnBatchErrorsOver}`);

      let batches = 0;
      let done = false;

      while (!done && batches < maxBatches) {
        if (stopRunRef.current) {
          pushLog("⏹ Stopped by operator.");
          break;
        }

        batches += 1;
        pushLog(`--- Batch ${batches} ---`);

        const out = await invokeNcaaOnce({ startAtOverride: cursor });
        if (!out?.ok) {
          pushLog(`❌ Batch ${batches} failed. Halting.`);
          break;
        }

        const batchErrors = Number(out?.stats?.errors || 0);
        if (Number.isFinite(batchErrors) && batchErrors > haltOnBatchErrorsOver) {
          pushLog(`🛑 Halting: batch reported errors=${batchErrors} which is > haltOnBatchErrorsOver=${haltOnBatchErrorsOver}.`);
          break;
        }

        cursor = Math.max(cursor, Number(out.nextStartAt || cursor));
        saveCursor(cursor);

        done = !!out.done;

        if (!done && pauseMs > 0) await sleep(pauseMs);
      }

      if (done) {
        pushLog("🏁 NCAA run-until-done complete: done=true");
      } else if (batches >= maxBatches) {
        pushLog(`⏸ Reached maxBatches=${maxBatches}. Cursor saved at startAt=${cursor}.`);
      } else {
        pushLog(`⏸ Halted early. Cursor saved at startAt=${cursor}.`);
      }
    } catch (e) {
      pushLog(`❌ run-until-done exception: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
      stopRunRef.current = false;
    }
  }

  function stopRun() {
    stopRunRef.current = true;
    pushLog("Stop requested. Will halt after current batch completes.");
  }

  function clearLogs() {
    setLog([]);
  }

  async function refreshUnmatched() {
    const Unmatched = pickEntityFromSDK("UnmatchedAthleticsRow");
    if (!Unmatched) {
      pushLog("❌ UnmatchedAthleticsRow entity not found on client. Check src/api/entities.js export.");
      return;
    }

    setUnmatchedBusy(true);
    try {
      const all = await Unmatched.filter({});
      const rows = Array.isArray(all) ? all : [];

      const orgFilter = lc(unmatchedOrg || "");
      const filtered = orgFilter ? rows.filter((r) => lc(r?.org) === orgFilter) : rows;

      const counts = { total: filtered.length, no_match: 0, ambiguous: 0, missing_fields: 0, other: 0 };
      for (const r of filtered) {
        const reason = lc(r?.reason || "");
        if (reason === "no_match") counts.no_match += 1;
        else if (reason === "ambiguous") counts.ambiguous += 1;
        else if (reason === "missing_fields") counts.missing_fields += 1;
        else counts.other += 1;
      }

      const sorted = [...filtered].sort((a, b) => {
        const av = Date.parse(a?.created_at || a?.createdAt || a?.created || "") || 0;
        const bv = Date.parse(b?.created_at || b?.createdAt || b?.created || "") || 0;
        return bv - av;
      });

      const lim = Math.max(1, Number(unmatchedLimit || 25));
      const sample = sorted.slice(0, lim).map((r) => ({
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

      pushLog(`📌 Unmatched refreshed: org=${orgFilter || "ALL"} total=${counts.total} no_match=${counts.no_match} ambiguous=${counts.ambiguous} other=${counts.other}`);
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

    const cursor = Number.isFinite(startAtGroupOverride) ? Math.max(0, Number(startAtGroupOverride)) : Math.max(0, Number(startAtGroup || 0));

    const payload = {
      ...dedupePayloadPreview,
      startAtGroup: cursor,
    };

    pushLog(`AthleticsMembership dedupe sweep start. dryRun=${payload.dryRun} org=${payload.org} seasonYear=${payload.seasonYear} startAtGroup=${payload.startAtGroup} maxGroups=${payload.maxGroups} maxDelete=${payload.maxDelete} throttleMs=${payload.throttleMs} timeBudgetMs=${payload.timeBudgetMs} tries=${payload.tries}`);

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

    pushLog(`✅ Dedupe complete. scanned=${st.scanned} groups=${st.groups} dupGroups=${st.dupGroups} kept=${st.kept} deleted=${st.deleted} errors=${st.errors} dryRun=${!!res?.dryRun} nextStartAtGroup=${next} done=${done} stoppedEarly=${!!res?.debug?.stoppedEarly}`);

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

      // Conservative loop count to avoid runaway UI loops
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

        // Gentle pause to reduce UI/network churn
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
     Camps: Promote CampDemo -> Camp (server-side function)
  ----------------------------- */

  /* ----------------------------
     Camps: Promote CampDemo -> Camp (server-side function)
     Fixes:
     - Advance sportIndex deterministically in run-until-done (avoid stale React state)
     - Allow resolvePromoteSportId(index)
  ----------------------------- */
  function resolvePromoteSportId(sportIndexOverride) {
    if (promoteOnlySportId) return promoteOnlySportId;
    const idx = Math.max(0, Number(sportIndexOverride ?? promoteCursor?.sportIndex ?? 0));
    const row = Array.isArray(sportsList) ? sportsList[idx] : null;
    return row ? getId(row) : "";
  }

  async function invokePromoteOnce({ sportIdOverride, startAtOverride, sportIndexOverride } = {}) {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return { ok: false, error: "admin off" };
    }
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available.");
      return { ok: false, error: "invoke not available" };
    }

    const sportId = safeStr(sportIdOverride || resolvePromoteSportId(sportIndexOverride));
    const startAt2 = Number.isFinite(startAtOverride)
      ? Math.max(0, Number(startAtOverride))
      : Math.max(0, Number(promoteCursor?.startAt ?? 0));

    if (!sportId) {
      pushLog("❌ Promote: No sportId resolved. If running ALL sports, ensure Sport table is loaded.");
      return { ok: false, error: "no sportId" };
    }

    const payload = {
      sportId,
      startAt: startAt2,
      batchSize: Math.max(1, Math.min(2000, Number(promoteBatchSize || 600))),
      throttleMs: Math.max(0, Number(promoteThrottleMs || 0)),
      timeBudgetMs: Math.max(2000, Math.min(55_000, Number(promoteTimeBudgetMs || 22_000))),
      dryRun: !!promoteDryRun,
    };

    pushLog(
      `Promote start. dryRun=${payload.dryRun} sportId=${payload.sportId} startAt=${payload.startAt} batchSize=${payload.batchSize} throttleMs=${payload.throttleMs} timeBudgetMs=${payload.timeBudgetMs}`
    );

    const raw = await invokeWithRetry(() => base44.functions.invoke("promoteCampsFromCampDemo", payload), {
      tries: 6,
      baseDelayMs: 800,
      jitterMs: 250,
      onRetry: ({ attempt, tries, backoffMs, error }) => {
        pushLog(`↻ promote invoke retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`);
      },
    });

    const res = unwrapInvokeResponse(raw);
    pushLog(`promote invoke data:\n${truncate(res, 1600)}`);

    if (res?.ok !== true) {
      const err = safeStr(res?.error || "no ok=true");
      pushLog(`❌ Promote failed: ${err}`);
      return { ok: false, error: err, res };
    }

    const totals = res?.totals || {};
    const nextStartAt = Number(res?.next?.nextStartAt ?? startAt2);
    const done = !!res?.next?.done;

    setPromoteStatus({
      runIso: res?.runIso,
      sportId,
      totals,
      nextStartAt,
      done,
      debug: res?.debug || null,
    });

    pushLog(
      `✅ Promote batch complete. sportId=${sportId} processed=${totals.processed} created=${totals.created} updated=${totals.updated} skipped=${totals.skipped} errors=${totals.errors} nextStartAt=${nextStartAt} done=${done}`
    );

    return { ok: true, res, sportId, nextStartAt, done, totals };
  }

  async function runPromoteNext() {
    setPromoteBusy(true);
    try {
      await invokePromoteOnce();
    } catch (e) {
      pushLog(`❌ Promote exception: ${safeStr(e?.message || e)}`);
    } finally {
      setPromoteBusy(false);
    }
  }

  async function runPromoteUntilDone() {
    setPromoteBusy(true);
    stopRunRef.current = false;

    // Use local cursors to avoid stale React state during rapid loops.
    let localSportIndex = Math.max(0, Number(promoteCursor?.sportIndex ?? 0));
    let localStartAt = Math.max(0, Number(promoteCursor?.startAt ?? 0));

    try {
      let loops = 0;
      let totalErrors = 0;

      pushLog(
        `▶ Promote run until done: mode=${promoteOnlySportId ? "single-sport" : "all-sports"} starting sportIndex=${localSportIndex} startAt=${localStartAt} maxBatches=${promoteMaxBatches}`
      );

      while (loops < Math.max(1, Number(promoteMaxBatches || 50))) {
        if (stopRunRef.current) {
          pushLog("⏹ Promote stopped by user.");
          break;
        }

        if (!promoteOnlySportId) {
          if (Array.isArray(sportsList) && localSportIndex >= sportsList.length) {
            pushLog("🏁 Promote complete: reached end of Sports list.");
            break;
          }
        }

        const sportId = promoteOnlySportId ? promoteOnlySportId : resolvePromoteSportId(localSportIndex);
        if (!sportId) {
          pushLog("❌ Promote: Could not resolve sportId for current sportIndex.");
          break;
        }

        loops += 1;
        pushLog(`--- Promote Batch ${loops} ---`);

        const out = await invokePromoteOnce({
          sportIdOverride: sportId,
          startAtOverride: localStartAt,
          sportIndexOverride: localSportIndex,
        });

        if (!out?.ok) {
          pushLog(`❌ Promote batch ${loops} failed. Halting.`);
          break;
        }

        totalErrors += Number(out?.totals?.errors || 0);
        if (totalErrors > Math.max(0, Number(promoteHaltOnErrorsOver || 120))) {
          pushLog(`⛔ Promote halted: errors=${totalErrors} exceeded threshold=${promoteHaltOnErrorsOver}`);
          break;
        }

        // Advance local cursor
        if (promoteOnlySportId) {
          localStartAt = out.done ? out.nextStartAt : out.nextStartAt;
          savePromoteCursor({ sportIndex: localSportIndex, startAt: localStartAt });
          if (out.done) {
            pushLog("🏁 Promote complete: done=true (single sport)");
            break;
          }
        } else {
          if (out.done) {
            localSportIndex += 1;
            localStartAt = 0;
          } else {
            localStartAt = out.nextStartAt;
          }
          savePromoteCursor({ sportIndex: localSportIndex, startAt: localStartAt });
        }

        await sleep(Math.max(0, Number(promotePauseMs || 0)));
      }

      pushLog(`⏸ Promote ended. Cursor: sportIndex=${localSportIndex} startAt=${localStartAt}`);
    } catch (e) {
      pushLog(`❌ Promote run-until-done exception: ${safeStr(e?.message || e)}`);
    } finally {
      setPromoteBusy(false);
    }
  }
  const lastSavedCursor = useMemo(() => Number(localStorage.getItem(cursorStorageKey) || 0), [cursorStorageKey, startAt]);
  const lastSavedDedupeCursor = useMemo(() => Number(localStorage.getItem(dedupeCursorStorageKey) || 0), [dedupeCursorStorageKey, startAtGroup]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">Checkpointed pipelines with telemetry.</div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
            Profile
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
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
            <Button variant="outline" onClick={() => setShowRecoverBanner(false)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
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
            <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Overview
            </Button>
            <Button variant={tab === "athletics" ? "default" : "outline"} onClick={() => setTab("athletics")} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Athletics
            </Button>
            <Button variant={tab === "camps" ? "default" : "outline"} onClick={() => setTab("camps")} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Camps
            </Button>
            <Button variant={tab === "diagnostics" ? "default" : "outline"} onClick={() => setTab("diagnostics")} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {tab === "overview" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Admin Ops hub</div>
          <div className="text-sm text-gray-700 mt-2">Use Athletics tab for NCAA enrichment + dedupe + unmatched.</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="outline" onClick={() => nav(ROUTES.AdminSeedSchoolsMaster)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Seed Schools (Scorecard)
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.AdminImport)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Admin Import
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.Discover)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Discover
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.AdminFactoryReset)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
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
              <Button variant={dryRun ? "default" : "outline"} onClick={() => setDryRun(true)} disabled={busy || unmatchedBusy || dedupeBusy}>
                Dry run
              </Button>
              <Button variant={!dryRun ? "default" : "outline"} onClick={() => setDryRun(false)} disabled={busy || unmatchedBusy || dedupeBusy}>
                Write
              </Button>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">seasonYear</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={seasonYear} onChange={(e) => setSeasonYear(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">startAt</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={startAt}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value || 0));
                    setStartAt(v);
                    localStorage.setItem(cursorStorageKey, String(v));
                  }}
                  disabled={busy || unmatchedBusy || dedupeBusy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">maxRows</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">confidenceThreshold</span>
                <input className="border rounded px-2 py-1 w-28" type="number" step="0.01" min="0" max="1" value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">throttleMs</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={throttleMs} onChange={(e) => setThrottleMs(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">timeBudgetMs</span>
                <input className="border rounded px-2 py-1 w-28" type="number" value={timeBudgetMs} onChange={(e) => setTimeBudgetMs(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runNextBatch} disabled={busy || unmatchedBusy || dedupeBusy || !adminEnabled}>
                Run next batch
              </Button>
              <Button variant="outline" onClick={resetCursor} disabled={busy || unmatchedBusy || dedupeBusy}>
                Reset cursor
              </Button>
              <Button variant="outline" onClick={() => refreshUnmatched()} disabled={busy || !adminEnabled || unmatchedBusy || dedupeBusy}>
                Refresh Unmatched
              </Button>
            </div>

            <div className="border rounded bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Payload preview (exact request body)</div>
              <pre className="text-xs overflow-auto">{safeJson(payloadPreview)}</pre>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-medium">Run until done</div>

              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">maxBatches</span>
                  <input className="border rounded px-2 py-1 w-24" type="number" min="1" value={maxBatches} onChange={(e) => setMaxBatches(Math.max(1, Number(e.target.value || 1)))} disabled={busy || unmatchedBusy || dedupeBusy} />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">pauseMs</span>
                  <input className="border rounded px-2 py-1 w-24" type="number" min="0" value={pauseMs} onChange={(e) => setPauseMs(Math.max(0, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy} />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">halt if errors &gt;</span>
                  <input className="border rounded px-2 py-1 w-20" type="number" min="0" value={haltOnBatchErrorsOver} onChange={(e) => setHaltOnBatchErrorsOver(Math.max(0, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy} />
                </label>

                <Button onClick={runUntilDone} disabled={busy || unmatchedBusy || dedupeBusy || !adminEnabled || dryRun}>
                  Run until done
                </Button>

                <Button variant="outline" onClick={stopRun} disabled={!busy}>
                  Stop
                </Button>
              </div>

              {dryRun && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Run-until-done is disabled in Dry run. Switch to Write.</div>}

              <div className="text-xs text-gray-600">
                Cursor key: <span className="font-mono">{cursorStorageKey}</span> (persisted)
              </div>
            </div>
          </Card>

          {/* DEDUPE */}
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">AthleticsMembership dedupe sweep</div>
            <div className="text-sm text-gray-600">
              Use this to remove duplicates per <span className="font-mono">source_key</span> safely. Tuned to avoid rate limits.
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button variant={dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(true)} disabled={busy || unmatchedBusy || dedupeBusy}>
                Dry run
              </Button>
              <Button variant={!dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(false)} disabled={busy || unmatchedBusy || dedupeBusy}>
                Write
              </Button>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">org</span>
                <select className="border rounded px-2 py-1" value={dedupeOrg} onChange={(e) => setDedupeOrg(e.target.value)} disabled={busy || unmatchedBusy || dedupeBusy}>
                  <option value="ncaa">ncaa</option>
                  <option value="naia">naia</option>
                  <option value="njcaa">njcaa</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">seasonYear</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={dedupeSeasonYear} onChange={(e) => setDedupeSeasonYear(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">startAtGroup</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={startAtGroup}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value || 0));
                    setStartAtGroup(v);
                    localStorage.setItem(dedupeCursorStorageKey, String(v));
                  }}
                  disabled={busy || unmatchedBusy || dedupeBusy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">maxGroups</span>
                <input className="border rounded px-2 py-1 w-24" type="number" min="1" value={maxGroups} onChange={(e) => setMaxGroups(Math.max(1, Number(e.target.value || 1)))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">maxDelete</span>
                <input className="border rounded px-2 py-1 w-24" type="number" min="0" value={maxDelete} onChange={(e) => setMaxDelete(Math.max(0, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">throttleMs</span>
                <input className="border rounded px-2 py-1 w-24" type="number" min="0" value={dedupeThrottleMs} onChange={(e) => setDedupeThrottleMs(Math.max(0, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">timeBudgetMs</span>
                <input className="border rounded px-2 py-1 w-28" type="number" min="5000" value={dedupeTimeBudgetMs} onChange={(e) => setDedupeTimeBudgetMs(Math.max(5000, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">tries</span>
                <input className="border rounded px-2 py-1 w-20" type="number" min="1" value={dedupeTries} onChange={(e) => setDedupeTries(Math.max(1, Number(e.target.value || 1)))} disabled={busy || unmatchedBusy || dedupeBusy} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runDedupeNext} disabled={busy || unmatchedBusy || dedupeBusy || !adminEnabled}>
                Run dedupe batch
              </Button>
              <Button variant="outline" onClick={resetDedupeCursor} disabled={busy || unmatchedBusy || dedupeBusy}>
                Reset dedupe cursor
              </Button>
              <Button onClick={runDedupeUntilDone} disabled={busy || unmatchedBusy || dedupeBusy || !adminEnabled || dedupeDryRun}>
                Run dedupe until done
              </Button>
            </div>

            {dedupeDryRun && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Run-until-done is disabled in Dry run. Switch to Write.</div>}

            <div className="border rounded bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Dedupe payload preview (exact request body)</div>
              <pre className="text-xs overflow-auto">{safeJson(dedupePayloadPreview)}</pre>
            </div>

            <div className="text-xs text-gray-600">
              Cursor key: <span className="font-mono">{dedupeCursorStorageKey}</span> (persisted)
            </div>
          </Card>

          {/* Unmatched queue */}
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Unmatched queue</div>
                <div className="text-sm text-gray-600">Visibility for noMatch/ambiguous staging rows.</div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">org</span>
                  <select className="border rounded px-2 py-1" value={unmatchedOrg} onChange={(e) => setUnmatchedOrg(e.target.value)} disabled={busy || unmatchedBusy || dedupeBusy}>
                    <option value="ncaa">ncaa</option>
                    <option value="naia">naia</option>
                    <option value="njcaa">njcaa</option>
                    <option value="">(all)</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">sample</span>
                  <input className="border rounded px-2 py-1 w-20" type="number" min="5" max="100" value={unmatchedLimit} onChange={(e) => setUnmatchedLimit(Number(e.target.value || 25))} disabled={busy || unmatchedBusy || dedupeBusy} />
                </label>

                <Button onClick={refreshUnmatched} disabled={busy || !adminEnabled || unmatchedBusy || dedupeBusy}>
                  {unmatchedBusy ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            {unmatchedSummary ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div className="border rounded p-2">
                  <div className="text-gray-600 text-xs">total</div>
                  <div className="font-semibold">{unmatchedSummary.counts.total}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-gray-600 text-xs">no_match</div>
                  <div className="font-semibold">{unmatchedSummary.counts.no_match}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-gray-600 text-xs">ambiguous</div>
                  <div className="font-semibold">{unmatchedSummary.counts.ambiguous}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-gray-600 text-xs">missing_fields</div>
                  <div className="font-semibold">{unmatchedSummary.counts.missing_fields}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-gray-600 text-xs">other</div>
                  <div className="font-semibold">{unmatchedSummary.counts.other}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">Click Refresh to load unmatched counts and samples.</div>
            )}

            <div className="border rounded bg-gray-50 p-2 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="p-2">reason</th>
                    <th className="p-2">raw_school_name</th>
                    <th className="p-2">raw_source_key</th>
                    <th className="p-2">created_at</th>
                    <th className="p-2">source_url</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedSamples.length ? (
                    unmatchedSamples.map((r) => (
                      <tr key={r.id || r.raw_source_key} className="border-t">
                        <td className="p-2 font-mono">{safeStr(r.reason)}</td>
                        <td className="p-2">{safeStr(r.raw_school_name)}</td>
                        <td className="p-2 font-mono">{safeStr(r.raw_source_key)}</td>
                        <td className="p-2 font-mono">{safeStr(r.created_at)}</td>
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

            <div className="text-xs text-gray-600">
              Note: staging rows are written by the function when <span className="font-mono">dryRun=false</span> and a row is <span className="font-mono">no_match</span> or <span className="font-mono">ambiguous</span>.
            </div>
          </Card>
        </div>
      )}

      {tab === "camps" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Promote Camps: CampDemo → Camp</div>
            <div className="text-sm text-gray-700">
              Paid Discover reads <span className="font-mono">Camp</span>. Today your data is in <span className="font-mono">CampDemo</span>. This runner promotes in safe batches using the server function <span className="font-mono">promoteCampsFromCampDemo</span>.
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button variant={promoteDryRun ? "default" : "outline"} onClick={() => setPromoteDryRun(true)} disabled={promoteBusy || !adminEnabled}>
                DryRun
              </Button>
              <Button variant={!promoteDryRun ? "default" : "outline"} onClick={() => setPromoteDryRun(false)} disabled={promoteBusy || !adminEnabled}>
                Write
              </Button>

              <Button variant="outline" onClick={() => (stopRunRef.current = true)} disabled={!promoteBusy}>
                Stop
              </Button>
              <Button variant="outline" onClick={resetPromoteCursor} disabled={promoteBusy}>
                Reset cursor
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">Batch size</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteBatchSize} onChange={(e) => setPromoteBatchSize(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">Throttle ms</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteThrottleMs} onChange={(e) => setPromoteThrottleMs(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">Time budget ms</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteTimeBudgetMs} onChange={(e) => setPromoteTimeBudgetMs(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">Max batches</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteMaxBatches} onChange={(e) => setPromoteMaxBatches(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">Pause ms</span>
                <input className="border rounded px-2 py-1" type="number" value={promotePauseMs} onChange={(e) => setPromotePauseMs(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">Halt if errors &gt;</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteHaltOnErrorsOver} onChange={(e) => setPromoteHaltOnErrorsOver(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-gray-600">Only sportId (optional)</span>
                <input className="border rounded px-2 py-1 font-mono" placeholder="(blank = run all sports)" value={promoteOnlySportId} onChange={(e) => setPromoteOnlySportId(e.target.value)} disabled={promoteBusy} />
              </label>
            </div>

            <div className="text-xs text-gray-600">
              Cursor: sportIndex=<span className="font-mono">{String(promoteCursor.sportIndex)}</span> startAt=<span className="font-mono">{String(promoteCursor.startAt)}</span> sportsLoaded=<span className="font-mono">{String(Array.isArray(sportsList) ? sportsList.length : 0)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runPromoteNext} disabled={promoteBusy || !adminEnabled}>
                Run next batch
              </Button>
              <Button variant="outline" onClick={runPromoteUntilDone} disabled={promoteBusy || !adminEnabled}>
                Run until done
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="font-medium">Payload preview</div>
                <pre className="text-xs overflow-auto mt-2">{safeJson(promotePayloadPreview)}</pre>
              </Card>
              <Card className="p-3">
                <div className="font-medium">Last result</div>
                <pre className="text-xs overflow-auto mt-2">{safeJson(promoteStatus || { note: "(none yet)" })}</pre>
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
            <Button variant="outline" onClick={() => setShowRecoverBanner(true)} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
              Show recover info
            </Button>
            <Button variant="outline" onClick={clearLogs} disabled={busy || unmatchedBusy || dedupeBusy || promoteBusy}>
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
