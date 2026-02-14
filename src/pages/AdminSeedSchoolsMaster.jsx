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
      type="button"
    >
      {children}
    </button>
  );
};

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function unwrapInvokeResponse(resp) {
  // Some Base44 function invocations return { data: ... }.
  // Others return the payload directly.
  return resp?.data ?? resp ?? null;
}

export default function AdminSeedSchoolsMaster() {
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  // Membership seed (legacy path)
  const [dryRun, setDryRun] = useState(true);
  const [includeNCAA, setIncludeNCAA] = useState(true);
  const [includeNAIA, setIncludeNAIA] = useState(true);
  const [includeNJCAA, setIncludeNJCAA] = useState(true);

  // NEW: Scorecard seed (primary path)
  const [scorecardSeedDryRun, setScorecardSeedDryRun] = useState(true);
  const [scorecardSeedPage, setScorecardSeedPage] = useState(0);
  const [scorecardSeedPerPage, setScorecardSeedPerPage] = useState(100);
  const [scorecardSeedMaxPages, setScorecardSeedMaxPages] = useState(1);

  // Enrich (existing)
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

      const resp = unwrapInvokeResponse(raw);

      if (resp?.error) {
        push(`❌ ERROR: ${resp.error}`);
      }

      push(
        `✅ Done. Created=${resp?.stats?.created ?? "?"} Updated=${resp?.stats?.updated ?? "?"} Skipped=${
          resp?.stats?.skipped ?? "?"
        }`
      );
      push(`Notes: ${resp?.stats?.notes ?? 0}`);

      // Show debug.pages explicitly so we can see whether the function ever fetched sources
      if (Array.isArray(resp?.debug?.pages)) {
        push(`Pages:\n${JSON.stringify(resp.debug.pages, null, 2)}`);
      } else {
        push(`Pages:\n[]`);
      }

      if (Array.isArray(resp?.debug?.errors) && resp.debug.errors.length) {
        push(`Debug errors:\n${JSON.stringify(resp.debug.errors, null, 2)}`);
      }

      if (Array.isArray(resp?.sample) && resp.sample.length) {
        push(`Sample:\n${JSON.stringify(resp.sample, null, 2)}`);
      }
    } catch (e) {
      push(`❌ ERROR: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  // NEW: Scorecard seed (primary)
  const runScorecardSeed = async () => {
    if (!canRun) return;

    setWorking(true);
    setLog([]);
    try {
      push(`Scorecard seed start @ ${new Date().toISOString()}`);
      push(
        `DryRun=${scorecardSeedDryRun} page=${scorecardSeedPage} perPage=${scorecardSeedPerPage} maxPages=${scorecardSeedMaxPages}`
      );

      const raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
        dryRun: !!scorecardSeedDryRun,
        page: Number(scorecardSeedPage || 0),
        perPage: Number(scorecardSeedPerPage || 100),
        maxPages: Number(scorecardSeedMaxPages || 1),
      });

      const resp = unwrapInvokeResponse(raw);

      if (resp?.error) {
        push(`❌ ERROR: ${resp.error}`);
      }

      push(
        `✅ Done. Created=${resp?.stats?.created ?? 0} Updated=${resp?.stats?.updated ?? 0} Skipped=${
          resp?.stats?.skipped ?? 0
        } Pages=${resp?.stats?.pages ?? 0}`
      );

      if (Array.isArray(resp?.debug?.pageCalls)) {
        push(`PageCalls:\n${JSON.stringify(resp.debug.pageCalls, null, 2)}`);
      }

      if (Array.isArray(resp?.debug?.errors) && resp.debug.errors.length) {
        push(`Debug errors:\n${JSON.stringify(resp.debug.errors, null, 2)}`);
      }

      if (Array.isArray(resp?.debug?.sample) && resp.debug.sample.length) {
        push(`Sample:\n${JSON.stringify(resp.debug.sample, null, 2)}`);
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
        dryRun: !!scorecardDryRun,
        batchLimit: Number(scorecardBatchLimit || 75),
      });

      const resp = unwrapInvokeResponse(raw);

      if (resp?.error) {
        push(`❌ ERROR: ${resp.error}`);
      }

      push(
        `✅ Done. Matched=${resp?.stats?.matched ?? "?"} Updated=${resp?.stats?.updated ?? "?"} NoMatch=${
          resp?.stats?.noMatch ?? "?"
        } Errors=${resp?.stats?.errors ?? "?"}`
      );

      // These fields exist in your enrich function output now
      if (resp?.stats) {
        push(`API key present? ${resp?.stats?.apiKeyPresent ? "YES" : "NO"}`);
        if (resp?.stats?.apiKeyWhere) push(`API key where: ${resp.stats.apiKeyWhere}`);
      }

      if (Array.isArray(resp?.debug?.secretTries) && resp.debug.secretTries.length) {
        push(`Secret tries:\n${JSON.stringify(resp.debug.secretTries, null, 2)}`);
      }

      if (Array.isArray(resp?.debug?.errors) && resp.debug.errors.length) {
        push(`Debug errors:\n${JSON.stringify(resp.debug.errors, null, 2)}`);
      }

      if (Array.isArray(resp?.sample) && resp.sample.length) {
        push(`Sample:\n${JSON.stringify(resp.sample, null, 2)}`);
      }

      if (resp?.debug?.scorecard) {
        push(`Scorecard probe:\n${JSON.stringify(resp.debug.scorecard, null, 2)}`);
      }
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
            Recommended flow: (1) Seed Schools via College Scorecard (stable master list with city/state/website/unitid),
            then (2) optionally enrich/overlay athletics membership (NCAA/NAIA/NJCAA) later, then (3) logo enrichment.
          </div>
        </Card>

        {/* Primary seed: Scorecard */}
        <Card>
          <div className="text-lg font-semibold text-slate-900">1) Seed via College Scorecard (Primary)</div>
          <div className="text-sm text-slate-600 mt-1">
            Uses your published <code>seedSchoolsMaster_scorecard</code> function. Requires SCORECARD_API_KEY in
            secrets. Start with DryRun and small pages.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scorecardSeedDryRun}
                onChange={(e) => setScorecardSeedDryRun(e.target.checked)}
              />
              Dry run (seed)
            </label>

            <label className="text-sm">
              Page{" "}
              <input
                className="ml-2 w-20 rounded border border-slate-300 px-2 py-1"
                value={scorecardSeedPage}
                onChange={(e) => setScorecardSeedPage(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Per page{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={scorecardSeedPerPage}
                onChange={(e) => setScorecardSeedPerPage(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Max pages{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={scorecardSeedMaxPages}
                onChange={(e) => setScorecardSeedMaxPages(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <Button disabled={working} onClick={runScorecardSeed}>
              {working ? "Working…" : "Run Scorecard seed"}
            </Button>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Safe ramp: DryRun=true page=0 maxPages=1 → DryRun=false page=0 maxPages=1 → then increase maxPages in small
            blocks (5–10).
          </div>
        </Card>

        {/* Legacy membership seed (kept for now) */}
        <Card>
          <div className="text-lg font-semibold text-slate-900">2) Membership seed (Legacy / troubleshooting)</div>
          <div className="text-sm text-slate-600 mt-1">
            This runs <code>seedSchoolsMaster_membership</code>. If it shows Pages: [], it is returning before fetch
            (usually entity access or deployment model). Use logs below to diagnose.
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

          <div className="mt-3 flex gap-2">
            <Button disabled={working} onClick={runMembershipSeed} variant="outline">
              {working ? "Working…" : "Run membership seed"}
            </Button>
          </div>
        </Card>

        {/* Existing enrich */}
        <Card>
          <div className="text-lg font-semibold text-slate-900">3) Enrich via College Scorecard (Secondary pass)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs <code>enrichSchoolsMaster_scorecard</code> (best when you already have Schools and want to fill missing
            fields). Requires SCORECARD_API_KEY in secrets.
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
