import { useState, useRef, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  var parts = path.split(".");
  var current = obj;
  for (var i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function formatDuration(ms) {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  var mins = Math.floor(ms / 60000);
  var secs = Math.floor((ms % 60000) / 1000);
  return mins + "m " + secs + "s";
}

export default function AutoBatchRunner({
  functionName,
  params = {},
  onComplete,
  onError,
  batchDelayMs = 2000,
  maxBatches = 100,
  doneKey = "pagination.done",
  cursorKey = "pagination.nextStartAt",
  cursorParam = "startAt",
  formatLogLine,
  title,
}) {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [batchLog, setBatchLog] = useState([]);
  const [lastError, setLastError] = useState(null);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const startTimeRef = useRef(0);

  // Elapsed timer
  useEffect(() => {
    if (state !== "running") return;
    const iv = setInterval(() => {
      setTotalElapsed(Date.now() - startTimeRef.current);
    }, 500);
    return () => clearInterval(iv);
  }, [state]);

  const defaultFormatLine = useCallback((batchNum, data, elapsedMs) => {
    const stats = data.stats || {};
    const pag = data.pagination || {};
    const stealth = data.stealth || {};
    const start = pag.startAt ?? "?";
    const next = pag.nextStartAt ?? "?";
    const isIngest = stats.campsInserted !== undefined || stats.schoolsProcessed !== undefined;
    if (isIngest) {
      return `schools ${start}→${next} · ${stats.schoolsProcessed ?? "?"} schools · ${stats.campsInserted || 0} new · ${stats.campsUpdated || 0} updated · ${stats.campsSkipped || 0} skipped · ${stats.campsErrors || 0} errors · ${stealth.ryzerRequestsTotal ?? 0} ryzer req · ${formatDuration(elapsedMs)}`;
    }
    // Generic fallback
    const processed = stats.processed ?? pag.processed ?? "?";
    const updated = stats.updated ?? stats.campsUpdated ?? 0;
    const errors = stats.errors ?? stats.campsErrors ?? 0;
    return `processed=${processed} · updated=${updated} · errors=${errors} · ${formatDuration(elapsedMs)}`;
  }, []);

  const run = useCallback(async () => {
    setState("running");
    setBatchLog([]);
    setLastError(null);
    stopRef.current = false;
    runningRef.current = true;
    startTimeRef.current = Date.now();

    let cursor = params[cursorParam] ?? 0;
    let batchCount = 0;

    while (runningRef.current && !stopRef.current) {
      batchCount++;
      if (batchCount > maxBatches) {
        setLastError("Reached max batch limit (" + maxBatches + ")");
        setState("error");
        if (onError) onError("max_batches");
        return;
      }

      const batchStart = Date.now();
      let data;
      try {
        const callParams = { ...params, [cursorParam]: cursor };
        const res = await base44.functions.invoke(functionName, callParams);
        data = res.data || res;
      } catch (e) {
        const errMsg = e?.response?.data?.error || e?.message || String(e);
        setLastError(errMsg);
        setState("error");
        if (onError) onError(errMsg);
        return;
      }

      const batchElapsed = Date.now() - batchStart;
      // Debug: log the actual shape we're working with
      console.log("[AutoBatch] batch", batchCount, "data keys:", Object.keys(data || {}), "stats:", data?.stats, "pagination:", data?.pagination);
      const done = getNestedValue(data, doneKey);
      const nextCursor = getNestedValue(data, cursorKey);
      const lineText = (formatLogLine || defaultFormatLine)(batchCount, data, batchElapsed);

      setBatchLog(prev => [...prev, {
        num: batchCount,
        text: lineText,
        done: !!done,
        elapsed: batchElapsed,
        data: data,
      }]);

      // Check circuit breaker from stealth
      if (data.stealth?.circuitBroken || data.stats?.circuitBroken) {
        setLastError("Circuit breaker triggered: " + (data.stealth?.circuitBrokenReason || data.stats?.circuitBrokenReason || "unknown"));
        setState("error");
        if (onError) onError("circuit_broken");
        return;
      }

      if (done) {
        setState("done");
        runningRef.current = false;
        if (onComplete) onComplete(data);
        return;
      }

      cursor = nextCursor ?? cursor + 1;

      if (stopRef.current) break;
      await new Promise(r => setTimeout(r, batchDelayMs));
    }

    // Stopped manually
    setState("idle");
    runningRef.current = false;
  }, [functionName, params, batchDelayMs, maxBatches, doneKey, cursorKey, cursorParam, formatLogLine, defaultFormatLine, onComplete, onError]);

  const stop = useCallback(() => {
    stopRef.current = true;
    runningRef.current = false;
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setBatchLog([]);
    setLastError(null);
    setTotalElapsed(0);
  }, []);

  // Aggregate stats from all batches
  const totals = batchLog.reduce((acc, b) => {
    const s = b.data?.stats || {};
    acc.new += (s.campsInserted || 0);
    acc.updated += (s.campsUpdated || s.updated || 0);
    acc.skipped += (s.campsSkipped || s.skipped || 0);
    acc.errors += (s.campsErrors || s.errors || 0);
    acc.processed += (s.schoolsProcessed || s.processed || 0);
    return acc;
  }, { new: 0, updated: 0, skipped: 0, errors: 0, processed: 0 });

  const totalPrograms = batchLog.length > 0 ? (batchLog[0].data?.totalProgramsOnSite || 0) : 0;
  const progressPct = totalPrograms > 0 ? Math.min(100, Math.round((totals.processed / totalPrograms) * 100)) : 0;

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, background: "#FFF", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1F3B" }}>
          {title || functionName}
          {state === "running" && <span style={{ color: "#2563EB", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>● Running</span>}
          {state === "done" && <span style={{ color: "#059669", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>✓ Complete</span>}
          {state === "error" && <span style={{ color: "#DC2626", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>✗ Error</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {state === "idle" && (
            <button onClick={run} style={{ background: "#0B1F3B", color: "#FFF", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ▶ Run
            </button>
          )}
          {state === "running" && (
            <button onClick={stop} style={{ background: "#DC2626", color: "#FFF", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ⏹ Stop
            </button>
          )}
          {(state === "done" || state === "error") && (
            <button onClick={reset} style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Progress bar (when running or done) */}
      {batchLog.length > 0 && (
        <div style={{ padding: "8px 16px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
            <span>Batch {batchLog.length}{totalPrograms > 0 ? ` of ~${Math.ceil(totalPrograms / (params.maxSchools || 22))}` : ""} · {totals.processed} processed · {totals.new} new · {totals.errors} errors</span>
            <span>{formatDuration(totalElapsed)}</span>
          </div>
          <div style={{ width: "100%", height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: (state === "done" ? 100 : progressPct) + "%",
              height: "100%",
              background: state === "error" ? "#DC2626" : state === "done" ? "#059669" : "#2563EB",
              borderRadius: 3,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      )}

      {/* Error banner */}
      {state === "error" && lastError && (
        <div style={{ padding: "10px 16px", background: "#FEF2F2", borderBottom: "1px solid #FECACA", fontSize: 13, color: "#991B1B" }}>
          ✗ {lastError}
        </div>
      )}

      {/* Done banner */}
      {state === "done" && (
        <div style={{ padding: "10px 16px", background: "#F0FDF4", borderBottom: "1px solid #BBF7D0", fontSize: 13, color: "#166534" }}>
          🏁 Done — {batchLog.length} batches · {totals.new} new camps · {totals.updated} updated · {totals.errors} errors · {formatDuration(totalElapsed)} total
        </div>
      )}

      {/* Batch log */}
      {batchLog.length > 0 && (
        <div style={{ maxHeight: 280, overflowY: "auto", padding: "8px 16px" }}>
          {batchLog.map((b) => (
            <div key={b.num} style={{ fontSize: 12, fontFamily: "monospace", color: "#374151", padding: "3px 0", borderBottom: "1px solid #F9FAFB" }}>
              <span style={{ color: b.done ? "#059669" : "#6B7280" }}>{b.done ? "🏁" : "✓"}</span>
              {" "}Batch {b.num} — {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}