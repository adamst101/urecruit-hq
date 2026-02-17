// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";
const NCAA_CURSOR_KEY_PREFIX = "adminops_ncaa_cursor_v1:";

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

function getId(r) {
  if (!r) return null;
  if (typeof r.id === "string" || typeof r.id === "number") return String(r.id);
  if (typeof r._id === "string" || typeof r._id === "number") return String(r._id);
  if (typeof r.uuid === "string" || typeof r.uuid === "number") return String(r.uuid);
  return null;
}

async function withRetries(fn, { tries = 8, baseDelayMs = 400, onRetry } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = safeStr(e?.message || e);
      const status = e?.raw?.status || e?.status;
      const isRate = status === 429 || lc(msg).includes("rate limit") || lc(msg).includes("429");
      const isNet = lc(msg).includes("network") || lc(msg).includes("timeout");
      const is500 = status >= 500 && status <= 599;

      if (i < tries - 1 && (isRate || isNet || is500)) {
        const delay = Math.min(25_000, Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * 250));
        onRetry?.({ attempt: i + 1, tries, delayMs: delay, err: e });
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function pickEntityFromSDK(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("overview");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // Athletics sync controls
  const [athleticsDryRun, setAthleticsDryRun] = useState(true);
  const [ncaaSeasonYear, setNcaaSeasonYear] = useState(new Date().getFullYear());
  const [ncaaMaxRows, setNcaaMaxRows] = useState(200); // batch size
  const [ncaaConfidenceThreshold, setNcaaConfidenceThreshold] = useState(0.92);
  const [ncaaThrottleMs, setNcaaThrottleMs] = useState(15);
  const [ncaaTimeBudgetMs, setNcaaTimeBudgetMs] = useState(24000);

  const cursorStorageKey = useMemo(() => `${NCAA_CURSOR_KEY_PREFIX}${ncaaSeasonYear}`, [ncaaSeasonYear]);
  const [ncaaStartAt, setNcaaStartAt] = useState(0);

  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");
  }, []);

  useEffect(() => {
    // load cursor per season
    const saved = Number(localStorage.getItem(cursorStorageKey) || 0);
    setNcaaStartAt(Number.isFinite(saved) ? saved : 0);
  }, [cursorStorageKey]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function pushLog(line) {
    setLog((prev) => [...prev, `[${new Date().toISOString()}] ${line}`]);
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

  async function runNcaaMembershipSync({ useSavedCursor = true } = {}) {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    setBusy(true);
    try {
      if (!base44?.functions?.invoke) {
        pushLog("❌ base44.functions.invoke is not available in this environment.");
        return;
      }

      const startAt = useSavedCursor ? ncaaStartAt : 0;

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

      pushLog(`invoke data:\n${truncate(res, 1500)}`);

      if (res?.error) {
        pushLog(`❌ NCAA sync failed: ${safeStr(res.error)}`);
        if (res?.debug) pushLog(`server debug:\n${truncate(res.debug, 1500)}`);
        return;
      }

      if (res?.ok !== true) {
        pushLog(`❌ NCAA sync failed (no ok=true). See invoke payload above.`);
        return;
      }

      const st = res?.stats || {};
      const nextStartAt = Number(res?.nextStartAt ?? startAt);
      const done = !!res?.done;
      const elapsedMs = Number(res?.debug?.elapsedMs || 0);
      const stoppedEarly = !!res?.debug?.stoppedEarly;

      pushLog(
        `✅ NCAA sync complete. processed=${st.processed} matched=${st.matched} created=${st.created} updated=${st.updated} noMatch=${st.noMatch} ambiguous=${st.ambiguous} missingName=${st.missingName} errors=${st.errors} nextStartAt=${nextStartAt} done=${done} elapsedMs=${elapsedMs} stoppedEarly=${stoppedEarly}`
      );

      // persist cursor for resume (even on dry run, so ops can iterate through the dataset)
      saveCursor(nextStartAt);

      const samples = asArray(res?.debug?.samples).slice(0, 2);
      for (const smp of samples) pushLog(`sample: ${safeStr(JSON.stringify(smp)).slice(0, 500)}`);
      const errs = asArray(res?.debug?.errors).slice(0, 2);
      for (const er of errs) pushLog(`error: ${safeStr(JSON.stringify(er)).slice(0, 500)}`);
    } catch (e) {
      pushLog(`❌ NCAA sync exception: ${safeStr(e?.message || e)}`);
      if (e?.raw) pushLog(`exception raw:\n${truncate(e.raw, 1500)}`);
    } finally {
      setBusy(false);
    }
  }

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
              Uses cursor <span className="font-mono">startAt</span> and saves <span className="font-mono">nextStartAt</span> per season.
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
                <input className="border rounded px-2 py-1 w-24" type="number" value={ncaaSeasonYear} onChange={(e) => setNcaaSeasonYear(Number(e.target.value || 0))} disabled={busy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">startAt</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={ncaaStartAt} onChange={(e) => setNcaaStartAt(Number(e.target.value || 0))} disabled={busy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">batch</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={ncaaMaxRows} onChange={(e) => setNcaaMaxRows(Number(e.target.value || 0))} disabled={busy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">threshold</span>
                <input className="border rounded px-2 py-1 w-24" type="number" step="0.01" min="0" max="1" value={ncaaConfidenceThreshold} onChange={(e) => setNcaaConfidenceThreshold(Number(e.target.value || 0))} disabled={busy} />
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
              <Button onClick={() => runNcaaMembershipSync({ useSavedCursor: true })} disabled={busy || !adminEnabled}>
                Run next batch (uses startAt)
              </Button>
              <Button variant="outline" onClick={() => runNcaaMembershipSync({ useSavedCursor: false })} disabled={busy || !adminEnabled}>
                Run from 0 (ignores cursor)
              </Button>
              <Button variant="outline" onClick={resetCursor} disabled={busy}>
                Reset cursor
              </Button>
            </div>

            <div className="text-xs text-gray-600">
              Cursor key: <span className="font-mono">{cursorStorageKey}</span>
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
          <Button variant="outline" onClick={() => setLog([])} disabled={busy}>
            Clear
          </Button>
        </div>
        <div ref={logRef} className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto" style={{ maxHeight: 420 }}>
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
