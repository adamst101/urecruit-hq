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
  AdminOps: "/AdminOps",
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
        const delay = Math.min(15_000, Math.floor(baseDelayMs * Math.pow(2, i) + Math.random() * 250));
        onRetry?.({ attempt: i + 1, tries, delayMs: delay, err: e });
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function listAll(Entity) {
  if (!Entity?.list) return [];
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

async function filterAll(Entity, where) {
  if (!Entity?.filter) return [];
  try {
    return asArray(await Entity.filter(where || {}));
  } catch {
    return [];
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

  // Prefer "scorecard" platform if present
  if (lc(r?.source_platform) === "scorecard") s += 1;

  return s;
}

function pickEntity(name) {
  // Prefer explicit exports from src/api/entities.js
  const direct = Entities?.[name];
  if (direct) return direct;
  const e = base44?.entities;
  if (e?.[name]) return e[name];
  if (e?.[`${name}s`]) return e[`${name}s`];
  return null;
}

function unwrapInvokeResponse(raw) {
  // Base44 sometimes wraps responses
  if (!raw) return raw;
  if (raw.data !== undefined) return raw.data;
  if (raw.result !== undefined) return raw.result;
  return raw;
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
      // if no state, still group by name (but mark lower confidence)
      key = st ? `${n}::${st}` : `${n}::(no_state)`;
    }

    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return groups;
}

async function repointForeignKeys({
  pushLog,
  dryRun,
  keepSchoolId,
  deleteSchoolId,
  delayMs,
}) {
  // Update related tables to point to keepSchoolId before deleting the dup school.
  const tables = [
    { name: "Camp", fk: "school_id" },
    { name: "CampDemo", fk: "school_id" },
    { name: "SchoolSportSite", fk: "school_id" },
    { name: "SchoolSport", fk: "school_id" },
  ];

  const results = [];
  for (const t of tables) {
    const E = pickEntity(t.name);
    if (!E?.filter || !E?.update) {
      pushLog(`⚠️ ${t.name}: missing filter/update. Skipping repoint.`);
      results.push({ table: t.name, updated: 0, skipped: true });
      continue;
    }

    const rows = await filterAll(E, { [t.fk]: String(deleteSchoolId) });
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
  const [tab, setTab] = useState("pipelines"); // pipelines | purge | dedupe | diagnostics

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  // Purge/reset controls (kept, but you can ignore)
  const [purgeSelection, setPurgeSelection] = useState(() => ({
    School: false,
    SchoolSport: false,
    SchoolSportSite: false,
    Sport: false,
    CampDemo: false,
    Camp: false,
    Event: false,
    Favorite: false,
    CampIntent: false,
    UserCamp: false,
    Registration: false,
  }));
  const [purgeDryRun, setPurgeDryRun] = useState(true);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purgePerDeleteDelayMs, setPurgePerDeleteDelayMs] = useState(125);
  const [purgeBetweenEntitiesDelayMs, setPurgeBetweenEntitiesDelayMs] = useState(650);

  // Dedupe controls
  const [dedupeDryRun, setDedupeDryRun] = useState(true);
  const [dedupeDeleteDelayMs, setDedupeDeleteDelayMs] = useState(150);
  const [dedupeUpdateDelayMs, setDedupeUpdateDelayMs] = useState(120);

  const [dedupeMode, setDedupeMode] = useState("name_state"); // source_key | unitid | name_state
  const [dedupeMinGroupSize, setDedupeMinGroupSize] = useState(2);
  const [dedupeLimitGroups, setDedupeLimitGroups] = useState(250); // safety cap per run
  const [dedupeSkipNoState, setDedupeSkipNoState] = useState(true); // for name_state mode

  // Pipelines controls (kept)
  const [pipeDryRun, setPipeDryRun] = useState(true);
  const [autoRun, setAutoRun] = useState(true);
  const [seedPerPage, setSeedPerPage] = useState(100);
  const [seedPagesPerCall, setSeedPagesPerCall] = useState(2);
  const [seedMaxUpserts, setSeedMaxUpserts] = useState(400);
  const [seedWriteDelayMs, setSeedWriteDelayMs] = useState(120);

  const [memberOrgs, setMemberOrgs] = useState(() => ({ NCAA: true, NAIA: true, NJCAA: true }));
  const [memberMaxUpdates, setMemberMaxUpdates] = useState(250);
  const [memberWriteDelayMs, setMemberWriteDelayMs] = useState(150);

  const [sportsOnlyMissing, setSportsOnlyMissing] = useState(true);

  const [schoolSportsOrg, setSchoolSportsOrg] = useState("CAMP");
  const [schoolSportsMaxCreates, setSchoolSportsMaxCreates] = useState(400);
  const [schoolSportsWriteDelayMs, setSchoolSportsWriteDelayMs] = useState(100);

  const [logosMaxUpdates, setLogosMaxUpdates] = useState(500);
  const [logosWriteDelayMs, setLogosWriteDelayMs] = useState(120);

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

  const selectedEntities = useMemo(
    () => Object.entries(purgeSelection).filter(([, v]) => !!v).map(([k]) => k),
    [purgeSelection]
  );

  const entityKeys = useMemo(() => {
    const keys = Object.keys(base44?.entities || {});
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
  }, []);

  function requireAdminOrLog() {
    if (adminEnabled) return true;
    pushLog("❌ Blocked: Admin Mode is OFF. Enable it in Profile → Admin.");
    return false;
  }

  async function runPurge() {
    if (!requireAdminOrLog()) return;
    if (!selectedEntities.length) return pushLog("❌ Nothing selected.");
    if (purgeConfirmText.trim() !== "DELETE") return pushLog('❌ Type "DELETE" to confirm.');

    setBusy(true);
    const startedAt = new Date().toISOString();

    try {
      pushLog(
        `Purge start. DryRun=${purgeDryRun} Entities=${selectedEntities.join(", ")}`
      );

      const countsBefore = {};
      for (const name of selectedEntities) {
        const Entity = pickEntity(name);
        const rows = await listAll(Entity);
        countsBefore[name] = rows.length;
      }
      pushLog(`Counts before: ${JSON.stringify(countsBefore)}`);

      let deletedTotal = 0;
      const deletedByEntity = {};

      for (const name of selectedEntities) {
        const Entity = pickEntity(name);
        if (!Entity?.delete) {
          pushLog(`⚠️ Skipping ${name}: delete not available.`);
          continue;
        }

        const rows = await listAll(Entity);
        pushLog(`--- ${name}: ${rows.length} rows ---`);

        let deleted = 0;
        for (const r of rows) {
          const id = getId(r);
          if (!id) continue;
          if (purgeDryRun) {
            deleted += 1;
            continue;
          }

          await withRetries(() => Entity.delete(String(id)), {
            tries: 6,
            baseDelayMs: 450,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`↻ delete retry ${attempt} (${name}) wait=${delayMs}ms err=${safeStr(err?.message || err)}`),
          });
          deleted += 1;
          deletedTotal += 1;
          await sleep(purgePerDeleteDelayMs);
        }

        deletedByEntity[name] = deleted;
        pushLog(`✅ ${name}: ${purgeDryRun ? "would delete" : "deleted"} ${deleted}`);
        await sleep(purgeBetweenEntitiesDelayMs);
      }

      const finishedAt = new Date().toISOString();
      await logAdminEvent({
        operation: "purge",
        dry_run: purgeDryRun,
        entities: selectedEntities,
        started_at: startedAt,
        finished_at: finishedAt,
        counts_before_json: JSON.stringify(countsBefore),
        deleted_by_entity_json: JSON.stringify(deletedByEntity),
        deleted_total: deletedTotal,
      });

      pushLog(`Purge complete. ${purgeDryRun ? "Dry run." : "Deleted."}`);
    } catch (e) {
      pushLog(`❌ Purge failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runSchoolDedupe() {
    if (!requireAdminOrLog()) return;
    const School = pickEntity("School");
    if (!School?.filter || !School?.delete || !School?.update) {
      return pushLog("❌ School entity missing filter/update/delete.");
    }

    setBusy(true);
    const startedAt = new Date().toISOString();

    try {
      pushLog(`School dedupe start. Mode=${dedupeMode} DryRun=${dedupeDryRun}`);

      const all = await filterAll(School, {});
      pushLog(`Loaded School rows: ${all.length}`);

      const groups = buildGroups(all, dedupeMode);
      let entries = [...groups.entries()].filter(([, rows]) => rows.length >= dedupeMinGroupSize);

      if (dedupeMode === "name_state" && dedupeSkipNoState) {
        entries = entries.filter(([k]) => !k.endsWith("::(no_state)"));
      }

      // Focus on true duplicates: same key with >1 rows
      entries = entries.filter(([, rows]) => rows.length > 1);
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

      const sample = [];

      for (const [key, rows] of limited) {
        const sorted = [...rows].sort((a, b) => scoreSchoolRow(b) - scoreSchoolRow(a));
        const keep = sorted[0];
        const keepId = getId(keep);
        if (!keepId) continue;

        const toDelete = sorted.slice(1).filter((r) => !!getId(r));
        if (!toDelete.length) continue;

        // Optional: if grouping by name_state, confirm names are really close (guardrail)
        if (dedupeMode === "name_state") {
          const kn = normName(keep?.school_name || "");
          for (const d of toDelete) {
            const dn = normName(d?.school_name || "");
            // If normalization differs a lot, still proceed, but log it
            if (kn && dn && kn !== dn) {
              pushLog(`⚠️ name_state group mismatch inside group key=${key}: keep="${keep?.school_name}" del="${d?.school_name}"`);
            }
          }
        }

        keptSchools += 1;

        if (sample.length < 25) {
          sample.push({
            mode: dedupeMode,
            group_key: key,
            keep_id: keepId,
            keep_name: keep?.school_name,
            delete_ids: toDelete.map(getId),
            delete_names: toDelete.map((r) => r?.school_name),
          });
        }

        // For each dup: repoint foreign keys then delete
        for (const d of toDelete) {
          const delId = getId(d);
          if (!delId) continue;

          // 1) repoint child rows
          const repointRes = await repointForeignKeys({
            pushLog,
            dryRun: dedupeDryRun,
            keepSchoolId: keepId,
            deleteSchoolId: delId,
            delayMs: dedupeUpdateDelayMs,
          });

          const repointed = repointRes.reduce((acc, x) => acc + (x?.updated || 0), 0);
          repointedRowsTotal += repointed;

          // 2) delete the dup school
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
        sample_json: JSON.stringify(sample),
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

  async function runDiagnostics() {
    setBusy(true);
    try {
      pushLog("Diagnostics start");
      pushLog(`Entities available: ${entityKeys.length}`);
      pushLog(entityKeys.join(", "));

      const checks = [
        { name: "School", fields: ["school_name", "city", "state", "website_url", "logo_url", "division", "source_key"] },
        { name: "Camp", fields: ["name", "start_date", "school_id", "sport_id", "registration_url"] },
        { name: "CampDemo", fields: ["name", "start_date", "school_id", "sport_id", "registration_url"] },
        { name: "SchoolSport", fields: ["school_id", "sport_id", "org"] },
        { name: "SchoolSportSite", fields: ["school_id", "sport_id", "url"] },
      ];

      for (const c of checks) {
        const E = pickEntity(c.name);
        if (!E?.filter) {
          pushLog(`- ${c.name}: filter not available`);
          continue;
        }
        const rows = await filterAll(E, {});
        pushLog(`\n${c.name}: ${rows.length} rows`);
        for (const f of c.fields) {
          const missing = rows.filter((r) => r?.[f] === null || r?.[f] === undefined || safeStr(r?.[f]).trim() === "").length;
          const pct = rows.length ? Math.round((missing / rows.length) * 100) : 0;
          pushLog(`  - missing ${f}: ${missing} (${pct}%)`);
        }
      }

      // Discover fix check: camps with missing school_id
      const Camp = pickEntity("Camp");
      if (Camp?.filter) {
        const camps = await filterAll(Camp, {});
        const missingSchool = camps.filter((c) => !safeStr(c?.school_id).trim()).length;
        pushLog(`\nDiscover Fix Check: Camps missing school_id: ${missingSchool}`);
      }
    } catch (e) {
      pushLog(`❌ Diagnostics failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function invokePipeline(fnName, payload, { auto = false, untilDone = false } = {}) {
    if (!requireAdminOrLog()) return;
    setBusy(true);
    const startedAt = new Date().toISOString();
    const opId = `op_${fnName}_${Date.now()}`;

    try {
      pushLog(`▶ ${fnName} start (dryRun=${!!payload?.dryRun}) opId=${opId}`);

      let loops = 0;
      let last = null;
      do {
        loops += 1;
        if (loops > 40) {
          pushLog("Stopping auto-run after 40 loops (safety). Re-run to continue.");
          break;
        }

        const raw = await withRetries(
          () => base44.functions.invoke(fnName, payload),
          {
            tries: 6,
            baseDelayMs: 650,
            onRetry: ({ attempt, delayMs, err }) =>
              pushLog(`↻ invoke retry ${attempt} wait=${delayMs}ms err=${safeStr(err?.message || err)}`),
          }
        );
        const resp = unwrapInvokeResponse(raw);
        last = resp;

        if (resp?.error) {
          pushLog(`❌ ${fnName} error: ${safeStr(resp.error)}`);
          break;
        }

        pushLog(`↳ ${fnName} resp: ${safeStr(JSON.stringify({ stats: resp?.stats, done: resp?.done, cursor: resp?.cursor, pageNext: resp?.pageNext }))}`);

        if (untilDone && resp?.done === true) break;

        if (auto && untilDone) {
          await sleep(900);
        } else {
          break;
        }
      } while (auto && untilDone);

      await logAdminEvent({
        operation: fnName,
        dry_run: !!payload?.dryRun,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        op_id: opId,
        request_json: JSON.stringify(payload || {}),
        response_json: JSON.stringify(last || {}),
      });

      pushLog(`✅ ${fnName} complete.`);
    } catch (e) {
      pushLog(`❌ ${fnName} failed: ${safeStr(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  // --- UI ---
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
          Destructive actions are blocked unless Admin Mode is enabled (Profile → Admin).
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <TabBtn id="pipelines">Pipelines</TabBtn>
        <TabBtn id="purge">Purge / Reset</TabBtn>
        <TabBtn id="dedupe">Dedupe</TabBtn>
        <TabBtn id="diagnostics">Diagnostics</TabBtn>
      </div>

      {tab === "pipelines" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Phase 1: Seed Schools (Scorecard)</div>
            <div className="text-sm text-gray-700">
              Canonical institution master. Restart-safe checkpoint stored server-side.
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Per page</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={seedPerPage}
                  onChange={(e) => setSeedPerPage(Number(e.target.value || 0))}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Pages per call</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={seedPagesPerCall}
                  onChange={(e) => setSeedPagesPerCall(Number(e.target.value || 0))}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Max upserts per call</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={seedMaxUpserts}
                  onChange={(e) => setSeedMaxUpserts(Number(e.target.value || 0))}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Write delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={seedWriteDelayMs}
                  onChange={(e) => setSeedWriteDelayMs(Number(e.target.value || 0))}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={pipeDryRun ? "default" : "outline"}
                onClick={() => setPipeDryRun(true)}
                disabled={busy}
              >
                Dry run
              </Button>
              <Button
                variant={!pipeDryRun ? "default" : "outline"}
                onClick={() => setPipeDryRun(false)}
                disabled={busy}
              >
                Write
              </Button>

              <Button
                variant={autoRun ? "default" : "outline"}
                onClick={() => setAutoRun((v) => !v)}
                disabled={busy}
              >
                Auto-run: {autoRun ? "ON" : "OFF"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  invokePipeline(
                    "seedSchoolsMaster_scorecard",
                    {
                      dryRun: pipeDryRun,
                      resume: true,
                      perPage: seedPerPage,
                      maxPages: seedPagesPerCall,
                      maxUpserts: seedMaxUpserts,
                      writeDelayMs: seedWriteDelayMs,
                    },
                    { auto: autoRun, untilDone: true }
                  )
                }
                disabled={busy}
              >
                Run Scorecard seed
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Phase 2: Athletics membership enrich</div>
            <div className="text-sm text-gray-700">
              Fills division/subdivision/conference where available. Conservative matching.
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              {Object.keys(memberOrgs).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!memberOrgs[k]}
                    onChange={(e) => setMemberOrgs((p) => ({ ...p, [k]: e.target.checked }))}
                    disabled={busy}
                  />
                  {k}
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Max updates per call</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={memberMaxUpdates}
                  onChange={(e) => setMemberMaxUpdates(Number(e.target.value || 0))}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Write delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={memberWriteDelayMs}
                  onChange={(e) => setMemberWriteDelayMs(Number(e.target.value || 0))}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  invokePipeline(
                    "enrichSchools_athleticsMembership",
                    {
                      dryRun: pipeDryRun,
                      resume: true,
                      orgs: Object.entries(memberOrgs)
                        .filter(([, v]) => !!v)
                        .map(([k]) => k),
                      maxUpdates: memberMaxUpdates,
                      writeDelayMs: memberWriteDelayMs,
                    },
                    { auto: autoRun, untilDone: true }
                  )
                }
                disabled={busy}
              >
                Run membership enrich
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Phase 3: Sports catalog</div>
            <div className="text-sm text-gray-700">Seeds stable Sport rows (idempotent).</div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sportsOnlyMissing}
                onChange={(e) => setSportsOnlyMissing(e.target.checked)}
                disabled={busy}
              />
              Only create missing sports
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  invokePipeline(
                    "seedSportsCatalog",
                    {
                      dryRun: pipeDryRun,
                      onlyMissing: sportsOnlyMissing,
                    },
                    { auto: false, untilDone: false }
                  )
                }
                disabled={busy}
              >
                Seed Sports
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Phase 3: SchoolSports from Camps</div>
            <div className="text-sm text-gray-700">
              Camp-driven membership so Discover filters can work fast.
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Org</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={schoolSportsOrg}
                  onChange={(e) => setSchoolSportsOrg(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Max creates per call</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={schoolSportsMaxCreates}
                  onChange={(e) => setSchoolSportsMaxCreates(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Write delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={schoolSportsWriteDelayMs}
                  onChange={(e) => setSchoolSportsWriteDelayMs(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  invokePipeline(
                    "enrichSchoolSportsFromCamps",
                    {
                      dryRun: pipeDryRun,
                      resume: true,
                      org: schoolSportsOrg,
                      maxCreates: schoolSportsMaxCreates,
                      writeDelayMs: schoolSportsWriteDelayMs,
                    },
                    { auto: autoRun, untilDone: true }
                  )
                }
                disabled={busy}
              >
                Build SchoolSports
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-lg font-semibold">Phase 4: Logo backfill from domain</div>
            <div className="text-sm text-gray-700">
              Sets <code className="bg-gray-100 px-1 rounded">logo_url</code> using the school website domain.
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="space-y-1">
                <div className="text-gray-600">Max updates per call</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={logosMaxUpdates}
                  onChange={(e) => setLogosMaxUpdates(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>
              <label className="space-y-1">
                <div className="text-gray-600">Write delay (ms)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  value={logosWriteDelayMs}
                  onChange={(e) => setLogosWriteDelayMs(Number(e.target.value || 0))}
                  disabled={busy}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  invokePipeline(
                    "enrichSchools_logosFromDomain",
                    {
                      dryRun: pipeDryRun,
                      resume: true,
                      maxUpdates: logosMaxUpdates,
                      writeDelayMs: logosWriteDelayMs,
                    },
                    { auto: autoRun, untilDone: true }
                  )
                }
                disabled={busy}
              >
                Run logo backfill
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "purge" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Purge / Reset</div>
          <div className="text-sm text-gray-700">
            Select entities to wipe. This is destructive. Use Dry run first.
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            {Object.keys(purgeSelection).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!purgeSelection[k]}
                  onChange={(e) => setPurgeSelection((p) => ({ ...p, [k]: e.target.checked }))}
                  disabled={busy}
                />
                {k}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <label className="space-y-1">
              <div className="text-gray-600">Confirm</div>
              <input
                className="w-full border rounded px-2 py-1"
                placeholder='Type DELETE'
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="space-y-1">
              <div className="text-gray-600">Delay per delete (ms)</div>
              <input
                className="w-full border rounded px-2 py-1"
                type="number"
                value={purgePerDeleteDelayMs}
                onChange={(e) => setPurgePerDeleteDelayMs(Number(e.target.value || 0))}
                disabled={busy}
              />
            </label>
            <label className="space-y-1">
              <div className="text-gray-600">Delay between entities (ms)</div>
              <input
                className="w-full border rounded px-2 py-1"
                type="number"
                value={purgeBetweenEntitiesDelayMs}
                onChange={(e) => setPurgeBetweenEntitiesDelayMs(Number(e.target.value || 0))}
                disabled={busy}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
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
              Delete
            </Button>
            <Button onClick={runPurge} disabled={busy}>
              Run purge
            </Button>
          </div>

          <div className="text-xs text-gray-600">
            You said you will not reset again. Leave this tab alone unless you explicitly decide to.
          </div>
        </Card>
      )}

      {tab === "dedupe" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">School Dedupe (with merge)</div>
          <div className="text-sm text-gray-700">
            This dedupe will <b>repoint</b> Camp/CampDemo/SchoolSport/SchoolSportSite to the kept School before deleting the dup School.
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
                <option value="name_state">name + state (recommended for your case)</option>
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
                <option value="no">No (more aggressive)</option>
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

          <div className="text-xs text-gray-600">
            Recommended run: Mode = name + state, Dry run first, then Merge + delete.
          </div>
        </Card>
      )}

      {tab === "diagnostics" && (
        <Card className="p-4 space-y-3">
          <div className="text-lg font-semibold">Diagnostics</div>
          <div className="text-sm text-gray-700">Quick health checks and entity inventory.</div>
          <Button onClick={runDiagnostics} disabled={busy}>
            Run diagnostics
          </Button>
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
          style={{ maxHeight: 320 }}
        >
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>(no logs yet)</div>}
        </div>
      </Card>
    </div>
  );
}
