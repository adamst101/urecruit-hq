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
function isNetworkError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("network error") || msg.includes("failed to fetch");
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
  return (
    msg.includes("duplicate") ||
    msg.includes("already exists") ||
    msg.includes("unique") ||
    msg.includes("conflict") ||
    e?.raw?.status === 409
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
  const [perOpDelayMs, setPerOpDelayMs] = useState(300);
  const [scorecardFetchTries, setScorecardFetchTries] = useState(8);

  // Write strategy
  // create_only: fastest for clean rebuilds (no DB reads; skips conflicts)
  // create_then_update_on_conflict: safer for reruns but can hit 429 due to filter+update
  const [writeMode, setWriteMode] = useState("create_only");

  // Adaptive delay grows on 429/network, shrinks slowly when stable
  const adaptiveDelayRef = useRef(300);

  // Function resolution
  const [scorecardFn, setScorecardFn] = useState(null);

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

  async function tryInvoke(name) {
    const raw = await base44.functions.invoke(name, { page: 0, perPage: 1, maxPages: 1 });
    const resp = unwrapInvokeResponse(raw);
    // If function exists but returns {error}, still counts as "exists" (not 404). We just need non-404.
    return resp;
  }

  // IMPORTANT: autodiscover correct deployed function name in prod
  const resolveScorecardFunction = async () => {
    if (!canRun) return null;

    const candidates = [
      "seedSchoolsMaster_scorecard_v3",
      "seedSchoolsMaster_scorecard",
      "seedSchoolsMaster_scorecard_v2",
      "scorecardSeedSchoolsMaster",
      "scorecardProbe",
      "probeScorecard",
      "probeMinimal",
    ];

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
        // 404 means function not deployed under that name in this environment
        if (status === 404 || msg.includes("status code 404")) {
          push(`- Not found: ${name}`);
          continue;
        }
        // Non-404 errors still mean the function name exists; pick it
        push(`✅ Function exists (non-404): ${name} (error=${msg})`);
        setScorecardFn(name);
        return name;
      }
    }

    push(`❌ Could not resolve a deployed scorecard function. Deploy one of the candidate names above.`);
    setScorecardFn(null);
    return null;
  };

  const probe = async () => {
    if (!canRun) return;

    push(`\nProbe start @ ${new Date().toISOString()}`);
    const fn = scorecardFn || (await resolveScorecardFunction());
    if (!fn) return;

    try {
      const raw = await base44.functions.invoke(fn, { page: 0, perPage: 5, maxPages: 1 });
      push(`Probe fn=${fn}\n${truncate(unwrapInvokeResponse(raw))}`);
    } catch (e) {
      push(`Probe threw:\n${truncate({ message: e?.message, raw: e?.raw || e })}`);
    }
  };

  async function fetchBatchWithRetry(fnName, page0, perPageNum, pagesInBatchNum) {
    let last = null;

    for (let i = 0; i < scorecardFetchTries; i++) {
      if (cancelRef.current) throw new Error("Cancelled");

      try {
        const raw = await base44.functions.invoke(fnName, {
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

        // If it's a 404, the function name is wrong in this env. Stop immediately and re-resolve.
        const status = e?.raw?.status || e?.status;
        if (status === 404 || msg.includes("status code 404")) {
          throw e;
        }

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
      if (isRateLimitError(e) || isNetworkError(e)) throw e;

      push(`❌ Base44Error during ${label}`);
      push(`Context: ${truncate(context)}`);
      push(`Error: ${truncate({ message: e?.message, raw: e?.raw || e })}`);
      throw e;
    }
  }

  function bumpAdaptiveDelay() {
    adaptiveDelayRef.current = Math.min(2500, Math.floor(adaptiveDelayRef.current * 1.5 + 75));
  }
  function relaxAdaptiveDelay() {
    adaptiveDelayRef.current = Math.max(150, Math.floor(adaptiveDelayRef.current * 0.96));
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
    // Canonical key: scorecard:<unitid>. Avoid name/state keys entirely.
    const source_key = unitid ? `scorecard:${unitid}` : r?.source_key ? String(r.source_key) : null;

    return {
      school_name: name,
      normalized_name: r.normalized_name || null,
      city: r.city || null,
      state: r.state || null,
      website_url: r.website_url || null,
      unitid: unitid || null,
      source_platform: "scorecard",
      source_key: source_key,
    };
  };

  async function getSchoolCountBestEffort() {
    if (!School) return null;
    try {
      const rows = await safeEntityCall("School.list", async () => await School.list({}), {});
      return Array.isArray(rows) ? rows.length : null;
    } catch (e) {
      push(`⚠️ School count probe failed (continuing): ${String(e?.message || e)}`);
      return null;
    }
  }

  const createOnly = async (r) => {
    const payload = buildPayload(r);
    if (!payload.source_key || !payload.school_name) return { mode: "skipped" };

    try {
      await safeEntityCall("School.create", async () => await School.create(payload), {
        source_key: payload.source_key,
      });
      return { mode: "created" };
    } catch (e) {
      if (isRateLimitError(e) || isNetworkError(e)) throw e;
      if (looksLikeDuplicateCreate(e)) return { mode: "skipped" };
      throw e;
    }
  };

  const upsertRowCreateFirst = async (r) => {
    const payload = buildPayload(r);
    if (!payload.source_key || !payload.school_name) return { mode: "skipped" };

    try {
      await safeEntityCall(
        "School.create",
        async () => await School.create(payload),
        { source_key: payload.source_key, unitid: payload.unitid }
      );
      return { mode: "created" };
    } catch (e) {
      if (isRateLimitError(e) || isNetworkError(e)) throw e;

      // Most likely duplicate create. Find existing row by source_key and update.
      if (!looksLikeDuplicateCreate(e)) throw e;

      const existing = await safeEntityCall(
        "School.filter",
        async () => await School.filter({ source_key: payload.source_key }),
        { source_key: payload.source_key }
      );

      const ex = Array.isArray(existing) ? existing[0] : null;
      if (!ex?.id) return { mode: "skipped" };

      await safeEntityCall(
        "School.update",
        async () => await School.update(ex.id, payload),
        { id: ex.id, source_key: payload.source_key }
      );
      return { mode: "updated" };
    }
  };

  async function upsertOneWithRetries(row, rowIndex, page) {
    const label = `School upsert (page=${page} idx=${rowIndex})`;
    let last = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      if (cancelRef.current) throw new Error("Cancelled");

      try {
        const res =
          writeMode === "create_then_update_on_conflict" ? await upsertRowCreateFirst(row) : await createOnly(row);
        relaxAdaptiveDelay();
        return res;
      } catch (e) {
        last = e;
        const msg = String(e?.message || e);
        const is429 = isRateLimitError(e) || isNetworkError(e);

        if (!is429) throw e;

        bumpAdaptiveDelay();
        const wait = Math.min(20000, adaptiveDelayRef.current + 250 * attempt + Math.floor(Math.random() * 250));
        push(`⚠️ ${label}: retry ${attempt + 1} (${wait}ms) due to: ${msg}`);
        await sleep(wait);
      }
    }

    throw last || new Error("Upsert failed");
  }

  async function upsertRowsToSchool(rows, page) {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      if (cancelRef.current) break;

      const r = rows[i];

      try {
        const res = await upsertOneWithRetries(r, i, page);
        if (res.mode === "created") created++;
        else if (res.mode === "updated") updated++;
        else skipped++;
      } catch (e) {
        failed++;
        push(`❌ Upsert failed idx=${i} page=${page}: ${String(e?.message || e)}`);
        push(`Row: ${truncate(r, 900)}`);
        // continue on failure
      }

      await waitAfterDbOp();
    }

    return { created, updated, skipped, failed };
  }

  const startAutoRun = async () => {
    if (!canRun) return;
    if (!School && !dryRun) {
      push(`❌ School entity not available via src/api/entities.js export`);
      return;
    }

    setRunning(true);
    cancelRef.current = false;
    adaptiveDelayRef.current = Math.max(150, Number(perOpDelayMs || 300));

    push(`\nHost: ${env.host} (${env.label}, ${env.dataEnv})`);
    push(`URL: ${env.href}`);
    push(`School entity: using src/api/entities.js export`);
    push(`Checkpoint (local): pageNext=${checkpoint.pageNext}`);

    // Resolve function name each run (prod/preview mismatch-proof)
    let fn = scorecardFn;
    if (!fn) fn = await resolveScorecardFunction();
    if (!fn) {
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
    push(`Scorecard fetch tries=${scorecardFetchTries}`);
    if (!dryRun) {
      push(`Write throttle: perOpDelayMs=${perOpDelayMs} (adaptive=${adaptiveDelayRef.current})`);
      const cnt = await getSchoolCountBestEffort();
      if (cnt === 0 && writeMode !== "create_only") {
        setWriteMode("create_only");
        push(`ℹ️ School appears empty (count=0). Forcing writeMode=create_only to avoid 429.`);
      } else if (typeof cnt === "number") {
        push(`School count probe: ${cnt}`);
      }
      push(`WriteMode=${cnt === 0 ? "create_only" : writeMode}`);
    }

    try {
      for (let b = 0; b < 5000; b++) {
        if (cancelRef.current) break;

        const batchPage = currentPage;

        push(`\n--- Batch ${b + 1} ---`);
        push(`Fetching page=${batchPage} maxPages=${ppb} perPage=${per} ...`);

        let out;
        try {
          out = await fetchBatchWithRetry(fn, batchPage, per, ppb);
        } catch (e) {
          const msg = String(e?.message || e);
          const status = e?.raw?.status || e?.status;
          if (status === 404 || msg.includes("status code 404")) {
            push(`❌ Fetch got 404. Re-resolving function name and retrying batch...`);
            fn = await resolveScorecardFunction();
            if (!fn) throw e;
            out = await fetchBatchWithRetry(fn, batchPage, per, ppb);
          } else {
            throw e;
          }
        }

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
          push(`Writing upserts to School (create-first + retry + continue on failure)...`);
          const up = await upsertRowsToSchool(rows, batchPage);
          push(
            `✅ Upsert complete. Created=${up.created} Updated=${up.updated} Skipped=${up.skipped} Failed=${up.failed}`
          );
        }

        const nextPage = batchPage + ppb;

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
            Auto-resolves the deployed scorecard function name (prevents PROD 404).
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
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-700">Write mode</span>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="writeMode"
                    checked={writeMode === "create_only"}
                    onChange={() => setWriteMode("create_only")}
                    disabled={running}
                  />
                  <span>Create only</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="writeMode"
                    checked={writeMode === "create_then_update_on_conflict"}
                    onChange={() => setWriteMode("create_then_update_on_conflict")}
                    disabled={running}
                  />
                  <span>Create then update on conflict</span>
                </label>
              </div>

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
