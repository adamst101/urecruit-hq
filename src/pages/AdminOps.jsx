// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";
const ADMINOPS_SESSION_STATE_KEY = "adminops_session_state_v4";

// Promote cursor + last-run metadata
const PROMOTE_CURSOR_KEY = "adminops_promote_camps_cursor_v3";
const PROMOTE_LASTRUN_KEY = "adminops_promote_camps_lastRun_v1";

const ROUTES = {
  Workspace: "/Workspace",
  Discover: "/Discover",
  Profile: "/Profile",
  AdminImport: "/AdminImport",
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
function isRetryableInvokeError(e) {
  const msg = lc(e?.message || e);
  return (
    msg.includes("status code 502") ||
    msg.includes("status code 503") ||
    msg.includes("status code 504") ||
    msg.includes("status code 429") ||
    msg.includes("rate limit")
  );
}
async function invokeWithRetry(invokeFn, { tries = 6, baseDelayMs = 800, jitterMs = 250, onRetry } = {}) {
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

  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  const stopRunRef = useRef(false);

  // Camps promotion controls
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteDryRun, setPromoteDryRun] = useState(true);
  const [promoteUseAll, setPromoteUseAll] = useState(true); // ✅ recommended default
  const [promoteOnlySportId, setPromoteOnlySportId] = useState("");
  const [promoteBatchSize, setPromoteBatchSize] = useState(600);
  const [promoteThrottleMs, setPromoteThrottleMs] = useState(8);
  const [promoteTimeBudgetMs, setPromoteTimeBudgetMs] = useState(22000);
  const [promotePauseMs, setPromotePauseMs] = useState(350);
  const [promoteMaxBatches, setPromoteMaxBatches] = useState(60);
  const [promoteHaltOnErrorsOver, setPromoteHaltOnErrorsOver] = useState(250);

  const [promoteCursor, setPromoteCursor] = useState({ startAt: 0 });
  const [promoteStatus, setPromoteStatus] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  // Camp health check
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthSeasonYear, setHealthSeasonYear] = useState(new Date().getFullYear());
  const [healthSportId, setHealthSportId] = useState("");
  const [healthResult, setHealthResult] = useState(null);

  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");

    // Restore cursor + last run
    try {
      const raw = localStorage.getItem(PROMOTE_CURSOR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPromoteCursor({ startAt: Math.max(0, Number(parsed?.startAt ?? 0)) });
      }
    } catch {
      // ignore
    }

    try {
      const raw = localStorage.getItem(PROMOTE_LASTRUN_KEY);
      if (raw) setLastRun(JSON.parse(raw));
    } catch {
      // ignore
    }

    const ss = loadSessionState();
    if (ss) {
      if (typeof ss.tab === "string") setTab(ss.tab);
      if (Array.isArray(ss.log)) setLog(ss.log);

      if (typeof ss.promoteDryRun === "boolean") setPromoteDryRun(ss.promoteDryRun);
      if (typeof ss.promoteUseAll === "boolean") setPromoteUseAll(ss.promoteUseAll);
      if (typeof ss.promoteOnlySportId === "string") setPromoteOnlySportId(ss.promoteOnlySportId);
      if (Number.isFinite(ss.promoteBatchSize)) setPromoteBatchSize(ss.promoteBatchSize);
      if (Number.isFinite(ss.promoteThrottleMs)) setPromoteThrottleMs(ss.promoteThrottleMs);
      if (Number.isFinite(ss.promoteTimeBudgetMs)) setPromoteTimeBudgetMs(ss.promoteTimeBudgetMs);
      if (Number.isFinite(ss.promotePauseMs)) setPromotePauseMs(ss.promotePauseMs);
      if (Number.isFinite(ss.promoteMaxBatches)) setPromoteMaxBatches(ss.promoteMaxBatches);
      if (Number.isFinite(ss.promoteHaltOnErrorsOver)) setPromoteHaltOnErrorsOver(ss.promoteHaltOnErrorsOver);

      if (Number.isFinite(ss.healthSeasonYear)) setHealthSeasonYear(ss.healthSeasonYear);
      if (typeof ss.healthSportId === "string") setHealthSportId(ss.healthSportId);
    }
  }, []);

  useEffect(() => {
    saveSessionState({
      tab,
      log,
      promoteDryRun,
      promoteUseAll,
      promoteOnlySportId,
      promoteBatchSize,
      promoteThrottleMs,
      promoteTimeBudgetMs,
      promotePauseMs,
      promoteMaxBatches,
      promoteHaltOnErrorsOver,
      healthSeasonYear,
      healthSportId,
      savedAt: new Date().toISOString(),
    });
  }, [
    tab,
    log,
    promoteDryRun,
    promoteUseAll,
    promoteOnlySportId,
    promoteBatchSize,
    promoteThrottleMs,
    promoteTimeBudgetMs,
    promotePauseMs,
    promoteMaxBatches,
    promoteHaltOnErrorsOver,
    healthSeasonYear,
    healthSportId,
  ]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function pushLog(line) {
    setLog((prev) => {
      const next = [...prev, `[${new Date().toISOString()}] ${line}`];
      return next.length > 900 ? next.slice(next.length - 900) : next;
    });
  }

  function toggleAdminMode() {
    const next = !adminEnabled;
    localStorage.setItem(ADMIN_MODE_KEY, next ? "true" : "false");
    setAdminEnabled(next);
    pushLog(`Admin Mode ${next ? "ENABLED" : "DISABLED"}`);
  }

  function savePromoteCursor(next) {
    const v = { startAt: Math.max(0, Number(next?.startAt ?? 0)) };
    try {
      localStorage.setItem(PROMOTE_CURSOR_KEY, JSON.stringify(v));
    } catch {
      // ignore
    }
    setPromoteCursor(v);
  }

  function saveLastRun(next) {
    try {
      localStorage.setItem(PROMOTE_LASTRUN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setLastRun(next);
  }

  function resetPromoteCursor() {
    savePromoteCursor({ startAt: 0 });
    setPromoteStatus(null);
    pushLog("Promote cursor reset. startAt=0");
  }

  function resolvePromoteSportId() {
    if (promoteUseAll) return "*";
    return safeStr(promoteOnlySportId).trim();
  }

  async function invokePromoteOnce({ startAtOverride } = {}) {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return { ok: false, error: "admin off" };
    }
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available.");
      return { ok: false, error: "invoke not available" };
    }

    const sportId = resolvePromoteSportId();
    if (!sportId) {
      pushLog("❌ Provide sportId OR enable Promote ALL.");
      return { ok: false, error: "no sportId" };
    }

    const startAt = Number.isFinite(startAtOverride)
      ? Math.max(0, Number(startAtOverride))
      : Math.max(0, Number(promoteCursor?.startAt ?? 0));

    const payload = {
      sportId,
      startAt,
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
      baseDelayMs: 900,
      jitterMs: 250,
      onRetry: ({ attempt, tries, backoffMs, error }) => {
        pushLog(`↻ promote retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`);
      },
    });

    const res = unwrapInvokeResponse(raw);
    pushLog(`promote invoke data:\n${truncate(res, 1800)}`);

    if (res?.ok !== true) {
      const err = safeStr(res?.error || "no ok=true");
      pushLog(`❌ Promote failed: ${err}`);
      return { ok: false, error: err, res };
    }

    const totals = res?.totals || {};
    const nextStartAt = Number(res?.next?.nextStartAt ?? startAt);
    const done = !!res?.next?.done;

    const status = {
      runIso: res?.runIso,
      sportId,
      dryRun: !!payload.dryRun,
      totals,
      nextStartAt,
      done,
    };

    setPromoteStatus(status);

    // Update cursor + last run
    savePromoteCursor({ startAt: nextStartAt });
    saveLastRun({
      at: new Date().toISOString(),
      function: "promoteCampsFromCampDemo",
      params: payload,
      totals,
      done,
    });

    pushLog(
      `✅ Promote batch complete. sportId=${sportId} processed=${totals.processed} created=${totals.created} updated=${totals.updated} skipped=${totals.skipped} errors=${totals.errors} nextStartAt=${nextStartAt} done=${done}`
    );

    return { ok: true, res, totals, nextStartAt, done };
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

    // Local cursor variables to avoid stale React state
    let localStartAt = Math.max(0, Number(promoteCursor?.startAt ?? 0));

    try {
      let loops = 0;
      let totalErrors = 0;
      const sportId = resolvePromoteSportId();

      pushLog(
        `▶ Promote run until done: mode=${promoteUseAll ? "ALL" : "single-sport"} sportId=${sportId} starting startAt=${localStartAt} maxBatches=${promoteMaxBatches}`
      );

      while (loops < Math.max(1, Number(promoteMaxBatches || 1))) {
        if (stopRunRef.current) {
          pushLog("⏹ Promote stopped by user.");
          break;
        }

        loops += 1;
        pushLog(`--- Promote Batch ${loops} ---`);

        const out = await invokePromoteOnce({ startAtOverride: localStartAt });
        if (!out?.ok) {
          pushLog(`❌ Promote batch ${loops} failed. Halting.`);
          break;
        }

        totalErrors += Number(out?.totals?.errors || 0);
        if (totalErrors > Math.max(0, Number(promoteHaltOnErrorsOver || 0))) {
          pushLog(`⛔ Promote halted: errors=${totalErrors} exceeded threshold=${promoteHaltOnErrorsOver}`);
          break;
        }

        localStartAt = Math.max(0, Number(out?.nextStartAt ?? localStartAt));
        savePromoteCursor({ startAt: localStartAt });

        if (out?.done) {
          pushLog("🏁 Promote complete: done=true");
          break;
        }

        await sleep(Math.max(0, Number(promotePauseMs || 0)));
      }

      pushLog(`⏸ Promote ended. Cursor startAt=${localStartAt}`);
    } catch (e) {
      pushLog(`❌ Promote run-until-done exception: ${safeStr(e?.message || e)}`);
    } finally {
      setPromoteBusy(false);
    }
  }

  async function runCampHealthCheck() {
    setHealthBusy(true);
    try {
      const CampEntity = base44?.entities?.Camp || base44?.entities?.Camps;
      if (!CampEntity?.filter) {
        setHealthResult({ ok: false, error: "Camp entity not available." });
        return;
      }

      const seasonYear = Number(healthSeasonYear);
      const sportId = safeStr(healthSportId).trim();

      let rows = [];
      try {
        rows = await CampEntity.filter({ season_year: seasonYear });
      } catch {
        try {
          rows = await CampEntity.filter({ season_year: String(seasonYear) });
        } catch {
          rows = await CampEntity.filter({});
        }
      }

      const arr = Array.isArray(rows) ? rows : [];
      const bySport = sportId ? arr.filter((r) => safeStr(r?.sport_id) === sportId) : arr;
      const active = bySport.filter((r) => (typeof r?.active === "boolean" ? r.active : true));

      const sample = active.slice(0, 3).map((r) => ({
        id: r?.id,
        camp_name: r?.camp_name,
        start_date: r?.start_date,
        season_year: r?.season_year,
        sport_id: r?.sport_id,
        school_id: r?.school_id,
      }));

      setHealthResult({
        ok: true,
        inputs: { season_year: seasonYear, sport_id: sportId || null },
        counts: {
          fetched: arr.length,
          afterSport: bySport.length,
          active: active.length,
        },
        sample,
      });
    } catch (e) {
      setHealthResult({ ok: false, error: safeStr(e?.message || e) });
    } finally {
      setHealthBusy(false);
    }
  }

  const promotePayloadPreview = useMemo(() => {
    return {
      sportId: resolvePromoteSportId() || "(missing)",
      startAt: promoteCursor?.startAt ?? 0,
      batchSize: promoteBatchSize,
      throttleMs: promoteThrottleMs,
      timeBudgetMs: promoteTimeBudgetMs,
      dryRun: promoteDryRun,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoteUseAll, promoteOnlySportId, promoteCursor, promoteBatchSize, promoteThrottleMs, promoteTimeBudgetMs, promoteDryRun]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">Control plane for promotion + health checks.</div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)} disabled={promoteBusy || healthBusy}>
            Profile
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)} disabled={promoteBusy || healthBusy}>
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} disabled={promoteBusy || healthBusy}>
            Admin Mode: {adminEnabled ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {!adminEnabled && (
        <Card className="p-4 border border-amber-300 bg-amber-50">
          <div className="font-medium">Admin Mode is OFF</div>
          <div className="text-sm text-gray-700 mt-1">Turn it on to run promotion and health checks.</div>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} disabled={promoteBusy || healthBusy}>
              Overview
            </Button>
            <Button variant={tab === "camps" ? "default" : "outline"} onClick={() => setTab("camps")} disabled={promoteBusy || healthBusy}>
              Camps
            </Button>
            <Button variant={tab === "diagnostics" ? "default" : "outline"} onClick={() => setTab("diagnostics")} disabled={promoteBusy || healthBusy}>
              Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {tab === "overview" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Quick actions</div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="outline" onClick={() => nav(ROUTES.Discover)} disabled={promoteBusy || healthBusy}>
                Open Discover
              </Button>
              <Button variant="outline" onClick={() => nav(ROUTES.AdminImport)} disabled={promoteBusy || healthBusy}>
                Admin Import
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Camp health check</div>
            <div className="text-sm text-gray-700">
              Confirms Camp has rows for the entitled season and (optionally) a sport.
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">season_year</span>
                <input className="border rounded px-2 py-1 w-28" type="number" value={healthSeasonYear} onChange={(e) => setHealthSeasonYear(Number(e.target.value || 0))} disabled={healthBusy} />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">sport_id (optional)</span>
                <input className="border rounded px-2 py-1 w-80 font-mono" value={healthSportId} onChange={(e) => setHealthSportId(e.target.value)} placeholder="e.g. 69407156fe19c3615944865f" disabled={healthBusy} />
              </label>

              <Button onClick={runCampHealthCheck} disabled={healthBusy || !adminEnabled}>
                {healthBusy ? "Checking…" : "Run health check"}
              </Button>
            </div>

            <Card className="p-3">
              <div className="font-medium">Result</div>
              <pre className="text-xs overflow-auto mt-2">{safeJson(healthResult || { note: "(not run yet)" })}</pre>
            </Card>

            <Card className="p-3">
              <div className="font-medium">Last promotion</div>
              <pre className="text-xs overflow-auto mt-2">{safeJson(lastRun || { note: "(none yet)" })}</pre>
            </Card>
          </Card>
        </div>
      )}

      {tab === "camps" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Promote Camps: CampDemo → Camp</div>
            <div className="text-sm text-gray-700">
              Recommended default is <span className="font-mono">Promote ALL</span>. This keeps paid Discover stable because it reads Camp.
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={promoteUseAll} onChange={(e) => setPromoteUseAll(!!e.target.checked)} disabled={promoteBusy} />
                <span className="text-gray-800">Promote ALL (sportId="*")</span>
              </label>

              <label className="flex items-center gap-2">
                <span className="text-gray-600">Only sportId</span>
                <input className="border rounded px-2 py-1 flex-1 font-mono" value={promoteOnlySportId} onChange={(e) => setPromoteOnlySportId(e.target.value)} disabled={promoteBusy || promoteUseAll} placeholder="disabled when Promote ALL is enabled" />
              </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">batchSize</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteBatchSize} onChange={(e) => setPromoteBatchSize(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">throttleMs</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteThrottleMs} onChange={(e) => setPromoteThrottleMs(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">timeBudgetMs</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteTimeBudgetMs} onChange={(e) => setPromoteTimeBudgetMs(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">pauseMs</span>
                <input className="border rounded px-2 py-1" type="number" value={promotePauseMs} onChange={(e) => setPromotePauseMs(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">maxBatches</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteMaxBatches} onChange={(e) => setPromoteMaxBatches(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">halt errors &gt;</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteHaltOnErrorsOver} onChange={(e) => setPromoteHaltOnErrorsOver(Number(e.target.value || 0))} disabled={promoteBusy} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-gray-600">cursor startAt</span>
                <input className="border rounded px-2 py-1" type="number" value={promoteCursor?.startAt ?? 0} onChange={(e) => savePromoteCursor({ startAt: Number(e.target.value || 0) })} disabled={promoteBusy} />
              </label>
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
            <Button variant="outline" onClick={() => setLog([])} disabled={promoteBusy || healthBusy}>
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
