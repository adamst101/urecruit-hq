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

async function withRetries(fn, { tries = 6, baseDelayMs = 400, onRetry } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = safeStr(e?.message || e);
      const status = e?.raw?.status || e?.status;

      const is429 = status === 429 || lc(msg).includes("rate limit") || lc(msg).includes("429");
      const isNet = lc(msg).includes("network") || lc(msg).includes("timeout");
      const is5xx = status >= 500 && status <= 599;

      if (i < tries - 1 && (is429 || isNet || is5xx)) {
        const delay = Math.min(
          20_000,
          Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * 300)
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
    return await tryList(Entity);
  }
  const l = await tryList(Entity);
  if (l.error) return l;
  if (l.rows.length) return l;
  return await tryFilter(Entity, {});
}

function pickEntity(name) {
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSchoolRow(r) {
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

function buildGroups(rows, mode) {
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
  // NOTE: SchoolSport removed (does not exist in your app)
  const tables = [
    { name: "Camp", fk: "school_id" },
    { name: "CampDemo", fk: "school_id" },
    { name: "SchoolSportSite", fk: "school_id" },
  ];

  const results = [];
  for (const t of tables) {
    const E = pickEntity(t.name);
    if (!E?.update) {
      pushLog(`⚠️ ${t.name}: missing update. Skipping repoint.`);
      results.push({ table: t.name, updated: 0, skipped: true });
      continue;
    }

    // Retry the FILTER itself on 429 instead of skipping
    const f = await withRetries(() => tryFilter(E, { [t.fk]: String(deleteSchoolId) }), {
      tries: 6,
      baseDelayMs: 550,
      onRetry: ({ attempt, delayMs, err }) =>
        pushLog(`↻ ${t.name}.filter retry ${attempt} wait=${delayMs}ms err=${safeStr(err?.message || err)}`),
    });

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
          baseDelayMs: 550,
          onRetry: ({ attempt, delayMs, err }) =>
            pushLog(`↻ ${t.name}.update retry ${attempt} wait=${delayMs}ms err=${safeStr(err?.message || err)}`),
        });
        await sleep(delayMs);
      }
      updated += 1;
    }

    results.push({ table: t.name, updated });
  }

  return results;
}

