// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";

// Cursor persisted long-term (so you can pick up tomorrow)
const NCAA_CURSOR_KEY_PREFIX = "adminops_ncaa_cursor_v2:";

// Session-only persistence (survives refresh, clears when tab closes)
const ADMINOPS_SESSION_STATE_KEY = "adminops_session_state_v2";

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
function loadSessionState() {
  try {
    const raw = sessionStorage.getItem(ADMINOPS_SESSION_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSessionState(state) {
  try {
    sessionStorage.setItem(ADMINOPS_SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function getId(r) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v == null ? null : String(v);
}

function pickEntityFromSDK(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

function isRetryableInvokeError(e) {
  const msg = lc(e?.message || e);
  if (msg.includes("status code 502")) return true;
  if (msg.includes("status code 503")) return true;
  if (msg.includes("status code 504")) return true;
  if (msg.includes("status code 429")) return true;
  if (msg.includes("rate limit")) return true;
  return false;
}

async function invokeWithRetry(invokeFn, { tries = 5, baseDelayMs = 700, jitterMs = 250, onRetry } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await invokeFn();
    } catch (e) {
      lastErr = e;
      const retryable = isRetryableInvokeError(e);
      if (!retryable || i === tries - 1) throw e;

      const backoff = Math.min(10_000, Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * jitterMs));
      onRetry?.({ attempt: i + 1, tries, backoffMs: backoff, error: safeStr(e?.message || e) });
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function normSchoolName(x) {
  const s = lc(x)
    .replace(/&/g, "and")
    .replace(/\buniv\.\b/g, "university")
    .replace(/\buniv\b/g, "university")
    .replace(/\ba&m\b/g, "am")
    .replace(/\bst\.\b/g, "state")
    .replace(/\bmt\.\b/g, "mount")
    .replace(/\bthe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function openMaybe(url) {
  const u = safeStr(url).trim();
  if (!u) return;
  try {
    window.open(u, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("overview");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // stop flag for run-until-done loop (ref survives rerenders)
  const stopRunRef = useRef(false);

  // Athletics sync controls
  const [athleticsDryRun, setAthleticsDryRun] = useState(true);
  const [ncaaSeasonYear, setNcaaSeasonYear] = useState(new Date().getFullYear());
  const [ncaaMaxRows, setNcaaMaxRows] = useState(250);
  const [ncaaConfidenceThreshold, setNcaaConfidenceThreshold] = useState(0.92);
  const [ncaaThrottleMs, setNcaaThrottleMs] = useState(2);
  const [ncaaTimeBudgetMs, setNcaaTimeBudgetMs] = useState(20000);

  // Run-until-done controls
  const [runUntilDoneMaxBatches, setRunUntilDoneMaxBatches] = useState(20);
  const [runUntilDonePauseMs, setRunUntilDonePauseMs] = useState(900);

  // Safety: stop loop if server reports too many per-row errors in a batch
  const [haltOnBatchErrorsOver, setHaltOnBatchErrorsOver] = useState(25);

  const cursorStorageKey = useMemo(() => `${NCAA_CURSOR_KEY_PREFIX}${ncaaSeasonYear}`, [ncaaSeasonYear]);
  const [ncaaStartAt, setNcaaStartAt] = useState(0);

  // Recovery UX
  const [hasRecoveredSession, setHasRecoveredSession] = useState(false);
  const [showRecoverBanner, setShowRecoverBanner] = useState(false);

  // Unmatched Repair UI state
  const [repairOrg, setRepairOrg] = useState("ncaa");
  const [repairReason, setRepairReason] = useState("no_match"); // no_match | ambiguous | missing_fields | all
  const [repairQuery, setRepairQuery] = useState("");
  const [repairLimit, setRepairLimit] = useState(50);
  const [repairRows, setRepairRows] = useState([]);
  const [repairLoading, setRepairLoading] = useState(false);

  const [schoolIndexLoading, setSchoolIndexLoading] = useState(false);
  const [schoolIndex, setSchoolIndex] = useState([]); // array of School rows
  const [schoolIndexByNorm, setSchoolIndexByNorm] = useState(new Map()); // norm -> [school]
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolSearchResults, setSchoolSearchResults] = useState([]);
  const [selectedSchoolByRowId, setSelectedSchoolByRowId] = useState({}); // rowId -> { id, name, unitid }

  const Unmatched = useMemo(() => pickEntityFromSDK("UnmatchedAthleticsRow"), []);
  const School = useMemo(() => pickEntityFromSDK("School"), []);
  const AthleticsMembership = useMemo(() => pickEntityFromSDK("AthleticsMembership"), []);

  // Initial load: admin mode + restore session state
  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");

    const ss = loadSessionState();
    if (ss && !hasRecoveredSession) {
      if (Array.isArray(ss.log)) setLog(ss.log);
      if (typeof ss.tab === "string") setTab(ss.tab);

      if (typeof ss.athleticsDryRun === "boolean") setAthleticsDryRun(ss.athleticsDryRun);
      if (Number.isFinite(ss.ncaaSeasonYear)) setNcaaSeasonYear(ss.ncaaSeasonYear);
      if (Number.isFinite(ss.ncaaMaxRows)) setNcaaMaxRows(ss.ncaaMaxRows);
      if (Number.isFinite(ss.ncaaConfidenceThreshold)) setNcaaConfidenceThreshold(ss.ncaaConfidenceThreshold);
      if (Number.isFinite(ss.ncaaThrottleMs)) setNcaaThrottleMs(ss.ncaaThrottleMs);
      if (Number.isFinite(ss.ncaaTimeBudgetMs)) setNcaaTimeBudgetMs(ss.ncaaTimeBudgetMs);

      if (Number.isFinite(ss.runUntilDoneMaxBatches)) setRunUntilDoneMaxBatches(ss.runUntilDoneMaxBatches);
      if (Number.isFinite(ss.runUntilDonePauseMs)) setRunUntilDonePauseMs(ss.runUntilDonePauseMs);
      if (Number.isFinite(ss.haltOnBatchErrorsOver)) setHaltOnBatchErrorsOver(ss.haltOnBatchErrorsOver);

      if (Number.isFinite(ss.ncaaStartAt)) setNcaaStartAt(ss.ncaaStartAt);

      // Repair UI restore (best-effort)
      if (typeof ss.repairOrg === "string") setRepairOrg(ss.repairOrg);
      if (typeof ss.repairReason === "string") setRepairReason(ss.repairReason);
      if (typeof ss.repairQuery === "string") setRepairQuery(ss.repairQuery);
      if (Number.isFinite(ss.repairLimit)) setRepairLimit(ss.repairLimit);

      setHasRecoveredSession(true);
      setShowRecoverBanner(true);
    }
  }, [hasRecoveredSession]);

  // Load cursor per season (localStorage is source of truth)
  useEffect(() => {
    const saved = Number(localStorage.getItem(cursorStorageKey) || 0);
    if (Number.isFinite(saved)) setNcaaStartAt(saved);
  }, [cursorStorageKey]);

  // Persist session state (logs + inputs)
  useEffect(() => {
    saveSessionState({
      tab,
      log,
      athleticsDryRun,
      ncaaSeasonYear,
      ncaaMaxRows,
      ncaaConfidenceThreshold,
      ncaaThrottleMs,
      ncaaTimeBudgetMs,
      runUntilDoneMaxBatches,
      runUntilDonePauseMs,
      haltOnBatchErrorsOver,
      ncaaStartAt,
      repairOrg,
      repairReason,
      repairQuery,
      repairLimit,
      savedAt: new Date().toISOString(),
    });
  }, [
    tab,
    log,
    athleticsDryRun,
    ncaaSeasonYear,
    ncaaMaxRows,
    ncaaConfidenceThreshold,
    ncaaThrottleMs,
    ncaaTimeBudgetMs,
    runUntilDoneMaxBatches,
    runUntilDonePauseMs,
    haltOnBatchErrorsOver,
    ncaaStartAt,
    repairOrg,
    repairReason,
    repairQuery,
    repairLimit,
  ]);

  // Auto-scroll log view
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Prevent accidental refresh/close while busy
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!busy) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  function pushLog(line) {
    setLog((prev) => {
      const next = [...prev, `[${new Date().toISOString()}] ${line}`];
      if (next.length > 900) return next.slice(next.length - 900);
      return next;
    });
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

  async function invokeNcaaOnce({ startAtOverride } = {}) {
    if (!base44?.functions?.invoke) {
      pushLog("❌ base44.functions.invoke is not available in this environment.");
      return { ok: false, error: "invoke not available" };
    }

    const startAt = Number.isFinite(startAtOverride) ? Math.max(0, Number(startAtOverride)) : ncaaStartAt;

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

    const raw = await invokeWithRetry(() => base44.functions.invoke("ncaaMembershipSync", payload), {
      tries: 5,
      baseDelayMs: 800,
      jitterMs: 250,
      onRetry: ({ attempt, tries, backoffMs, error }) => {
        pushLog(`↻ invoke retry ${attempt}/${tries - 1} in ${backoffMs}ms (reason="${error}")`);
      },
    });

    const res = unwrapInvokeResponse(raw);

    pushLog(`invoke data:\n${truncate(res, 1200)}`);

    if (res?.error) {
      pushLog(`❌ NCAA sync failed: ${safeStr(res.error)}`);
      return { ok: false, error: safeStr(res.error), res };
    }
    if (res?.ok !== true) {
      pushLog(`❌ NCAA sync failed (no ok=true).`);
      return { ok: false, error: "no ok=true", res };
    }

    const st = res?.stats || {};
    const nextStartAt = Number(res?.nextStartAt ?? startAt);
    const done = !!res?.done;
    const elapsedMs = Number(res?.debug?.elapsedMs || 0);
    const stoppedEarly = !!res?.debug?.stoppedEarly;

    pushLog(
      `✅ NCAA sync complete. processed=${st.processed} matched=${st.matched} created=${st.created} updated=${st.updated} noMatch=${st.noMatch} ambiguous=${st.ambiguous} missingName=${st.missingName} errors=${st.errors} nextStartAt=${nextStartAt} done=${done} elapsedMs=${elapsedMs} stoppedEarly=${stoppedEarly}`
    );

    saveCursor(nextStartAt);

    return { ok: true, res, nextStartAt, done, stats: st, elapsedMs, stoppedEarly };
  }

  async function runNcaaNextBatch() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    setBusy(true);
    stopRunRef.current = false;
    try {
      await invokeNcaaOnce();
    } catch (e) {
      pushLog(`❌ NCAA sync exception: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runNcaaUntilDone() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (athleticsDryRun) return pushLog("❌ Run-until-done is disabled in DryRun. Switch to Write.");

    setBusy(true);
    stopRunRef.current = false;

    try {
      let cursor = Math.max(0, Number(ncaaStartAt || 0));
      pushLog(
        `▶ Run until done: maxBatches=${runUntilDoneMaxBatches} pauseMs=${runUntilDonePauseMs} startingCursor=${cursor} haltOnBatchErrorsOver=${haltOnBatchErrorsOver}`
      );

      let batches = 0;
      let done = false;

      while (!done && batches < runUntilDoneMaxBatches) {
        if (stopRunRef.current) {
          pushLog("⏹ Stopped by operator.");
          break;
        }

        batches += 1;
        pushLog(`--- Batch ${batches} ---`);

        const out = await invokeNcaaOnce({ startAtOverride: cursor });
        if (!out?.ok) {
          pushLog(`❌ Batch ${batches} failed. Halting run-until-done.`);
          break;
        }

        const batchErrors = Number(out?.stats?.errors || 0);
        if (Number.isFinite(batchErrors) && batchErrors > haltOnBatchErrorsOver) {
          pushLog(
            `🛑 Halting: batch reported errors=${batchErrors} which is > haltOnBatchErrorsOver=${haltOnBatchErrorsOver}. Inspect server debug/errors and/or reduce write rate.`
          );
          break;
        }

        cursor = Math.max(cursor, Number(out.nextStartAt || cursor));
        saveCursor(cursor);

        done = !!out.done;

        if (!done && runUntilDonePauseMs > 0) {
          await sleep(runUntilDonePauseMs);
        }
      }

      if (done) {
        pushLog("🏁 NCAA run-until-done complete: done=true");
        pushLog("Next: run once from startAt=0 to prove idempotency (created≈0, updated>0).");
      } else if (batches >= runUntilDoneMaxBatches) {
        pushLog(`⏸ Reached maxBatches=${runUntilDoneMaxBatches}. Cursor saved at startAt=${cursor}. Run again to continue.`);
      } else {
        pushLog(`⏸ Halted early. Cursor saved at startAt=${cursor}.`);
      }
    } catch (e) {
      pushLog(`❌ run-until-done exception: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
      stopRunRef.current = false;
    }
  }

  function stopRun() {
    stopRunRef.current = true;
    pushLog("Stop requested. Will halt after current batch completes.");
  }

  function clearLogs() {
    setLog([]);
  }

  const lastSavedCursor = useMemo(() => {
    const v = Number(localStorage.getItem(cursorStorageKey) || 0);
    return Number.isFinite(v) ? v : 0;
  }, [cursorStorageKey, ncaaStartAt]);

  // --------------------------
  // Unmatched Repair UI helpers
  // --------------------------

  async function loadUnmatchedRows() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (!Unmatched) return pushLog("❌ UnmatchedAthleticsRow entity not found (check entities.js exports).");

    setRepairLoading(true);
    try {
      const where = {};
      if (repairOrg && repairOrg !== "all") where.org = repairOrg;
      if (repairReason && repairReason !== "all") where.reason = repairReason;

      // Base44 filter is exact-match only in most cases; apply query client-side below.
      const rows = await Unmatched.filter(where);
      let list = Array.isArray(rows) ? rows : [];

      const q = lc(repairQuery);
      if (q) {
        list = list.filter((r) => {
          const a = lc(r?.raw_school_name);
          const b = lc(r?.raw_city);
          const c = lc(r?.raw_state);
          const d = lc(r?.raw_source_key);
          return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q);
        });
      }

      list.sort((a, b) => {
        const ta = safeStr(a?.created_at || a?.createdAt || "");
        const tb = safeStr(b?.created_at || b?.createdAt || "");
        // newest first
        return tb.localeCompare(ta);
      });

      const limited = list.slice(0, Math.max(1, Number(repairLimit || 50)));
      setRepairRows(limited);
      pushLog(`Loaded Unmatched rows: total=${list.length} showing=${limited.length} org=${repairOrg} reason=${repairReason}`);
    } catch (e) {
      pushLog(`❌ Load Unmatched failed: ${safeStr(e?.message || e)}`);
    } finally {
      setRepairLoading(false);
    }
  }

  async function buildSchoolIndex() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (!School) return pushLog("❌ School entity not found (check entities.js exports).");

    setSchoolIndexLoading(true);
    try {
      const rows = await School.filter({});
      const list = Array.isArray(rows) ? rows : [];
      const byNorm = new Map();

      for (const srow of list) {
        const id = getId(srow);
        const name = safeStr(srow?.school_name || srow?.name || "");
        const norm = safeStr(srow?.normalized_name || "") || normSchoolName(name);
        const unitid = safeStr(srow?.unitid || "");
        if (!id || !norm) continue;

        if (!byNorm.has(norm)) byNorm.set(norm, []);
        byNorm.get(norm).push({
          id,
          unitid,
          name: name || norm,
          city: safeStr(srow?.city || ""),
          state: safeStr(srow?.state || ""),
          website_url: safeStr(srow?.website_url || ""),
        });
      }

      setSchoolIndex(list);
      setSchoolIndexByNorm(byNorm);
      pushLog(`School index loaded: rows=${list.length} keys=${byNorm.size}`);
    } catch (e) {
      pushLog(`❌ Build school index failed: ${safeStr(e?.message || e)}`);
    } finally {
      setSchoolIndexLoading(false);
    }
  }

  function computeSchoolSearchResults(q) {
    const query = normSchoolName(q || "");
    if (!query) return [];
    if (!schoolIndexByNorm || !(schoolIndexByNorm instanceof Map) || schoolIndexByNorm.size === 0) return [];

    // Simple heuristic: substring match on norm key, then score by closeness
    const results = [];
    for (const [k, arr] of schoolIndexByNorm.entries()) {
      if (!k.includes(query) && !query.includes(k)) continue;
      const score = Math.abs(k.length - query.length) + (k.startsWith(query) ? -5 : 0);
      for (const s of arr) results.push({ ...s, _score: score, _k: k });
      if (results.length > 200) break; // cap
    }
    results.sort((a, b) => a._score - b._score);
    return results.slice(0, 25);
  }

  useEffect(() => {
    const res = computeSchoolSearchResults(schoolSearch);
    setSchoolSearchResults(res);
  }, [schoolSearch, schoolIndexByNorm]);

  async function applyRepairForRow(row) {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (!AthleticsMembership) return pushLog("❌ AthleticsMembership entity not found (check entities.js exports).");
    if (!Unmatched) return pushLog("❌ UnmatchedAthleticsRow entity not found (check entities.js exports).");

    const rowId = getId(row);
    const org = safeStr(row?.org || "ncaa").trim() || "ncaa";
    const picked = selectedSchoolByRowId?.[rowId];

    if (!rowId) return pushLog("❌ Repair failed: unmatched row missing id.");
    if (!picked?.id) return pushLog("❌ Repair failed: select a School first.");

    const schoolId = picked.id;
    const seasonYear = Number(ncaaSeasonYear || new Date().getFullYear());
    const sourceKey = `${org}:${schoolId}:${seasonYear}`;

    // Membership record fields (minimal but deterministic)
    const rec = {
      school_id: schoolId,
      org,
      member: true,
      division: null,
      subdivision: null,
      conference: null,
      season_year: seasonYear,
      source_platform: "manual-repair",
      source_url: safeStr(row?.source_url || row?.sourceUrl || ""),
      source_key: sourceKey,
      confidence: 1,
      last_verified_at: new Date().toISOString(),
    };

    setBusy(true);
    try {
      // Upsert strategy:
      // 1) try create, 2) on duplicate, filter+update first hit
      try {
        await AthleticsMembership.create(rec);
        pushLog(`✅ Repair: created AthleticsMembership source_key=${sourceKey} (school="${picked.name}")`);
      } catch (e1) {
        const msg = lc(e1?.message || e1);
        const looksDup = msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists") || msg.includes("conflict") || msg.includes("409");
        if (!looksDup) throw e1;

        const existing = await AthleticsMembership.filter({ source_key: sourceKey });
        const first = Array.isArray(existing) && existing.length ? existing[0] : null;
        const exId = getId(first);
        if (!exId) {
          // fallback: attempt create again; if still dup, surface
          await AthleticsMembership.create(rec);
          pushLog(`✅ Repair: created AthleticsMembership (fallback) source_key=${sourceKey}`);
        } else {
          await AthleticsMembership.update(exId, rec);
          pushLog(`✅ Repair: updated AthleticsMembership source_key=${sourceKey} (school="${picked.name}")`);
        }
      }

      // Delete unmatched row so it stops reappearing.
      // If delete not supported, we leave it and log.
      const delFn = Unmatched.delete || Unmatched.remove || Unmatched.destroy;
      if (typeof delFn === "function") {
        await delFn.call(Unmatched, rowId);
        pushLog(`✅ Repair: deleted UnmatchedAthleticsRow id=${rowId}`);
        setRepairRows((prev) => prev.filter((r) => getId(r) !== rowId));
      } else {
        pushLog(`⚠️ UnmatchedAthleticsRow delete() not available. Row id=${rowId} not removed. (Safe, but will keep showing up.)`);
      }
    } catch (e) {
      pushLog(`❌ Repair failed for row id=${rowId}: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  // --------------------------
  // Render
  // --------------------------

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">Checkpointed pipelines with telemetry and repair tools.</div>
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

      {showRecoverBanner && (
        <Card className="p-3 border border-blue-200 bg-blue-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Recovered Admin Ops state after refresh</div>
              <div className="text-sm text-gray-700">
                Cursor (season {ncaaSeasonYear}) last saved at <span className="font-mono">{lastSavedCursor}</span>. Logs and settings restored from session.
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowRecoverBanner(false)} disabled={busy}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

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
          <div className="text-sm text-gray-700 mt-2">Use Athletics tab for NCAA enrichment and repair.</div>
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
          {/* NCAA runner */}
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">NCAA enrichment (batch + resume)</div>
            <div className="text-sm text-gray-600">
              Cursor uses <span className="font-mono">startAt</span> and saves <span className="font-mono">nextStartAt</span> per season.
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
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={ncaaSeasonYear}
                  onChange={(e) => setNcaaSeasonYear(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">startAt</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={ncaaStartAt}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value || 0));
                    setNcaaStartAt(v);
                    localStorage.setItem(cursorStorageKey, String(v));
                  }}
                  disabled={busy}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">batch</span>
                <input className="border rounded px-2 py-1 w-24" type="number" value={ncaaMaxRows} onChange={(e) => setNcaaMaxRows(Number(e.target.value || 0))} disabled={busy} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">threshold</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={ncaaConfidenceThreshold}
                  onChange={(e) => setNcaaConfidenceThreshold(Number(e.target.value || 0))}
                  disabled={busy}
                />
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
              <Button onClick={runNcaaNextBatch} disabled={busy || !adminEnabled}>
                Run next batch
              </Button>
              <Button variant="outline" onClick={resetCursor} disabled={busy}>
                Reset cursor
              </Button>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-medium">Run until done</div>
              <div className="text-xs text-gray-600">
                Loops batches until <span className="font-mono">done=true</span>, or max batches reached, or you stop. Disabled in Dry run.
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">maxBatches</span>
                  <input
                    className="border rounded px-2 py-1 w-24"
                    type="number"
                    min="1"
                    value={runUntilDoneMaxBatches}
                    onChange={(e) => setRunUntilDoneMaxBatches(Math.max(1, Number(e.target.value || 1)))}
                    disabled={busy}
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">pauseMs</span>
                  <input
                    className="border rounded px-2 py-1 w-24"
                    type="number"
                    min="0"
                    value={runUntilDonePauseMs}
                    onChange={(e) => setRunUntilDonePauseMs(Math.max(0, Number(e.target.value || 0)))}
                    disabled={busy}
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">halt if errors &gt;</span>
                  <input
                    className="border rounded px-2 py-1 w-20"
                    type="number"
                    min="0"
                    value={haltOnBatchErrorsOver}
                    onChange={(e) => setHaltOnBatchErrorsOver(Math.max(0, Number(e.target.value || 0)))}
                    disabled={busy}
                  />
                </label>

                <Button onClick={runNcaaUntilDone} disabled={busy || !adminEnabled || athleticsDryRun}>
                  Run until done
                </Button>

                <Button variant="outline" onClick={stopRun} disabled={!busy}>
                  Stop
                </Button>
              </div>

              {athleticsDryRun && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Run-until-done is disabled in Dry run. Switch to Write to use it.
                </div>
              )}
            </div>

            <div className="text-xs text-gray-600">
              Cursor key: <span className="font-mono">{cursorStorageKey}</span> (persisted)
            </div>
          </Card>

          {/* Unmatched Repair UI */}
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Unmatched repair UI</div>
            <div className="text-sm text-gray-600">
              Manually map unmatched athletics rows to an existing School, then write a deterministic AthleticsMembership record. No School creation.
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">1) Load Unmatched</div>

                <div className="flex flex-wrap gap-2 items-center">
                  <label className="text-sm">
                    <div className="text-gray-600">Org</div>
                    <select className="border rounded px-2 py-1" value={repairOrg} onChange={(e) => setRepairOrg(e.target.value)} disabled={busy || repairLoading}>
                      <option value="ncaa">ncaa</option>
                      <option value="naia">naia</option>
                      <option value="njcaa">njcaa</option>
                      <option value="all">all</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600">Reason</div>
                    <select className="border rounded px-2 py-1" value={repairReason} onChange={(e) => setRepairReason(e.target.value)} disabled={busy || repairLoading}>
                      <option value="no_match">no_match</option>
                      <option value="ambiguous">ambiguous</option>
                      <option value="missing_fields">missing_fields</option>
                      <option value="all">all</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="text-gray-600">Limit</div>
                    <input className="border rounded px-2 py-1 w-24" type="number" value={repairLimit} onChange={(e) => setRepairLimit(Number(e.target.value || 50))} disabled={busy || repairLoading} />
                  </label>
                </div>

                <label className="text-sm block">
                  <div className="text-gray-600">Search</div>
                  <input className="border rounded px-2 py-1 w-full" value={repairQuery} onChange={(e) => setRepairQuery(e.target.value)} disabled={busy || repairLoading} placeholder="name, city, state, source_key" />
                </label>

                <div className="flex gap-2">
                  <Button onClick={loadUnmatchedRows} disabled={busy || repairLoading || !adminEnabled}>
                    {repairLoading ? "Loading..." : "Load unmatched"}
                  </Button>
                  <Button variant="outline" onClick={() => setRepairRows([])} disabled={busy || repairLoading}>
                    Clear list
                  </Button>
                </div>

                <div className="text-xs text-gray-600">
                  Entity status: Unmatched={Unmatched ? "OK" : "MISSING"} | School={School ? "OK" : "MISSING"} | AthleticsMembership={AthleticsMembership ? "OK" : "MISSING"}
                </div>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <div className="text-sm font-medium">2) Load School index + search</div>
                <div className="text-xs text-gray-600">Load once per session. Then pick a School for each unmatched row.</div>

                <div className="flex flex-wrap gap-2 items-center">
                  <Button onClick={buildSchoolIndex} disabled={busy || schoolIndexLoading || !adminEnabled}>
                    {schoolIndexLoading ? "Indexing..." : `Load Schools (${schoolIndex.length || 0})`}
                  </Button>

                  <label className="text-sm flex-1 min-w-[240px]">
                    <div className="text-gray-600">School search</div>
                    <input className="border rounded px-2 py-1 w-full" value={schoolSearch} onChange={(e) => setSchoolSearch(e.target.value)} disabled={busy || schoolIndexLoading} placeholder="e.g., 'adams state' or 'university of akron'" />
                  </label>
                </div>

                {schoolSearch && (
                  <div className="border rounded p-2">
                    <div className="text-xs text-gray-600 mb-2">Top matches (click to copy as selection when repairing a row):</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {schoolSearchResults.length === 0 && <div className="text-xs text-gray-500">(no matches)</div>}
                      {schoolSearchResults.map((s) => (
                        <div key={s.id} className="border rounded p-2 text-sm">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-gray-600">
                            {s.city ? `${s.city}, ` : ""}
                            {s.state}
                            {s.unitid ? ` • unitid ${s.unitid}` : ""}
                          </div>
                          <div className="text-xs font-mono mt-1">{s.id}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Tip: use this as a lookup list, then select the School per row below.</div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">3) Repair rows</div>

              {repairRows.length === 0 ? (
                <div className="text-sm text-gray-600">(Load unmatched rows to begin.)</div>
              ) : (
                <div className="space-y-3">
                  {repairRows.map((row) => {
                    const rowId = getId(row);
                    const rawName = safeStr(row?.raw_school_name || "");
                    const rawCity = safeStr(row?.raw_city || "");
                    const rawState = safeStr(row?.raw_state || "");
                    const reason = safeStr(row?.reason || "");
                    const org = safeStr(row?.org || "");
                    const url = safeStr(row?.source_url || row?.sourceUrl || "");
                    const key = safeStr(row?.raw_source_key || "");
                    const notes = safeStr(row?.attempted_match_notes || "");
                    const selected = selectedSchoolByRowId?.[rowId] || null;

                    return (
                      <div key={rowId} className="border rounded-lg p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">
                              {rawName || "(missing raw_school_name)"}{" "}
                              <span className="text-xs text-gray-500">
                                [{org || "?"} / {reason || "?"}]
                              </span>
                            </div>
                            <div className="text-sm text-gray-700">
                              {rawCity || rawState ? (
                                <span>
                                  {rawCity ? `${rawCity}, ` : ""}
                                  {rawState}
                                </span>
                              ) : (
                                <span className="text-gray-500">(no city/state)</span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-gray-600 mt-1">{key}</div>
                            {notes ? <div className="text-xs text-gray-600 mt-1">Notes: {notes}</div> : null}
                            {url ? (
                              <div className="text-xs mt-1">
                                <button className="underline text-blue-700" onClick={() => openMaybe(url)} disabled={busy}>
                                  Open source
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="min-w-[320px] flex-1">
                            <div className="text-xs text-gray-600 mb-1">Select School</div>
                            <div className="flex gap-2 items-center">
                              <input
                                className="border rounded px-2 py-1 flex-1"
                                placeholder="Paste School id OR type name then pick from results below"
                                value={selected?.id ? selected.id : ""}
                                onChange={(e) => {
                                  const v = safeStr(e.target.value).trim();
                                  setSelectedSchoolByRowId((prev) => ({
                                    ...prev,
                                    [rowId]: v ? { id: v, name: prev?.[rowId]?.name || "", unitid: prev?.[rowId]?.unitid || "" } : null,
                                  }));
                                }}
                                disabled={busy}
                              />
                              <Button
                                variant="outline"
                                onClick={() => {
                                  // quick-fill from top search result (if available)
                                  const top = schoolSearchResults?.[0];
                                  if (!top?.id) return;
                                  setSelectedSchoolByRowId((prev) => ({
                                    ...prev,
                                    [rowId]: { id: top.id, name: top.name, unitid: top.unitid },
                                  }));
                                }}
                                disabled={busy || schoolSearchResults.length === 0}
                              >
                                Use top match
                              </Button>
                            </div>

                            {selected?.id ? (
                              <div className="text-xs text-gray-600 mt-1">
                                Selected: <span className="font-mono">{selected.id}</span> {selected.name ? `• ${selected.name}` : ""}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 mt-1">(No school selected)</div>
                            )}

                            <div className="flex gap-2 mt-2">
                              <Button onClick={() => applyRepairForRow(row)} disabled={busy || !adminEnabled || !selected?.id}>
                                Apply repair
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedSchoolByRowId((prev) => {
                                    const next = { ...prev };
                                    delete next[rowId];
                                    return next;
                                  });
                                }}
                                disabled={busy}
                              >
                                Clear selection
                              </Button>
                            </div>

                            <div className="text-xs text-gray-500 mt-1">
                              Writes AthleticsMembership with source_key <span className="font-mono">{`${org || "org"}:${"school_id"}:${ncaaSeasonYear}`}</span> and attempts to delete this Unmatched row.
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRecoverBanner(true)} disabled={busy}>
              Show recover info
            </Button>
            <Button variant="outline" onClick={clearLogs} disabled={busy}>
              Clear
            </Button>
          </div>
        </div>
        <div ref={logRef} className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto" style={{ maxHeight: 420 }}>
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
