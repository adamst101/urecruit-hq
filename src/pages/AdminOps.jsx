// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";
const NCAA_CURSOR_KEY_PREFIX = "adminops_ncaa_cursor_v2:";
const ADMINOPS_SESSION_STATE_KEY = "adminops_session_state_v2";

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
  const [throttleMs, setThrottleMs] = useState(5); // function param: throttleMs
  const [timeBudgetMs, setTimeBudgetMs] = useState(20000); // function param: timeBudgetMs
  const [sourcePlatform] = useState("ncaa-api");

  // Run-until-done
  const [maxBatches, setMaxBatches] = useState(20);
  const [pauseMs, setPauseMs] = useState(1500);
  const [haltOnBatchErrorsOver, setHaltOnBatchErrorsOver] = useState(60);

  // Unmatched queue visibility
  const [unmatchedBusy, setUnmatchedBusy] = useState(false);
  const [unmatchedSummary, setUnmatchedSummary] = useState(null);
  const [unmatchedSamples, setUnmatchedSamples] = useState([]);
  const [unmatchedOrg, setUnmatchedOrg] = useState("ncaa"); // default for this vertical slice
  const [unmatchedLimit, setUnmatchedLimit] = useState(25);

  // Dedupe controls
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [dedupeOrg, setDedupeOrg] = useState("ncaa");
  const [dedupeSeasonYear, setDedupeSeasonYear] = useState(new Date().getFullYear());
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeMaxDelete, setDedupeMaxDelete] = useState(5000);

  // Optional staging cleanup (Unmatched)
  const [purgeUnmatchedBusy, setPurgeUnmatchedBusy] = useState(false);
  const [purgeUnmatchedOrg, setPurgeUnmatchedOrg] = useState("ncaa");
  const [purgeUnmatchedMaxDelete, setPurgeUnmatchedMaxDelete] = useState(2000);

  const cursorStorageKey = useMemo(() => `${NCAA_CURSOR_KEY_PREFIX}${seasonYear}`, [seasonYear]);
  const [hasRecoveredSession, setHasRecoveredSession] = useState(false);
  const [showRecoverBanner, setShowRecoverBanner] = useState(false);

  // Load admin mode + restore session
  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");
    const ss = loadSessionState();
    if (ss && !hasRecoveredSession) {
      if (Array.isArray(ss.log)) setLog(ss.log);
      if (typeof ss.tab === "string") setTab(ss.tab);

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

      // unmatched panel settings
      if (typeof ss.unmatchedOrg === "string") setUnmatchedOrg(ss.unmatchedOrg);
      if (Number.isFinite(ss.unmatchedLimit)) setUnmatchedLimit(ss.unmatchedLimit);

      // dedupe panel settings
      if (typeof ss.dedupeOrg === "string") setDedupeOrg(ss.dedupeOrg);
      if (Number.isFinite(ss.dedupeSeasonYear)) setDedupeSeasonYear(ss.dedupeSeasonYear);
      if (typeof ss.dedupeDryRun === "boolean") setDedupeDryRun(ss.dedupeDryRun);
      if (Number.isFinite(ss.dedupeMaxDelete)) setDedupeMaxDelete(ss.dedupeMaxDelete);

      // purge unmatched settings
      if (typeof ss.purgeUnmatchedOrg === "string") setPurgeUnmatchedOrg(ss.purgeUnmatchedOrg);
      if (Number.isFinite(ss.purgeUnmatchedMaxDelete)) setPurgeUnmatchedMaxDelete(ss.purgeUnmatchedMaxDelete);

      setHasRecoveredSession(true);
      setShowRecoverBanner(true);
    }
  }, [hasRecoveredSession]);

  // Load cursor per season
  useEffect(() => {
    const saved = Number(localStorage.getItem(cursorStorageKey) || 0);
    if (Number.isFinite(saved)) setStartAt(saved);
  }, [cursorStorageKey]);

  // Persist session state
  useEffect(() => {
    saveSessionState({
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

      dedupeOrg,
      dedupeSeasonYear,
      dedupeDryRun,
      dedupeMaxDelete,

      purgeUnmatchedOrg,
      purgeUnmatchedMaxDelete,

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
    dedupeOrg,
    dedupeSeasonYear,
    dedupeDryRun,
    dedupeMaxDelete,
    purgeUnmatchedOrg,
    purgeUnmatchedMaxDelete,
  ]);

  // Auto-scroll log
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Warn on refresh while busy
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!busy && !unmatchedBusy && !dedupeBusy && !purgeUnmatchedBusy) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy, unmatchedBusy, dedupeBusy, purgeUnmatchedBusy]);

  function pushLog(line) {
    setLog((prev) => {
      const next = [...prev, `[${new Date().toISOString()}] ${line}`];
      if (next.length > 800) return next.slice(next.length - 800);
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

        // advance cursor defensively
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

      const counts = {
        total: filtered.length,
        no_match: 0,
        ambiguous: 0,
        missing_fields: 0,
        other: 0,
      };

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

  async function invokeMembershipDedupe() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (!base44?.functions?.invoke) return pushLog("❌ base44.functions.invoke is not available.");

    setDedupeBusy(true);
    try {
      const payload = {
        dryRun: !!dedupeDryRun,
        org: dedupeOrg || null,
        seasonYear: Number.isFinite(dedupeSeasonYear) ? Number(dedupeSeasonYear) : null,
        maxDelete: Math.max(0, Number(dedupeMaxDelete || 0)),
      };

      pushLog(`AthleticsMembership dedupe sweep start. dryRun=${payload.dryRun} org=${payload.org || "ALL"} seasonYear=${payload.seasonYear ?? "ALL"} maxDelete=${payload.maxDelete}`);

      const raw = await invokeWithRetry(
        () => base44.functions.invoke("athleticsMembershipDedupeSweep", payload),
        {
          tries: 5,
          baseDelayMs: 800,
          jitterMs: 250,
          onRetry: ({ attempt, tries, backoffMs, error }) => pushLog(`↻ dedupe retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`),
        }
      );

      const res = unwrapInvokeResponse(raw);
      pushLog(`dedupe invoke data:\n${truncate(res, 1800)}`);

      if (res?.ok !== true) {
        pushLog(`❌ Dedupe failed: ${safeStr(res?.error || "no ok=true")}`);
        return;
      }

      const st = res?.stats || {};
      pushLog(`✅ Dedupe complete. scanned=${st.scanned} groups=${st.groups} dupGroups=${st.dupGroups} kept=${st.kept} deleted=${st.deleted} errors=${st.errors} dryRun=${!!dedupeDryRun}`);
    } catch (e) {
      pushLog(`❌ Dedupe exception: ${safeStr(e?.message || e)}`);
    } finally {
      setDedupeBusy(false);
    }
  }

  async function purgeUnmatchedRows() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    const Unmatched = pickEntityFromSDK("UnmatchedAthleticsRow");
    if (!Unmatched) {
      pushLog("❌ UnmatchedAthleticsRow entity not found on client. Check src/api/entities.js export.");
      return;
    }

    setPurgeUnmatchedBusy(true);
    try {
      const all = await Unmatched.filter({});
      const rows = Array.isArray(all) ? all : [];

      const orgFilter = lc(purgeUnmatchedOrg || "");
      const filtered = orgFilter ? rows.filter((r) => lc(r?.org) === orgFilter) : rows;

      const maxDel = Math.max(0, Number(purgeUnmatchedMaxDelete || 0));
      const toDelete = filtered.slice(0, maxDel);

      pushLog(`Unmatched purge start. org=${orgFilter || "ALL"} candidates=${filtered.length} deleting=${toDelete.length}`);

      let deleted = 0;
      let errors = 0;

      for (const r of toDelete) {
        const id = getId(r);
        if (!id) continue;
        try {
          await Unmatched.delete(id);
          deleted += 1;
          if (deleted % 50 === 0) await sleep(50);
        } catch (e) {
          errors += 1;
          if (errors <= 10) pushLog(`purge delete failed id=${id}: ${safeStr(e?.message || e)}`);
        }
      }

      pushLog(`✅ Unmatched purge complete. deleted=${deleted} errors=${errors}`);
      await refreshUnmatched();
    } catch (e) {
      pushLog(`❌ Unmatched purge exception: ${safeStr(e?.message || e)}`);
    } finally {
      setPurgeUnmatchedBusy(false);
    }
  }

  const lastSavedCursor = useMemo(() => Number(localStorage.getItem(cursorStorageKey) || 0), [cursorStorageKey, startAt]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">Checkpointed pipelines with telemetry.</div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
            Profile
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
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
                Cursor (season {seasonYear}) last saved at <span className="font-mono">{String(lastSavedCursor || 0)}</span>.
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowRecoverBanner(false)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
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
            <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Overview
            </Button>
            <Button variant={tab === "athletics" ? "default" : "outline"} onClick={() => setTab("athletics")} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Athletics
            </Button>
            <Button variant={tab === "diagnostics" ? "default" : "outline"} onClick={() => setTab("diagnostics")} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {tab === "overview" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Admin Ops hub</div>
          <div className="text-sm text-gray-700 mt-2">Use Athletics tab for NCAA enrichment batches, dedupe, and unmatched visibility.</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="outline" onClick={() => nav(ROUTES.AdminSeedSchoolsMaster)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Seed Schools (Scorecard)
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.AdminImport)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Admin Import
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.Discover)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Discover
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.AdminFactoryReset)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Factory Reset
            </Button>
          </div>
        </Card>
      )}

      {tab === "athletics" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">NCAA enrichment (batch + resume)</div>
            <div className="text-sm text-gray-600">Labels match function params exactly.</div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button variant={dryRun ? "default" : "outline"} onClick={() => setDryRun(true)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                Dry run
              </Button>
              <Button variant={!dryRun ? "default" : "outline"} onClick={() => setDryRun(false)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                Write
              </Button>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">seasonYear</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={seasonYear} onChange={(e) => setSeasonYear(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
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
                  disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">maxRows</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">confidenceThreshold</span>
                <input className="border rounded px-2 py-1 w-28" type="number" step="0.01" min="0" max="1" value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">throttleMs</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={throttleMs} onChange={(e) => setThrottleMs(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">timeBudgetMs</span>
                <input className="border rounded px-2 py-1 w-28" type="number" value={timeBudgetMs} onChange={(e) => setTimeBudgetMs(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runNextBatch} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy || !adminEnabled}>
                Run next batch
              </Button>
              <Button variant="outline" onClick={resetCursor} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                Reset cursor
              </Button>
              <Button variant="outline" onClick={() => refreshUnmatched()} disabled={busy || dedupeBusy || purgeUnmatchedBusy || !adminEnabled || unmatchedBusy}>
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
                  <input className="border rounded px-2 py-1 w-24" type="number" min="1" value={maxBatches} onChange={(e) => setMaxBatches(Math.max(1, Number(e.target.value || 1)))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">pauseMs</span>
                  <input className="border rounded px-2 py-1 w-24" type="number" min="0" value={pauseMs} onChange={(e) => setPauseMs(Math.max(0, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">halt if errors &gt;</span>
                  <input className="border rounded px-2 py-1 w-20" type="number" min="0" value={haltOnBatchErrorsOver} onChange={(e) => setHaltOnBatchErrorsOver(Math.max(0, Number(e.target.value || 0)))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <Button onClick={runUntilDone} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy || !adminEnabled || dryRun}>
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

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Dedup / repair tools</div>
            <div className="text-sm text-gray-600">
              Use this if Base44 cannot enforce Unique constraints on <span className="font-mono">source_key</span>.
            </div>

            <div className="border rounded bg-gray-50 p-3 space-y-3">
              <div className="text-sm font-medium">AthleticsMembership: dedupe sweep (by source_key)</div>

              <div className="flex flex-wrap gap-3 items-center">
                <Button variant={dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(true)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                  Dry run
                </Button>
                <Button variant={!dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(false)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                  Execute
                </Button>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">org</span>
                  <select className="border rounded px-2 py-1" value={dedupeOrg} onChange={(e) => setDedupeOrg(e.target.value)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                    <option value="ncaa">ncaa</option>
                    <option value="naia">naia</option>
                    <option value="njcaa">njcaa</option>
                    <option value="">(all)</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">seasonYear</span>
                  <input className="border rounded px-2 py-1 w-24" type="number" value={dedupeSeasonYear} onChange={(e) => setDedupeSeasonYear(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">maxDelete</span>
                  <input className="border rounded px-2 py-1 w-28" type="number" value={dedupeMaxDelete} onChange={(e) => setDedupeMaxDelete(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <Button onClick={invokeMembershipDedupe} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy || !adminEnabled}>
                  {dedupeBusy ? "Running..." : dedupeDryRun ? "Dedupe dry run" : "Run dedupe"}
                </Button>
              </div>

              <div className="text-xs text-gray-600">
                Function: <span className="font-mono">athleticsMembershipDedupeSweep</span> (server-side). Keeps newest row per <span className="font-mono">source_key</span>.
              </div>
            </div>

            <div className="border rounded bg-gray-50 p-3 space-y-3">
              <div className="text-sm font-medium">UnmatchedAthleticsRow: purge (optional)</div>
              <div className="text-xs text-gray-600">Use this when staging is massive and you want a clean re-run (after you’ve shipped better matching).</div>

              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">org</span>
                  <select className="border rounded px-2 py-1" value={purgeUnmatchedOrg} onChange={(e) => setPurgeUnmatchedOrg(e.target.value)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                    <option value="ncaa">ncaa</option>
                    <option value="naia">naia</option>
                    <option value="njcaa">njcaa</option>
                    <option value="">(all)</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">maxDelete</span>
                  <input className="border rounded px-2 py-1 w-28" type="number" value={purgeUnmatchedMaxDelete} onChange={(e) => setPurgeUnmatchedMaxDelete(Number(e.target.value || 0))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <Button variant="outline" onClick={purgeUnmatchedRows} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy || !adminEnabled}>
                  {purgeUnmatchedBusy ? "Purging..." : "Purge unmatched"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Unmatched queue</div>
                <div className="text-sm text-gray-600">Visibility for noMatch/ambiguous staging rows.</div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">org</span>
                  <select className="border rounded px-2 py-1" value={unmatchedOrg} onChange={(e) => setUnmatchedOrg(e.target.value)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
                    <option value="ncaa">ncaa</option>
                    <option value="naia">naia</option>
                    <option value="njcaa">njcaa</option>
                    <option value="">(all)</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">sample</span>
                  <input className="border rounded px-2 py-1 w-20" type="number" min="5" max="100" value={unmatchedLimit} onChange={(e) => setUnmatchedLimit(Number(e.target.value || 25))} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy} />
                </label>

                <Button onClick={refreshUnmatched} disabled={busy || !adminEnabled || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
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
            <Button variant="outline" onClick={() => setShowRecoverBanner(true)} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Show recover info
            </Button>
            <Button variant="outline" onClick={clearLogs} disabled={busy || unmatchedBusy || dedupeBusy || purgeUnmatchedBusy}>
              Clear
            </Button>
          </div>
        </div>
        <div ref={logRef} className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto" style={{ maxHeight: 420 }}>
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
