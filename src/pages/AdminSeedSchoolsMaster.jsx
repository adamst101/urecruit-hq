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

export default function AdminSeedSchoolsMaster() {
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  const [dryRun, setDryRun] = useState(true);
  const [includeNCAA, setIncludeNCAA] = useState(true);
  const [includeNAIA, setIncludeNAIA] = useState(true);
  const [includeNJCAA, setIncludeNJCAA] = useState(true);

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

      const resp = await base44.functions.invoke("seedSchoolsMaster_membership", {
        dryRun,
        includeNCAA,
        includeNAIA,
        includeNJCAA,
      });

      push(
        `✅ Done. Created=${resp?.stats?.created ?? "?"} Updated=${resp?.stats?.updated ?? "?"} Skipped=${resp?.stats?.skipped ?? "?"}`
      );
      if (resp?.debug?.pages) push(`Pages: ${JSON.stringify(resp.debug.pages, null, 2)}`);
      if (Array.isArray(resp?.sample) && resp.sample.length) {
        push(`Sample:\n${JSON.stringify(resp.sample, null, 2)}`);
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

      const resp = await base44.functions.invoke("enrichSchoolsMaster_scorecard", {
        dryRun: scorecardDryRun,
        batchLimit: Number(scorecardBatchLimit || 75),
      });

      // Your backend returns stats+debug; these fields are reliable
      push(
        `✅ Done. Matched=${resp?.stats?.matched ?? "?"} Updated=${resp?.stats?.updated ?? "?"} NoMatch=${resp?.stats?.noMatch ?? "?"} Errors=${resp?.stats?.errors ?? "?"}`
      );
      push(
        `API key present? ${resp?.stats?.apiKeyPresent ? "YES" : "NO"} (where=${resp?.stats?.apiKeyWhere ?? "unknown"})`
      );

      if (resp?.debug?.errors?.length) push(`Debug errors: ${JSON.stringify(resp.debug.errors, null, 2)}`);
      if (resp?.debug?.notes?.length) push(`Debug notes: ${JSON.stringify(resp.debug.notes, null, 2)}`);
      if (resp?.debug?.secretTries) push(`Secret tries: ${JSON.stringify(resp.debug.secretTries, null, 2)}`);

      if (resp?.debug?.scorecard) push(`Scorecard probe: ${JSON.stringify(resp.debug.scorecard, null, 2)}`);
      if (Array.isArray(resp?.sample) && resp.sample.length) push(`Sample:\n${JSON.stringify(resp.sample, null, 2)}`);
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
      const resp = await base44.functions.invoke("debugSecrets", {});
      push(`✅ debugSecrets response:\n${JSON.stringify(resp, null, 2)}`);
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
