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
  return resp?.data ?? resp ?? null;
}

function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch (e) {
    return String(x);
  }
}

function diagnoseAxiosError(e) {
  return {
    message: String(e?.message || e),
    name: e?.name || null,
    code: e?.code || null,
    status: e?.response?.status ?? null,
    statusText: e?.response?.statusText ?? null,
    data: e?.response?.data ?? null,
    headers: e?.response?.headers ?? null,
  };
}

export default function AdminSeedSchoolsMaster() {
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  // Membership seed (legacy)
  const [dryRun, setDryRun] = useState(true);
  const [includeNCAA, setIncludeNCAA] = useState(true);
  const [includeNAIA, setIncludeNAIA] = useState(true);
  const [includeNJCAA, setIncludeNJCAA] = useState(true);

  // Scorecard seed (primary)
  const [scorecardSeedFunctionName, setScorecardSeedFunctionName] = useState(
    "seedSchoolsMaster_scorecard"
  );
  const [scorecardSeedDryRun, setScorecardSeedDryRun] = useState(true);
  const [scorecardSeedPage, setScorecardSeedPage] = useState(0);
  const [scorecardSeedPerPage, setScorecardSeedPerPage] = useState(100);
  const [scorecardSeedMaxPages, setScorecardSeedMaxPages] = useState(1);

  // Enrich (secondary)
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

      if (resp?.error) push(`❌ ERROR: ${resp.error}`);

      push(
        `✅ Done. Created=${resp?.stats?.created ?? "?"} Updated=${resp?.stats?.updated ?? "?"} Skipped=${
          resp?.stats?.skipped ?? "?"
        }`
      );

      push(`Pages:\n${safeJson(resp?.debug?.pages ?? [])}`);

      if (asArray(resp?.debug?.errors).length) push(`Debug errors:\n${safeJson(resp.debug.errors)}`);
      if (asArray(resp?.sample).length) push(`Sample:\n${safeJson(resp.sample)}`);
    } catch (e) {
      const d = diagnoseAxiosError(e);
      push(`❌ ERROR: ${d.message}`);
      if (d.status) push(`HTTP ${d.status} ${d.statusText || ""}`.trim());
      if (d.data) push(`Response data:\n${safeJson(d.data)}`);
    } finally {
      setWorking(false);
    }
  };

  const runScorecardSeed = async () => {
    if (!canRun) return;

    const fn = String(scorecardSeedFunctionName || "").trim();
    if (!fn) {
      setLog([`❌ ERROR: Scorecard function name is blank.`]);
      return;
    }

    setWorking(true);
    setLog([]);
    try {
      push(`Scorecard seed start @ ${new Date().toISOString()}`);
      push(`Function=${fn}`);
      push(
        `DryRun=${scorecardSeedDryRun} page=${scorecardSeedPage} perPage=${scorecardSeedPerPage} maxPages=${scorecardSeedMaxPages}`
      );

      const raw = await base44.functions.invoke(fn, {
        dryRun: !!scorecardSeedDryRun,
        page: Number(scorecardSeedPage || 0),
        perPage: Number(scorecardSeedPerPage || 100),
        maxPages: Number(scorecardSeedMaxPages || 1),
      });

      const resp = unwrapInvokeResponse(raw);

      if (resp?.error) push(`❌ ERROR: ${resp.error}`);

      push(
        `✅ Done. Created=${resp?.stats?.created ?? 0} Updated=${resp?.stats?.updated ?? 0} Skipped=${
          resp?.stats?.skipped ?? 0
        } Pages=${resp?.stats?.pages ?? 0}`
      );

      if (resp?.debug?.step) push(`Step: ${resp.debug.step}`);
      push(`PageCalls:\n${safeJson(resp?.debug?.pageCalls ?? [])}`);

      if (asArray(resp?.debug?.errors).length) push(`Debug errors:\n${safeJson(resp.debug.errors)}`);
      if (asArray(resp?.debug?.sample).length) push(`Sample:\n${safeJson(resp.debug.sample)}`);
    } catch (e) {
      const d = diagnoseAxiosError(e);
      push(`❌ ERROR: ${d.message}`);
      if (d.status) push(`HTTP ${d.status} ${d.statusText || ""}`.trim());
      if (d.data) push(`Response data:\n${safeJson(d.data)}`);
      if (!d.data) push(`No response body returned (platform-level 500).`);
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

      if (resp?.error) push(`❌ ERROR: ${resp.error}`);

      push(
        `✅ Done. Matched=${resp?.stats?.matched ?? "?"} Updated=${resp?.stats?.updated ?? "?"} NoMatch=${
          resp?.stats?.noMatch ?? "?"
        } Errors=${resp?.stats?.errors ?? "?"}`
      );

      if (resp?.stats) {
        push(`API key present? ${resp?.stats?.apiKeyPresent ? "YES" : "NO"}`);
        if (resp?.stats?.apiKeyWhere) push(`API key where: ${resp.stats.apiKeyWhere}`);
      }

      if (asArray(resp?.debug?.secretTries).length) push(`Secret tries:\n${safeJson(resp.debug.secretTries)}`);
      if (asArray(resp?.debug?.errors).length) push(`Debug errors:\n${safeJson(resp.debug.errors)}`);
      if (asArray(resp?.sample).length) push(`Sample:\n${safeJson(resp.sample)}`);
      if (resp?.debug?.scorecard) push(`Scorecard probe:\n${safeJson(resp.debug.scorecard)}`);
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
      <div className="max-w-3xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Seed School Master (Option A)</div>
          <div className="text-sm text-slate-600 mt-1">
            Primary path is Scorecard seed (stable master list). If a function name mismatch exists, override it below.
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">1) Seed via College Scorecard (Primary)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs the function name you specify. If you published a different filename/function name, change it here.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <label className="text-sm">
              Scorecard seed function name
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                value={scorecardSeedFunctionName}
                onChange={(e) => setScorecardSeedFunctionName(e.target.value)}
                placeholder="seedSchoolsMaster_scorecard"
              />
              <div className="mt-1 text-xs text-slate-500">
                Must match the deployed backend function name exactly.
              </div>
            </label>

            <div className="flex flex-wrap items-center gap-3">
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

            <div className="flex gap-2">
              <Button disabled={working} onClick={runScorecardSeed}>
                {working ? "Working…" : "Run Scorecard seed"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">2) Membership seed (Legacy / diagnostic)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs <code>seedSchoolsMaster_membership</code>. If Pages is empty, the function returned early.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run (membership)
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

        <Card>
          <div className="text-lg font-semibold text-slate-900">3) Enrich via College Scorecard (Secondary)</div>
          <div className="text-sm text-slate-600 mt-1">
            Runs <code>enrichSchoolsMaster_scorecard</code>.
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
