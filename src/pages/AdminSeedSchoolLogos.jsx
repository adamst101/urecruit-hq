// src/pages/AdminSeedSchoolLogos.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "../api/base44Client";

const Card = ({ children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">{children}</div>
);

const Button = ({ children, disabled, onClick, variant = "solid" }) => {
  const base =
    "px-3 py-2 rounded-lg text-sm border transition disabled:opacity-50 disabled:cursor-not-allowed";
  const solid = "bg-slate-900 text-white border-slate-900 hover:bg-slate-800";
  const outline = "bg-white text-slate-900 border-slate-300 hover:bg-slate-50";
  return (
    <button
      className={`${base} ${variant === "outline" ? outline : solid}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
};

function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function truncate(x, n = 2200) {
  const t = typeof x === "string" ? x : safeJson(x);
  return t.length > n ? t.slice(0, n) + "\n...<truncated>..." : t;
}

function unwrapInvokeResponse(resp) {
  return resp?.data ?? resp ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function isTransient(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  const status = e?.raw?.status || e?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return msg.includes("timeout") || msg.includes("network") || msg.includes("rate limit") || msg.includes("502");
}

const STATE_KEY = "campapp_seedSchoolLogos_state_v1";
const CURSOR_KEY = "campapp_seedSchoolLogos_cursor_v1";

function loadState() {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

function clearState() {
  try {
    window.localStorage.removeItem(STATE_KEY);
  } catch {}
}

function loadCursor() {
  try {
    const raw = window.localStorage.getItem(CURSOR_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCursor(cursor) {
  try {
    window.localStorage.setItem(CURSOR_KEY, JSON.stringify(cursor ?? null));
  } catch {}
}

function clearCursor() {
  try {
    window.localStorage.removeItem(CURSOR_KEY);
  } catch {}
}

export default function AdminSeedSchoolLogos() {
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);
  const cancelRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const push = (m) => setLog((x) => [...x, m]);

  const [dryRun, setDryRun] = useState(true);
  const [maxRows, setMaxRows] = useState(50);
  const [throttleMs, setThrottleMs] = useState(250);
  const [timeBudgetMs, setTimeBudgetMs] = useState(20000);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [preferWikimedia, setPreferWikimedia] = useState(true);
  const [force, setForce] = useState(false);

  const [tries, setTries] = useState(8);
  const [delayBetweenBatchesMs, setDelayBetweenBatchesMs] = useState(1200);

  const [cursor, setCursor] = useState(null);
  const [totals, setTotals] = useState({
    scanned: 0,
    eligible: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    batches: 0,
  });

  useEffect(() => {
    const st = loadState();
    const cur = loadCursor();
    if (cur) setCursor(cur);
    if (st?.totals) setTotals(st.totals);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!running) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const stop = () => {
    cancelRef.current = true;
    setRunning(false);
    push(`⏹️ Stop requested @ ${new Date().toISOString()}`);
    saveState({ running: false, stoppedAt: new Date().toISOString(), totals, cursor });
  };

  const reset = () => {
    stop();
    setLog([]);
    setTotals({ scanned: 0, eligible: 0, updated: 0, skipped: 0, errors: 0, batches: 0 });
    setCursor(null);
    clearState();
    clearCursor();
    push(`🧹 Cleared state @ ${new Date().toISOString()}`);
  };

  async function invokeWithRetry(fnName, payload) {
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        const resp = await base44.functions.invoke(fnName, payload);
        return unwrapInvokeResponse(resp);
      } catch (e) {
        lastErr = e;
        if (!isTransient(e) || i === tries - 1) throw e;
        const wait = Math.min(12000, 500 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
        push(`⚠️ transient error (attempt ${i + 1}/${tries}) wait=${wait}ms err=${String(e?.message || e)}`);
        await sleep(wait);
      }
    }
    throw lastErr || new Error("invokeWithRetry failed");
  }

  async function debugSchoolRead() {
    if (!canRun) return;
    push(`\n🔎 debugSchoolRead @ ${new Date().toISOString()}`);
    try {
      const out = await invokeWithRetry("debugSchoolRead", {});
      push(`✅ debugSchoolRead: ${truncate(out, 2000)}`);
    } catch (e) {
      push(`❌ debugSchoolRead failed: ${String(e?.message || e)}`);
    }
  }

  async function probeLogos() {
    if (!canRun) return;
    push(`\nProbe ingestSchoolLogos @ ${new Date().toISOString()}`);
    try {
      const out = await invokeWithRetry("ingestSchoolLogos", {
        dryRun: true,
        cursor: null,
        maxRows: 2,
        throttleMs: 0,
        timeBudgetMs: 12000,
        onlyMissing: true,
        preferWikimedia: true,
        force: false,
      });
      push(`✅ Probe ok: ${truncate(out, 2000)}`);
    } catch (e) {
      push(`❌ Probe failed: ${String(e?.message || e)}`);
    }
  }

  async function run() {
    if (!canRun) return;

    cancelRef.current = false;
    setRunning(true);

    push(`\n▶️ Run start @ ${new Date().toISOString()}`);
    push(
      `Settings: dryRun=${dryRun} maxRows=${maxRows} throttleMs=${throttleMs} timeBudgetMs=${timeBudgetMs} onlyMissing=${onlyMissing} preferWikimedia=${preferWikimedia} force=${force}`
    );

    let cur = cursor;
    let localTotals = { ...totals };

    while (!cancelRef.current) {
      const batchNum = localTotals.batches + 1;
      push(`\n[Batch ${batchNum}] cursor=${cur ? truncate(cur, 200) : "<null>"}`);

      let out = null;
      try {
        out = await invokeWithRetry("ingestSchoolLogos", {
          dryRun,
          cursor: cur,
          maxRows,
          throttleMs,
          timeBudgetMs,
          onlyMissing,
          preferWikimedia,
          force,
        });
      } catch (e) {
        push(`❌ Batch failed: ${String(e?.message || e)} | stopping`);
        break;
      }

      const stats = out?.stats || {};
      const next = out?.next_cursor ?? null;
      const done = !!out?.done;

      localTotals = {
        scanned: localTotals.scanned + (Number(stats.scanned || 0) || 0),
        eligible: localTotals.eligible + (Number(stats.eligible || 0) || 0),
        updated: localTotals.updated + (Number(stats.updated || 0) || 0),
        skipped: localTotals.skipped + (Number(stats.skipped || 0) || 0),
        errors: localTotals.errors + (Number(stats.errors || 0) || 0),
        batches: batchNum,
      };

      setTotals(localTotals);
      setCursor(next);
      saveCursor(next);

      saveState({
        running: true,
        updatedAt: new Date().toISOString(),
        totals: localTotals,
        cursor: next,
        lastBatch: out,
      });

      push(
        `✅ Batch ${batchNum} done | scanned=${stats.scanned || 0} updated=${stats.updated || 0} errors=${
          stats.errors || 0
        } next_cursor=${next ? "<set>" : "<null>"}`
      );

      if (done || !next) {
        push(`🏁 Done (done=${done} next_cursor=${next ? "set" : "null"}) @ ${new Date().toISOString()}`);
        break;
      }

      cur = next;
      await sleep(delayBetweenBatchesMs);
    }

    setRunning(false);
    saveState({ running: false, stoppedAt: new Date().toISOString(), totals: localTotals, cursor: cur });
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Admin • School Logo Ingestion</h1>
          <p className="text-sm text-slate-600">
            Server runner: <span className="font-mono">ingestSchoolLogos</span> + diagnostics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={debugSchoolRead} disabled={!canRun || running}>
            Debug School Read
          </Button>
          <Button variant="outline" onClick={probeLogos} disabled={!canRun || running}>
            Probe Logos
          </Button>
          <Button variant="outline" onClick={reset} disabled={running}>
            Reset
          </Button>
          {!running ? (
            <Button onClick={run} disabled={!canRun}>
              Run
            </Button>
          ) : (
            <Button onClick={stop}>Stop</Button>
          )}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">dryRun</label>
            <select
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={dryRun ? "true" : "false"}
              onChange={(e) => setDryRun(e.target.value === "true")}
              disabled={running}
            >
              <option value="true">true (no writes)</option>
              <option value="false">false (write)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">maxRows per batch</label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              type="number"
              value={maxRows}
              min={1}
              max={250}
              onChange={(e) => setMaxRows(Number(e.target.value || 0))}
              disabled={running}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">throttleMs</label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              type="number"
              value={throttleMs}
              min={0}
              max={5000}
              onChange={(e) => setThrottleMs(Number(e.target.value || 0))}
              disabled={running}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">timeBudgetMs</label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              type="number"
              value={timeBudgetMs}
              min={2000}
              max={22000}
              onChange={(e) => setTimeBudgetMs(Number(e.target.value || 0))}
              disabled={running}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">delayBetweenBatchesMs</label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              type="number"
              value={delayBetweenBatchesMs}
              min={0}
              max={15000}
              onChange={(e) => setDelayBetweenBatchesMs(Number(e.target.value || 0))}
              disabled={running}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">tries</label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              type="number"
              value={tries}
              min={1}
              max={15}
              onChange={(e) => setTries(Number(e.target.value || 0))}
              disabled={running}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} disabled={running} />
            Only fill missing logos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferWikimedia}
              onChange={(e) => setPreferWikimedia(e.target.checked)}
              disabled={running}
            />
            Prefer Wikimedia
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={running} />
            Force overwrite
          </label>
        </div>

        <div className="mt-4 text-sm text-slate-700">
          <div>
            <span className="font-semibold">Cursor:</span> <span className="font-mono">{cursor ? truncate(cursor, 120) : "<null>"}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2">
            {[
              ["batches", totals.batches],
              ["scanned", totals.scanned],
              ["eligible", totals.eligible],
              ["updated", totals.updated],
              ["skipped", totals.skipped],
              ["errors", totals.errors],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs text-slate-500">{k}</div>
                <div className="font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Log</div>
          <Button variant="outline" onClick={() => setLog([])} disabled={running}>
            Clear
          </Button>
        </div>
        <pre className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
          {log.join("\n") || "(empty)"}
        </pre>
      </Card>
    </div>
  );
}