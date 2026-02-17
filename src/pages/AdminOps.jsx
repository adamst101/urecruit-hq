// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";

// Cursor persisted long-term (so you can pick up tomorrow)
const NCAA_CURSOR_KEY_PREFIX = "adminops_ncaa_cursor_v2:";

// Session-only persistence (survives refresh, clears when tab closes)
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
function asArray(x) {
  return Array.isArray(x) ? x : [];
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

function pickEntityFromSDK(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
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

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("overview");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // "stop" flag for run-until-done loop (ref survives rerenders)
  const stopRunRef = useRef(false);

  // Athletics sync controls
  const [athleticsDryRun, setAthleticsDryRun] = useState(true);
  const [ncaaSeasonYear, setNcaaSeasonYear] = useState(new Date().getFullYear());
  const [ncaaMaxRows, setNcaaMaxRows] = useState(250);
  const [ncaaConfidenceThreshold, setNcaaConfidenceThreshold] = useState(0.92);
  const [ncaaThrottleMs, setNcaaThrottleMs] = useState(2);
  const [ncaaTimeBudgetMs, setNcaaTimeBudgetMs] = useState(20000);

  // Run-until-done controls
  const [runUntilDoneMaxBatches, setRunUntilDoneMaxBatches] = useState(20);
  const [runUntilDonePauseMs, setRunUntilDonePauseMs] = useState(900);

  const cursorStorageKey = useMemo(() => `${NCAA_CURSOR_KEY_PREFIX}${ncaaSeasonYear}`, [ncaaSeasonYear]);
  const [ncaaStartAt, setNcaaStartAt] = useState(0);

  // Recovery UX
  const [hasRecoveredSession, setHasRecoveredSession] = useState(false);
  const [showRecoverBanner, setShowRecoverBanner] = useState(false);

  // Initial load: admin mode + restore session state (logs + settings)
  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");

    const ss = loadSessionState();
    if (ss && !hasRecoveredSession) {
      // Restore logs + settings
      if (Array.isArray(ss.log)) setLog(ss.log);

      if (typeof ss.tab === "string") setTab(ss.tab);

      if (typeof ss.athleticsDryRun === "boolean") setAthleticsDryRun(ss.athleticsDryRun);
      if (Number.isFinite(ss.ncaaSeasonYear)) setNcaaSeasonYear(ss.ncaaSeasonYear);
      if (Number.isFinite(ss.ncaaMaxRows)) setNcaaMaxRows(ss.ncaaMaxRows);
      if (Number.isFinite(ss.ncaaConfidenceThreshold)) setNcaaConfidenceThreshold(ss.ncaaConfidenceThreshold);
      if (Number.isFinite(ss.ncaaThrottleMs)) setNcaaThrottleMs(ss.ncaaThrottleMs);
      if (Number.isFinite(ss.ncaaTimeBudgetMs)) setNcaaTimeBudgetMs(ss.ncaaTimeBudgetMs);

      if (Number.isFinite(ss.runUntilDoneMaxBatches)) setRunUntilDoneMaxBatches(ss.runUntilDoneMaxBatches);
      if (Number.isFinite(ss.runUntilDonePauseMs)) setRunUntilDonePauseMs(ss.runUntilDonePauseMs);

      // startAt is special: prefer cursor from localStorage per-season (source of truth),
      // but if session had a newer manual edit, keep it.
      if (Number.isFinite(ss.ncaaStartAt)) setNcaaStartAt(ss.ncaaStartAt);

      setHasRecoveredSession(true);
      setShowRecoverBanner(true);
    }
  }, [hasRecoveredSession]);

  // Load cursor per season (localStorage is source of truth for resume)
  useEffect(() => {
    const saved = Number(localStorage.getItem(cursorStorageKey) || 0);
    if (Number.isFinite(saved)) setNcaaStartAt(saved);
  }, [cursorStorageKey]);

  // Persist session state on any meaningful change (logs + inputs)
  useEffect(() => {
    saveSessionState({
      tab,
      log,
      athleticsDryRun,
      ncaaSeasonYear,
      ncaaMaxRows,
      ncaaConfidenceThreshold,
      ncaaThrottleMs,
      ncaaTimeBudgetMs,
      runUntilDoneMaxBatches,
      runUntilDonePauseMs,
      ncaaStartAt,
      savedAt: new Date().toISOString(),
    });
  }, [
    tab,
    log,
    athleticsDryRun,
    ncaaSeasonYear,
    ncaaMaxRows,
    ncaaConfidenceThreshold,
    ncaaThrottleMs,
    ncaaTimeBudgetMs,
    runUntilDoneMaxBatches,
    runUntilDonePauseMs,
    ncaaStartAt,
  ]);

  // Auto-scroll log view
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Prevent accidental refresh/close while busy
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!busy) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  function pushLog(line) {
    setLog((prev) => {
      const next = [...prev, `[${new Date().toISOString()}] ${line}`];
      // keep log bounded to avoid huge sessionStorage
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
    setNcaaStartAt(v);
  }

  function resetCursor() {
    localStorage.setItem(cursorStorageKey, "0");
    setNcaaStartAt(0);
    pushLog(`NCAA cursor reset for season ${ncaaSeasonYear}. startAt=0`);
  }

  async function invokeNcaaOnce({ startAtOverride } = {}) {
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available in this environment.");
      return { ok: false, error: "invoke not available" };
    }

    const startAt = Number.isFinite(startAtOverride) ? Math.max(0, Number(startAtOverride)) : ncaaStartAt;

    const payload = {
      dryRun: athleticsDryRun,
      seasonYear: ncaaSeasonYear,
      startAt,
      maxRows: ncaaMaxRows,
      confidenceThreshold: ncaaConfidenceThreshold,
      throttleMs: ncaaThrottleMs,
      timeBudgetMs: ncaaTimeBudgetMs,
      sourcePlatform: "ncaa-api",
    };

    pushLog(
      `NCAA sync start. DryRun=${payload.dryRun} seasonYear=${payload.seasonYear} startAt=${payload.startAt} maxRows=${payload.maxRows} threshold=${payload.confidenceThreshold} throttleMs=${payload.throttleMs} timeBudgetMs=${payload.timeBudgetMs}`
    );

    const raw = await base44.functions.invoke("ncaaMembershipSync", payload);
    const res = unwrapInvokeResponse(raw);

    pushLog(`invoke data:\n${truncate(res, 1200)}`);

    if (res?.error) {
      pushLog(`❌ NCAA sync failed: ${safeStr(res.error)}`);
      return { ok: false, error: safeStr(res.error), res };
    }
    if (res?.ok !== true) {
      pushLog(`❌ NCAA sync failed (no ok=true).`);
      return { ok: false, error: "no ok=true", res };
    }

    const st = res?.stats || {};
    const nextStartAt = Number(res?.nextStartAt ?? startAt);
    const done = !!res?.done;
    const elapsedMs = Number(res?.debug?.elapsedMs || 0);
    const stoppedEarly = !!res?.debug?.stoppedEarly;

    pushLog(
      `✅ NCAA sync complete. processed=${st.processed} matched=${st.matched} created=${st.created} updated=${st.updated} noMatch=${st.noMatch} ambiguous=${st.ambiguous} missingName=${st.missingName} errors=${st.errors} nextStartAt=${nextStartAt} done=${done} elapsedMs=${elapsedMs} stoppedEarly=${stoppedEarly}`
    );

    // persist cursor for resume (dry run included so operator can iterate)
    saveCursor(nextStartAt);

    return { ok: true, res, nextStartAt, done, stats: st, elapsedMs, stoppedEarly };
  }

  async function runNcaaNextBatch() {
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

  async function runNcaaUntilDone() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (athleticsDryRun) return pushLog("❌ Run-until-done is disabled in DryRun. Switch to Write.");

    // sanity: entity exists (optional)
    const AthleticsMembership = pickEntityFromSDK("AthleticsMembership");
    if (!AthleticsMembership) pushLog("⚠️ AthleticsMembership entity not found on client; function may still work, continuing.");

    setBusy(true);
    stopRunRef.current = false;

    try {
      pushLog(
        `▶ Run until done: maxBatches=${runUntilDoneMaxBatches} pauseMs=${runUntilDonePauseMs} startingCursor=${ncaaStartAt}`
      );

      let batches = 0;
      let done = false;

      while (!done && batches < runUntilDoneMaxBatches) {
        if (stopRunRef.current) {
          pushLog("⏹ Stopped by operator.");
          break;
        }

        batches += 1;
        pushLog(`--- Batch ${batches} ---`);

        const out = await invokeNcaaOnce();
        if (!out?.ok) {
          pushLog(`❌ Batch ${batches} failed. Halting run-until-done.`);
          break;
        }

        done = !!out.done;

        if (!done && runUntilDonePauseMs > 0) {
          await sleep(runUntilDonePauseMs);
        }
      }

      if (done) {
        pushLog("🏁 NCAA run-until-done complete: done=true");
        pushLog("Next: run once from startAt=0 to prove idempotency (created≈0, updated>0).");
      } else if (batches >= runUntilDoneMaxBatches) {
        pushLog(`⏸ Reached maxBatches=${runUntilDoneMaxBatches}. Cursor saved at startAt=${ncaaStartAt}. Run again to continue.`);
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
    pushLog("Logs cleared.");
  }

  const lastSavedCursor = useMemo(() => {
    const v = Number(localStorage.getItem(cursorStorageKey) || 0);
    return Number.isFinite(v) ? v : 0;
  }, [cursorStorageKey, ncaaStartAt]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">Checkpointed pipelines with telemetry.</div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)} disabled={busy}>
            Profile
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)} disabled={busy}>
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} disabled={busy}>
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
                Cursor (season {ncaaSeasonYear}) last saved at <span className="font-mono">{lastSavedCursor}</span>. Logs and settings restored from session.
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowRecoverBanner(false)} disabled={busy}>
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
            <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} disabled={busy}>
              Overview
            </Button>
            <Button variant={tab === "athletics" ? "default" : "outline"} onClick={() => setTab("athletics")} disabled={busy}>
              Athletics
            </Button>
            <Button variant={tab === "diagnostics" ? "default" : "outline"} onClick={() => setTab("diagnostics")} disabled={busy}>
              Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {tab === "overview" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Admin Ops hub</div>
          <div className="text-sm text-gray-700 mt-2">Use Athletics tab for NCAA enrichment batches.</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="outline" onClick={() => nav(ROUTES.AdminSeedSchoolsMaster)} disabled={busy}>
              Seed Schools (Scorecard)
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.AdminImport)} disabled={busy}>
              Admin Import
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.Discover)} disabled={busy}>
              Discover
            </Button>
            <Button variant="outline" onClick={() => nav(ROUTES.AdminFactoryReset)} disabled={busy}>
              Factory Reset
            </Button>
          </div>
        </Card>
      )}

      {tab === "athletics" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">NCAA enrichment (batch + resume)</div>
            <div className="text-sm text-gray-600">
              Cursor uses <span className="font-mono">startAt</span> and saves <span className="font-mono">nextStartAt</span> per season.
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button variant={athleticsDryRun ? "default" : "outline"} onClick={() => setAthleticsDryRun(true)} disabled={busy}>
                Dry run
              </Button>
              <Button variant={!athleticsDryRun ? "default" : "outline"} onClick={() => setAthleticsDryRun(false)} disabled={busy}>
                Write
              </Button>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Season</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={ncaaSeasonYear}
                  onChange={(e) => setNcaaSeasonYear(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">startAt</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={ncaaStartAt}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value || 0));
                    setNcaaStartAt(v);
                    // persist manual edits immediately so refresh doesn’t lose them
                    localStorage.setItem(cursorStorageKey, String(v));
                  }}
                  disabled={busy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">batch</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={ncaaMaxRows} onChange={(e) => setNcaaMaxRows(Number(e.target.value || 0))} disabled={busy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">threshold</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={ncaaConfidenceThreshold}
                  onChange={(e) => setNcaaConfidenceThreshold(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">throttle</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={ncaaThrottleMs} onChange={(e) => setNcaaThrottleMs(Number(e.target.value || 0))} disabled={busy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">budget</span>
                <input className="border rounded px-2 py-1 w-28" type="number" value={ncaaTimeBudgetMs} onChange={(e) => setNcaaTimeBudgetMs(Number(e.target.value || 0))} disabled={busy} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runNcaaNextBatch} disabled={busy || !adminEnabled}>
                Run next batch
              </Button>
              <Button variant="outline" onClick={resetCursor} disabled={busy}>
                Reset cursor
              </Button>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-medium">Run until done</div>
              <div className="text-xs text-gray-600">
                Loops batches until <span className="font-mono">done=true</span>, or max batches reached, or you stop. Disabled in Dry run.
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">maxBatches</span>
                  <input
                    className="border rounded px-2 py-1 w-24"
                    type="number"
                    min="1"
                    value={runUntilDoneMaxBatches}
                    onChange={(e) => setRunUntilDoneMaxBatches(Math.max(1, Number(e.target.value || 1)))}
                    disabled={busy}
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">pauseMs</span>
                  <input
                    className="border rounded px-2 py-1 w-24"
                    type="number"
                    min="0"
                    value={runUntilDonePauseMs}
                    onChange={(e) => setRunUntilDonePauseMs(Math.max(0, Number(e.target.value || 0)))}
                    disabled={busy}
                  />
                </label>

                <Button onClick={runNcaaUntilDone} disabled={busy || !adminEnabled || athleticsDryRun}>
                  Run until done
                </Button>

                <Button variant="outline" onClick={stopRun} disabled={!busy}>
                  Stop
                </Button>
              </div>

              {athleticsDryRun && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Run-until-done is disabled in Dry run. Switch to Write to use it.
                </div>
              )}
            </div>

            <div className="text-xs text-gray-600">
              Cursor key: <span className="font-mono">{cursorStorageKey}</span> (persisted)
            </div>
          </Card>
        </div>
      )}

      {tab === "diagnostics" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Entities available</div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.keys(base44?.entities || {}).sort().map((k) => (
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
            <Button variant="outline" onClick={() => setShowRecoverBanner(true)} disabled={busy}>
              Show recover info
            </Button>
            <Button variant="outline" onClick={clearLogs} disabled={busy}>
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
