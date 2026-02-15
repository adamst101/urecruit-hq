// src/pages/AdminOps.jsx
import React, { useEffect, useRef, useState } from "react";
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

async function withRetries(fn, { tries = 6, baseDelayMs = 450, onRetry } = {}) {
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
          25_000,
          Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * 350)
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

function normState(x) {
  const s = lc(x);
  if (!s) return "";
  // keep as-is; Scorecard uses 2-letter abbreviations, camps should too
  return s.length === 2 ? s : s;
}

function schoolKeyFromParts(name, state) {
  const n = normName(name);
  const st = normState(state);
  if (!n || !st) return "";
  return `${n}::${st}`;
}

function extractCampSchoolName(row) {
  return (
    row?.school_name ||
    row?.schoolName ||
    row?.school ||
    row?.school_title ||
    row?.host_school ||
    row?.host_school_name ||
    row?.institution_name ||
    row?.institution ||
    row?.name || // last resort
    ""
  );
}

function extractCampState(row) {
  return row?.state || row?.school_state || row?.schoolState || row?.location_state || row?.locationState || "";
}

function extractCampCity(row) {
  return row?.city || row?.school_city || row?.schoolCity || row?.location_city || row?.locationCity || "";
}

function scoreSchoolRow(r) {
  // Used for tie-break if multiple Schools share same name/state (rare but possible)
  let s = 0;
  if (safeStr(r?.unitid).trim()) s += 3;
  if (safeStr(r?.source_key).trim()) s += 2;
  if (safeStr(r?.city).trim()) s += 2;
  if (safeStr(r?.state).trim()) s += 2;
  if (safeStr(r?.website_url).trim()) s += 1;
  if (safeStr(r?.logo_url).trim()) s += 1;
  if (lc(r?.source_platform) === "scorecard") s += 1;
  return s;
}

function buildSchoolIndex(schools) {
  // key => { id, score, count }
  const map = new Map();
  const collisions = new Map(); // key => count
  for (const s of schools) {
    const id = getId(s);
    if (!id) continue;
    const key = schoolKeyFromParts(s?.school_name || s?.name || "", s?.state || "");
    if (!key) continue;

    const score = scoreSchoolRow(s);
    if (!map.has(key)) {
      map.set(key, { id: String(id), score });
      collisions.set(key, 1);
    } else {
      collisions.set(key, (collisions.get(key) || 1) + 1);
      // keep best scored
      const cur = map.get(key);
      if (score > (cur?.score || 0)) map.set(key, { id: String(id), score });
    }
  }
  return { map, collisions };
}

