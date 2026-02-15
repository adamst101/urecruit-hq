// src/pages/AdminSeedSchoolsMaster.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "../api/base44Client";
import { School as SchoolEntityFromApi } from "../api/entities";

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
function isRateLimitError(e) {
  const status = e?.raw?.status || e?.status;
  if (status === 429) return true;
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429");
}
function isScorecardTransient(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("scorecard http 500") ||
    msg.includes("scorecard http 502") ||
    msg.includes("scorecard http 503") ||
    msg.includes("scorecard http 504") ||
    msg.includes("timeout") ||
    msg.includes("network")
  );
}
function looksLikeDuplicateCreate(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  // Generic heuristics: Base44 duplicate/unique constraint messages vary
  return (
    msg.includes("duplicate") ||
    msg.includes("already exists") ||
    msg.includes("unique") ||
    msg.includes("conflict") ||
    (e?.raw?.status === 409)
  );
}

// Local checkpoint storage
const CHECKPOINT_STORAGE_KEY = "campapp_admin_seed_schools_master_pageNext_v1";
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

export default function AdminSeedSchoolsMaster() {
  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  // Canonical School export
  const School = SchoolEntityFromApi || null;

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

  // IMPORTANT: increase default throttle to reduce 429s
  const [perOpDelayMs, setPerOpDelayMs] = useState(250);

  const [scorecardFetchTries, setScorecardFetchTries] = useState(8);

  // Adaptive throttle state: increases when we see 429, slowly decreases when stable
  const adaptiveDelayRef = useRef(250);

  // Checkpoint
  const [checkpoint, setCheckpoint] = useState({ loaded: false, pageNext: 0 });
  useEffect(() => {
    const n = loadCheckpointFromStorage();
    setCheckpoint({ loaded: true, pageNext: n });
  }, []);

  const stop = () => {
    cancelRef.current = true;
    setRunning(false);
    push(`⏹️ Stop requested @ ${new Date().toISOString()}`);
  };

  const probeScorecard = async () => {
    if (!canRun) return;
    push(`\nProbe start @ ${new Date().toISOString()}`);
    try {
      const raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
        page: 0,
        perPage: 5,
        maxPages: 1,
      });
      push(`Probe unwrapped:\n${truncate(unwrapInvokeResponse(raw))}`);
    } catch (e) {
      push(`Probe threw:\n${truncate({ message: e?.message, stack: e?.stack, raw: e })}`);
    }
  };

  async function fetchBatchWithRetry(page0, perPageNum, pagesInBatchNum) {
    let last = null;

    for (let i = 0; i < scorecardFetchTries; i++) {
      if (cancelRef.current) throw new Error("Cancelled");

      try {
        const raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
          page: Number(page0 || 0),
          perPage: Number(perPageNum || 100),
          maxPages: Number(pagesInBatchNum || 1),
        });

        const resp = unwrapInvokeResponse(raw);

        if (resp && resp.error) {
          const err = new Error(String(resp.error));
          err._debug = resp.debug || null;
          throw err;
        }

        return { rows: Array.isArray(resp?.rows) ? resp.rows : [], debug: resp?.debug || null };
      } catch (e) {
        last = e;
        const msg = String(e?.message || e);
        const dbg = e?._debug || null;

        push(`⚠️ Fetch attempt ${i + 1}/${scorecardFetchTries} failed: ${msg}`);
        if (dbg) push(`Fetch debug:\n${truncate(dbg)}`);

        if (!isScorecardTransient(e) || i === scorecardFetchTries - 1) break;

        const wait = Math.min(20000, 2000 * Math.pow(2, i));
        push(`Waiting ${wait}ms then retrying same page...`);
        await sleep(wait);
      }
    }

    throw last || new Error("Scorecard fetch failed");
  }

  async function safeEntityCall(label, fn, context) {
    try {
      return await fn();
    } catch (e) {
      // Bubble rate limit so caller can adapt
      if (isRateLimitError(e)) throw e;

      push(`❌ Base44Error during ${label}`);
      push(`Context: ${truncate(context)}`);
      push(`Error: ${truncate({ message: e?.message, raw: e?.raw || e })}`);
      throw e;
    }
  }

  function bumpAdaptiveDelay() {
    // Increase delay quickly when throttled
    adaptiveDelayRef.current = Math.min(2000, Math.floor(adaptiveDelayRef.current * 1.6 + 50));
  }
  function relaxAdaptiveDelay() {
    // Slowly relax when stable
    adaptiveDelayRef.current = Math.max(150, Math.floor(adaptiveDelayRef.current * 0.95));
  }

  async function waitAfterDbOp() {
    const base = Math.max(0, Number(perOpDelayMs || 0));
    const adaptive = adaptiveDelayRef.current;
    const wait = Math.max(base, adaptive);
    if (wait > 0) await sleep(wait);
  }

  const buildPayload = (r) => {
    const unitid = r?.unitid ? String(r.unitid) : null;
    const name = r?.school_name ? String(r.school_name) : null;
    const source_key = r?.source_key ? String(r.source_key) : null;

    return {
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
  };

  // KEY CHANGE: Create-first strategy to avoid per-row filter
  const upsertRowCreateFirst = async (r) => {
    const payload = buildPayload(r);

    if (!payload.source_key || !payload.school_name) return { mode: "skipped" };

    // Try create first (1 DB call)
    try {
      await safeEntityCall(
        "School.create",
        async () => await School.create(payload),
        { payloadKeys: Object.keys(payload), source_key: payload.source_key }
      );
      return { mode: "created" };
    } catch (e) {
      // If rate limit, bubble up to retry wrapper
      if (isRateLimitError(e)) throw e;

      // If duplicate, then do filter+update (2 more DB calls but only for existing rows)
      if (looksLikeDuplicateCreate(e)) {
        const existingRows = await safeEntityCall(
          "School.filter",
          async () => await School.filter({ source_key: payload.source_key }),
          { source_key: payload.source_key }
        );

        const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;
        if (existing?.id) {
          await safeEntityCall(
            "School.update",
            async () => await School.update(String(existing.id), payload),
            { id: existing.id, source_key: payload.source_key }
          );
          return { mode: "updated" };
        }
      }

      // Not duplicate; treat as real error
      throw e;
    }
  };

  const upsertRowsToSchool = async (rows) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      if (cancelRef.current) break;
      if (dryRun) continue;

      try {
        const res = await (async () => {
          // Retry only for 429, with backoff and adaptive delay increase
          for (let t = 0; t < 8; t++) {
            try {
              return await upsertRowCreateFirst(rows[i]);
            } catch (e) {
              if (!isRateLimitError(e) || t === 7) throw e;

              bumpAdaptiveDelay();
              const wait = Math.min(15000, 1000 * Math.pow(2, t));
              push(`⚠️ DB rate limit. Backing off ${wait}ms (adaptiveDelay=${adaptiveDelayRef.current}ms)`);
              await sleep(wait);
            }
          }
          return { mode: "skipped" };
        })();

        if (res.mode === "created") created += 1;
        else if (res.mode === "updated") updated += 1;
        else skipped += 1;

        relaxAdaptiveDelay();
      } finally {
        await waitAfterDbOp();
      }
    }

    return { created, updated, skipped };
  };

  const startAutoRun = async () => {
    if (!canRun) return;

    setLog([]);
    cancelRef.current = false;
    setRunning(true);

    if (!School?.create || !School?.update || !School?.filter) {
      push(`❌ ERROR: School entity not available. Check src/api/entities.js export for School/Schools.`);
      setRunning(false);
      return;
    }

    adaptiveDelayRef.current = Math.max(150, Number(perOpDelayMs || 250));

    const per = Number(perPage || 100);
    const ppb = Math.max(1, Number(pagesPerBatch || 1));
    const delay = Math.max(0, Number(delayMs || 0));
    let currentPage = Number(startPage || 0);

    push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`School entity: using src/api/entities.js export`);
    push(`Checkpoint (local): pageNext=${checkpoint.pageNext}`);
    push(`Auto-run start @ ${new Date().toISOString()}`);
    push(`DryRun=${dryRun} startPage=${currentPage} perPage=${per} pagesPerBatch=${ppb} delayMs=${delay}`);
    push(`Scorecard fetch tries=${scorecardFetchTries}`);
    if (!dryRun) push(`Write throttle: perOpDelayMs=${perOpDelayMs} (adaptive starting at ${adaptiveDelayRef.current})`);

    try {
      for (let b = 0; b < 5000; b++) {
        if (cancelRef.current) break;

        push(`\n--- Batch ${b + 1} ---`);
        push(`Fetching page=${currentPage} maxPages=${ppb} perPage=${per} ...`);

        const out = await fetchBatchWithRetry(currentPage, per, ppb);

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
          push(`DryRun: WouldUpsert=${rows.length}`);
        } else {
          push(`Writing upserts to School (create-first strategy)...`);
          const up = await upsertRowsToSchool(rows);
          push(`✅ Upsert complete. Created=${up.created} Updated=${up.updated} Skipped=${up.skipped}`);
        }

        const nextPage = currentPage + ppb;

        if (!dryRun) {
          saveCheckpointToStorage(nextPage);
          setCheckpoint({ loaded: true, pageNext: nextPage });
          push(`💾 Checkpoint saved (local): nextPage=${nextPage}`);
        }

        currentPage = nextPage;

        if (rows.length < expectedMax) {
          push(`🏁 Fetched fewer than ${expectedMax}. Treating as complete.`);
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
    } finally {
      setRunning(false);
      push(`\nAuto-run finished @ ${new Date().toISOString()}`);
    }
  };

  const resumeFromCheckpoint = () => {
    setStartPage(checkpoint.pageNext || 0);
    push(`↩️ Start page set from local checkpoint: ${checkpoint.pageNext || 0}`);
  };

  const clearCheckpoint = () => {
    clearCheckpointStorage();
    setCheckpoint({ loaded: true, pageNext: 0 });
    push(`🧹 Local checkpoint cleared (pageNext=0)`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master</div>
          <div className="text-sm text-slate-600 mt-1">
            Create-first upsert to cut DB calls and reduce rate limits. Local checkpoint.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Checkpoint</div>
          <div className="mt-2 text-sm text-slate-700">
            <div>Next page (local): <span className="font-mono">{checkpoint.pageNext}</span></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={!checkpoint.loaded || running} onClick={resumeFromCheckpoint} variant="outline">
              Set Start Page to Checkpoint
            </Button>
            <Button disabled={running} onClick={clearCheckpoint} variant="outline">
              Clear Checkpoint
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
