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
  } catch {
    return String(x);
  }
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
    isPreviewHost,
    hasProdDataEnv,
    href,
    label: isPreviewHost ? "PREVIEW HOST" : "PROD HOST",
    dataEnv: hasProdDataEnv ? "prod data env" : "default data env",
  };
}

export default function AdminSeedSchoolsMaster() {
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  const [scorecardSeedFunctionName, setScorecardSeedFunctionName] = useState(
    "seedSchoolsMaster_scorecard"
  );
  const [scorecardSeedDryRun, setScorecardSeedDryRun] = useState(true);
  const [scorecardSeedPage, setScorecardSeedPage] = useState(0);
  const [scorecardSeedPerPage, setScorecardSeedPerPage] = useState(100);
  const [scorecardSeedMaxPages, setScorecardSeedMaxPages] = useState(1);

  const push = (m) => setLog((x) => [...x, m]);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);
  const env = useMemo(() => detectEnv(), []);

  const runScorecardSeed = async () => {
    if (!canRun) return;

    const fn = String(scorecardSeedFunctionName || "").trim();
    if (!fn) {
      setLog([`❌ ERROR: Function name is blank.`]);
      return;
    }

    setWorking(true);
    setLog([]);
    try {
      push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
      push(`URL: ${env.href}`);
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
      push(`✅ Done:\n${safeJson(resp)}`);
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
          <div className="text-xl font-bold text-slate-900">Seed School Master</div>
          <div className="text-sm text-slate-600 mt-1">
            This page will print host + URL so you can confirm whether you are calling preview functions or prod.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Scorecard seed (v2)</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <label className="text-sm">
              Function name
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                value={scorecardSeedFunctionName}
                onChange={(e) => setScorecardSeedFunctionName(e.target.value)}
                placeholder="seedSchoolsMaster_scorecard_v2"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scorecardSeedDryRun}
                  onChange={(e) => setScorecardSeedDryRun(e.target.checked)}
                />
                Dry run
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
                {working ? "Working…" : "Run"}
              </Button>
            </div>
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