// src/pages/AdminSeedSchoolsMaster.jsx
// Server-side seeding runner for the canonical School master (College Scorecard)
// Key principle: do NOT write School rows from the browser.
// Browser restarts (or mid-run 502/429) can re-run the same page and create duplicates.
// Instead: call the backend function which is idempotent + self-healing (upsert + dedupe).

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
function isScorecardTransient(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  const status = e?.raw?.status || e?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return msg.includes("timeout") || msg.includes("network") || msg.includes("rate limit") || msg.includes("502");
}

function clampInt(x, min, max, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}
function parseUrlParams() {
  try {
    const u = new URL(window.location.href);
    const startPage = u.searchParams.get("startPage");
    const perPage = u.searchParams.get("perPage");
    const ppb = u.searchParams.get("ppb");
    return {
      startPage: startPage === null ? null : clampInt(startPage, 0, 999999, 0),
      perPage: perPage === null ? null : clampInt(perPage, 1, 100, 100),
      ppb: ppb === null ? null : clampInt(ppb, 1, 25, 1),
    };
  } catch {
    return { startPage: null, perPage: null, ppb: null };
  }
}
function writeUrlParams(next) {
  try {
    const u = new URL(window.location.href);
    if (typeof next.startPage === "number") u.searchParams.set("startPage", String(next.startPage));
    if (typeof next.perPage === "number") u.searchParams.set("perPage", String(next.perPage));
    if (typeof next.ppb === "number") u.searchParams.set("ppb", String(next.ppb));
    window.history.replaceState({}, "", u.toString());
  } catch {}
}

// Local checkpoint storage
const CHECKPOINT_STORAGE_KEY = "campapp_admin_seed_schools_master_pageNext_v2";
const LASTRUN_STORAGE_KEY = "campapp_admin_seed_schools_master_lastRun_v1";

function loadCheckpointFromStorage() {
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  } catch {
    return 0;
  }
}
function saveCheckpointToStorage(pageNext) {
  try {
    window.localStorage.setItem(CHECKPOINT_STORAGE_KEY, String(Number(pageNext || 0)));
  } catch {}
}
function clearCheckpointStorage() {
  try {
    window.localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
  } catch {}
}