function parseIdPairs(text) {
  // Accept lines:
  // delId,keepId
  // delId -> keepId
  // delId keepId
  const pairs = [];
  const lines = safeStr(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = line.replace(/["'`]/g, "");
    const parts = cleaned.split(/->|,|\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const delId = parts[0];
      const keepId = parts[1];
      if (delId && keepId && delId !== keepId) pairs.push({ delId, keepId });
    }
  }
  // de-dupe identical pairs
  const key = (p) => `${p.delId}::${p.keepId}`;
  const uniq = new Map();
  for (const p of pairs) uniq.set(key(p), p);
  return [...uniq.values()];
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  const [tab, setTab] = useState("dedupe"); // dedupe | repair | check

  // Dedupe controls
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeMode, setDedupeMode] = useState("name_state");
  const [dedupeLimitGroups, setDedupeLimitGroups] = useState(250);
  const [dedupeSkipNoState, setDedupeSkipNoState] = useState(true);
  const [dedupeUpdateDelayMs, setDedupeUpdateDelayMs] = useState(250);
  const [dedupeDeleteDelayMs, setDedupeDeleteDelayMs] = useState(350);

  // Repair controls
  const [repairDryRun, setRepairDryRun] = useState(true);
  const [repairDelayMs, setRepairDelayMs] = useState(200);
  const [repairPairsText, setRepairPairsText] = useState("");

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

  async function runOrphanCheck() {
    if (!requireAdminOrLog()) return;
    setBusy(true);
    try {
      const School = pickEntity("School");
      const Camp = pickEntity("Camp");
      const CampDemo = pickEntity("CampDemo");

      const schoolsRes = await getAllRows(School, { prefer: "list" });
      if (schoolsRes.error) {
        pushLog(`❌ School read failed: ${safeStr(schoolsRes.error?.message || schoolsRes.error)}`);
        return;
      }
      const schoolIds = new Set(schoolsRes.rows.map(getId).filter(Boolean).map(String));
      pushLog(`Loaded Schools: ${schoolIds.size}`);

      const campsRes = await getAllRows(Camp, { prefer: "list" });
      if (campsRes.error) pushLog(`⚠️ Camp read failed: ${safeStr(campsRes.error?.message || campsRes.error)}`);

      const campDemoRes = await getAllRows(CampDemo, { prefer: "list" });
      if (campDemoRes.error) pushLog(`⚠️ CampDemo read failed: ${safeStr(campDemoRes.error?.message || campDemoRes.error)}`);

      const camps = campsRes.error ? [] : campsRes.rows;
      const campDemos = campDemoRes.error ? [] : campDemoRes.rows;

      const orphanCamps = camps.filter((c) => {
        const sid = safeStr(c?.school_id).trim();
        return sid && !schoolIds.has(sid);
      });

      const orphanCampDemos = campDemos.filter((c) => {
        const sid = safeStr(c?.school_id).trim();
        return sid && !schoolIds.has(sid);
      });

      pushLog(`Orphan check results:`);
      pushLog(`- Camp rows: ${camps.length} | orphan school_id: ${orphanCamps.length}`);
      pushLog(`- CampDemo rows: ${campDemos.length} | orphan school_id: ${orphanCampDemos.length}`);

      if (orphanCamps.length) pushLog(`⚠️ Camps are pointing to deleted School ids. Use Repair tab.`);
      if (orphanCampDemos.length) pushLog(`⚠️ CampDemos are pointing to deleted School ids. Use Repair tab.`);
      if (!orphanCamps.length && !orphanCampDemos.length) pushLog(`✅ No orphaned Camp/CampDemo school_id detected.`);
    } catch (e) {
      pushLog(`❌ Orphan check failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runRepairFromPairs() {
    if (!requireAdminOrLog()) return;

    const pairs = parseIdPairs(repairPairsText);
    if (!pairs.length) {
      pushLog("❌ No valid id pairs found. Paste lines like: deletedId,keepId");
      return;
    }

    setBusy(true);
    try {
      pushLog(`Repair start. DryRun=${repairDryRun} pairs=${pairs.length}`);
      let totalRepointed = 0;

      for (const p of pairs) {
        pushLog(`Processing del=${p.delId} -> keep=${p.keepId}`);
        const res = await repointForeignKeys({
          pushLog,
          dryRun: repairDryRun,
          keepSchoolId: p.keepId,
          deleteSchoolId: p.delId,
          delayMs: repairDelayMs,
        });
        const repointed = res.reduce((acc, x) => acc + (x?.updated || 0), 0);
        totalRepointed += repointed;
        pushLog(`✅ ${repairDryRun ? "Would repoint" : "Repointed"} rows=${repointed} for del=${p.delId}`);
        await sleep(300);
      }

      pushLog(`✅ Repair complete. ${repairDryRun ? "Dry run." : "Write."} Total repointed rows=${totalRepointed}`);
    } catch (e) {
      pushLog(`❌ Repair failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runSchoolDedupe() {
    if (!requireAdminOrLog()) return;

    const School = pickEntity("School");
    if (!School?.delete || !School?.update) {
      pushLog("❌ School entity missing delete/update.");
      return;
    }

    setBusy(true);
    try {
      pushLog(`School dedupe start. Mode=${dedupeMode} DryRun=${dedupeDryRun}`);

      const allRes = await withRetries(() => getAllRows(School, { prefer: "list" }), {
        tries: 3,
        baseDelayMs: 450,
      });

      if (allRes.error) {
        pushLog(`❌ Failed to read School rows via ${allRes.method}: ${safeStr(allRes.error?.message || allRes.error)}`);
        return;
      }

      const all = allRes.rows;
      pushLog(`Loaded School rows: ${all.length} (via ${allRes.method})`);
      if (!all.length) {
        pushLog("⚠️ Zero Schools returned. Stop.");
        return;
      }

      const groups = buildGroups(all, dedupeMode);
      let entries = [...groups.entries()].filter(([, rows]) => rows.length > 1);

      if (dedupeMode === "name_state" && dedupeSkipNoState) {
        entries = entries.filter(([k]) => !k.endsWith("::(no_state)"));
      }

      entries.sort((a, b) => b[1].length - a[1].length);
      pushLog(`Duplicate groups: ${entries.length}`);

      if (!entries.length) {
        pushLog("✅ No duplicates found.");
        return;
      }

      const limited = entries.slice(0, Math.max(1, Number(dedupeLimitGroups || 1)));
      if (limited.length < entries.length) {
        pushLog(`⚠️ Limiting to first ${limited.length} groups. Re-run to continue.`);
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
            await withRetries(() => School.delete(String(delId)), {
              tries: 6,
              baseDelayMs: 650,
              onRetry: ({ attempt, delayMs, err }) =>
                pushLog(`↻ School.delete retry ${attempt} wait=${delayMs}ms err=${safeStr(err?.message || err)}`),
            });
            await sleep(dedupeDeleteDelayMs);
          }

          deletedSchools += 1;
          pushLog(
            `✅ ${dedupeDryRun ? "Would merge+delete" : "Merged+deleted"} dup school id=${delId} into keep id=${keepId} (repointed=${repointed})`
          );
        }
      }

      pushLog(
        `✅ Dedupe complete. GroupsProcessed=${limited.length} Kept=${keptSchools} ${dedupeDryRun ? "Would delete" : "Deleted"}Schools=${deletedSchools} RepointedRows=${repointedRowsTotal}`
      );
      pushLog("Next: run Orphan Check tab to confirm joins are intact.");
    } catch (e) {
      pushLog(`❌ Dedupe failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const TabBtn = ({ id, children }) => (
    <Button
      variant={tab === id ? "default" : "outline"}
      onClick={() => setTab(id)}
      disabled={busy}
    >
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
          You already deduped Schools. Now we verify no orphaned Camp → School joins and repair if needed.
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <TabBtn id="dedupe">Dedupe</TabBtn>
        <TabBtn id="check">Orphan Check</TabBtn>
        <TabBtn id="repair">Repair School References</TabBtn>
      </div>

      {tab === "check" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Orphan Check</div>
          <div className="text-sm text-gray-700">
            Finds Camps/CampDemos whose <code className="bg-gray-100 px-1 rounded">school_id</code> points to a deleted School.
          </div>
          <Button onClick={runOrphanCheck} disabled={busy}>
            Run orphan check
          </Button>
        </Card>
      )}

      {tab === "repair" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Repair School References</div>
          <div className="text-sm text-gray-700">
            Paste mapping pairs from your dedupe log: <b>deletedId,keepId</b> (one per line). This will repoint
            Camp/CampDemo/SchoolSportSite off deleted School ids.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={repairDryRun ? "default" : "outline"}
              onClick={() => setRepairDryRun(true)}
              disabled={busy}
            >
              Dry run
            </Button>
            <Button
              variant={!repairDryRun ? "default" : "outline"}
              onClick={() => setRepairDryRun(false)}
              disabled={busy}
            >
              Write
            </Button>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Delay per update (ms)</span>
              <input
                className="border rounded px-2 py-1 w-24"
                type="number"
                value={repairDelayMs}
                onChange={(e) => setRepairDelayMs(Number(e.target.value || 0))}
                disabled={busy}
              />
            </label>
          </div>

          <textarea
            className="w-full border rounded p-2 text-sm"
            rows={10}
            placeholder={`Example:\n69920211bb44fc04366e585a,69920212339194772177de85\n6991ec9b5d5d6761d8e8eff7,69920212339194772177de85`}
            value={repairPairsText}
            onChange={(e) => setRepairPairsText(e.target.value)}
            disabled={busy}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={runRepairFromPairs} disabled={busy}>
              Run repair
            </Button>
          </div>

          <div className="text-xs text-gray-600">
            Run Orphan Check after repair to confirm orphan counts drop to zero.
          </div>
        </Card>
      )}

      {tab === "dedupe" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">School Dedupe (with merge)</div>
          <div className="text-sm text-gray-700">
            This is now hardened against 429s and no longer references the nonexistent SchoolSport entity.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <label className="space-y-1">
              <div className="text-gray-600">Mode</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={dedupeMode}
                onChange={(e) => setDedupeMode(e.target.value)}
                disabled={busy}
              >
                <option value="name_state">name + state</option>
                <option value="source_key">source_key</option>
                <option value="unitid">unitid</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Group limit per run</div>
              <input
                className="w-full border rounded px-2 py-1"
                type="number"
                value={dedupeLimitGroups}
                onChange={(e) => setDedupeLimitGroups(Number(e.target.value || 0))}
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Skip groups with no state</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={dedupeSkipNoState ? "yes" : "no"}
                onChange={(e) => setDedupeSkipNoState(e.target.value === "yes")}
                disabled={busy}
              >
                <option value="yes">Yes (safer)</option>
                <option value="no">No</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-gray-600">Update delay (ms)</div>
              <input
                className="w-full border rounded px-2 py-1"
                type="number"
                value={dedupeUpdateDelayMs}
                onChange={(e) => setDedupeUpdateDelayMs(Number(e.target.value || 0))}
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
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={dedupeDryRun ? "default" : "outline"}
              onClick={() => setDedupeDryRun(true)}
              disabled={busy}
            >
              Dry run
            </Button>
            <Button
              variant={!dedupeDryRun ? "default" : "outline"}
              onClick={() => setDedupeDryRun(false)}
              disabled={busy}
            >
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
        <div
          ref={logRef}
          className="mt-3 bg-black text-green-200 rounded p-3 text-xs overflow-auto"
          style={{ maxHeight: 360 }}
        >
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
