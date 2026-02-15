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
  return new Promise((r) => setTimeout(r, ms));
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

function scoreSchoolRow(r) {
  // Higher score = "keep this one"
  // Prefer records with more "real" data
  let s = 0;
  if (safeStr(r?.unitid).trim()) s += 2;
  if (safeStr(r?.city).trim()) s += 2;
  if (safeStr(r?.state).trim()) s += 2;
  if (safeStr(r?.website_url).trim()) s += 1;
  if (safeStr(r?.logo_url).trim()) s += 2;
  if (safeStr(r?.division).trim()) s += 1;
  if (safeStr(r?.subdivision).trim()) s += 1;
  if (safeStr(r?.conference).trim()) s += 1;

  // Prefer active
  if (r?.active === true) s += 1;

  // Prefer most recently seen
  const t = Date.parse(r?.last_seen_at || "");
  if (Number.isFinite(t)) s += Math.min(3, Math.floor((t / 1000) % 3)); // tiny tie-breaker

  return s;
}

async function withRetries(fn, { tries = 6, baseDelayMs = 350, onRetry } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = safeStr(e?.message || e);
      const status = e?.raw?.status || e?.status;
      const isRate = status === 429 || lc(msg).includes("rate limit");
      const isNet = lc(msg).includes("network");
      const is500 = status >= 500 && status <= 599;

      if (i < tries - 1 && (isRate || isNet || is500)) {
        const delay = baseDelayMs * Math.pow(2, i);
        onRetry?.({ attempt: i + 1, tries, delayMs: delay, err: e });
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function listAll(Entity, { where = null } = {}) {
  if (!Entity?.list) return [];
  // Base44 list() in your project appears to accept either:
  // - list()
  // - list({ where })
  // - list(where)
  try {
    if (!where) return asArray(await Entity.list());
    return asArray(await Entity.list({ where }));
  } catch {
    try {
      if (!where) return asArray(await Entity.list({}));
      return asArray(await Entity.list(where));
    } catch {
      return [];
    }
  }
}

async function deleteById(Entity, id) {
  if (!Entity?.delete) throw new Error("Entity.delete not available");
  await Entity.delete(String(id));
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("overview"); // overview | dataops | dedupe | diagnostics

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // Purge controls
  const [purgeSelection, setPurgeSelection] = useState(() => ({
    School: false,
    SchoolSportSite: false,
    Sport: false,
    CampDemo: false,
    Camp: false,
    Event: false,
    Favorite: false,
    Registration: false,
    UserCamp: false,
    CampIntent: false,
    CampIntentHistory: false,
    CampDecisionScore: false,
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
  const [purgePerDeleteDelayMs, setPurgePerDeleteDelayMs] = useState(125);
  const [purgeBetweenEntitiesDelayMs, setPurgeBetweenEntitiesDelayMs] = useState(750);
  const [purgeDryRun, setPurgeDryRun] = useState(true);

  // Dedupe controls (School)
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeDeleteDelayMs, setDedupeDeleteDelayMs] = useState(150);
  const [dedupeMinDuplicateGroup, setDedupeMinDuplicateGroup] = useState(2);

  // Diagnostics
  const [diagExpanded, setDiagExpanded] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(ADMIN_MODE_KEY) === "true";
    setAdminEnabled(v);
  }, []);

  useEffect(() => {
    // auto-scroll
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
          tries: 6,
          baseDelayMs: 450,
          onRetry: ({ attempt, delayMs, err }) =>
            pushLog(`⚠️ listAll retry ${attempt} (${delayMs}ms): ${safeStr(err?.message || err)}`),
        });

        pushLog(`Found ${rows.length} rows in ${name}.`);
        if (purgeDryRun) {
          pushLog(`DryRun ON: would delete ${rows.length} rows from ${name}.`);
          await sleep(purgeBetweenEntitiesDelayMs);
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
              tries: 8,
              baseDelayMs: 400,
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

  async function runSchoolDedupe() {
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
      pushLog(
        `School dedupe start. DryRun=${dedupeDryRun} deleteDelayMs=${dedupeDeleteDelayMs} minGroup=${dedupeMinDuplicateGroup}`
      );

      const rows = await withRetries(() => listAll(School), {
        tries: 6,
        baseDelayMs: 450,
        onRetry: ({ attempt, delayMs, err }) =>
          pushLog(`⚠️ listAll retry ${attempt} (${delayMs}ms): ${safeStr(err?.message || err)}`),
      });

      pushLog(`Loaded School rows: ${rows.length}`);

      // Group by source_key first (best signal)
      const groups = new Map();
      for (const r of rows) {
        const k = safeStr(r?.source_key).trim();
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }

      const dupKeys = Array.from(groups.keys()).filter((k) => groups.get(k).length >= dedupeMinDuplicateGroup);
      pushLog(`Duplicate source_key groups: ${dupKeys.length}`);

      let keepCount = 0;
      let deleteCount = 0;
      let failCount = 0;

      for (const k of dupKeys) {
        const arr = groups.get(k) || [];
        // Sort by score desc, then deterministic by id
        const sorted = [...arr].sort((a, b) => {
          const sa = scoreSchoolRow(a);
          const sb = scoreSchoolRow(b);
          if (sb !== sa) return sb - sa;
          return safeStr(getId(a)).localeCompare(safeStr(getId(b)));
        });

        const keep = sorted[0];
        const keepId = getId(keep);
        keepCount += 1;

        const toDelete = sorted.slice(1).map((r) => ({ id: getId(r), score: scoreSchoolRow(r) }));
        pushLog(
          `Dedupe group source_key="${k}" keepId=${keepId} delete=${toDelete
            .map((x) => x.id)
            .filter(Boolean)
            .join(", ")}`
        );

        if (dedupeDryRun) continue;

        for (const d of toDelete) {
          if (!d?.id) continue;
          try {
            await withRetries(() => deleteById(School, d.id), {
              tries: 8,
              baseDelayMs: 400,
              onRetry: ({ attempt, delayMs, err }) =>
                pushLog(
                  `⚠️ delete retry ${attempt} (${delayMs}ms) School id=${d.id}: ${safeStr(
                    err?.message || err
                  )}`
                ),
            });
            deleteCount += 1;
          } catch (e) {
            failCount += 1;
            pushLog(`❌ Delete failed School id=${d.id}: ${safeStr(e?.message || e)}`);
          }
          if (dedupeDeleteDelayMs > 0) await sleep(dedupeDeleteDelayMs);
        }
      }

      pushLog(
        `✅ School dedupe finished. Groups=${dupKeys.length} Keep=${keepCount} Deleted=${deleteCount} Failed=${failCount}`
      );
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
          <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")}>
            Overview
          </Button>
          <Button variant={tab === "dataops" ? "default" : "outline"} onClick={() => setTab("dataops")}>
            Data Ops
          </Button>
          <Button variant={tab === "dedupe" ? "default" : "outline"} onClick={() => setTab("dedupe")}>
            Dedupe
          </Button>
          <Button variant={tab === "diagnostics" ? "default" : "outline"} onClick={() => setTab("diagnostics")}>
            Diagnostics
          </Button>
        </div>
      </Card>

      {tab === "overview" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Quick actions</div>
            <div className="text-sm text-gray-600 mt-1">
              Use these to jump into the specialized admin pages you already have.
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="outline" onClick={() => nav(ROUTES.AdminSeedSchoolsMaster)}>
                Seed Schools (Scorecard)
              </Button>
              <Button variant="outline" onClick={() => nav(ROUTES.AdminImport)}>
                Admin Import
              </Button>
              <Button variant="outline" onClick={() => nav(ROUTES.AdminFactoryReset)}>
                Factory Reset
              </Button>
              <Button variant="outline" onClick={() => nav(ROUTES.Discover)}>
                Discover
              </Button>
            </div>

            <div className="mt-4 text-sm text-gray-700">
              <div className="font-medium">What this control plane solves</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Mass purge across multiple entities with retries and throttling</li>
                <li>Dedupe School by source_key so Discover stops showing "Unknown school" artifacts</li>
                <li>Diagnostics to quickly confirm what entities exist on this host/env</li>
              </ul>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-lg font-semibold">Operational guardrails</div>
            <ul className="list-disc pl-5 mt-2 text-sm text-gray-700 space-y-1">
              <li>Destructive actions require Admin Mode + typing DELETE</li>
              <li>Retry logic backs off on rate limits and transient network failures</li>
              <li>Throttles writes to reduce Base44 429s</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "dataops" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Bulk purge (multi-entity)</div>
            <div className="text-sm text-gray-600 mt-1">
              This is your "Option A" style control: select entities and wipe them safely with retries + throttling.
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              {Object.keys(purgeSelection).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!purgeSelection[k]}
                    onChange={(e) => setPurgeSelection((p) => ({ ...p, [k]: e.target.checked }))}
                  />
                  <span className="font-mono">{k}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <label className="text-sm">
                <div className="text-gray-700">Dry run</div>
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={purgeDryRun ? "true" : "false"}
                  onChange={(e) => setPurgeDryRun(e.target.value === "true")}
                >
                  <option value="true">true (no deletes)</option>
                  <option value="false">false (delete)</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="text-gray-700">per delete delay (ms)</div>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  type="number"
                  min={0}
                  value={purgePerDeleteDelayMs}
                  onChange={(e) => setPurgePerDeleteDelayMs(Number(e.target.value || 0))}
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-700">between entities delay (ms)</div>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  type="number"
                  min={0}
                  value={purgeBetweenEntitiesDelayMs}
                  onChange={(e) => setPurgeBetweenEntitiesDelayMs(Number(e.target.value || 0))}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col md:flex-row gap-2 md:items-center">
              <label className="text-sm flex-1">
                <div className="text-gray-700">Type DELETE to confirm</div>
                <input
                  className="mt-1 w-full border rounded px-2 py-1 font-mono"
                  value={purgeConfirmText}
                  onChange={(e) => setPurgeConfirmText(e.target.value)}
                  placeholder="DELETE"
                />
              </label>

              <Button onClick={runPurge} disabled={busy}>
                {busy ? "Working..." : "Run purge"}
              </Button>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              Note: This uses entity.list() then entity.delete() per row. If Base44 returns 429, it backs off and retries.
            </div>
          </Card>
        </div>
      )}

      {tab === "dedupe" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">School dedupe</div>
            <div className="text-sm text-gray-600 mt-1">
              Removes duplicate School rows that share the same <span className="font-mono">source_key</span>.
              Keeps the "best" row (more complete data, logo, division, active).
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <label className="text-sm">
                <div className="text-gray-700">Dry run</div>
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={dedupeDryRun ? "true" : "false"}
                  onChange={(e) => setDedupeDryRun(e.target.value === "true")}
                >
                  <option value="true">true (no deletes)</option>
                  <option value="false">false (delete)</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="text-gray-700">delete delay (ms)</div>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  type="number"
                  min={0}
                  value={dedupeDeleteDelayMs}
                  onChange={(e) => setDedupeDeleteDelayMs(Number(e.target.value || 0))}
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-700">min group size</div>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  type="number"
                  min={2}
                  value={dedupeMinDuplicateGroup}
                  onChange={(e) => setDedupeMinDuplicateGroup(Number(e.target.value || 2))}
                />
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={runSchoolDedupe} disabled={busy}>
                {busy ? "Working..." : "Run School dedupe"}
              </Button>

              <Button variant="outline" onClick={() => nav(ROUTES.AdminSeedSchoolsMaster)}>
                Go to Seed Schools
              </Button>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              If you had earlier partial failures, the safe play is to re-run seeding on the earlier pages. Dedupe makes
              that painless.
            </div>
          </Card>
        </div>
      )}

      {tab === "diagnostics" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-lg font-semibold">Entity diagnostics</div>
            <div className="text-sm text-gray-600 mt-1">
              Confirms what Base44 entities exist in this environment, and what your entity exports resolve to.
            </div>

            <div className="mt-3 text-sm">
              <div>
                Export sanity:{" "}
                <span className="font-mono">
                  Camp={Entities?.Camp ? "ok" : "missing"} Sport={Entities?.Sport ? "ok" : "missing"} School=
                  {Entities?.School ? "ok" : "missing"}
                </span>
              </div>
              <div className="mt-1">
                base44.entities keys: <span className="font-mono">{entityKeys.length}</span>
              </div>
            </div>

            <div className="mt-3">
              <Button variant="outline" onClick={() => setDiagExpanded((v) => !v)}>
                {diagExpanded ? "Hide keys" : "Show keys"}
              </Button>
            </div>

            {diagExpanded && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {entityKeys.map((k) => (
                  <div key={k} className="border rounded px-2 py-1 font-mono bg-white">
                    {k}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Run log</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLog([])} disabled={busy}>
              Clear
            </Button>
            <Button variant="outline" onClick={() => pushLog("Manual note")} disabled={busy}>
              Add note
            </Button>
          </div>
        </div>

        <div
          ref={logRef}
          className="mt-3 h-64 overflow-auto border rounded bg-black text-green-200 font-mono text-xs p-2"
        >
          {log.length === 0 ? (
            <div className="text-green-300/70">No log yet.</div>
          ) : (
            log.map((l, idx) => <div key={idx}>{l}</div>)
          )}
        </div>
      </Card>
    </div>
  );
}