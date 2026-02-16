// src/pages/AdminSeedSchoolsMaster.jsx
// Option A + Option B (FULL FILE)
// A) Auto-resume after refresh if a run was in-progress.
// B) Bigger server batches (default pagesPerBatch=5) to reduce client loop count.
// Notes:
// - Writes are SERVER-SIDE via seedSchoolsMaster_scorecard (idempotent + self-healing).
// - Checkpoint saved after every successful batch (even dryRun).
// - URL params persist start/per/ppb so refresh restores intent.

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

// ---------------------------
// URL param persistence
// ---------------------------
function getUrlParams() {
  try {
    const u = new URL(window.location.href);
    const sp = u.searchParams;
    const startPage = Number(sp.get("startPage") || "0");
    const perPage = Number(sp.get("perPage") || "100");
    const ppb = Number(sp.get("ppb") || "5");
    const dry = sp.get("dryRun");
    return {
      startPage: Number.isFinite(startPage) && startPage >= 0 ? startPage : 0,
      perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 100,
      pagesPerBatch: Number.isFinite(ppb) && ppb > 0 ? ppb : 5,
      dryRun: dry === null ? null : dry === "1" || dry === "true",
    };
  } catch {
    return { startPage: 0, perPage: 100, pagesPerBatch: 5, dryRun: null };
  }
}
function writeUrlParams({ startPage, perPage, ppb, dryRun }) {
  try {
    const u = new URL(window.location.href);
    if (startPage !== undefined) u.searchParams.set("startPage", String(Number(startPage || 0)));
    if (perPage !== undefined) u.searchParams.set("perPage", String(Number(perPage || 100)));
    if (ppb !== undefined) u.searchParams.set("ppb", String(Number(ppb || 5)));
    if (dryRun !== undefined && dryRun !== null) u.searchParams.set("dryRun", dryRun ? "1" : "0");
    window.history.replaceState({}, "", u.toString());
  } catch {}
}

// ---------------------------
// Local checkpoint storage
// ---------------------------
const CHECKPOINT_STORAGE_KEY = "campapp_admin_seed_schools_master_pageNext_v2";
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

