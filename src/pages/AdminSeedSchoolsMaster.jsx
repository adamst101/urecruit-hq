// src/pages/AdminSeedSchoolsMaster.jsx
// OPTION A: Refresh-proof client runner that calls the SERVER seed function.
// - All writes happen server-side (seedSchoolsMaster_scorecard is idempotent + dedupes)
// - Client only orchestrates batches
// - Checkpoint + totals persist to localStorage every successful batch
// - On refresh, you can resume safely from nextPage

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
function truncate(x, n = 1800) {
  const t = typeof x === "string" ? x : safeJson(x);
  return t.length > n ? t.slice(0, n) + "\n...<truncated>..." : t;
}
function unwrapInvokeResponse(resp) {
  return resp?.data ?? resp ?? null;
}
function detectEnv() {
  const href = typeof window !== "undefined" ? window.location.href : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const isPreviewHost = host.includes("preview-sandbox") || host.includes("preview");
  const hasProdDataEnv = href.includes("base44_data_env=prod");
  return {
    host,
    href,
    label: isPreviewHost ? "PREVIEW HOST" : "PROD HOST",
    dataEnv: hasProdDataEnv ? "prod data env" : "default data env",
  };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isTransient(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  const status = e?.raw?.status || e?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return msg.includes("timeout") || msg.includes("network") || msg.includes("rate limit") || msg.includes("502");
}

// ----------------------------
// Persisted run state
// ----------------------------
const STATE_KEY = "campapp_seedSchoolsMaster_state_v3";
// We keep a separate “checkpoint” key for compatibility
const CHECKPOINT_KEY = "campapp_admin_seed_schools_master_pageNext_v3";

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
function loadCheckpoint() {
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
function saveCheckpoint(n) {
  try {
    window.localStorage.setItem(CHECKPOINT_KEY, String(Number(n || 0)));
  } catch {}
}
function clearCheckpoint() {
  try {
    window.localStorage.removeItem(CHECKPOINT_KEY);
  } catch {}
}

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const cancelRef = useRef(false);
  const [running, setRunning] = useState(false);

  const [log, setLog] = useState([]);
  const push = (m) => setLog((x) => [...x, m]);

  // Controls
  const [dryRun, setDryRun] = useState(true);
  const [startPage, setStartPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [pagesPerBatch, setPagesPerBatch] = useState(1);
  const [delayMs, setDelayMs] = useState(1500);
  const [tries, setTries] = useState(8);

  const [resolvedFn, setResolvedFn] = useState("seedSchoolsMaster_scorecard");

  // Hydrate from localStorage on mount
  const [saved, setSaved] = useState(() => {
    const st = loadState();
    const cp = loadCheckpoint();
    return {
      state: st,
      checkpoint: cp,
    };
  });

  useEffect(() => {
    // If we have a saved state, show it in UI and allow resume
    const st = loadState();
    const cp = loadCheckpoint();
    setSaved({ state: st, checkpoint: cp });

    // If a run was in-flight and the page refreshed, we do NOT auto-restart silently.
    // But we will set StartPage to the saved nextPage to make “Resume” one click.
    if (st?.nextPage != null && Number.isFinite(Number(st.nextPage))) {
      setStartPage(Number(st.nextPage));
    } else if (cp) {
      setStartPage(Number(cp));
    }
  }, []);

  // Warn on refresh while running (best-effort; some hosts still refresh)
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

    // Persist “stopped” state
    const st = loadState() || {};
    saveState({ ...st, running: false, stoppedAt: new Date().toISOString() });
    setSaved({ state: loadState(), checkpoint: loadCheckpoint() });
  };

  async function resolveFunctionName() {
    if (!canRun) return null;

    // Canonical name only
    const name = "seedSchoolsMaster_scorecard";
    push(`Resolving scorecard function on ${env.host} (${env.label})...`);

    try {
      await base44.functions.invoke(name, { page: 0, perPage: 1, maxPages: 1, dryRun: true });
      push(`✅ Using function: ${name}`);
      setResolvedFn(name);
      return name;
    } catch (e) {
      const status = e?.raw?.status || e?.status;
      const msg = String(e?.message || e);

      if (status === 404 || msg.includes("status code 404")) {
        push(`❌ Not found: ${name} (deploy functions/seedSchoolsMaster_scorecard.js)`);
        return null;
      }

      // Non-404 means function exists but errored; still use it.
      push(`✅ Function exists (non-404): ${name} (error=${msg})`);
      setResolvedFn(name);
      return name;
    }
  }

  const probe = async () => {
    if (!canRun) return;
    push(`\nProbe start @ ${new Date().toISOString()}`);

    const fn = await resolveFunctionName();
    if (!fn) return;

    try {
      const raw = await base44.functions.invoke(fn, { page: 0, perPage: 5, maxPages: 1, dryRun: true });
      push(`Probe fn=${fn}\n${truncate(unwrapInvokeResponse(raw))}`);
    } catch (e) {
      push(`Probe threw:\n${truncate({ message: e?.message, raw: e?.raw || e })}`);
    }
  };

  async function runServerBatchWithRetry(fnName, page0, per, ppb, dry) {
    let last = null;

    for (let i = 0; i < tries; i++) {
      if (cancelRef.current) throw new Error("Cancelled");

      try {
        const raw = await base44.functions.invoke(fnName, {
          page: Number(page0 || 0),
          perPage: Number(per || 100),
          maxPages: Number(ppb || 1),
          dryRun: !!dry,
          // server throttles
          delayMs: 220,
          deleteDelayMs: 260,
          updateExisting: true,
        });

        const resp = unwrapInvokeResponse(raw);
        if (resp?.error) {
          const err = new Error(String(resp.error));
          err._debug = resp.debug || null;
          throw err;
        }
        return resp;
      } catch (e) {
        last = e;
        const msg = String(e?.message || e);
        const dbg = e?._debug || null;

        push(`⚠️ Batch attempt ${i + 1}/${tries} failed: ${msg}`);
        if (dbg) push(`Server debug:\n${truncate(dbg)}`);

        const status = e?.raw?.status || e?.status;
        if (status === 404 || msg.includes("status code 404")) throw e;

        if (!isTransient(e) || i === tries - 1) break;

        const wait = Math.min(20000, 2000 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        push(`Waiting ${wait}ms then retrying same batch...`);
        await sleep(wait);
      }
    }

    throw last || new Error("Server batch failed");
  }

  function persistProgress(nextPage, totalsPatch = {}) {
    const prev = loadState() || {};
    const totals = { ...(prev.totals || {}), ...(totalsPatch || {}) };

    const st = {
      ...prev,
      running: true,
      envHost: env.host,
      envHref: env.href,
      fn: resolvedFn,
      nextPage: Number(nextPage || 0),
      perPage: Number(perPage || 100),
      pagesPerBatch: Number(pagesPerBatch || 1),
      dryRun: !!dryRun,
      totals,
      updatedAt: new Date().toISOString(),
    };

    saveState(st);
    saveCheckpoint(Number(nextPage || 0));
    setSaved({ state: st, checkpoint: Number(nextPage || 0) });
  }

  const clearAll = () => {
    clearState();
    clearCheckpoint();
    setSaved({ state: null, checkpoint: 0 });
    push(`🧹 Cleared local saved state + checkpoint`);
  };

  const resumeFromSaved = () => {
    const st = loadState();
    const cp = loadCheckpoint();
    const n = Number(st?.nextPage ?? cp ?? 0);
    setStartPage(n);
    push(`↩️ StartPage set to saved nextPage=${n}`);
  };

  const startAutoRun = async () => {
    if (!canRun) return;

    // Do not nuke the log at start; refresh already clears it. Keep continuity if it stays alive.
    setRunning(true);
    cancelRef.current = false;

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`Write path: server-side (seedSchoolsMaster_scorecard)`);
    push(`Saved checkpoint (local): ${loadCheckpoint()}`);

    const fn = await resolveFunctionName();
    if (!fn) {
      setRunning(false);
      return;
    }

    const per = Math.max(1, Math.min(100, Number(perPage || 100)));
    const ppb = Math.max(1, Number(pagesPerBatch || 1));
    const delay = Math.max(0, Number(delayMs || 0));
    let current = Math.max(0, Number(startPage || 0));

    // Initialize persisted state at start (so refresh mid-batch still shows “running” + page)
    persistProgress(current, { fetched: 0, processed: 0, created: 0, updated: 0, dedupeGroups: 0, dedupeDeleted: 0 });
    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(`Function=${fn}`);
    push(`DryRun=${dryRun} startPage=${current} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay}`);
    push(`Server throttles: delayMs=220 deleteDelayMs=260`);

    try {
      for (let b = 0; b < 10000; b++) {
        if (cancelRef.current) break;

        const batchPage = current;
        const nextPage = batchPage + ppb;
        const expectedMax = per * ppb;

        push(`\n--- Batch ${b + 1} ---`);
        push(`Running server batch page=${batchPage} maxPages=${ppb} perPage=${per} (nextPage=${nextPage}) ...`);

        // Persist intent before running (if refresh happens here, you still know where you were going)
        persistProgress(batchPage);

        const out = await runServerBatchWithRetry(fn, batchPage, per, ppb, dryRun);

        const s = out?.stats || {};
        const fetched = Number(s.fetched ?? 0);
        const processed = Number(s.processed ?? 0);
        const created = Number(s.created ?? 0);
        const updated = Number(s.updated ?? 0);
        const dedupeGroups = Number(s.dedupeGroups ?? 0);
        const dedupeDeleted = Number(s.dedupeDeleted ?? 0);

        push(
          `✅ Batch complete. fetched=${fetched} processed=${processed} created=${created} updated=${updated} dedupeGroups=${dedupeGroups} dedupeDeleted=${dedupeDeleted}`
        );

        // Persist checkpoint after success
        const prevTotals = (loadState()?.totals) || {};
        const newTotals = {
          fetched: Number(prevTotals.fetched || 0) + fetched,
          processed: Number(prevTotals.processed || 0) + processed,
          created: Number(prevTotals.created || 0) + created,
          updated: Number(prevTotals.updated || 0) + updated,
          dedupeGroups: Number(prevTotals.dedupeGroups || 0) + dedupeGroups,
          dedupeDeleted: Number(prevTotals.dedupeDeleted || 0) + dedupeDeleted,
        };

        persistProgress(nextPage, newTotals);
        push(`💾 Checkpoint saved (local): nextPage=${nextPage}`);

        current = nextPage;

        if (!fetched) {
          push(`🏁 fetched=0. Completed.`);
          break;
        }
        if (fetched < expectedMax) {
          push(`🏁 fetched fewer than ${expectedMax}. Treating as complete.`);
          break;
        }

        if (delay > 0) {
          push(`Sleeping ${delay}ms...`);
          await sleep(delay);
        }
      }
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
      push(`Raw error:\n${truncate({ message: e?.message, raw: e?.raw || e })}`);

      // Mark state as not running
      const st = loadState() || {};
      saveState({ ...st, running: false, errorAt: new Date().toISOString(), lastError: String(e?.message || e) });
      setSaved({ state: loadState(), checkpoint: loadCheckpoint() });
    } finally {
      setRunning(false);
      // Mark state as not running if we naturally finish
      const st = loadState() || {};
      saveState({ ...st, running: false, finishedAt: new Date().toISOString() });
      setSaved({ state: loadState(), checkpoint: loadCheckpoint() });

      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  const savedState = saved?.state || null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master</div>
          <div className="text-sm text-slate-600 mt-1">
            Server-side upsert + dedupe by unitid. Client runner is refresh-proof via localStorage checkpoint.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Function: <span className="font-mono">{resolvedFn}</span>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Saved State</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>
              Checkpoint nextPage (local): <span className="font-mono">{saved?.checkpoint ?? 0}</span>
            </div>
            <div className="mt-1">
              Running flag (saved): <span className="font-mono">{String(!!savedState?.running)}</span>
            </div>
            {savedState?.totals && (
              <div className="mt-2 text-xs text-slate-600">
                Totals:{" "}
                <span className="font-mono">
                  {safeJson(savedState.totals)}
                </span>
              </div>
            )}
            {savedState?.lastError && (
              <div className="mt-2 text-xs text-red-700">
                Last error: <span className="font-mono">{savedState.lastError}</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button disabled={running} onClick={resumeFromSaved} variant="outline">
              Set Start Page from Saved nextPage
            </Button>
            <Button disabled={running} onClick={clearAll} variant="outline">
              Clear Saved State
            </Button>
            <Button disabled={running} onClick={resolveFunctionName} variant="outline">
              Resolve Function
            </Button>
            <Button disabled={running} onClick={probe} variant="outline">
              Probe
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Controls</div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={running} />
              Dry run (no writes)
            </label>

            <label className="text-sm">
              Start page{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={startPage}
                onChange={(e) => setStartPage(e.target.value)}
                disabled={running}
              />
            </label>

            <label className="text-sm">
              Per page{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={perPage}
                onChange={(e) => setPerPage(e.target.value)}
                disabled={running}
              />
            </label>

            <label className="text-sm">
              Pages per batch{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={pagesPerBatch}
                onChange={(e) => setPagesPerBatch(e.target.value)}
                disabled={running}
              />
            </label>

            <label className="text-sm">
              Delay ms{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={delayMs}
                onChange={(e) => setDelayMs(e.target.value)}
                disabled={running}
              />
            </label>

            <label className="text-sm">
              Tries{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={tries}
                onChange={(e) => setTries(e.target.value)}
                disabled={running}
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <Button disabled={running} onClick={startAutoRun}>
              Run until complete
            </Button>
            <Button disabled={!running} onClick={stop} variant="outline">
              Stop
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-slate-900">Log</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
        </Card>
      </div>
    </div>
  );
}
