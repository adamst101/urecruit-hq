// src/pages/AdminSeedSchoolsMaster.jsx
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
function truncate(x, n = 2000) {
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

const CHECKPOINT_KEY = "admin_seed_schools_master_v1";

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const schoolResolved = useMemo(() => resolveEntity("School", "Schools"), []);
  const eventResolved = useMemo(() => resolveEntity("Event", "Events"), []);
  const queryResolved = useMemo(() => resolveEntity("Query", "Queries"), []);

  const SchoolEntity = schoolResolved?.entity || null;
  const QueryEntity = queryResolved?.entity || null;

  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const [log, setLog] = useState([]);
  const push = (m) => setLog((x) => [...x, m]);

  // Controls
  const [dryRun, setDryRun] = useState(true);
  const [startPage, setStartPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [pagesPerBatch, setPagesPerBatch] = useState(1);
  const [delayMs, setDelayMs] = useState(750);
  const [perOpDelayMs, setPerOpDelayMs] = useState(75);

  // Checkpoint state
  const [checkpoint, setCheckpoint] = useState({
    loaded: false,
    pageNext: 0,
    lastUpdatedAt: null,
  });

  const loadCheckpoint = async () => {
    if (!QueryEntity?.filter) {
      setCheckpoint((c) => ({ ...c, loaded: true }));
      return;
    }
    try {
      const rows = await QueryEntity.filter({ key: CHECKPOINT_KEY });
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      const pageNext = Number(row?.page_next ?? 0) || 0;
      setCheckpoint({
        loaded: true,
        pageNext,
        lastUpdatedAt: row?.last_updated_at || null,
      });
    } catch {
      setCheckpoint((c) => ({ ...c, loaded: true }));
    }
  };

  const saveCheckpoint = async (pageNext) => {
    if (!QueryEntity?.filter || !QueryEntity?.create || !QueryEntity?.update) return;

    const now = new Date().toISOString();
    const rows = await QueryEntity.filter({ key: CHECKPOINT_KEY });
    const existing = Array.isArray(rows) && rows.length ? rows[0] : null;

    const payload = { key: CHECKPOINT_KEY, page_next: Number(pageNext || 0), last_updated_at: now };

    if (existing?.id) await QueryEntity.update(String(existing.id), payload);
    else await QueryEntity.create(payload);

    setCheckpoint((c) => ({ ...c, pageNext: Number(pageNext || 0), lastUpdatedAt: now }));
  };

  useEffect(() => {
    loadCheckpoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    cancelRef.current = true;
    setRunning(false);
    push(`⏹️ Stop requested @ ${new Date().toISOString()}`);
  };

  // --- PROBE: call the function once and print raw response ---
  const probeScorecard = async () => {
    if (!canRun) return;
    push(`\nProbe start @ ${new Date().toISOString()}`);
    try {
      const raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
        page: 0,
        perPage: 5,
        maxPages: 1,
      });
      push(`Probe raw response:\n${truncate(raw)}`);
      const resp = unwrapInvokeResponse(raw);
      push(`Probe unwrapped:\n${truncate(resp)}`);
    } catch (e) {
      push(`Probe threw error:\n${truncate({ message: e?.message, stack: e?.stack, raw: e })}`);
    }
  };

  const runOneBatch = async (page0, perPageNum, pagesInBatchNum) => {
    let raw;
    try {
      raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
        page: Number(page0 || 0),
        perPage: Number(perPageNum || 100),
        maxPages: Number(pagesInBatchNum || 1),
      });
    } catch (e) {
      // invoke itself failed
      push(`Invoke threw error:\n${truncate({ message: e?.message, stack: e?.stack, raw: e })}`);
      throw e;
    }

    const resp = unwrapInvokeResponse(raw);

    // Always log raw on failure
    if (resp && resp.error) {
      push(`Function returned error: ${String(resp.error)}`);
      push(`Function raw response:\n${truncate(raw)}`);
      push(`Function debug:\n${truncate(resp.debug || null)}`);
      throw new Error(String(resp.error));
    }

    const rows = resp && Array.isArray(resp.rows) ? resp.rows : [];
    const debug = resp && resp.debug ? resp.debug : null;
    return { rows, debug };
  };

  const upsertRow = async (r) => {
    const source_key = r && r.source_key ? String(r.source_key) : null;
    const unitid = r && r.unitid ? String(r.unitid) : null;
    const name = r && r.school_name ? String(r.school_name) : null;

    if (!source_key || !name) return { mode: "skipped" };

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
      if (dryRun) continue;

      const res = await retryable(
        async () => upsertRow(rows[i]),
        {
          tries: 6,
          baseDelayMs: 600,
          maxDelayMs: 6000,
          jitterMs: 250,
          onRetry: (e, attempt, wait) => push(`⚠️ Rate limit hit. Retry attempt ${attempt} in ${wait}ms`),
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

    setLog([]);
    cancelRef.current = false;
    setRunning(true);

    const per = Number(perPage || 100);
    const ppb = Math.max(1, Number(pagesPerBatch || 1));
    const delay = Math.max(0, Number(delayMs || 0));
    let currentPage = Number(startPage || 0);

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`Resolved entity: School=${schoolResolved?.key || "NONE"} Event=${eventResolved?.key || "NONE"}`);
    push(`Checkpoint: pageNext=${checkpoint.pageNext}`);
    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(`DryRun=${dryRun} startPage=${currentPage} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay}`);
    if (!dryRun) push(`Write throttle: perOpDelayMs=${perOpDelayMs}`);

    try {
      for (let b = 0; b < 2000; b++) {
        if (cancelRef.current) break;

        push(`\n--- Batch ${b + 1} ---`);
        push(`Fetching page=${currentPage} maxPages=${ppb} perPage=${per} ...`);

        const out = await runOneBatch(currentPage, per, ppb);

        const rows = out.rows || [];
        const debug = out.debug || null;
        const expectedMax = per * ppb;

        push(`✅ Fetched rows: ${rows.length} (expected up to ${expectedMax})`);
        if (debug) push(`Fetch debug:\n${truncate(debug)}`);

        if (!rows.length) {
          push(`🏁 No rows returned. Completed.`);
          break;
        }

        if (dryRun) {
          push(`DryRun complete for batch. WouldUpsert=${rows.length}`);
        } else {
          if (!SchoolEntity?.filter || !SchoolEntity?.create || !SchoolEntity?.update) {
            push(`❌ ERROR: School entity not available for upserts.`);
            break;
          }
          push(`Writing upserts to School...`);
          const up = await upsertRowsToSchool(rows);
          push(`✅ Upsert batch complete. Created=${up.created} Updated=${up.updated} Skipped=${up.skipped}`);
        }

        const nextPage = currentPage + ppb;

        if (!dryRun) {
          await saveCheckpoint(nextPage);
          push(`💾 Checkpoint saved: nextPage=${nextPage}`);
        }

        currentPage = nextPage;

        if (rows.length < expectedMax) {
          push(`🏁 Fetched fewer than ${expectedMax}. Treating as complete.`);
          if (!dryRun) await saveCheckpoint(currentPage);
          break;
        }

        if (delay > 0) {
          push(`Sleeping ${delay}ms to avoid throttling...`);
          await sleep(delay);
        }
      }
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
    } finally {
      setRunning(false);
      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  const resumeFromCheckpoint = () => {
    setStartPage(checkpoint.pageNext || 0);
    push(`↩️ Start page set from checkpoint: ${checkpoint.pageNext || 0}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master</div>
          <div className="text-sm text-slate-600 mt-1">
            Added probe + raw error logging so Scorecard HTTP 500 becomes diagnosable.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Checkpoint</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>Next page: <span className="font-mono">{checkpoint.pageNext}</span></div>
            <div>Last updated: {checkpoint.lastUpdatedAt || "-"}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={!checkpoint.loaded || running} onClick={resumeFromCheckpoint} variant="outline">
              Set Start Page to Checkpoint
            </Button>
            <Button disabled={running} onClick={probeScorecard} variant="outline">
              Probe Scorecard
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
              <label className="text-sm">
                Per-op delay (ms){" "}
                <input
                  className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                  value={perOpDelayMs}
                  onChange={(e) => setPerOpDelayMs(e.target.value)}
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
