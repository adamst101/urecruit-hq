// src/pages/AdminSeedSchoolsMaster.jsx
import React, { useMemo, useRef, useState } from "react";
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

function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
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

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many") || msg.includes("429");
}

function resolveEntity(nameA, nameB) {
  const e = base44?.entities;
  if (!e) return null;
  if (e[nameA]) return { key: nameA, entity: e[nameA] };
  if (e[nameB]) return { key: nameB, entity: e[nameB] };
  return null;
}

async function retryable(fn, opts) {
  const {
    tries = 5,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    jitterMs = 200,
    onRetry = null,
    shouldRetry = isRateLimitError,
  } = opts || {};

  let lastErr = null;

  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retry = shouldRetry(e) && i < tries - 1;
      if (!retry) throw e;

      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, i));
      const jitter = Math.floor(Math.random() * (jitterMs + 1));
      const wait = backoff + jitter;
      if (onRetry) onRetry(e, i + 1, wait);
      await sleep(wait);
    }
  }

  throw lastErr;
}

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const entityKeys = useMemo(() => {
    try {
      return Object.keys(base44?.entities || {}).sort();
    } catch {
      return [];
    }
  }, []);

  const schoolResolved = useMemo(() => resolveEntity("School", "Schools"), []);
  const eventResolved = useMemo(() => resolveEntity("Event", "Events"), []);
  const SchoolEntity = schoolResolved?.entity || null;

  const [working, setWorking] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const [log, setLog] = useState([]);

  // Controls
  const [dryRun, setDryRun] = useState(true);

  // Batch controls
  const [startPage, setStartPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [pagesPerBatch, setPagesPerBatch] = useState(2);
  const [delayMs, setDelayMs] = useState(750);

  // Write throttling (only used when dryRun=false)
  const [perOpDelayMs, setPerOpDelayMs] = useState(75);

  // Progress
  const [progress, setProgress] = useState({
    batches: 0,
    pagesProcessed: 0,
    rowsFetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    lastPageStart: null,
    lastBatchRows: 0,
    done: false,
    stopped: false,
    lastError: null,
  });

  const push = (m) => setLog((x) => [...x, m]);

  const resetRunState = () => {
    setLog([]);
    setProgress({
      batches: 0,
      pagesProcessed: 0,
      rowsFetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      lastPageStart: null,
      lastBatchRows: 0,
      done: false,
      stopped: false,
      lastError: null,
    });
  };

  const stop = () => {
    cancelRef.current = true;
    setRunning(false);
    setProgress((p) => ({ ...p, stopped: true }));
    push(`⏹️ Stop requested @ ${new Date().toISOString()}`);
  };

  const runOneBatch = async (page0, perPageNum, pagesInBatchNum) => {
    const raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
      page: Number(page0 || 0),
      perPage: Number(perPageNum || 100),
      maxPages: Number(pagesInBatchNum || 1),
    });

    const resp = unwrapInvokeResponse(raw);
    if (resp && resp.error) throw new Error(String(resp.error));

    const rows = resp && Array.isArray(resp.rows) ? resp.rows : [];
    const debug = resp && resp.debug ? resp.debug : null;
    return { rows, debug };
  };

  const upsertRow = async (r) => {
    const source_key = r && r.source_key ? String(r.source_key) : null;
    const unitid = r && r.unitid ? String(r.unitid) : null;
    const name = r && r.school_name ? String(r.school_name) : null;

    if (!source_key || !name) return { mode: "skipped" };

    // Schema-aligned payload ONLY
    const payload = {
      school_name: name,
      normalized_name: r.normalized_name || null,
      city: r.city || null,
      state: r.state || null,
      country: "US",
      division: null,
      subdivision: null,
      conference: null,
      logo_url: null,
      website_url: r.website_url || null,
      unitid: unitid || null,
      source_platform: "scorecard",
      source_key: source_key,
      source_school_url: null,
      active: true,
      last_seen_at: new Date().toISOString(),
    };

    const existingRows = await SchoolEntity.filter({ source_key: source_key });
    const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;

    if (existing && existing.id) {
      await SchoolEntity.update(String(existing.id), payload);
      return { mode: "updated" };
    }

    await SchoolEntity.create(payload);
    return { mode: "created" };
  };

  const upsertRowsToSchool = async (rows) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      if (cancelRef.current) break;

      const r = rows[i];

      // DryRun: no DB calls at all
      if (dryRun) continue;

      const res = await retryable(
        async () => {
          return await upsertRow(r);
        },
        {
          tries: 6,
          baseDelayMs: 600,
          maxDelayMs: 6000,
          jitterMs: 250,
          onRetry: (e, attempt, wait) => {
            push(`⚠️ Rate limit hit. Retry attempt ${attempt} in ${wait}ms`);
          },
        }
      );

      if (res.mode === "created") created += 1;
      else if (res.mode === "updated") updated += 1;
      else skipped += 1;

      if (perOpDelayMs > 0) await sleep(perOpDelayMs);
      if (i > 0 && i % 100 === 0) await sleep(0);
    }

    return { created, updated, skipped };
  };

  const startAutoRun = async () => {
    if (!canRun) return;

    if (!SchoolEntity || !SchoolEntity.filter || !SchoolEntity.create || !SchoolEntity.update) {
      setLog([
        `❌ ERROR: Could not resolve School entity from base44.entities.`,
        `Resolved School key: ${schoolResolved?.key || "NONE"}`,
        `Available entities (first 40): ${entityKeys.slice(0, 40).join(", ")}`,
      ]);
      return;
    }

    cancelRef.current = false;
    setRunning(true);
    setWorking(true);
    resetRunState();

    const page0 = Number(startPage || 0);
    const per = Number(perPage || 100);
    const ppb = Math.max(1, Number(pagesPerBatch || 1));
    const delay = Math.max(0, Number(delayMs || 0));

    // Hidden safety cap only (not user-facing): prevents infinite loop if API repeats pages forever
    const SAFETY_MAX_BATCHES = 2000;

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`Resolved entity: School=${schoolResolved?.key || "NONE"} Event=${eventResolved?.key || "NONE"}`);
    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(`DryRun=${dryRun} startPage=${page0} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay}`);
    if (!dryRun) push(`Write throttle: perOpDelayMs=${perOpDelayMs}`);
    else push(`DryRun: no DB reads/writes (prevents Base44 rate limiting).`);

    let currentPage = page0;

    try {
      for (let b = 0; b < SAFETY_MAX_BATCHES; b++) {
        if (cancelRef.current) {
          setProgress((p) => ({ ...p, stopped: true }));
          break;
        }

        setProgress((p) => ({
          ...p,
          batches: p.batches + 1,
          lastPageStart: currentPage,
          lastError: null,
        }));

        push(`\n--- Batch ${b + 1} ---`);
        push(`Fetching page=${currentPage} maxPages=${ppb} perPage=${per} ...`);

        const out = await retryable(
          async () => runOneBatch(currentPage, per, ppb),
          {
            tries: 2,
            baseDelayMs: 1200,
            maxDelayMs: 1200,
            jitterMs: 200,
            onRetry: (e, attempt, wait) => push(`⚠️ Fetch failed. Retry ${attempt} in ${wait}ms`),
            shouldRetry: (e) => {
              const msg = String(e?.message || e).toLowerCase();
              return msg.includes("timeout") || msg.includes("network") || msg.includes("429") || msg.includes("rate");
            },
          }
        );

        const rows = out.rows || [];
        const debug = out.debug || null;
        const expectedMax = per * ppb;

        push(`✅ Fetched rows: ${rows.length} (expected up to ${expectedMax})`);
        if (debug && debug.pageCalls) push(`PageCalls:\n${safeJson(debug.pageCalls)}`);

        setProgress((p) => ({
          ...p,
          rowsFetched: p.rowsFetched + rows.length,
          lastBatchRows: rows.length,
        }));

        // Completion condition 1: no rows
        if (!rows.length) {
          push(`🏁 No rows returned. Completed.`);
          setProgress((p) => ({ ...p, done: true }));
          break;
        }

        if (dryRun) {
          push(`DryRun complete for batch. WouldUpsert=${rows.length}`);
        } else {
          push(`Writing upserts to School...`);
          const up = await upsertRowsToSchool(rows);
          push(`✅ Upsert batch complete. Created=${up.created} Updated=${up.updated} Skipped=${up.skipped}`);
          setProgress((p) => ({
            ...p,
            created: p.created + up.created,
            updated: p.updated + up.updated,
            skipped: p.skipped + up.skipped,
          }));
        }

        setProgress((p) => ({ ...p, pagesProcessed: p.pagesProcessed + ppb }));
        currentPage = currentPage + ppb;

        // Completion condition 2: partial block means end of dataset
        if (rows.length < expectedMax) {
          push(`🏁 Fetched fewer than ${expectedMax}. Treating as complete.`);
          setProgress((p) => ({ ...p, done: true }));
          break;
        }

        if (delay > 0) {
          push(`Sleeping ${delay}ms to avoid throttling...`);
          await sleep(delay);
        }
      }
    } catch (e) {
      const msg = String(e?.message || e);
      push(`❌ ERROR: ${msg}`);
      setProgress((p) => ({ ...p, lastError: msg }));
    } finally {
      setWorking(false);
      setRunning(false);
      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master (Run to completion)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs Scorecard fetch + upsert batches until the dataset ends. DryRun uses zero DB calls.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Entity Diagnostics</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>
              Resolved School entity: <span className="font-mono">{schoolResolved?.key || "NONE"}</span>
            </div>
            <div>
              Resolved Event entity: <span className="font-mono">{eventResolved?.key || "NONE"}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Entities (first 40): {entityKeys.slice(0, 40).join(", ")}
            </div>
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
              <label className="text-sm">
                Per-op delay (ms){" "}
                <input
                  className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                  value={perOpDelayMs}
                  onChange={(e) => setPerOpDelayMs(e.target.value)}
                  disabled={running}
                />
              </label>
              <div className="text-xs text-slate-500">
                If you still hit Base44 rate limits, raise to 100–200ms.
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button disabled={working || running} onClick={startAutoRun}>
              Run until complete
            </Button>
            <Button disabled={!running} onClick={stop} variant="outline">
              Stop
            </Button>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Recommended write settings: pagesPerBatch=2, perOpDelayMs=75, delayMs=750.
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-slate-900">Log</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{asArray(log).join("\n")}</pre>
        </Card>
      </div>
    </div>
  );
}
