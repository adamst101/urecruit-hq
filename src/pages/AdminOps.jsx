// src/pages/AdminOps.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import * as Entities from "../api/entities";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

// Admin mode gate (shared with Profile)
const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";

const ROUTES = {
  Workspace: "/Workspace",
  Profile: "/Profile",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function lc(x) {
  return safeStr(x).toLowerCase().trim();
}

function getId(r) {
  return r?.id || r?._id || r?.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

async function withRetries(fn, { tries = 6, baseDelayMs = 350, onRetry } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = safeStr(e?.message || e);
      const status = e?.raw?.status || e?.status;
      const isRate = status === 429 || lc(msg).includes("rate") || lc(msg).includes("429");
      const isNet = lc(msg).includes("network") || lc(msg).includes("timeout");
      const is500 = status >= 500 && status <= 599;

      if (i < tries - 1 && (isRate || isNet || is500)) {
        const delay = Math.min(
          15_000,
          Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * 250)
        );
        onRetry?.({ attempt: i + 1, tries, delayMs: delay, err: e });
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

/**
 * Read helpers that DO NOT swallow errors.
 * Return { rows, error } so callers can log and decide.
 */
async function tryList(Entity) {
  if (!Entity?.list) return { rows: [], error: null, method: "list:missing" };
  try {
    const rows = await Entity.list();
    return { rows: asArray(rows), error: null, method: "list" };
  } catch (e1) {
    try {
      const rows = await Entity.list({});
      return { rows: asArray(rows), error: null, method: "list({})" };
    } catch (e2) {
      return { rows: [], error: e2 || e1, method: "list:error" };
    }
  }
}

async function tryFilter(Entity, where) {
  if (!Entity?.filter) return { rows: [], error: null, method: "filter:missing" };
  try {
    const rows = await Entity.filter(where || {});
    return { rows: asArray(rows), error: null, method: "filter" };
  } catch (e) {
    return { rows: [], error: e, method: "filter:error" };
  }
}

async function getAllRows(Entity, { prefer = "list" } = {}) {
  if (prefer === "filter") {
    const f = await tryFilter(Entity, {});
    if (f.error) return f;
    if (f.rows.length) return f;
    const l = await tryList(Entity);
    return l;
  } else {
    const l = await tryList(Entity);
    if (l.error) return l;
    if (l.rows.length) return l;
    const f = await tryFilter(Entity, {});
    return f;
  }
}

function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSchoolRow(r) {
  // Higher score = keep
  let s = 0;
  if (safeStr(r?.unitid).trim()) s += 3;
  if (safeStr(r?.source_key).trim()) s += 2;

  if (safeStr(r?.city).trim()) s += 2;
  if (safeStr(r?.state).trim()) s += 2;
  if (safeStr(r?.website_url).trim()) s += 1;

  if (safeStr(r?.logo_url).trim()) s += 2;
  if (safeStr(r?.division).trim()) s += 1;
  if (safeStr(r?.subdivision).trim()) s += 1;
  if (safeStr(r?.conference).trim()) s += 1;

  if (r?.active === true) s += 1;

  if (lc(r?.source_platform) === "scorecard") s += 1;
  return s;
}

function pickEntity(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

async function logAdminEvent(payload) {
  try {
    const Event = base44?.entities?.Event || base44?.entities?.Events;
    if (!Event?.create) return;
    await Event.create({ event_name: "admin_ops_run", ts: new Date().toISOString(), ...payload });
  } catch {
    // non-blocking
  }
}

function buildGroups(rows, mode) {
  // mode: source_key | unitid | name_state
  const groups = new Map();
  for (const r of rows) {
    const id = getId(r);
    if (!id) continue;

    let key = "";
    if (mode === "source_key") key = safeStr(r?.source_key).trim();
    else if (mode === "unitid") key = safeStr(r?.unitid).trim();
    else if (mode === "name_state") {
      const n = normName(r?.school_name || r?.name || "");
      const st = lc(r?.state || "");
      key = st ? `${n}::${st}` : `${n}::(no_state)`;
    }

    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return groups;
}

async function repointForeignKeys({ pushLog, dryRun, keepSchoolId, deleteSchoolId, delayMs }) {
  const tables = [
    { name: "Camp", fk: "school_id" },
    { name: "CampDemo", fk: "school_id" },
    { name: "SchoolSportSite", fk: "school_id" },
    { name: "SchoolSport", fk: "school_id" },
  ];

  const results = [];
  for (const t of tables) {
    const E = pickEntity(t.name);
    if (!E?.update) {
      pushLog(`⚠️ ${t.name}: missing update. Skipping repoint.`);
      results.push({ table: t.name, updated: 0, skipped: true });
      continue;
    }

    const f = await tryFilter(E, { [t.fk]: String(deleteSchoolId) });
    if (f.error) {
      pushLog(`⚠️ ${t.name}: filter failed (${safeStr(f.error?.message || f.error)}). Skipping repoint.`);
      results.push({ table: t.name, updated: 0, error: true });
      continue;
    }

    const rows = f.rows;
    if (!rows.length) {
      results.push({ table: t.name, updated: 0 });
      continue;
    }

    pushLog(`↳ Repoint ${t.name}.${t.fk}: ${rows.length} rows ${dryRun ? "(dry)" : ""}`);

    let updated = 0;
    for (const r of rows) {
      const id = getId(r);
      if (!id) continue;
      if (!dryRun) {
        await withRetries(() => E.update(String(id), { [t.fk]: String(keepSchoolId) }), {
          tries: 6,
          baseDelayMs: 450,
        });
        await sleep(delayMs);
      }
      updated += 1;
    }

    results.push({ table: t.name, updated });
  }

  return results;
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [tab, setTab] = useState("dedupe"); // you said: focus on dedupe

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // Dedupe controls
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeDeleteDelayMs, setDedupeDeleteDelayMs] = useState(150);
  const [dedupeUpdateDelayMs, setDedupeUpdateDelayMs] = useState(120);

  const [dedupeMode, setDedupeMode] = useState("name_state"); // source_key | unitid | name_state
  const [dedupeLimitGroups, setDedupeLimitGroups] = useState(250);
  const [dedupeSkipNoState, setDedupeSkipNoState] = useState(true);

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

  function requireAdminOrLog() {
    if (adminEnabled) return true;
    pushLog("❌ Blocked: Admin Mode is OFF. Enable it in Profile → Admin.");
    return false;
  }

  async function runSchoolDedupe() {
    if (!requireAdminOrLog()) return;

    const School = pickEntity("School");
    if (!School?.delete || !School?.update) {
      return pushLog("❌ School entity missing delete/update.");
    }

    setBusy(true);
    const startedAt = new Date().toISOString();

    try {
      pushLog(`School dedupe start. Mode=${dedupeMode} DryRun=${dedupeDryRun}`);

      // IMPORTANT: prefer list() for School reads (your failure was likely filter())
      const allRes = await withRetries(() => getAllRows(School, { prefer: "list" }), {
        tries: 3,
        baseDelayMs: 450,
      });

      if (allRes.error) {
        pushLog(`❌ Failed to read School rows via ${allRes.method}: ${safeStr(allRes.error?.message || allRes.error)}`);
        pushLog("Stop. This must be fixed before any write dedupe can run.");
        return;
      }

      const all = allRes.rows;
      pushLog(`Loaded School rows: ${all.length} (via ${allRes.method})`);

      if (!all.length) {
        pushLog("⚠️ Zero Schools returned. This is not a dedupe result; it is a read failure or permission issue.");
        pushLog("Try: hard refresh, re-login, then run again. If it persists, the School list API is blocked in this environment.");
        return;
      }

      const groups = buildGroups(all, dedupeMode);
      let entries = [...groups.entries()].filter(([, rows]) => rows.length > 1);

      if (dedupeMode === "name_state" && dedupeSkipNoState) {
        entries = entries.filter(([k]) => !k.endsWith("::(no_state)"));
      }

      entries.sort((a, b) => b[1].length - a[1].length);

      const totalGroups = entries.length;
      pushLog(`Duplicate groups: ${totalGroups}`);

      if (!totalGroups) {
        pushLog("✅ No duplicates found for selected mode.");
        return;
      }

      const limited = entries.slice(0, Math.max(1, Number(dedupeLimitGroups || 1)));
      if (limited.length < entries.length) {
        pushLog(`⚠️ Limiting to first ${limited.length} groups (safety cap). Re-run to continue.`);
      }

      let deletedSchools = 0;
      let keptSchools = 0;
      let repointedRowsTotal = 0;

      for (const [key, rows] of limited) {
        const sorted = [...rows].sort((a, b) => scoreSchoolRow(b) - scoreSchoolRow(a));
        const keep = sorted[0];
        const keepId = getId(keep);
        if (!keepId) continue;

        const toDelete = sorted.slice(1).filter((r) => !!getId(r));
        if (!toDelete.length) continue;

        keptSchools += 1;

        for (const d of toDelete) {
          const delId = getId(d);
          if (!delId) continue;

          const repointRes = await repointForeignKeys({
            pushLog,
            dryRun: dedupeDryRun,
            keepSchoolId: keepId,
            deleteSchoolId: delId,
            delayMs: dedupeUpdateDelayMs,
          });

          const repointed = repointRes.reduce((acc, x) => acc + (x?.updated || 0), 0);
          repointedRowsTotal += repointed;

          if (!dedupeDryRun) {
            await withRetries(() => School.delete(String(delId)), { tries: 6, baseDelayMs: 450 });
            await sleep(dedupeDeleteDelayMs);
          }
          deletedSchools += 1;

          pushLog(
            `✅ ${dedupeDryRun ? "Would merge+delete" : "Merged+deleted"} dup school id=${delId} into keep id=${keepId} (repointed=${repointed})`
          );
        }
      }

      await logAdminEvent({
        operation: "school_dedupe_merge",
        mode: dedupeMode,
        dry_run: dedupeDryRun,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        groups_seen: totalGroups,
        groups_processed: limited.length,
        kept_schools: keptSchools,
        deleted_schools: deletedSchools,
        repointed_rows: repointedRowsTotal,
      });

      pushLog(
        `✅ Dedupe complete. GroupsProcessed=${limited.length} Kept=${keptSchools} ${dedupeDryRun ? "Would delete" : "Deleted"}Schools=${deletedSchools} RepointedRows=${repointedRowsTotal}`
      );
    } catch (e) {
      pushLog(`❌ Dedupe failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const TabBtn = ({ id, children }) => (
    <Button variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)} disabled={busy}>
      {children}
    </Button>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-2xl font-semibold">Admin Ops</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)} disabled={busy}>
            Workspace
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Profile)} disabled={busy}>
            Profile
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Safety gate</div>
          <div className={`text-sm ${adminEnabled ? "text-green-700" : "text-red-700"}`}>
            Admin Mode: {adminEnabled ? "ON" : "OFF"}
          </div>
        </div>
        <div className="text-sm text-gray-700">
          Your last run showed write-mode reading 0 Schools. This version logs read failures instead of hiding them.
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <TabBtn id="dedupe">Dedupe</TabBtn>
      </div>

      {tab === "dedupe" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">School Dedupe (with merge)</div>
          <div className="text-sm text-gray-700">
            Repoints Camp/CampDemo/SchoolSport/SchoolSportSite to the kept School before deleting duplicates.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <label className="space-y-1">
              <div className="text-gray-600">Mode</div>
              <select className="w-full border rounded px-2 py-1" value={dedupeMode} onChange={(e) => setDedupeMode(e.target.value)} disabled={busy}>
                <option value="name_state">name + state (recommended)</option>
                <option value="source_key">source_key</option>
                <option value="unitid">unitid</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Group limit per run</div>
              <input className="w-full border rounded px-2 py-1" type="number" value={dedupeLimitGroups} onChange={(e) => setDedupeLimitGroups(Number(e.target.value || 0))} disabled={busy} />
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Skip groups with no state</div>
              <select className="w-full border rounded px-2 py-1" value={dedupeSkipNoState ? "yes" : "no"} onChange={(e) => setDedupeSkipNoState(e.target.value === "yes")} disabled={busy}>
                <option value="yes">Yes (safer)</option>
                <option value="no">No (more aggressive)</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Update delay (ms)</div>
              <input className="w-full border rounded px-2 py-1" type="number" value={dedupeUpdateDelayMs} onChange={(e) => setDedupeUpdateDelayMs(Number(e.target.value || 0))} disabled={busy} />
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Delete delay (ms)</div>
              <input className="w-full border rounded px-2 py-1" type="number" value={dedupeDeleteDelayMs} onChange={(e) => setDedupeDeleteDelayMs(Number(e.target.value || 0))} disabled={busy} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant={dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(true)} disabled={busy}>
              Dry run
            </Button>
            <Button variant={!dedupeDryRun ? "default" : "outline"} onClick={() => setDedupeDryRun(false)} disabled={busy}>
              Merge + delete
            </Button>
            <Button onClick={runSchoolDedupe} disabled={busy}>
              Run School dedupe
            </Button>
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
        <div ref={logRef} className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto" style={{ maxHeight: 320 }}>
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