// ---------------------------
// Last-run persistence (Option A)
// ---------------------------
const LAST_RUN_STORAGE_KEY = "campapp_admin_seed_schools_master_lastRun_v1";
function loadLastRunFromStorage() {
  try {
    const raw = window.localStorage.getItem(LAST_RUN_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}
function saveLastRunToStorage(obj) {
  try {
    window.localStorage.setItem(LAST_RUN_STORAGE_KEY, JSON.stringify(obj || {}));
  } catch {}
}

const AUTO_RESUME_ENABLED = true;
const AUTO_RESUME_DELAY_MS = 1200;

function shouldAutoResume(lastRunObj) {
  if (!AUTO_RESUME_ENABLED) return false;
  if (!lastRunObj) return false;
  if (lastRunObj.status !== "running") return false;
  const next = Number(lastRunObj.progress?.nextPage ?? 0);
  return Number.isFinite(next) && next > 0;
}

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const [log, setLog] = useState([]);
  const push = (m) => setLog((x) => [...x, m]);

  // Controls (Option B defaults)
  const urlInit = useMemo(() => getUrlParams(), []);
  const [dryRun, setDryRun] = useState(urlInit.dryRun === null ? true : !!urlInit.dryRun);
  const [startPage, setStartPage] = useState(urlInit.startPage ?? 0);
  const [perPage, setPerPage] = useState(urlInit.perPage ?? 100);
  const [pagesPerBatch, setPagesPerBatch] = useState(urlInit.pagesPerBatch ?? 5);
  const [delayMs, setDelayMs] = useState(2500);
  const [scorecardFetchTries, setScorecardFetchTries] = useState(8);

  // Function resolution
  const [scorecardFn, setScorecardFn] = useState(null);

  // Checkpoint
  const [checkpoint, setCheckpoint] = useState({ loaded: false, pageNext: 0 });
  useEffect(() => {
    const n = loadCheckpointFromStorage();
    setCheckpoint({ loaded: true, pageNext: n });
  }, []);

  // Keep URL params in sync with controls
  useEffect(() => {
    writeUrlParams({ startPage, perPage, ppb: pagesPerBatch, dryRun });
  }, [startPage, perPage, pagesPerBatch, dryRun]);

  const stop = () => {
    cancelRef.current = true;
    setRunning(false);
    push(`⏹️ Stop requested @ ${new Date().toISOString()}`);

    const lr = loadLastRunFromStorage();
    if (lr && lr.status === "running") {
      saveLastRunToStorage({
        ...lr,
        status: "stopped",
        stoppedAt: new Date().toISOString(),
      });
    }
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
          // Server-side throttles (tuned for Base44 429 reality)
          delayMs: 260,
          deleteDelayMs: 320,
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

        const wait = Math.min(22000, 2000 * Math.pow(2, i)) + Math.floor(Math.random() * 300);
        push(`Waiting ${wait}ms then retrying same batch...`);
        await sleep(wait);
      }
    }

    throw last || new Error("Server batch failed");
  }

  const startAutoRun = async () => {
    if (!canRun) return;

    setRunning(true);
    cancelRef.current = false;

    // Record run intent (Option A)
    const initialNext = Number(startPage || 0);
    saveLastRunToStorage({
      status: "running",
      startedAt: new Date().toISOString(),
      env: { host: env.host, label: env.label, dataEnv: env.dataEnv },
      params: {
        dryRun: !!dryRun,
        startPage: Number(startPage || 0),
        perPage: Number(perPage || 100),
        pagesPerBatch: Number(pagesPerBatch || 5),
        delayMs: Number(delayMs || 0),
      },
      progress: { lastBatchPage: null, nextPage: initialNext, batches: 0 },
      totals: { fetched: 0, processed: 0, created: 0, updated: 0, dedupeGroups: 0, dedupeDeleted: 0 },
    });

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`Write path: server-side (seedSchoolsMaster_scorecard)`);
    push(`Checkpoint (local): pageNext=${checkpoint.pageNext}`);

    let fn = scorecardFn;
    if (!fn) fn = await resolveScorecardFunction();
    if (!fn) {
      setRunning(false);
      const lr = loadLastRunFromStorage();
      if (lr && lr.status === "running") saveLastRunToStorage({ ...lr, status: "error", error: "Function not found" });
      return;
    }

    const per = Number(perPage || 100);
    const ppb = Math.max(1, Number(pagesPerBatch || 5));
    const delay = Math.max(0, Number(delayMs || 0));
    let currentPage = Number(startPage || 0);

    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(`Function=${fn}`);
    push(`DryRun=${dryRun} startPage=${currentPage} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay}`);
    push(`Scorecard batch tries=${scorecardFetchTries}`);
    push(`Server throttles: delayMs=260 deleteDelayMs=320`);

    try {
      // Safety: if someone fat-fingers ppb huge, keep UI stable
      const HARD_MAX_BATCHES = 5000;

      // Totals for last-run persistence
      let totalFetched = 0;
      let totalProcessed = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalDedupeGroups = 0;
      let totalDedupeDeleted = 0;

      for (let b = 0; b < HARD_MAX_BATCHES; b++) {
        if (cancelRef.current) break;

        const batchPage = currentPage;
        const nextPage = batchPage + ppb;
        const expectedMax = per * ppb;

        push(`\n--- Batch ${b + 1} ---`);
        push(`Running server batch page=${batchPage} maxPages=${ppb} perPage=${per} (nextPage=${nextPage}) ...`);

        // Persist "about to run" progress so refresh can resume even if call hangs/crashes
        {
          const lr = loadLastRunFromStorage();
          if (lr && lr.status === "running") {
            saveLastRunToStorage({
              ...lr,
              progress: {
                ...(lr.progress || {}),
                lastBatchPage: batchPage,
                nextPage,
                batches: Number(lr.progress?.batches || 0) + 1,
              },
            });
          }
        }

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

        totalFetched += fetched;
        totalProcessed += processed;
        totalCreated += created;
        totalUpdated += updated;
        totalDedupeGroups += dedupeGroups;
        totalDedupeDeleted += dedupeDeleted;

        push(
          `✅ Server batch complete. fetched=${fetched} processed=${processed} created=${created} updated=${updated} dedupeGroups=${dedupeGroups} dedupeDeleted=${dedupeDeleted}`
        );
        if (out?.debug) push(`Debug:\n${truncate(out.debug)}`);

        // Save checkpoint after a successful server batch (even in dry-run)
        saveCheckpointToStorage(nextPage);
        setCheckpoint({ loaded: true, pageNext: nextPage });
        push(`💾 Checkpoint saved (local): nextPage=${nextPage}`);

        // Persist totals + progress (Option A)
        {
          const lr = loadLastRunFromStorage();
          if (lr && lr.status === "running") {
            saveLastRunToStorage({
              ...lr,
              progress: { ...(lr.progress || {}), lastBatchPage: batchPage, nextPage },
              totals: {
                fetched: totalFetched,
                processed: totalProcessed,
                created: totalCreated,
                updated: totalUpdated,
                dedupeGroups: totalDedupeGroups,
                dedupeDeleted: totalDedupeDeleted,
              },
            });
          }
        }

        currentPage = nextPage;
        setStartPage(nextPage); // reflect progress in UI control + URL

        if (!fetched) {
          push(`🏁 fetched=0. Completed.`);
          const lr = loadLastRunFromStorage();
          if (lr && lr.status === "running") {
            saveLastRunToStorage({ ...lr, status: "complete", completedAt: new Date().toISOString() });
          }
          break;
        }
        if (fetched < expectedMax) {
          push(`🏁 fetched fewer than ${expectedMax}. Treating as complete.`);
          const lr = loadLastRunFromStorage();
          if (lr && lr.status === "running") {
            saveLastRunToStorage({ ...lr, status: "complete", completedAt: new Date().toISOString() });
          }
          break;
        }

        if (delay > 0) {
          push(`Sleeping ${delay}ms...`);
          await sleep(delay);
        }
      }

      if (cancelRef.current) {
        const lr = loadLastRunFromStorage();
        if (lr && lr.status === "running") {
          saveLastRunToStorage({ ...lr, status: "stopped", stoppedAt: new Date().toISOString() });
        }
      }
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
      push(`Raw error:\n${truncate({ message: e?.message, raw: e?.raw || e })}`);

      const lr = loadLastRunFromStorage();
      if (lr && lr.status === "running") {
        saveLastRunToStorage({
          ...lr,
          status: "error",
          error: String(e?.message || e),
          erroredAt: new Date().toISOString(),
        });
      }
    } finally {
      setRunning(false);
      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  // Option A: auto-resume after refresh if a run was in-progress
  useEffect(() => {
    if (!canRun) return;
    if (running) return;

    const lr = loadLastRunFromStorage();
    if (!shouldAutoResume(lr)) return;

    const next = Number(lr.progress?.nextPage ?? 0);
    const per = Number(lr.params?.perPage ?? 100);
    const ppb = Number(lr.params?.pagesPerBatch ?? 5);
    const dr = !!(lr.params?.dryRun ?? true);

    // restore UI controls + URL
    setDryRun(dr);
    setPerPage(per);
    setPagesPerBatch(ppb);
    setStartPage(next);
    writeUrlParams({ startPage: next, perPage: per, ppb, dryRun: dr });

    setTimeout(() => {
      const lr2 = loadLastRunFromStorage();
      if (!shouldAutoResume(lr2)) return;

      setLog((x) => [
        ...x,
        `\n🔁 Auto-resume after refresh. Continuing from page ${next} @ ${new Date().toISOString()}\n`,
      ]);
      startAutoRun();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, AUTO_RESUME_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, running]);

  const resumeFromCheckpoint = () => {
    const next = checkpoint.pageNext || 0;
    setStartPage(next);
    writeUrlParams({ startPage: next });
    push(`↩️ Start page set from local checkpoint: ${next}`);
  };

  const clearCheckpoint = () => {
    clearCheckpointStorage();
    setCheckpoint({ loaded: true, pageNext: 0 });
    push(`🧹 Local checkpoint cleared (pageNext=0)`);
  };

  const clearLastRun = () => {
    try {
      window.localStorage.removeItem(LAST_RUN_STORAGE_KEY);
      push(`🧹 LastRun cleared (auto-resume disabled until a new run starts)`);
    } catch {}
  };

  const showLastRun = () => {
    const lr = loadLastRunFromStorage();
    push(`\nLastRun:\n${truncate(lr || { empty: true })}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs server-side upsert + dedupe by unitid. Auto-resumes after refresh.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Resolved function: <span className="font-mono">{scorecardFn || "(not resolved yet)"}</span>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Checkpoint</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>
              Next page (local): <span className="font-mono">{checkpoint.pageNext}</span>
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
            <Button disabled={running} onClick={showLastRun} variant="outline">
              Show LastRun
            </Button>
            <Button disabled={running} onClick={clearLastRun} variant="outline">
              Clear LastRun
            </Button>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Auto-resume: <span className="font-mono">{AUTO_RESUME_ENABLED ? "ON" : "OFF"}</span> (delay{" "}
            {AUTO_RESUME_DELAY_MS}ms)
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
                Scorecard batch tries{" "}
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

          <div className="mt-3 text-xs text-slate-500">
            Tip: for fastest completion, use pagesPerBatch=5 and perPage=100 (500 rows/batch). Checkpoint persists even
            if the page refreshes.
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
