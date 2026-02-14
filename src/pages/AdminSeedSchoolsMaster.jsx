// src/pages/AdminSeedSchoolsMaster.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "../api/base44Client";
import { School } from "../api/entities";

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
function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}
function unwrapInvokeResponse(resp) {
  return resp?.data ?? resp ?? null;
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
    href,
    label: isPreviewHost ? "PREVIEW HOST" : "PROD HOST",
    dataEnv: hasProdDataEnv ? "prod data env" : "default data env",
  };
}

async function upsertSchoolBySourceKey(sourceKey, payload, dryRun) {
  const rows = await School.filter({ source_key: sourceKey });
  const existing = Array.isArray(rows) && rows.length ? rows[0] : null;

  if (dryRun) {
    return { mode: existing && existing.id ? "would_update" : "would_create", id: existing && existing.id ? String(existing.id) : null };
  }

  if (existing && existing.id) {
    await School.update(String(existing.id), payload);
    return { mode: "updated", id: String(existing.id) };
  }

  const created = await School.create(payload);
  return { mode: "created", id: created && created.id ? String(created.id) : null };
}

export default function AdminSeedSchoolsMaster() {
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  const env = useMemo(() => detectEnv(), []);
  const canRun = useMemo(() => !!base44?.functions?.invoke, []);

  const [dryRun, setDryRun] = useState(true);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(100);
  const [maxPages, setMaxPages] = useState(1);

  const push = (m) => setLog((x) => [...x, m]);

  const runScorecardFetchAndUpsert = async () => {
    if (!canRun) return;

    if (!School || !School.filter || !School.create || !School.update) {
      setLog([`❌ ERROR: School entity is not available in src/api/entities.js`]);
      return;
    }

    setWorking(true);
    setLog([]);
    try {
      push(`Host: ${env.host} (${env.label}, ${env.dataEnv})`);
      push(`URL: ${env.href}`);
      push(`Scorecard fetch start @ ${new Date().toISOString()}`);
      push(`DryRun=${dryRun} page=${page} perPage=${perPage} maxPages=${maxPages}`);

      const raw = await base44.functions.invoke("seedSchoolsMaster_scorecard", {
        page: Number(page || 0),
        perPage: Number(perPage || 100),
        maxPages: Number(maxPages || 1),
      });

      const resp = unwrapInvokeResponse(raw);

      if (resp && resp.error) {
        push(`❌ ERROR: ${resp.error}`);
        if (resp.debug) push(`Debug:\n${safeJson(resp.debug)}`);
        return;
      }

      const rows = resp && Array.isArray(resp.rows) ? resp.rows : [];
      push(`✅ Fetched rows: ${rows.length}`);
      if (resp && resp.debug && resp.debug.pageCalls) push(`PageCalls:\n${safeJson(resp.debug.pageCalls)}`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const sample = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const source_key = r && r.source_key ? String(r.source_key) : null;
        const unitid = r && r.unitid ? String(r.unitid) : null;
        const name = r && r.school_name ? String(r.school_name) : null;

        if (!source_key || !unitid || !name) {
          skipped += 1;
          continue;
        }

        const payload = {
          school_name: name,
          normalized_name: r.normalized_name || null,

          source_platform: "scorecard",
          source_key: source_key,
          unitid: unitid,
          active: true,

          city: r.city || null,
          state: r.state || null,
          website_url: r.website_url || null,

          division: null,
          subdivision: null,
          conference: null,
          school_type: "College/University",
          country: "US",

          logo_url: null,
          last_seen_at: new Date().toISOString(),
        };

        const res = await upsertSchoolBySourceKey(source_key, payload, dryRun);

        if (res.mode === "created") created += 1;
        else if (res.mode === "updated") updated += 1;

        if (sample.length < 10) sample.push({ mode: res.mode, source_key, unitid, name });
      }

      if (dryRun) {
        push(`✅ DryRun complete. Sample:\n${safeJson(sample)}`);
        push(`Flip DryRun off to write these rows.`);
      } else {
        push(`✅ Upsert complete. Created=${created} Updated=${updated} Skipped=${skipped}`);
        push(`Sample:\n${safeJson(sample)}`);
      }
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
          <div className="text-xl font-bold text-slate-900">Admin: Seed Schools Master (Scorecard)</div>
          <div className="text-sm text-slate-600 mt-1">
            Backend fetches Scorecard rows; this page upserts into School using the frontend SDK.
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Current: <span className="font-mono">{env.host}</span> ({env.label}, {env.dataEnv})
          </div>
        </Card>

        <Card>
          <div className="text-lg font-semibold text-slate-900">Run</div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run (no writes)
            </label>

            <label className="text-sm">
              Page{" "}
              <input
                className="ml-2 w-20 rounded border border-slate-300 px-2 py-1"
                value={page}
                onChange={(e) => setPage(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Per page{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={perPage}
                onChange={(e) => setPerPage(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Max pages{" "}
              <input
                className="ml-2 w-24 rounded border border-slate-300 px-2 py-1"
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <Button disabled={working} onClick={runScorecardFetchAndUpsert}>
              {working ? "Working…" : "Fetch + Upsert"}
            </Button>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Ramp plan: DryRun=true (page 0, maxPages 1) → DryRun=false same → then maxPages 5.
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
