// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";

const ROUTES = {
  Workspace: "/Workspace",
  Discover: "/Discover",
  Profile: "/Profile",
  AdminSeedSchoolsMaster: "/AdminSeedSchoolsMaster",
  AdminImport: "/AdminImport",
  AdminFactoryReset: "/AdminFactoryReset",
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
function schoolKey_unitid(r) {
  return safeStr(r?.unitid).trim();
}
function schoolKey_sourceKey(r) {
  return safeStr(r?.source_key).trim();
}
function schoolKey_nameState(r) {
  const n = normName(r?.school_name || r?.name || "");
  const st = normState(r?.state || "");
  if (!n || !st) return "";
  return `${n}::${st}`;
}
function scoreSchoolRow(r) {
  let s = 0;
  if (safeStr(r?.unitid).trim()) s += 4;
  if (safeStr(r?.source_key).trim()) s += 2;
  if (safeStr(r?.school_name).trim() || safeStr(r?.name).trim()) s += 2;
  if (safeStr(r?.city).trim()) s += 2;
  if (safeStr(r?.state).trim()) s += 2;
  if (safeStr(r?.website_url).trim()) s += 1;
  if (safeStr(r?.logo_url).trim()) s += 2;
  if (safeStr(r?.division).trim()) s += 1;
  if (safeStr(r?.subdivision).trim()) s += 1;
  if (safeStr(r?.conference).trim()) s += 1;
  if (lc(r?.source_platform) === "scorecard") s += 2;
  if (r?.active === true) s += 1;
  const t = Date.parse(r?.last_seen_at || "");
  if (Number.isFinite(t)) s += 1;
  return s;
}

async function withRetries(fn, { tries = 8, baseDelayMs = 400, onRetry } = {}) {
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

function pickEntityFromSDK(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

/**
 * Base44 list() is NOT guaranteed to accept arbitrary pagination args.
 * In this project, passing unknown keys can cause list() to behave like a filter and return [].
 *
 * So we PROBE which paging mode works, then use only supported args.
 *
 * Modes we try:
 *  - "noargs": list()
 *  - "page_size": list({ page, page_size })
 *  - "per_page": list({ page, per_page })
 *  - "pageSize": list({ page, pageSize })
 *  - "limit_offset": list({ limit, offset })
 *
 * We also support filtered reads via Entity.filter(criteria), which is known-good in this app.
 */
async function detectListMode(Entity, samplePageSize = 50) {
  const candidates = [
    { mode: "noargs", call: () => Entity.list() },
    { mode: "page_size", call: () => Entity.list({ page: 1, page_size: samplePageSize }) },
    { mode: "per_page", call: () => Entity.list({ page: 1, per_page: samplePageSize }) },
    { mode: "pageSize", call: () => Entity.list({ page: 1, pageSize: samplePageSize }) },
    { mode: "limit_offset", call: () => Entity.list({ limit: samplePageSize, offset: 0 }) },
    { mode: "emptyobj", call: () => Entity.list({}) },
  ];

  for (const c of candidates) {
    try {
      const res = await c.call();
      const rows = asArray(res);
      // Accept ONLY if it returns any rows OR if we're confident the table may be empty.
      // We can't know empty vs broken signature, so we also check for "res not array" issues.
      if (Array.isArray(res)) {
        // If it returns rows, it's a good mode.
        if (rows.length > 0) return { mode: c.mode, ok: true };
        // If it returns 0 rows, we keep probing because this could be signature-broken.
        continue;
      }
    } catch {
      // ignore and try next
    }
  }

  // If all probes failed to produce rows, fall back to noargs (it’s the safest).
  return { mode: "noargs", ok: false };
}

async function listPage(Entity, listMode, { page, pageSize }) {
  if (listMode === "noargs") {
    // noargs cannot page; caller handles single-shot behavior
    return asArray(await Entity.list());
  }
  if (listMode === "page_size") return asArray(await Entity.list({ page, page_size: pageSize }));
  if (listMode === "per_page") return asArray(await Entity.list({ page, per_page: pageSize }));
  if (listMode === "pageSize") return asArray(await Entity.list({ page, pageSize }));
  if (listMode === "limit_offset") return asArray(await Entity.list({ limit: pageSize, offset: (page - 1) * pageSize }));
  if (listMode === "emptyobj") return asArray(await Entity.list({}));
  return asArray(await Entity.list());
}

/**
 * listAllPaged:
 * - If whereObj is provided and non-empty, we use Entity.filter(whereObj) (known-good in your app).
 * - If no filter, we use list() paging mode detected by detectListMode.
 *
 * Note: If Base44 only supports list() with no args, we'll load once and stop.
 */
async function listAllPaged(Entity, whereObj, { pageSize = 2000, maxPages = 200, onPage, onMode } = {}) {
  if (!Entity?.list) return [];

  const where = whereObj || {};
  const hasWhere = where && Object.keys(where).length > 0;

  // Filter path (use Base44 filter API, NOT list({where:...}) which is not supported here)
  if (hasWhere && typeof Entity.filter === "function") {
    const rows = await Entity.filter(where);
    const arr = asArray(rows);
    onMode?.({ mode: "filter", ok: true });
    onPage?.({ page: 1, got: arr.length, newCount: arr.length, total: arr.length });
    return arr;
  }

  // List path (no filter)
  const { mode, ok } = await detectListMode(Entity, Math.min(100, pageSize));
  onMode?.({ mode, ok });

  const seen = new Set();
  const out = [];

  // If mode is noargs, we can only do one call.
  if (mode === "noargs" || mode === "emptyobj") {
    const rows = await listPage(Entity, mode, { page: 1, pageSize });
    let newCount = 0;
    for (const r of rows) {
      const id = getId(r);
      if (id && seen.has(id)) continue;
      if (id) {
        seen.add(id);
        newCount += 1;
      }
      out.push(r);
    }
    onPage?.({ page: 1, got: rows.length, newCount, total: out.length });
    return out;
  }

  for (let p = 1; p <= maxPages; p++) {
    const rows = await listPage(Entity, mode, { page: p, pageSize });
    if (!rows.length) {
      onPage?.({ page: p, got: 0, newCount: 0, total: out.length });
      break;
    }

    let newCount = 0;
    for (const r of rows) {
      const id = getId(r);
      if (id && seen.has(id)) continue;
      if (id) {
        seen.add(id);
        newCount += 1;
      }
      out.push(r);
    }

    onPage?.({ page: p, got: rows.length, newCount, total: out.length });

    // Stop if we get a short page or no new IDs (prevents infinite loops on repeating pages)
    if (rows.length < pageSize || newCount === 0) break;

    await sleep(120);
  }

  return out;
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
  const [tab, setTab] = useState("overview");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  const [purgeSelection, setPurgeSelection] = useState(() => ({
    School: false,
    Sport: false,

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
  const [purgePerDeleteDelayMs, setPurgePerDeleteDelayMs] = useState(220);
  const [purgeBetweenEntitiesDelayMs, setPurgeBetweenEntitiesDelayMs] = useState(1200);
  const [purgeDryRun, setPurgeDryRun] = useState(true);

  const [deleteNonScorecardDryRun, setDeleteNonScorecardDryRun] = useState(true);
  const [deleteNonScorecardDelayMs, setDeleteNonScorecardDelayMs] = useState(220);

  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeDeleteDelayMs, setDedupeDeleteDelayMs] = useState(220);
  const [dedupeMode, setDedupeMode] = useState("unitid");

  const [pageSize, setPageSize] = useState(2000);

  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function pushLog(line) {
    setLog((prev) => [...prev, `[${new Date().toISOString()}] ${line}`]);
  }

  const selectedEntities = useMemo(() => {
    return Object.entries(purgeSelection)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }, [purgeSelection]);

  const entityKeys = useMemo(() => {
    const keys = Object.keys(base44?.entities || {});
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
  }, []);

  function toggleAdminMode() {
    const next = !adminEnabled;
    localStorage.setItem(ADMIN_MODE_KEY, next ? "true" : "false");
    setAdminEnabled(next);
    pushLog(`Admin Mode ${next ? "ENABLED" : "DISABLED"}`);
  }

  function applyPurgePresetDerived() {
    const next = { ...purgeSelection };
    for (const k of Object.keys(next)) next[k] = false;

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
    for (const k of derived) if (k in next) next[k] = true;

    if ("School" in next) next.School = false;
    if ("Sport" in next) next.Sport = false;

    setPurgeSelection(next);
    pushLog(`Preset applied: Derived tables selected. School/Sport left untouched.`);
  }

  async function runPurge() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    if (!selectedEntities.length) return pushLog("❌ Nothing selected to purge.");
    if (purgeConfirmText.trim() !== "DELETE") return pushLog('❌ Type "DELETE" to confirm purge.');

    setBusy(true);
    try {
      pushLog(`Purge start. DryRun=${purgeDryRun} Entities=${selectedEntities.join(", ")} pageSize=${pageSize}`);

      for (const name of selectedEntities) {
        const Entity = pickEntityFromSDK(name);
        if (!Entity?.list || !Entity?.delete) {
          pushLog(`⚠️ Skipping ${name}: list/delete not available.`);
          continue;
        }

        pushLog(`--- Purge ${name} ---`);

        let modeLogged = false;
        const rows = await withRetries(
          () =>
            listAllPaged(Entity, {}, {
              pageSize,
              maxPages: 300,
              onMode: ({ mode, ok }) => {
                if (modeLogged) return;
                modeLogged = true;
                pushLog(`List mode for ${name}: ${mode}${ok ? "" : " (probe had no rows)"} `);
              },
              onPage: ({ page, got, newCount, total }) =>
                pushLog(`Loaded ${name}: page=${page} got=${got} new=${newCount} total=${total}`),
            }),
          {
            tries: 7,
            baseDelayMs: 600,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`⚠️ list retry ${attempt} (${delayMs}ms) ${name}: ${safeStr(err?.message || err)}`),
          }
        );

        pushLog(`Found ${rows.length} rows in ${name}.`);
        if (purgeDryRun) {
          pushLog(`DryRun ON: would delete ${rows.length} rows from ${name}.`);
          await sleep(purgeBetweenEntitiesDelayMs);
          continue;
        }

        let deleted = 0;
        let failed = 0;

        for (const r of rows) {
          const id = getId(r);
          if (!id) {
            failed += 1;
            continue;
          }
          try {
            await withRetries(() => deleteById(Entity, id), {
              tries: 10,
              baseDelayMs: 500,
              onRetry: ({ attempt, delayMs, err }) =>
                pushLog(`⚠️ delete retry ${attempt} (${delayMs}ms) ${name} id=${id}: ${safeStr(err?.message || err)}`),
            });
            deleted += 1;
          } catch (e) {
            failed += 1;
            pushLog(`❌ Delete failed ${name} id=${id}: ${safeStr(e?.message || e)}`);
          }
          await sleep(purgePerDeleteDelayMs);
        }

        pushLog(`✅ Purge ${name} complete. Deleted=${deleted} Failed=${failed}`);
        await sleep(purgeBetweenEntitiesDelayMs);
      }

      pushLog("🏁 Purge finished.");
    } finally {
      setBusy(false);
    }
  }

  async function runDeleteNonScorecardSchools() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");

    const School = pickEntityFromSDK("School");
    if (!School?.list || !School?.delete) return pushLog("❌ School missing list/delete.");

    setBusy(true);
    try {
      pushLog(`Delete non-scorecard Schools start. DryRun=${deleteNonScorecardDryRun} pageSize=${pageSize}`);

      let modeLogged = false;
      const rows = await withRetries(
        () =>
          listAllPaged(School, {}, {
            pageSize,
            maxPages: 300,
            onMode: ({ mode, ok }) => {
              if (modeLogged) return;
              modeLogged = true;
              pushLog(`List mode for School: ${mode}${ok ? "" : " (probe had no rows)"}`);
            },
            onPage: ({ page, got, newCount, total }) =>
              pushLog(`Loaded School: page=${page} got=${got} new=${newCount} total=${total}`),
          }),
        {
          tries: 7,
          baseDelayMs: 600,
          onRetry: ({ attempt, delayMs, err }) =>
            pushLog(`⚠️ list retry ${attempt} (${delayMs}ms) School: ${safeStr(err?.message || err)}`),
        }
      );

      const nonScorecard = rows.filter((r) => lc(r?.source_platform) !== "scorecard");
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
            tries: 10,
            baseDelayMs: 500,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`⚠️ delete retry ${attempt} (${delayMs}ms) School id=${id}: ${safeStr(err?.message || err)}`),
          });
          deleted += 1;
        } catch (e) {
          failed += 1;
          pushLog(`❌ Delete failed School id=${id}: ${safeStr(e?.message || e)}`);
        }
        await sleep(deleteNonScorecardDelayMs);
      }

      pushLog(`✅ Delete non-scorecard complete. Deleted=${deleted} Failed=${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function getKeyFn(mode) {
    if (mode === "unitid") return schoolKey_unitid;
    if (mode === "source_key") return schoolKey_sourceKey;
    return schoolKey_nameState;
  }

  async function runSchoolDedupePass(mode) {
    const School = pickEntityFromSDK("School");
    if (!School?.list || !School?.delete) return pushLog("❌ School missing list/delete.");

    pushLog(`School dedupe pass start. Mode=${mode} DryRun=${dedupeDryRun} pageSize=${pageSize}`);

    let modeLogged = false;
    const rows = await withRetries(
      () =>
        listAllPaged(School, {}, {
          pageSize,
          maxPages: 300,
          onMode: ({ mode: m, ok }) => {
            if (modeLogged) return;
            modeLogged = true;
            pushLog(`List mode for School: ${m}${ok ? "" : " (probe had no rows)"}`);
          },
          onPage: ({ page, got, newCount, total }) =>
            pushLog(`Loaded School: page=${page} got=${got} new=${newCount} total=${total}`),
        }),
      {
        tries: 7,
        baseDelayMs: 600,
        onRetry: ({ attempt, delayMs, err }) =>
          pushLog(`⚠️ list retry ${attempt} (${delayMs}ms) School: ${safeStr(err?.message || err)}`),
      }
    );

    const scorecardRows = rows.filter((r) => lc(r?.source_platform) === "scorecard");
    const keyFn = getKeyFn(mode);
    const grouped = groupBy(scorecardRows, keyFn);

    const dupKeys = Array.from(grouped.keys()).filter((k) => (grouped.get(k) || []).length >= 2);

    pushLog(
      `Loaded School rows: ${rows.length} (scorecard=${scorecardRows.length}). Duplicate groups (mode=${mode}): ${dupKeys.length}`
    );

    let deleted = 0;
    let failed = 0;

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
      const toDelete = sorted.slice(1).map((r) => getId(r)).filter(Boolean);

      pushLog(`Group key="${k}" keepId=${keepId} delete=${toDelete.slice(0, 8).join(", ")}${toDelete.length > 8 ? "…" : ""}`);

      if (dedupeDryRun) continue;

      for (const id of toDelete) {
        try {
          await withRetries(() => deleteById(School, id), {
            tries: 10,
            baseDelayMs: 500,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`⚠️ delete retry ${attempt} (${delayMs}ms) School id=${id}: ${safeStr(err?.message || err)}`),
          });
          deleted += 1;
        } catch (e) {
          failed += 1;
          pushLog(`❌ Delete failed School id=${id}: ${safeStr(e?.message || e)}`);
        }
        await sleep(dedupeDeleteDelayMs);
      }
    }

    pushLog(`✅ Dedupe pass finished. Mode=${mode} Groups=${dupKeys.length} Deleted=${deleted} Failed=${failed}`);
  }

  async function runSchoolDedupe() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    setBusy(true);
    try {
      await runSchoolDedupePass(dedupeMode);
    } finally {
      setBusy(false);
    }
  }

  async function runSchoolDedupeAll() {
    if (!adminEnabled) return pushLog("❌ Blocked: Admin Mode is OFF.");
    setBusy(true);
    try {
      await runSchoolDedupePass("unitid");
      await sleep(600);
      await runSchoolDedupePass("source_key");
      await sleep(600);
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
            List-mode probing enabled. If list() paging args are unsupported, AdminOps will fall back safely.
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)} disabled={busy}>
            Profile
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)} disabled={busy}>
            Workspace
          </Button>
          <Button onClick={toggleAdminMode} disabled={busy}>
            Admin Mode: {adminEnabled ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {!adminEnabled && (
        <Card className="p-4 border border-amber-300 bg-amber-50">
          <div className="font-medium">Admin Mode is OFF</div>
          <div className="text-sm text-gray-700 mt-1">Turn it on to run purge/dedupe.</div>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "overview" ? "default" : "outline"} onClick={() => setTab("overview")} disabled={busy}>
              Overview
            </Button>
            <Button variant={tab === "purge" ? "default" : "outline"} onClick={() => setTab("purge")} disabled={busy}>
              Purge
            </Button>
            <Button variant={tab === "schools" ? "default" : "outline"} onClick={() => setTab("schools")} disabled={busy}>
              Schools
            </Button>
            <Button variant={tab === "diagnostics" ? "default" : "outline"} onClick={() => setTab("diagnostics")} disabled={busy}>
              Diagnostics
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Page size</span>
            <input
              className="border rounded px-2 py-1 w-24"
              type="number"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value || 2000))}
              disabled={busy}
            />
          </label>
        </div>
      </Card>

      {tab === "overview" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Option A workflow</div>
          <ol className="list-decimal pl-5 mt-2 text-sm text-gray-700 space-y-1">
            <li>Purge derived tables (Camp/CampDemo/Event/SchoolSportSite + artifacts)</li>
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
      )}

      {tab === "purge" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Purge</div>
          <div className="text-sm text-gray-600">Preset keeps School/Sport intact. Type DELETE to run.</div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={applyPurgePresetDerived} disabled={busy}>
              Preset: Derived tables
            </Button>
            <Button variant={purgeDryRun ? "default" : "outline"} onClick={() => setPurgeDryRun(true)} disabled={busy}>
              Dry run
            </Button>
            <Button variant={!purgeDryRun ? "default" : "outline"} onClick={() => setPurgeDryRun(false)} disabled={busy}>
              Write
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.keys(purgeSelection).map((k) => (
              <label key={k} className="flex items-center gap-2">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
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

          <Button onClick={runPurge} disabled={busy || !adminEnabled}>
            Run purge
          </Button>
        </Card>
      )}

      {tab === "schools" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Delete non-scorecard Schools</div>
            <div className="text-sm text-gray-600">Deletes School rows where source_platform != "scorecard" (including blank).</div>

            <div className="flex flex-wrap gap-2 items-center">
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

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Dedupe Scorecard Schools</div>
            <div className="text-sm text-gray-600">Run all passes after deleting non-scorecard schools.</div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Mode</div>
                <select className="w-full border rounded px-2 py-1" value={dedupeMode} onChange={(e) => setDedupeMode(e.target.value)} disabled={busy}>
                  <option value="unitid">unitid (best)</option>
                  <option value="source_key">source_key</option>
                  <option value="name_state">name + state (fallback)</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-gray-600">Delete delay (ms)</div>
                <input className="w-full border rounded px-2 py-1" type="number" value={dedupeDeleteDelayMs} onChange={(e) => setDedupeDeleteDelayMs(Number(e.target.value || 0))} disabled={busy} />
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

              <div className="space-y-1">
                <div className="text-gray-600">All passes</div>
                <Button variant="outline" onClick={runSchoolDedupeAll} disabled={busy || !adminEnabled}>
                  Run unitid → source_key → name_state
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runSchoolDedupe} disabled={busy || !adminEnabled}>
                Run dedupe (selected mode)
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "diagnostics" && (
        <Card className="p-4">
          <div className="text-lg font-semibold">Entities available</div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {entityKeys.map((k) => (
              <div key={k} className="border rounded px-2 py-1 font-mono">
                {k}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Run log</div>
          <Button variant="outline" onClick={() => setLog([])} disabled={busy}>
            Clear
          </Button>
        </div>
        <div ref={logRef} className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto" style={{ maxHeight: 420 }}>
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
