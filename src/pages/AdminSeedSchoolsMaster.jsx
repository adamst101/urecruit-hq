// src/pages/AdminSeedSchoolsMaster.jsx
import React, { useMemo, useRef, useState } from "react";
import { base44 } from "../api/base44Client";
import { School } from "../api/entities";

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
function diagnoseAxiosError(e) {
  return {
    message: String(e?.message || e),
    status: e?.response?.status ?? null,
    statusText: e?.response?.statusText ?? null,
    data: e?.response?.data ?? null,
  };
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

async function upsertSchoolBySourceKey(sourceKey, payload, dryRun) {
  const rows = await School.filter({ source_key: sourceKey });
  const existing = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (dryRun) {
    return {
      mode: existing && existing.id ? "would_update" : "would_create",
      id: existing && existing.id ? String(existing.id) : null,
    };
  }

  if (existing && existing.id) {
    await School.update(String(existing.id), payload);
    return { mode: "updated", id: String(existing.id) };
  }

  const created = await School.create(payload);
  return { mode: "created", id: created && created.id ? String(created.id) : null };
}

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const [working, setWorking] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const [log, setLog] = useState([]);

  // Controls
  const [dryRun, setDryRun] = useState(true);

  // Batch controls
  const [startPage, setStartPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [pagesPerBatch, setPagesPerBatch] = useState(5); // 5 pages = up to 500 rows per batch
  const [delayMs, setDelayMs] = useState(500);
  const [maxBatches, setMaxBatches] = useState(250); // safety stop

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
    if (resp && resp.error) {
      const err = new Error(String(resp.error));
      err._payload = resp;
      throw err;
    }

    const rows = resp && Array.isArray(resp.rows) ? resp.rows : [];
    const debug = resp && resp.debug ? resp.debug : null;
    return { rows, debug };
  };

  const upsertRows = async (rows) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const source_key = r && r.source_key ? String(r.source_key) : null;
      const unitid = r && r.unitid ? String(r.unitid) : null;
      const name = r && r.school_name ? String(r.school_name) : null;

      if (!source_key || !name) {
        skipped += 1;
        continue;
      }

      // Schema-aligned payload (ONLY fields that exist in School entity)
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

        // NOTE: You may want to add "scorecard" to your source_platform description list.
        source_platform: "scorecard",
        source_key: source_key,
        source_school_url: null,

        active: true,
        last_seen_at: new Date().toISOString(),
      };

      const res = await upsertSchoolBySourceKey(source_key, payload, dryRun);
      if (res.mode === "created") created += 1;
      else if (res.mode === "updated") updated += 1;

      if (i > 0 && i % 200 === 0) await sleep(0);
    }

    return { created, updated, skipped };
  };

  const startAutoRun = async () => {
    if (!canRun) return;

    if (!School || !School.filter || !School.create || !School.update) {
      setLog([`❌ ERROR: School entity is not available in src/api/entities.js`]);
      return;
    }

    cancelRef.current = false;
    setRunning(true);
    setWorking(true);
    resetRunState();

    const page0 = Number(startPage || 0);
    const per = Number(perPage || 100);
    const ppb = Number(pagesPerBatch || 1);
    const delay = Number(delayMs || 0);
    const maxB = Number(maxBatches || 1);

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(
      `DryRun=${dryRun} startPage=${page0} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay} maxBatches=${maxB}`
    );

    let currentPage = page0;

    try {
      for (let b = 0; b < maxB; b++) {
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

        let rows = [];
        let debug = null;

        // One retry for transient failures
        try {
          const out = await runOneBatch(currentPage, per, ppb);
          rows = out.rows;
          debug = out.debug;
        } catch (e1) {
          const d1 = diagnoseAxiosError(e1);
          push(`⚠️ Batch fetch failed: ${d1.message}${d1.status ? ` (HTTP ${d1.status})` : ""}`);
          push(`Retrying once after 1500ms...`);
          await sleep(1500);

          const out2 = await runOneBatch(currentPage, per, ppb);
          rows = out2.rows;
          debug = out2.debug;
        }

        const expectedMax = per * ppb;
        push(`✅ Fetched rows: ${rows.length} (expected up to ${expectedMax})`);
        if (debug && debug.pageCalls) push(`PageCalls:\n${safeJson(debug.pageCalls)}`);

        setProgress((p) => ({
          ...p,
          rowsFetched: p.rowsFetched + rows.length,
          lastBatchRows: rows.length,
        }));

        if (!rows.length) {
          push(`🏁 No rows returned. Completed.`);
          setProgress((p) => ({ ...p, done: true }));
          break;
        }

        push(dryRun ? `DryRun is ON: simulating upserts...` : `Writing upserts to School...`);
        const up = await upsertRows(rows);

        if (dryRun) {
          push(`✅ DryRun batch complete.`);
        } else {
          push(`✅ Upsert batch complete. Created=${up.created} Updated=${up.updated} Skipped=${up.skipped}`);
          setProgress((p) => ({
            ...p,
            created: p.created + up.created,
            updated: p.updated + up.updated,
            skipped: p.skipped + up.skipped,
          }));
        }

        setProgress((p) => ({
          ...p,
          pagesProcessed: p.pagesProcessed + ppb,
        }));
        currentPage = currentPage + ppb;

        // Completion heuristic: partial block = end of dataset
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
      const d = diagnoseAxiosError(e);
      push(`❌ ERROR: ${d.message}`);
      if (d.status) push(`HTTP ${d.status} ${d.statusText || ""}`.trim());
      if (d.data) push(`Response data:\n${safeJson(d.data)}`);
      setProgress((p) => ({ ...p, lastError: d.message }));
    } finally {
      setWorking(false);
      setRunning(false);
      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  const runSingle = async () => {
    if (!canRun) return;

    if (!School || !School.filter || !School.create || !School.update) {
      setLog([`❌ ERROR: School entity is not available in src/api/entities.js`]);
      return;
    }

    setWorking(true);
    setLog([]);
    try {
      push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
      push(`URL: ${env.href}`);
      push(`Single batch start @ ${new Date().toISOString()}`);
      push(`DryRun=${dryRun} page=${startPage} perPage=${perPage} maxPages=${pagesPerBatch}`);

      const out = await runOneBatch(Number(startPage || 0), Number(perPage || 100), Number(pagesPerBatch || 1));
      const rows = out.rows || [];
      push(`✅ Fetched rows: ${rows.length}`);
      if (out.debug && out.debug.pageCalls) push(`PageCalls:\n${safeJson(out.debug.pageCalls)}`);

      if (!rows.length) {
        push(`No rows returned.`);
        return;
      }

      push(dryRun ? `DryRun ON: not writing.` : `Writing to School...`);
      const up = await upsertRows(rows);

      if (dryRun) push(`✅ DryRun complete.`);
      else push(`✅ Upsert complete. Created=${up.created} Updated=${up.updated} Skipped=${up.skipped}`);
    } catch (e) {
      const d = diagnoseAxiosError(e);
      push(`❌ ERROR: ${d.message}`);
      if (d.status) push(`HTTP ${d.status} ${d.statusText || ""}`.trim());
      if (d.data) push(`Response data:\n${safeJson(d.data)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master (Auto-run)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs Scorecard fetch + School upsert in batches until complete. Uses stable source_key for idempotent upserts.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
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
              Max batches{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={maxBatches}
                onChange={(e) => setMaxBatches(e.target.value)}
                disabled={running}
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <Button disabled={working || running} onClick={runSingle} variant="outline">
              Run single batch
            </Button>
            <Button disabled={working || running} onClick={startAutoRun}>
              Run until complete
            </Button>
            <Button disabled={!running} onClick={stop} variant="outline">
              Stop
            </Button>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Start: perPage=100, pagesPerBatch=5, delayMs=500. DryRun=true first. Then DryRun=false.
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Progress</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>Batches: {progress.batches}</div>
            <div>Pages processed: {progress.pagesProcessed}</div>
            <div>Rows fetched: {progress.rowsFetched}</div>
            {!dryRun && (
              <>
                <div>Created: {progress.created}</div>
                <div>Updated: {progress.updated}</div>
                <div>Skipped: {progress.skipped}</div>
              </>
            )}
            <div>Last page start: {progress.lastPageStart === null ? "-" : progress.lastPageStart}</div>
            <div>Last batch rows: {progress.lastBatchRows}</div>
            <div>Status: {progress.done ? "DONE" : progress.stopped ? "STOPPED" : running ? "RUNNING" : "IDLE"}</div>
            {progress.lastError ? <div className="text-red-600">Last error: {progress.lastError}</div> : null}
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
