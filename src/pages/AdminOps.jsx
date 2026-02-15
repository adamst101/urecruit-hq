// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

// ----------------------------
// Admin mode gate
// ----------------------------
const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";

// ----------------------------
// Routes (no createPageUrl dependency)
// ----------------------------
const ROUTES = {
  Workspace: "/Workspace",
  Discover: "/Discover",
  Profile: "/Profile",
  AdminSeedSchoolsMaster: "/AdminSeedSchoolsMaster",
  AdminFactoryReset: "/AdminFactoryReset",
  AdminImport: "/AdminImport",
  AdminOps: "/AdminOps",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function lc(x) {
  return safeStr(x).toLowerCase().trim();
}

function pickEntityFromSDK(name) {
  // Prefer explicit exports from src/api/entities.js (handles pluralization)
  const direct = Entities?.[name];
  if (direct) return direct;

  // Fallback direct Base44 client
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  // Common plurals
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

function getId(r) {
  if (!r) return null;
  if (typeof r.id === "string" || typeof r.id === "number") return String(r.id);
  if (typeof r._id === "string" || typeof r._id === "number") return String(r._id);
  if (typeof r.uuid === "string" || typeof r.uuid === "number") return String(r.uuid);
  return null;
}

function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normState(x) {
  const s = lc(x);
  if (!s) return "";
  return s.length === 2 ? s : s;
}

function schoolKey_nameState(r) {
  const n = normName(r?.school_name || r?.name || "");
  const st = normState(r?.state || "");
  if (!n || !st) return "";
  return `${n}::${st}`;
}

function schoolKey_sourceKey(r) {
  return safeStr(r?.source_key).trim();
}

function schoolKey_unitid(r) {
  return safeStr(r?.unitid).trim();
}

function scoreSchoolRow(r) {
  // Higher score = "keep this one"
  let s = 0;

  // Strong identifiers
  if (safeStr(r?.unitid).trim()) s += 4;
  if (safeStr(r?.source_key).trim()) s += 2;

  // Completeness
  if (safeStr(r?.school_name).trim() || safeStr(r?.name).trim()) s += 2;
  if (safeStr(r?.city).trim()) s += 2;
  if (safeStr(r?.state).trim()) s += 2;
  if (safeStr(r?.website_url).trim()) s += 1;
  if (safeStr(r?.logo_url).trim()) s += 2;

  // Enrichment
  if (safeStr(r?.division).trim()) s += 1;
  if (safeStr(r?.subdivision).trim()) s += 1;
  if (safeStr(r?.conference).trim()) s += 1;

  // Prefer scorecard canonical
  if (lc(r?.source_platform) === "scorecard") s += 2;

  // Prefer active
  if (r?.active === true) s += 1;

  // Prefer most recently seen (light tie-break)
  const t = Date.parse(r?.last_seen_at || "");
  if (Number.isFinite(t)) s += 1;

  return s;
}

async function withRetries(fn, { tries = 7, baseDelayMs = 400, onRetry } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = safeStr(e?.message || e);
      const status = e?.raw?.status || e?.status;
      const isRate = status === 429 || lc(msg).includes("rate limit") || lc(msg).includes("429");
      const isNet = lc(msg).includes("network") || lc(msg).includes("timeout");
      const is500 = status >= 500 && status <= 599;

      if (i < tries - 1 && (isRate || isNet || is500)) {
        const delay = Math.min(25_000, Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * 250));
        onRetry?.({ attempt: i + 1, tries, delayMs: delay, err: e });
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function listAll(Entity) {
  if (!Entity?.list) return [];
  // Base44 list() in your project appears to accept either:
  // - list()
  // - list({})
  try {
    return asArray(await Entity.list());
  } catch {
    try {
      return asArray(await Entity.list({}));
    } catch {
      return [];
    }
  }
}

async function deleteById(Entity, id) {
  if (!Entity?.delete) throw new Error("Entity.delete not available");
  await Entity.delete(String(id));
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = safeStr(keyFn(r)).trim();
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("overview"); // overview | dataops | schools | diagnostics

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // Purge controls
  const [purgeSelection, setPurgeSelection] = useState(() => ({
    // Canonical
    School: false,
    Sport: false,

    // Derived / ingest artifacts (recommended purge set)
    SchoolSportSite: true,
    CampDemo: true,
    Camp: true,
    Event: true,
    Registration: true,
    Favorite: true,
    UserCamp: true,
    CampIntent: true,
    CampIntentHistory: true,
    CampDecisionScore: true,

    // Optional / may not exist
    Scenario: false,
    ScenarioCamp: false,
    TargetSchool: false,
    TargetSchoolHistory: false,
    AthleteProfile: false,
    Position: false,
    BudgetConstraint: false,
    CalendarConstraint: false,
    TravelConstraint: false,
    Entitlement: false,
  }));

  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purgePerDeleteDelayMs, setPurgePerDeleteDelayMs] = useState(140);
  const [purgeBetweenEntitiesDelayMs, setPurgeBetweenEntitiesDelayMs] = useState(650);
  const [purgeDryRun, setPurgeDryRun] = useState(true);

  // Schools: delete non-scorecard rows
  const [deleteNonScorecardDryRun, setDeleteNonScorecardDryRun] = useState(true);
  const [deleteNonScorecardDelayMs, setDeleteNonScorecardDelayMs] = useState(160);

  // Schools: dedupe controls
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeDeleteDelayMs, setDedupeDeleteDelayMs] = useState(150);
  const [dedupeMode, setDedupeMode] = useState("unitid"); // unitid | source_key | name_state
  const [dedupeMinGroupSize, setDedupeMinGroupSize] = useState(2);

  useEffect(() => {
    const v = localStorage.getItem(ADMIN_MODE_KEY) === "true";
    setAdminEnabled(v);
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function pushLog(line) {
    setLog((prev) => [...prev, `[${new Date().toISOString()}] ${line}`]);
  }

  const hostInfo = useMemo(() => {
    const host = safeStr(window?.location?.host);
    const isPreview = host.includes("preview");
    return { host, isPreview };
  }, []);

  const entityKeys = useMemo(() => {
    const keys = Object.keys(base44?.entities || {});
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
  }, []);

  const selectedEntities = useMemo(() => {
    return Object.entries(purgeSelection)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }, [purgeSelection]);

  function toggleAdminMode() {
    const next = !adminEnabled;
    localStorage.setItem(ADMIN_MODE_KEY, next ? "true" : "false");
    setAdminEnabled(next);
    pushLog(`Admin Mode ${next ? "ENABLED" : "DISABLED"}`);
  }

  function applyPurgePresetDerived() {
    // Keep School + Sport OFF by default.
    const next = { ...purgeSelection };
    const derived = [
      "SchoolSportSite",
      "CampDemo",
      "Camp",
      "Event",
      "Registration",
      "Favorite",
      "UserCamp",
      "CampIntent",
      "CampIntentHistory",
      "CampDecisionScore",
    ];
    for (const k of Object.keys(next)) next[k] = false;
    for (const k of derived) if (k in next) next[k] = true;
    // Canonical OFF
    if ("School" in next) next.School = false;
    if ("Sport" in next) next.Sport = false;

    setPurgeSelection(next);
    pushLog(`Preset applied: Purge derived tables (${derived.join(", ")}). School/Sport left untouched.`);
  }

  async function runPurge() {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return;
    }
    if (!selectedEntities.length) {
      pushLog("❌ Nothing selected to purge.");
      return;
    }
    if (purgeConfirmText.trim() !== "DELETE") {
      pushLog('❌ Confirmation required. Type "DELETE" to run purge.');
      return;
    }

    setBusy(true);
    try {
      pushLog(
        `Purge start. DryRun=${purgeDryRun} Entities=${selectedEntities.join(
          ", "
        )} perDeleteDelayMs=${purgePerDeleteDelayMs}`
      );

      for (const name of selectedEntities) {
        const Entity = pickEntityFromSDK(name);
        if (!Entity?.list || !Entity?.delete) {
          pushLog(`⚠️ Skipping ${name}: Entity.list or Entity.delete not available.`);
          continue;
        }

        pushLog(`--- Purge ${name} ---`);
        const rows = await withRetries(() => listAll(Entity), {
          tries: 7,
          baseDelayMs: 500,
          onRetry: ({ attempt, delayMs, err }) =>
            pushLog(`⚠️ listAll retry ${attempt} (${delayMs}ms): ${safeStr(err?.message || err)}`),
        });

        pushLog(`Found ${rows.length} rows in ${name}.`);
        if (purgeDryRun) {
          pushLog(`DryRun ON: would delete ${rows.length} rows from ${name}.`);
          if (purgeBetweenEntitiesDelayMs > 0) await sleep(purgeBetweenEntitiesDelayMs);
          continue;
        }

        let deleted = 0;
        let failed = 0;

        for (let i = 0; i < rows.length; i++) {
          const id = getId(rows[i]);
          if (!id) {
            failed += 1;
            continue;
          }

          try {
            await withRetries(() => deleteById(Entity, id), {
              tries: 9,
              baseDelayMs: 450,
              onRetry: ({ attempt, delayMs, err }) =>
                pushLog(
                  `⚠️ delete retry ${attempt} (${delayMs}ms) ${name} id=${id}: ${safeStr(
                    err?.message || err
                  )}`
                ),
            });
            deleted += 1;
          } catch (e) {
            failed += 1;
            pushLog(`❌ Delete failed ${name} id=${id}: ${safeStr(e?.message || e)}`);
          }

          if (purgePerDeleteDelayMs > 0) await sleep(purgePerDeleteDelayMs);
        }

        pushLog(`✅ Purge ${name} complete. Deleted=${deleted} Failed=${failed}`);
        if (purgeBetweenEntitiesDelayMs > 0) await sleep(purgeBetweenEntitiesDelayMs);
      }

      pushLog("🏁 Purge finished.");
    } finally {
      setBusy(false);
    }
  }

  async function runDeleteNonScorecardSchools() {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return;
    }

    const School = pickEntityFromSDK("School");
    if (!School?.list || !School?.delete) {
      pushLog("❌ School entity is missing list/delete.");
      return;
    }

    setBusy(true);
    try {
      pushLog(`Delete non-scorecard Schools start. DryRun=${deleteNonScorecardDryRun} delayMs=${deleteNonScorecardDelayMs}`);

      const rows = await withRetries(() => listAll(School), {
        tries: 7,
        baseDelayMs: 500,
        onRetry: ({ attempt, delayMs, err }) =>
          pushLog(`⚠️ listAll retry ${attempt} (${delayMs}ms): ${safeStr(err?.message || err)}`),
      });

      const nonScorecard = rows.filter((r) => {
        const sp = lc(r?.source_platform);
        // treat blank as non-scorecard (we only want canonical scorecard rows)
        return sp !== "scorecard";
      });

      pushLog(`Loaded School rows: ${rows.length}. Non-scorecard rows: ${nonScorecard.length}`);

      if (deleteNonScorecardDryRun) {
        pushLog(`DryRun ON: would delete ${nonScorecard.length} non-scorecard School rows.`);
        return;
      }

      let deleted = 0;
      let failed = 0;

      for (const r of nonScorecard) {
        const id = getId(r);
        if (!id) {
          failed += 1;
          continue;
        }
        try {
          await withRetries(() => deleteById(School, id), {
            tries: 9,
            baseDelayMs: 450,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`⚠️ delete retry ${attempt} (${delayMs}ms) School id=${id}: ${safeStr(err?.message || err)}`),
          });
          deleted += 1;
        } catch (e) {
          failed += 1;
          pushLog(`❌ Delete failed School id=${id}: ${safeStr(e?.message || e)}`);
        }
        if (deleteNonScorecardDelayMs > 0) await sleep(deleteNonScorecardDelayMs);
      }

      pushLog(`✅ Delete non-scorecard complete. Deleted=${deleted} Failed=${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function getDedupeKeyFn(mode) {
    if (mode === "unitid") return schoolKey_unitid;
    if (mode === "source_key") return schoolKey_sourceKey;
    return schoolKey_nameState;
  }

  async function runSchoolDedupePass(mode) {
    const School = pickEntityFromSDK("School");
    if (!School?.list || !School?.delete) {
      pushLog("❌ School entity is missing list/delete.");
      return;
    }

    pushLog(`School dedupe pass start. Mode=${mode} DryRun=${dedupeDryRun}`);
    const rows = await withRetries(() => listAll(School), {
      tries: 7,
      baseDelayMs: 500,
      onRetry: ({ attempt, delayMs, err }) =>
        pushLog(`⚠️ listAll retry ${attempt} (${delayMs}ms): ${safeStr(err?.message || err)}`),
    });

    // Only dedupe scorecard rows in these passes (non-scorecard should already be deleted)
    const scorecardRows = rows.filter((r) => lc(r?.source_platform) === "scorecard");

    const keyFn = getDedupeKeyFn(mode);
    const grouped = groupBy(scorecardRows, keyFn);

    const dupKeys = Array.from(grouped.keys()).filter((k) => (grouped.get(k) || []).length >= dedupeMinGroupSize);

    pushLog(`Loaded School rows: ${rows.length} (scorecard=${scorecardRows.length}). Duplicate groups (mode=${mode}): ${dupKeys.length}`);

    let keepCount = 0;
    let deleteCount = 0;
    let failCount = 0;

    for (const k of dupKeys) {
      const arr = grouped.get(k) || [];
      const sorted = [...arr].sort((a, b) => {
        const sa = scoreSchoolRow(a);
        const sb = scoreSchoolRow(b);
        if (sb !== sa) return sb - sa;
        return safeStr(getId(a)).localeCompare(safeStr(getId(b)));
      });

      const keep = sorted[0];
      const keepId = getId(keep);
      keepCount += 1;

      const toDelete = sorted.slice(1).map((r) => ({ id: getId(r), score: scoreSchoolRow(r) })).filter((x) => !!x.id);

      pushLog(
        `Group key="${k}" keepId=${keepId} delete=${toDelete.map((x) => x.id).join(", ")}`
      );

      if (dedupeDryRun) continue;

      for (const d of toDelete) {
        try {
          await withRetries(() => deleteById(School, d.id), {
            tries: 9,
            baseDelayMs: 450,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`⚠️ delete retry ${attempt} (${delayMs}ms) School id=${d.id}: ${safeStr(err?.message || err)}`),
          });
          deleteCount += 1;
        } catch (e) {
          failCount += 1;
          pushLog(`❌ Delete failed School id=${d.id}: ${safeStr(e?.message || e)}`);
        }
        if (dedupeDeleteDelayMs > 0) await sleep(dedupeDeleteDelayMs);
      }
    }

    pushLog(`✅ Dedupe pass finished. Mode=${mode} Groups=${dupKeys.length} Kept=${keepCount} Deleted=${deleteCount} Failed=${failCount}`);
  }

  async function runSchoolDedupeSingle() {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return;
    }
    setBusy(true);
    try {
      await runSchoolDedupePass(dedupeMode);
    } finally {
      setBusy(false);
    }
  }

  async function runSchoolDedupeAllPasses() {
    if (!adminEnabled) {
      pushLog("❌ Blocked: Admin Mode is OFF.");
      return;
    }
    setBusy(true);
    try {
      // Strong → weak
      await runSchoolDedupePass("unitid");
      await sleep(500);
      await runSchoolDedupePass("source_key");
      await sleep(500);
      await runSchoolDedupePass("name_state");
      pushLog("🏁 All dedupe passes complete (unitid → source_key → name_state).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin Ops</h1>
          <div className="text-sm text-gray-600">
            Host: <span className="font-mono">{hostInfo.host}</span>{" "}
            <span className="ml-2 px-2 py-0.5 rounded border text-xs">
              {hostInfo.isPreview ? "PREVIEW" : "PROD"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)}>
            Profile
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} className={adminEnabled ? "" : "opacity-80"}>
            Admin Mode: {adminEnabled ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {!adminEnabled && (
        <Card className="p-4 border border-amber-300 bg-amber-50">
          <div className="font-medium">Admin Mode is OFF</div>
          <div className="text-sm text-gray-700 mt-1">
            Turn it on to enable destructive actions (purge/dedupe). This is stored locally in your browser.
          </div>
        </Card>
      )}

      <Card className="p-2">
        <div className="flex flex-wrap gap-2">
          <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} disabled={busy}>
            Overview
          </Button>
          <Button variant={tab === "dataops" ? "default" : "outline"} onClick={() => setTab("dataops")} disabled={busy}>
            Purge
          </Button>
          <Button variant={tab === "schools" ? "default" : "outline"} onClick={() => setTab("schools")} disabled={busy}>
            Schools
          </Button>
          <Button
            variant={tab === "diagnostics" ? "default" : "outline"}
            onClick={() => setTab("diagnostics")}
            disabled={busy}
          >
            Diagnostics
          </Button>
        </div>
      </Card>

      {tab === "overview" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Option A workflow (recommended)</div>
            <ol className="list-decimal pl-5 mt-2 text-sm text-gray-700 space-y-1">
              <li>Purge derived tables (Camp/CampDemo/Event/SchoolSportSite + ingest artifacts)</li>
              <li>Delete non-scorecard Schools</li>
              <li>Dedupe Scorecard Schools (unitid → source_key → name_state)</li>
              <li>Run Scorecard seed again; School count should not increase</li>
            </ol>

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

          <Card className="p-4">
            <div className="text-lg font-semibold">Guardrails</div>
            <ul className="list-disc pl-5 mt-2 text-sm text-gray-700 space-y-1">
              <li>Admin Mode + typing DELETE required for purge</li>
              <li>Dry-run defaults ON for destructive steps</li>
              <li>Throttling + retry/backoff on 429/5xx</li>
              <li>Dedupe targets Scorecard rows only (after non-scorecard deletion)</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "dataops" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Purge derived tables (recommended)</div>
            <div className="text-sm text-gray-600 mt-1">
              Purges Camp/CampDemo/Event/SchoolSportSite plus ingest artifacts. Leaves School and Sport intact.
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="outline" onClick={applyPurgePresetDerived} disabled={busy}>
                Preset: Derived tables
              </Button>
              <Button
                variant={purgeDryRun ? "default" : "outline"}
                onClick={() => setPurgeDryRun(true)}
                disabled={busy}
              >
                Dry run
              </Button>
              <Button
                variant={!purgeDryRun ? "default" : "outline"}
                onClick={() => setPurgeDryRun(false)}
                disabled={busy}
              >
                Write
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              {Object.keys(purgeSelection).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!purgeSelection[k]}
                    onChange={(e) => setPurgeSelection((p) => ({ ...p, [k]: e.target.checked }))}
                    disabled={busy}
                  />
                  <span className="font-mono">{k}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Per delete delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={purgePerDeleteDelayMs}
                  onChange={(e) => setPurgePerDeleteDelayMs(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <label className="space-y-1">
                <div className="text-gray-600">Between entities delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={purgeBetweenEntitiesDelayMs}
                  onChange={(e) => setPurgeBetweenEntitiesDelayMs(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <label className="space-y-1">
                <div className="text-gray-600">Confirm</div>
                <input
                  className="w-full border rounded px-2 py-1 font-mono"
                  placeholder='Type "DELETE"'
                  value={purgeConfirmText}
                  onChange={(e) => setPurgeConfirmText(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>

            <div className="mt-4">
              <Button onClick={runPurge} disabled={busy || !adminEnabled}>
                Run purge
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "schools" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Step 1: Delete non-scorecard School rows</div>
            <div className="text-sm text-gray-600 mt-1">
              Deletes all School rows where <span className="font-mono">source_platform</span> is not <span className="font-mono">"scorecard"</span> (including blank).
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                variant={deleteNonScorecardDryRun ? "default" : "outline"}
                onClick={() => setDeleteNonScorecardDryRun(true)}
                disabled={busy}
              >
                Dry run
              </Button>
              <Button
                variant={!deleteNonScorecardDryRun ? "default" : "outline"}
                onClick={() => setDeleteNonScorecardDryRun(false)}
                disabled={busy}
              >
                Write
              </Button>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Delay (ms)</span>
                <input
                  className="border rounded px-2 py-1 w-24"
                  type="number"
                  value={deleteNonScorecardDelayMs}
                  onChange={(e) => setDeleteNonScorecardDelayMs(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <Button onClick={runDeleteNonScorecardSchools} disabled={busy || !adminEnabled}>
                Run delete non-scorecard
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-lg font-semibold">Step 2: Dedupe Scorecard Schools</div>
            <div className="text-sm text-gray-600 mt-1">
              Recommended: run all passes (unitid → source_key → name_state). This is safe after purging derived tables.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Mode</div>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={dedupeMode}
                  onChange={(e) => setDedupeMode(e.target.value)}
                  disabled={busy}
                >
                  <option value="unitid">unitid (best)</option>
                  <option value="source_key">source_key</option>
                  <option value="name_state">name + state (fallback)</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-gray-600">Min group size</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={dedupeMinGroupSize}
                  onChange={(e) => setDedupeMinGroupSize(Number(e.target.value || 2))}
                  disabled={busy}
                />
              </label>

              <label className="space-y-1">
                <div className="text-gray-600">Delete delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={dedupeDeleteDelayMs}
                  onChange={(e) => setDedupeDeleteDelayMs(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>

              <div className="space-y-1">
                <div className="text-gray-600">Write gate</div>
                <div className="flex gap-2">
                  <Button variant={dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(true)} disabled={busy}>
                    Dry run
                  </Button>
                  <Button variant={!dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(false)} disabled={busy}>
                    Write
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={runSchoolDedupeSingle} disabled={busy || !adminEnabled}>
                Run dedupe (selected mode)
              </Button>
              <Button variant="outline" onClick={runSchoolDedupeAllPasses} disabled={busy || !adminEnabled}>
                Run dedupe (all passes)
              </Button>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              Expectation: after unitid pass, most true duplicates should be gone. Re-running seed should not increase School count.
            </div>
          </Card>
        </div>
      )}

      {tab === "diagnostics" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Entities available</div>
            <div className="text-sm text-gray-600 mt-1">
              Useful to confirm what Base44 exposes in this environment.
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {entityKeys.map((k) => (
                <div key={k} className="border rounded px-2 py-1 font-mono">
                  {k}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Run log</div>
          <Button variant="outline" onClick={() => setLog([])} disabled={busy}>
            Clear
          </Button>
        </div>
        <div
          ref={logRef}
          className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto"
          style={{ maxHeight: 420 }}
        >
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}

