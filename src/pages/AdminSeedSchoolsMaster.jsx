// src/pages/AdminSeedSchoolsMaster.jsx
import React, { useMemo, useState } from "react";
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
    >
      {children}
    </button>
  );
};

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function unwrapBase44(raw) {
  // Base44 functions often return { data: ..., status, headers, ... }
  // Normalize so callers can always read resp.stats/resp.debug/etc.
  return raw?.data ?? raw;
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function AdminSeedSchoolsMaster() {
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  // Membership seed controls
  const [dryRun, setDryRun] = useState(true);
  const [includeNCAA, setIncludeNCAA] = useState(true);
  const [includeNAIA, setIncludeNAIA] = useState(true);
  const [includeNJCAA, setIncludeNJCAA] = useState(true);

  // Scorecard enrich controls
  const [scorecardBatchLimit, setScorecardBatchLimit] = useState(75);
  const [scorecardDryRun, setScorecardDryRun] = useState(true);

  const push = (m) => setLog((x) => [...x, m]);

  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const runMembershipSeed = async () => {
    if (!canRun) return;

    setWorking(true);
    setLog([]);
    try {
      push(`Membership seed start @ ${new Date().toISOString()}`);
      push(`DryRun=${dryRun} NCAA=${includeNCAA} NAIA=${includeNAIA} NJCAA=${includeNJCAA}`);

      const raw = await base44.functions.invoke("seedSchoolsMaster_membership", {
        dryRun,
        includeNCAA,
        includeNAIA,
        includeNJCAA,
      });
      const resp = unwrapBase44(raw);

      // If you're still getting unexpected wrapper shapes, this line helps
      if (resp === raw && raw?.data) {
        push(`(note) response was wrapped; using raw.data`);
      }

      push(
        `✅ Done. Created=${resp?.stats?.created ?? "?"} Updated=${resp?.stats?.updated ?? "?"} Skipped=${resp?.stats?.skipped ?? "?"}`
      );

      if (resp?.debug?.pages) push(`Pages:\n${safeJson(resp.debug.pages)}`);
      if (resp?.debug?.notes?.length) push(`Notes:\n${safeJson(resp.debug.notes)}`);
      if (resp?.debug?.errors?.length) push(`Errors:\n${safeJson(resp.debug.errors)}`);

      if (Array.isArray(resp?.sample) && resp.sample.length) {
        push(`Sample:\n${safeJson(resp.sample)}`);
      }
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  const runScorecardEnrich = async () => {
    if (!canRun) return;

    setWorking(true);
    setLog([]);
    try {
      push(`Scorecard enrich start @ ${new Date().toISOString()}`);
      push(`DryRun=${scorecardDryRun} BatchLimit=${scorecardBatchLimit}`);

      const raw = await base44.functions.invoke("enrichSchoolsMaster_scorecard", {
        dryRun: scorecardDryRun,
        batchLimit: Number(scorecardBatchLimit || 75),
      });
      const resp = unwrapBase44(raw);

      push(
        `✅ Done. Matched=${resp?.stats?.matched ?? "?"} Updated=${resp?.stats?.updated ?? "?"} NoMatch=${resp?.stats?.noMatch ?? "?"} Errors=${resp?.stats?.errors ?? "?"}`
      );
      push(
        `API key present? ${resp?.stats?.apiKeyPresent ? "YES" : "NO"} (where=${resp?.stats?.apiKeyWhere ?? "unknown"})`
      );

      if (resp?.stats?.candidates != null) push(`Candidates evaluated: ${resp.stats.candidates}`);

      if (resp?.debug?.errors?.length) push(`Debug errors:\n${safeJson(resp.debug.errors)}`);
      if (resp?.debug?.notes?.length) push(`Debug notes:\n${safeJson(resp.debug.notes)}`);
      if (resp?.debug?.secretTries) push(`Secret tries:\n${safeJson(resp.debug.secretTries)}`);

      if (resp?.debug?.scorecard) push(`Scorecard probe:\n${safeJson(resp.debug.scorecard)}`);

      if (Array.isArray(resp?.sample) && resp.sample.length) {
        push(`Sample:\n${safeJson(resp.sample)}`);
      }
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  const runDebugSecrets = async () => {
    if (!canRun) return;

    setWorking(true);
    setLog([]);
    try {
      push(`Debug secrets start @ ${new Date().toISOString()}`);

      const raw = await base44.functions.invoke("debugSecrets", {});
      const resp = unwrapBase44(raw);

      push(`✅ debugSecrets response:\n${safeJson(resp)}`);
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Seed School Master (Option A)</div>
          <div className="text-sm text-slate-600 mt-1">
            Step 1: membership truth (NCAA/NAIA/NJCAA). Step 2: enrich location/domain via College Scorecard.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run (membership seed)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeNCAA} onChange={(e) => setIncludeNCAA(e.target.checked)} />
              NCAA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeNAIA} onChange={(e) => setIncludeNAIA(e.target.checked)} />
              NAIA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeNJCAA} onChange={(e) => setIncludeNJCAA(e.target.checked)} />
              NJCAA
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={working} onClick={runMembershipSeed}>
              {working ? "Working…" : "Run membership seed"}
            </Button>
            <Button disabled={working} onClick={runDebugSecrets} variant="outline">
              {working ? "Working…" : "Debug secrets"}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Enrich via College Scorecard</div>
          <div className="text-sm text-slate-600 mt-1">
            Uses SCORECARD_API_KEY from backend secrets. This will log whether the key is visible and whether Scorecard
            requests are succeeding.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scorecardDryRun}
                onChange={(e) => setScorecardDryRun(e.target.checked)}
              />
              Dry run (enrich)
            </label>

            <label className="text-sm">
              Batch limit{" "}
              <input
                className="ml-2 w-20 rounded border border-slate-300 px-2 py-1"
                value={scorecardBatchLimit}
                onChange={(e) => setScorecardBatchLimit(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <Button disabled={working} onClick={runScorecardEnrich} variant="outline">
              {working ? "Working…" : "Run Scorecard enrich"}
            </Button>
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