export default function AdminOps() {
  const nav = useNavigate();

  const [adminEnabled, setAdminEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  const [tab, setTab] = useState("check"); // focus: check + auto repair

  // Orphan repair controls
  const [repairDryRun, setRepairDryRun] = useState(true);
  const [repairDelayMs, setRepairDelayMs] = useState(220);
  const [repairMaxRows, setRepairMaxRows] = useState(600); // covers 233+251 with slack
  const [repairAllowCityFallback, setRepairAllowCityFallback] = useState(false); // safer default off

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

      if (orphanCamps.length) pushLog(`⚠️ Camps are pointing to deleted School ids. Use Auto Repair.`);
      if (orphanCampDemos.length) pushLog(`⚠️ CampDemos are pointing to deleted School ids. Use Auto Repair.`);
      if (!orphanCamps.length && !orphanCampDemos.length) pushLog(`✅ No orphaned Camp/CampDemo school_id detected.`);
    } catch (e) {
      pushLog(`❌ Orphan check failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function autoRepairOrphans() {
    if (!requireAdminOrLog()) return;
    setBusy(true);

    try {
      const School = pickEntity("School");
      const Camp = pickEntity("Camp");
      const CampDemo = pickEntity("CampDemo");

      if (!School?.list) {
        pushLog("❌ School.list missing.");
        return;
      }
      if (!Camp?.list || !Camp?.update) {
        pushLog("❌ Camp entity missing list/update.");
        return;
      }
      if (!CampDemo?.list || !CampDemo?.update) {
        pushLog("❌ CampDemo entity missing list/update.");
        return;
      }

      pushLog(`Auto Repair start. DryRun=${repairDryRun} MaxRows=${repairMaxRows} DelayMs=${repairDelayMs} CityFallback=${repairAllowCityFallback}`);

      const schoolsRes = await getAllRows(School, { prefer: "list" });
      if (schoolsRes.error) {
        pushLog(`❌ School read failed: ${safeStr(schoolsRes.error?.message || schoolsRes.error)}`);
        return;
      }
      const schools = schoolsRes.rows;

      const schoolIds = new Set(schools.map(getId).filter(Boolean).map(String));
      const { map: schoolIndex, collisions } = buildSchoolIndex(schools);

      const collisionCount = [...collisions.values()].filter((n) => n > 1).length;
      pushLog(`School index built. Keys=${schoolIndex.size} CollidingKeys=${collisionCount}`);

      // Load Camps / CampDemos
      const campsRes = await getAllRows(Camp, { prefer: "list" });
      if (campsRes.error) {
        pushLog(`❌ Camp read failed: ${safeStr(campsRes.error?.message || campsRes.error)}`);
        return;
      }

      const campDemoRes = await getAllRows(CampDemo, { prefer: "list" });
      if (campDemoRes.error) {
        pushLog(`❌ CampDemo read failed: ${safeStr(campDemoRes.error?.message || campDemoRes.error)}`);
        return;
      }

      const orphanCamps = campsRes.rows.filter((c) => {
        const sid = safeStr(c?.school_id).trim();
        return sid && !schoolIds.has(sid);
      });

      const orphanCampDemos = campDemoRes.rows.filter((c) => {
        const sid = safeStr(c?.school_id).trim();
        return sid && !schoolIds.has(sid);
      });

      pushLog(`Found orphans: Camp=${orphanCamps.length} CampDemo=${orphanCampDemos.length}`);

      let fixed = 0;
      let wouldFix = 0;
      let ambiguous = 0;
      let noData = 0;
      let noMatch = 0;

      const fixOne = async (Entity, row, rowType) => {
        const rowId = getId(row);
        if (!rowId) return;

        const name = extractCampSchoolName(row);
        const state = extractCampState(row);
        const city = extractCampCity(row);

        const key = schoolKeyFromParts(name, state);
        if (!key) {
          noData += 1;
          return;
        }

        // If multiple Schools share same key, our index picks best score. Still safe but we flag ambiguous.
        const colN = collisions.get(key) || 0;
        if (colN > 1) ambiguous += 1;

        let targetSchoolId = schoolIndex.get(key)?.id || "";

        // Optional fallback: if no match by state, try name+city where city available and state present.
        // Default OFF because it can create wrong links.
        if (!targetSchoolId && repairAllowCityFallback) {
          const n = normName(name);
          const st = normState(state);
          const ct = normName(city);
          if (n && st && ct) {
            // Build a second index on the fly: name::state::city
            for (const s of schools) {
              const sid = getId(s);
              if (!sid) continue;
              const sn = normName(s?.school_name || s?.name || "");
              const ss = normState(s?.state || "");
              const sc = normName(s?.city || "");
              if (sn === n && ss === st && sc === ct) {
                targetSchoolId = String(sid);
                break;
              }
            }
          }
        }

        if (!targetSchoolId) {
          noMatch += 1;
          return;
        }

        if (repairDryRun) {
          wouldFix += 1;
        } else {
          await withRetries(() => Entity.update(String(rowId), { school_id: String(targetSchoolId) }), {
            tries: 6,
            baseDelayMs: 600,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`↻ ${rowType}.update retry ${attempt} wait=${delayMs}ms err=${safeStr(err?.message || err)}`),
          });
          fixed += 1;
          await sleep(repairDelayMs);
        }
      };

      // Cap work per run to stay restart-safe
      const max = Math.max(1, Number(repairMaxRows || 1));
      const workCamps = orphanCamps.slice(0, max);
      const remaining = max - workCamps.length;
      const workCampDemos = orphanCampDemos.slice(0, Math.max(0, remaining));

      pushLog(`Processing: Camp=${workCamps.length} CampDemo=${workCampDemos.length}`);

      for (const c of workCamps) {
        await fixOne(Camp, c, "Camp");
      }
      for (const d of workCampDemos) {
        await fixOne(CampDemo, d, "CampDemo");
      }

      pushLog(
        `Auto Repair complete. ${repairDryRun ? "WouldFix" : "Fixed"}=${repairDryRun ? wouldFix : fixed} ` +
          `NoData=${noData} NoMatch=${noMatch} AmbiguousKeys=${ambiguous}`
      );

      if (repairDryRun) {
        pushLog("Run again with Write to apply updates. Then run Orphan Check to confirm counts drop.");
      } else {
        pushLog("Next: run Orphan Check. If counts remain >0, rerun Auto Repair until clear (rate-safe).");
      }
    } catch (e) {
      pushLog(`❌ Auto Repair failed: ${safeStr(e?.message || e)}`);
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
          Your orphan check shows 100% orphaned school_id. Use Auto Repair to relink by name+state to current Scorecard Schools.
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <TabBtn id="check">Orphan Check</TabBtn>
        <TabBtn id="autoRepair">Auto Repair Orphans</TabBtn>
      </div>

      {tab === "check" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Orphan Check</div>
          <div className="text-sm text-gray-700">
            Counts Camps/CampDemos whose <code className="bg-gray-100 px-1 rounded">school_id</code> points to a missing School.
          </div>
          <Button onClick={runOrphanCheck} disabled={busy}>
            Run orphan check
          </Button>
        </Card>
      )}

      {tab === "autoRepair" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Auto Repair Orphans</div>
          <div className="text-sm text-gray-700">
            Re-links orphaned Camps and CampDemos by matching <b>school name + state</b> to the current School table. Safe by default.
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Max rows per run</span>
              <input
                className="border rounded px-2 py-1 w-24"
                type="number"
                value={repairMaxRows}
                onChange={(e) => setRepairMaxRows(Number(e.target.value || 0))}
                disabled={busy}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={repairAllowCityFallback}
                onChange={(e) => setRepairAllowCityFallback(e.target.checked)}
                disabled={busy}
              />
              <span className="text-gray-600">Allow city fallback (riskier)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={autoRepairOrphans} disabled={busy}>
              Run auto repair
            </Button>
            <Button variant="outline" onClick={runOrphanCheck} disabled={busy}>
              Run orphan check after
            </Button>
          </div>

          <div className="text-xs text-gray-600">
            Recommended: Run Dry run once, then Write. If rate limits hit, rerun with a smaller Max rows or higher Delay.
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
          style={{ maxHeight: 420 }}
        >
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