function loadLastRunFromStorage() {
  try {
    const raw = window.localStorage.getItem(LASTRUN_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}
function saveLastRunToStorage(obj) {
  try {
    window.localStorage.setItem(LASTRUN_STORAGE_KEY, JSON.stringify(obj || null));
  } catch {}
}
function clearLastRunStorage() {
  try {
    window.localStorage.removeItem(LASTRUN_STORAGE_KEY);
  } catch {}
}

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const [log, setLog] = useState([]);
  const push = (m) => setLog((x) => [...x, m]);

  // Controls
  const [dryRun, setDryRun] = useState(true);
  const [startPage, setStartPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [pagesPerBatch, setPagesPerBatch] = useState(1);
  const [delayMs, setDelayMs] = useState(2000);
  const [scorecardFetchTries, setScorecardFetchTries] = useState(8);

  // Function resolution
  const [scorecardFn, setScorecardFn] = useState(null);

  // Checkpoint
  const [checkpoint, setCheckpoint] = useState({ loaded: false, pageNext: 0 });

  // Last run summary (survives refresh + log clear)
  const [lastRun, setLastRun] = useState(() => loadLastRunFromStorage());

  useEffect(() => {
    // Load checkpoint from localStorage
    const n = loadCheckpointFromStorage();
    setCheckpoint({ loaded: true, pageNext: n });

    // Initialize controls from URL if present, else from checkpoint
    const qp = parseUrlParams();
    if (qp.perPage !== null) setPerPage(qp.perPage);
    if (qp.ppb !== null) setPagesPerBatch(qp.ppb);

    if (qp.startPage !== null) {
      setStartPage(qp.startPage);
    } else if (n > 0) {
      // Auto restore start page from checkpoint if URL doesn't specify
      setStartPage(n);
    }
  }, []);

  const stop = () => {
    cancelRef.current = true;
    setRunning(false);
    push(`⏹️ Stop requested @ ${new Date().toISOString()}`);

    const lr = {
      ...(lastRun || {}),
      stoppedAt: new Date().toISOString(),
      status: "stopped",
    };
    setLastRun(lr);
    saveLastRunToStorage(lr);
  };

  async function tryInvoke(name) {
    const raw = await base44.functions.invoke(name, { page: 0, perPage: 1, maxPages: 1, dryRun: true });
    return unwrapInvokeResponse(raw);
  }

  // Canonical function name only (prevents accidentally selecting broken variants)
  const resolveScorecardFunction = async () => {
    if (!canRun) return null;

    const candidates = ["seedSchoolsMaster_scorecard"];

    push(`Resolving scorecard function on ${env.host} (${env.label})...`);

    for (const name of candidates) {
      try {
        await tryInvoke(name);
        push(`✅ Using function: ${name}`);
        setScorecardFn(name);
        return name;
      } catch (e) {
        const status = e?.raw?.status || e?.status;
        const msg = String(e?.message || e);
        if (status === 404 || msg.includes("status code 404")) {
          push(`- Not found: ${name}`);
          continue;
        }
        push(`✅ Function exists (non-404): ${name} (error=${msg})`);
        setScorecardFn(name);
        return name;
      }
    }

    push(`❌ Could not resolve a deployed scorecard function. Deploy: seedSchoolsMaster_scorecard`);
    setScorecardFn(null);
    return null;
  };

  const probe = async () => {
    if (!canRun) return;

    push(`\nProbe start @ ${new Date().toISOString()}`);
    const fn = scorecardFn || (await resolveScorecardFunction());
    if (!fn) return;

    try {
      const raw = await base44.functions.invoke(fn, { page: 0, perPage: 5, maxPages: 1, dryRun: true });
      push(`Probe fn=${fn}\n${truncate(unwrapInvokeResponse(raw))}`);
    } catch (e) {
      push(`Probe threw:\n${truncate({ message: e?.message, raw: e?.raw || e })}`);
    }
  };

  async function runServerBatchWithRetry(fnName, page0, perPageNum, pagesInBatchNum, dryRunFlag) {
    let last = null;

    for (let i = 0; i < scorecardFetchTries; i++) {
      if (cancelRef.current) throw new Error("Cancelled");

      try {
        const raw = await base44.functions.invoke(fnName, {
          page: Number(page0 || 0),
          perPage: Number(perPageNum || 100),
          maxPages: Number(pagesInBatchNum || 1),
          dryRun: !!dryRunFlag,
          // Server-side throttles
          delayMs: 220,
          deleteDelayMs: 260,
          updateExisting: true,
        });

        const resp = unwrapInvokeResponse(raw);

        if (resp && resp.error) {
          const err = new Error(String(resp.error));
          err._debug = resp.debug || null;
          throw err;
        }

        return resp;
      } catch (e) {
        last = e;
        const msg = String(e?.message || e);
        const dbg = e?._debug || null;

        push(`⚠️ Batch attempt ${i + 1}/${scorecardFetchTries} failed: ${msg}`);
        if (dbg) push(`Server debug:\n${truncate(dbg)}`);

        const status = e?.raw?.status || e?.status;
        if (status === 404 || msg.includes("status code 404")) throw e;

        if (!isScorecardTransient(e) || i === scorecardFetchTries - 1) break;

        const wait = Math.min(20000, 2000 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        push(`Waiting ${wait}ms then retrying same batch...`);
        await sleep(wait);
      }
    }

    throw last || new Error("Server batch failed");
  }

  const startAutoRun = async () => {
    if (!canRun) return;

    // Do NOT wipe logs on run start; append a divider so refresh isn't the only way to clear context.
    push(`\n================ RUN START ${new Date().toISOString()} ================\n`);

    setRunning(true);
    cancelRef.current = false;

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`Write path: server-side (seedSchoolsMaster_scorecard)`);
    push(`Checkpoint (local): pageNext=${checkpoint.pageNext}`);

    // Persist controls into URL immediately so refresh keeps your intent
    writeUrlParams({
      startPage: Number(startPage || 0),
      perPage: Number(perPage || 100),
      ppb: Number(pagesPerBatch || 1),
    });

    const lr0 = {
      startedAt: new Date().toISOString(),
      status: "running",
      env: { host: env.host, label: env.label, dataEnv: env.dataEnv },
      params: {
        dryRun: !!dryRun,
        startPage: Number(startPage || 0),
        perPage: Number(perPage || 100),
        pagesPerBatch: Number(pagesPerBatch || 1),
        delayMs: Number(delayMs || 0),
        scorecardFetchTries: Number(scorecardFetchTries || 8),
      },
      progress: {
        lastBatchPage: null,
        nextPage: Number(startPage || 0),
        batchesCompleted: 0,
        totals: { fetched: 0, processed: 0, created: 0, updated: 0, dedupeGroups: 0, dedupeDeleted: 0 },
      },
      lastError: null,
      finishedAt: null,
    };
    setLastRun(lr0);
    saveLastRunToStorage(lr0);

    let fn = scorecardFn;
    if (!fn) fn = await resolveScorecardFunction();
    if (!fn) {
      const lrFail = { ...lr0, status: "error", lastError: "Function not resolved", finishedAt: new Date().toISOString() };
      setLastRun(lrFail);
      saveLastRunToStorage(lrFail);
      setRunning(false);
      return;
    }

    const per = Number(perPage || 100);
    const ppb = Math.max(1, Number(pagesPerBatch || 1));
    const delay = Math.max(0, Number(delayMs || 0));
    let currentPage = Number(startPage || 0);

    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(`Function=${fn}`);
    push(`DryRun=${dryRun} startPage=${currentPage} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay}`);
    push(`Scorecard batch tries=${scorecardFetchTries}`);
    push(`Server throttles: delayMs=220 deleteDelayMs=260`);

    try {
      for (let b = 0; b < 5000; b++) {
        if (cancelRef.current) break;

        const batchPage = currentPage;
        const nextPage = batchPage + ppb;
        const expectedMax = per * ppb;

        push(`\n--- Batch ${b + 1} ---`);
        push(`Running server batch page=${batchPage} maxPages=${ppb} perPage=${per} (nextPage=${nextPage}) ...`);

        let out;
        try {
          out = await runServerBatchWithRetry(fn, batchPage, per, ppb, dryRun);
        } catch (e) {
          const msg = String(e?.message || e);
          const status = e?.raw?.status || e?.status;
          if (status === 404 || msg.includes("status code 404")) {
            push(`❌ Function name mismatch (404). Re-resolving then retrying batch...`);
            fn = await resolveScorecardFunction();
            if (!fn) throw e;
            out = await runServerBatchWithRetry(fn, batchPage, per, ppb, dryRun);
          } else {
            throw e;
          }
        }

        const fetched = Number(out?.stats?.fetched ?? 0);
        const processed = Number(out?.stats?.processed ?? 0);
        const created = Number(out?.stats?.created ?? 0);
        const updated = Number(out?.stats?.updated ?? 0);
        const dedupeGroups = Number(out?.stats?.dedupeGroups ?? 0);
        const dedupeDeleted = Number(out?.stats?.dedupeDeleted ?? 0);

        push(
          `✅ Server batch complete. fetched=${fetched} processed=${processed} created=${created} updated=${updated} dedupeGroups=${dedupeGroups} dedupeDeleted=${dedupeDeleted}`
        );
        if (out?.debug) push(`Debug:\n${truncate(out.debug)}`);

        // Save checkpoint after successful server batch (even in dry-run)
        saveCheckpointToStorage(nextPage);
        setCheckpoint({ loaded: true, pageNext: nextPage });
        push(`💾 Checkpoint saved (local): nextPage=${nextPage}`);

        // Also persist progress in URL so refresh can continue with no thinking
        writeUrlParams({ startPage: nextPage, perPage: per, ppb });

        const lr = loadLastRunFromStorage() || lr0;
        const totals = lr?.progress?.totals || lr0.progress.totals;
        const updatedTotals = {
          fetched: totals.fetched + fetched,
          processed: totals.processed + processed,
          created: totals.created + created,
          updated: totals.updated + updated,
          dedupeGroups: totals.dedupeGroups + dedupeGroups,
          dedupeDeleted: totals.dedupeDeleted + dedupeDeleted,
        };
        const lr1 = {
          ...lr,
          status: "running",
          progress: {
            ...lr.progress,
            lastBatchPage: batchPage,
            nextPage,
            batchesCompleted: (lr.progress?.batchesCompleted || 0) + 1,
            totals: updatedTotals,
          },
          lastError: null,
        };
        setLastRun(lr1);
        saveLastRunToStorage(lr1);

        currentPage = nextPage;

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

      const lrDone = loadLastRunFromStorage() || lr0;
      const lr2 = { ...lrDone, status: "complete", finishedAt: new Date().toISOString() };
      setLastRun(lr2);
      saveLastRunToStorage(lr2);
    } catch (e) {
      const msg = String(e?.message || e);
      push(`❌ ERROR: ${msg}`);
      push(`Raw error:\n${truncate({ message: e?.message, raw: e?.raw || e })}`);

      const lrErr = loadLastRunFromStorage() || lr0;
      const lr3 = { ...lrErr, status: "error", lastError: msg, finishedAt: new Date().toISOString() };
      setLastRun(lr3);
      saveLastRunToStorage(lr3);
    } finally {
      setRunning(false);
      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  const resumeFromCheckpoint = () => {
    setStartPage(checkpoint.pageNext || 0);
    writeUrlParams({
      startPage: Number(checkpoint.pageNext || 0),
      perPage: Number(perPage || 100),
      ppb: Number(pagesPerBatch || 1),
    });
    push(`↩️ Start page set from local checkpoint: ${checkpoint.pageNext || 0}`);
  };

  const clearCheckpoint = () => {
    clearCheckpointStorage();
    setCheckpoint({ loaded: true, pageNext: 0 });
    push(`🧹 Local checkpoint cleared (pageNext=0)`);
  };

  const clearLastRun = () => {
    clearLastRunStorage();
    setLastRun(null);
    push(`🧹 LastRun cleared`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master</div>
          <div className="text-sm text-slate-600 mt-1">Runs server-side upsert + dedupe by unitid.</div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Resolved function: <span className="font-mono">{scorecardFn || "(not resolved yet)"}</span>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Run status</div>
          {!lastRun ? (
            <div className="mt-2 text-sm text-slate-700">No last run recorded yet.</div>
          ) : (
            <div className="mt-2 text-sm text-slate-700 space-y-1">
              <div>
                Status: <span className="font-mono">{lastRun.status}</span>
              </div>
              <div>
                Started: <span className="font-mono">{lastRun.startedAt || "-"}</span>
              </div>
              <div>
                Finished: <span className="font-mono">{lastRun.finishedAt || "-"}</span>
              </div>
              <div>
                Last batch page: <span className="font-mono">{String(lastRun.progress?.lastBatchPage ?? "-")}</span>
                {"  "}Next page: <span className="font-mono">{String(lastRun.progress?.nextPage ?? "-")}</span>
                {"  "}Batches: <span className="font-mono">{String(lastRun.progress?.batchesCompleted ?? 0)}</span>
              </div>
              <div className="text-xs text-slate-600">
                Totals: fetched={lastRun.progress?.totals?.fetched ?? 0} processed={lastRun.progress?.totals?.processed ?? 0} created=
                {lastRun.progress?.totals?.created ?? 0} updated={lastRun.progress?.totals?.updated ?? 0} dedupeGroups=
                {lastRun.progress?.totals?.dedupeGroups ?? 0} dedupeDeleted={lastRun.progress?.totals?.dedupeDeleted ?? 0}
              </div>
              {lastRun.lastError ? (
                <div className="text-xs text-red-700">
                  Last error: <span className="font-mono">{lastRun.lastError}</span>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-3 flex gap-2 flex-wrap">
            <Button disabled={running} onClick={clearLastRun} variant="outline">
              Clear LastRun
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Checkpoint</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>
              Next page (local): <span className="font-mono">{checkpoint.pageNext}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Tip: checkpoint is also mirrored into the URL after each successful batch.
            </div>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button disabled={!checkpoint.loaded || running} onClick={resumeFromCheckpoint} variant="outline">
              Set Start Page to Checkpoint
            </Button>
            <Button disabled={running} onClick={clearCheckpoint} variant="outline">
              Clear Checkpoint
            </Button>
            <Button disabled={running} onClick={resolveScorecardFunction} variant="outline">
              Resolve Function Name
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
          </div>

          {!dryRun && (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="text-sm text-slate-700">Writes are performed server-side with dedupe by unitid.</div>
              <label className="text-sm">
                Scorecard fetch tries{" "}
                <input
                  className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                  value={scorecardFetchTries}
                  onChange={(e) => setScorecardFetchTries(e.target.value)}
                  disabled={running}
                />
              </label>
            </div>
          )}

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
