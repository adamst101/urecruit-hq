import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const INITIAL_STATS = {
  pages: 0,
  scanned: 0,
  alreadyConfirmed: 0,
  wikipediaFetched: 0,
  athleticsFound: 0,
  noAthleticsFound: 0,
  wikiNotFound: 0,
  updated: 0,
  deleted: 0,
  errors: 0,
};

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-blue-700" : "text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
}

export default function SchoolAthleticsCleanup() {
  const [running, setRunning]   = useState(false);
  const [mode, setMode]         = useState(null); // "update" | "delete"
  const [dryRun, setDryRun]     = useState(true);
  const [stats, setStats]       = useState(INITIAL_STATS);
  const [log, setLog]           = useState([]);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState(null);
  const stopRef                 = useRef(false);

  function appendLog(msg) {
    setLog(prev => [...prev.slice(-199), msg]);
  }

  async function runLoop(selectedMode) {
    stopRef.current = false;
    setRunning(true);
    setMode(selectedMode);
    setStats(INITIAL_STATS);
    setLog([]);
    setDone(false);
    setError(null);

    let currentStartAt = 0;
    let totals = { ...INITIAL_STATS };

    appendLog(`▶ Starting ${selectedMode.toUpperCase()} — dryRun: ${dryRun}`);

    try {
      while (!stopRef.current) {
        const payload = {
          mode:     selectedMode,
          dryRun,
          maxRows:  50,
          sleepMs:  400,
          startAt:  currentStartAt,
        };

        const res  = await base44.functions.invoke("auditSchoolsAthletics", payload);
        const data = res?.data ?? res;

        if (!data?.ok) {
          setError(data?.error ?? "Unknown error from auditSchoolsAthletics");
          appendLog(`❌ Error: ${data?.error ?? "unknown"}`);
          break;
        }

        const s = data.stats ?? {};
        totals.pages          += 1;
        totals.scanned        += s.scanned          ?? 0;
        totals.alreadyConfirmed += s.alreadyConfirmed ?? 0;
        totals.wikipediaFetched += s.wikipediaFetched ?? 0;
        totals.athleticsFound += s.athleticsFound   ?? 0;
        totals.noAthleticsFound += s.noAthleticsFound ?? 0;
        totals.wikiNotFound   += s.wikiNotFound     ?? 0;
        totals.updated        += s.updated          ?? 0;
        totals.deleted        += s.deleted          ?? 0;
        totals.errors         += s.errors           ?? 0;

        setStats({ ...totals });

        const nextStartAt = data.next?.nextStartAt ?? s.nextStartAt ?? (currentStartAt + 50);
        const isDone      = !!(data.next?.done ?? s.done);

        appendLog(
          `Page ${totals.pages} (rows ${currentStartAt}–${nextStartAt - 1}): ` +
          `scanned=${s.scanned} found=${s.athleticsFound} notFound=${s.wikiNotFound} ` +
          `updated=${s.updated} deleted=${s.deleted} errors=${s.errors}`
        );

        if (isDone) {
          setDone(true);
          appendLog(`✅ Complete! Total pages: ${totals.pages}`);
          break;
        }

        currentStartAt = nextStartAt;
        // Small client-side pause between iterations
        await new Promise(r => setTimeout(r, 100));
      }

      if (stopRef.current) appendLog("⏹ Stopped by user.");
    } catch (e) {
      const msg = e?.message ?? String(e);
      setError(msg);
      appendLog(`❌ Exception: ${msg}`);
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    stopRef.current = true;
  }

  const modeColor = mode === "delete" ? "text-red-600" : "text-blue-700";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">School Athletics Cleanup</h1>
      <p className="text-sm text-gray-500 mb-6">
        Loops through all School rows, checks Wikipedia for athletic affiliations, then updates or deletes accordingly.
      </p>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Switch
            id="dry-run"
            checked={dryRun}
            onCheckedChange={setDryRun}
            disabled={running}
          />
          <Label htmlFor="dry-run" className="text-sm font-medium">
            Dry Run
            {dryRun && <span className="ml-2 text-xs text-amber-600 font-normal">(no writes — safe to test)</span>}
            {!dryRun && <span className="ml-2 text-xs text-red-600 font-normal">(LIVE — will write/delete)</span>}
          </Label>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => runLoop("update")}
            disabled={running}
            className="bg-blue-700 hover:bg-blue-800 text-white"
          >
            {running && mode === "update" ? "Running Update…" : "Run Update"}
          </Button>
          <Button
            onClick={() => runLoop("delete")}
            disabled={running}
            variant="destructive"
          >
            {running && mode === "delete" ? "Running Delete…" : "Run Delete"}
          </Button>
          {running && (
            <Button onClick={stop} variant="outline">
              Stop
            </Button>
          )}
        </div>

        {running && (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className={`font-semibold ${modeColor}`}>{mode?.toUpperCase()}</span>
            <span className="text-gray-500">in progress — page {stats.pages}</span>
            {dryRun && <Badge variant="outline" className="text-amber-600 border-amber-300">DRY RUN</Badge>}
          </div>
        )}

        {done && !running && (
          <div className="text-sm text-green-700 font-medium">
            ✅ Finished — {stats.pages} pages processed
            {dryRun && <span className="ml-2 text-amber-600">(dry run — no changes written)</span>}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2">❌ {error}</div>
        )}
      </div>

      {/* Stats */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Live Progress</h2>
        <StatRow label="Pages completed"         value={stats.pages}             highlight />
        <StatRow label="Schools scanned"         value={stats.scanned} />
        <StatRow label="Already confirmed (skip)" value={stats.alreadyConfirmed} />
        <StatRow label="Wikipedia fetched"       value={stats.wikipediaFetched} />
        <StatRow label="Athletics found ✅"      value={stats.athleticsFound} />
        <StatRow label="No athletics found 🚩"   value={stats.noAthleticsFound} />
        <StatRow label="Wiki not found ❓"       value={stats.wikiNotFound} />
        <StatRow label="Updated 📝"              value={stats.updated} />
        <StatRow label="Deleted 🗑️"              value={stats.deleted} />
        <StatRow label="Errors ⚠️"               value={stats.errors} />
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-gray-950 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Log</h2>
          <div className="space-y-0.5 max-h-72 overflow-y-auto font-mono text-xs text-green-400">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}