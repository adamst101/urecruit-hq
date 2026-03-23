// src/pages/AdminFactoryReset.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

/**
 * Factory Reset
 * - Deletes ingest + camp-dependent tables in dependency order
 * - Leaves reference tables alone (Sport, Position, AthleteProfile, Entitlement)
 *
 * Route: /AdminFactoryReset (Base44 file routing)
 */

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

async function entityList(Entity, whereObj) {
  if (!Entity) throw new Error("Entity is null/undefined.");
  const where = whereObj || {};

  if (typeof Entity.filter === "function") return asArray(await Entity.filter(where));

  if (typeof Entity.list === "function") {
    try {
      return asArray(await Entity.list({ where }));
    } catch {
      return asArray(await Entity.list(where));
    }
  }

  if (typeof Entity.findMany === "function") {
    try {
      return asArray(await Entity.findMany({ where }));
    } catch {
      return asArray(await Entity.findMany(where));
    }
  }

  if (typeof Entity.all === "function") return asArray(await Entity.all());

  throw new Error("Entity has no supported list method (filter/list/findMany/all).");
}

async function tryDelete(Entity, id) {
  if (!Entity || !id) return false;
  const fns = ["delete", "remove", "destroy"];
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    try {
      if (typeof Entity[fn] === "function") {
        await Entity[fn](String(id));
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

async function withRetry(fn, { maxRetries = 8 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      const m = lc(msg);
      const isRate =
        m.includes("rate limit") ||
        m.includes("rate-limit") ||
        m.includes("rate_limit") ||
        m.includes("too many requests") ||
        m.includes("429");
      const isNet = m.includes("network") || m.includes("fetch") || m.includes("timeout") || m.includes("gateway");

      if (!isRate && !isNet) throw e;

      attempt += 1;
      if (attempt > maxRetries) throw e;

      const backoff = Math.min(2500, 250 * Math.pow(2, attempt));
      await sleep(backoff);
    }
  }
}

function Card({ children }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4">{children}</div>;
}

function Button({ children, disabled, onClick, variant = "solid" }) {
  const base =
    "px-3 py-2 rounded-lg text-sm border transition disabled:opacity-50 disabled:cursor-not-allowed";
  const solid = "bg-slate-900 text-white border-slate-900 hover:bg-slate-800";
  const outline = "bg-white text-slate-900 border-slate-300 hover:bg-slate-50";
  return (
    <button className={`${base} ${variant === "outline" ? outline : solid}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export default function AdminFactoryReset() {
  const season = useSeasonAccess();

  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);
  const [dryRun, setDryRun] = useState(true);

  const canRun = useMemo(() => !!season?.accountId && !season?.isLoading, [season?.accountId, season?.isLoading]);

  const push = (m) => setLog((x) => [...x, m]);

  const E = base44 && base44.entities ? base44.entities : {};

  // IMPORTANT: order matters (children first)
  const purgePlan = useMemo(
    () => [
      { name: "UserCamp", entity: E.UserCamp || E.UserCamps },
      { name: "Registration", entity: E.Registration || E.Registrations },
      { name: "Favorite", entity: E.Favorite || E.Favorites },

      { name: "CampDecisionScore", entity: E.CampDecisionScore || E.CampDecisionScores },
      { name: "CampIntentHistory", entity: E.CampIntentHistory || E.CampIntentHistories },
      { name: "CampIntent", entity: E.CampIntent || E.CampIntents },

      { name: "ScenarioCamp", entity: E.ScenarioCamp || E.ScenarioCamps },
      { name: "Scenario", entity: E.Scenario || E.Scenarios },

      { name: "TargetSchoolHistory", entity: E.TargetSchoolHistory || E.TargetSchoolHistories },
      { name: "TargetSchool", entity: E.TargetSchool || E.TargetSchools },

      { name: "CampDemo", entity: E.CampDemo || E.CampDemos },
      { name: "Camp", entity: E.Camp || E.Camps },

      { name: "Event", entity: E.Event || E.Events },

      { name: "SchoolSportSite", entity: E.SchoolSportSite || E.SchoolSportSites },
      { name: "School", entity: E.School || E.Schools },
    ],
    [E]
  );

  // User-data-only purge — keeps Schools and Camps intact
  const userPurgePlan = useMemo(
    () => [
      { name: "CampDecisionScore", entity: E.CampDecisionScore || E.CampDecisionScores },
      { name: "CampIntentHistory", entity: E.CampIntentHistory || E.CampIntentHistories },
      { name: "CampIntent",        entity: E.CampIntent || E.CampIntents },
      { name: "Registration",      entity: E.Registration || E.Registrations },
      { name: "Favorite",          entity: E.Favorite || E.Favorites },
      { name: "UserCamp",          entity: E.UserCamp || E.UserCamps },
      { name: "ScenarioCamp",      entity: E.ScenarioCamp || E.ScenarioCamps },
      { name: "Scenario",          entity: E.Scenario || E.Scenarios },
      { name: "TargetSchoolHistory", entity: E.TargetSchoolHistory || E.TargetSchoolHistories },
      { name: "TargetSchool",      entity: E.TargetSchool || E.TargetSchools },
      { name: "Entitlement",       entity: E.Entitlement || E.Entitlements },
      { name: "AthleteProfile",    entity: E.AthleteProfile || E.AthleteProfiles },
    ],
    [E]
  );

  const [userPurgeDryRun, setUserPurgeDryRun] = useState(true);
  const [userPurgeWorking, setUserPurgeWorking] = useState(false);
  const [userPurgeLog, setUserPurgeLog] = useState([]);

  const pushU = (m) => setUserPurgeLog((x) => [...x, m]);

  const previewUserCounts = async () => {
    setUserPurgeLog([]);
    pushU(`Preview @ ${new Date().toISOString()}`);
    for (let i = 0; i < userPurgePlan.length; i++) {
      const t = userPurgePlan[i];
      if (!t.entity) { pushU(`- ${t.name}: entity not found (skipping)`); continue; }
      try {
        const rows = await withRetry(() => entityList(t.entity, {}));
        pushU(`- ${t.name}: ${rows.length}`);
        await sleep(25);
      } catch (e) {
        pushU(`- ${t.name}: ERROR listing (${String(e?.message || e)})`);
      }
    }
    pushU("Preview complete.");
  };

  const runUserPurge = async () => {
    setUserPurgeWorking(true);
    setUserPurgeLog([]);
    pushU(`USER DATA PURGE START @ ${new Date().toISOString()}`);
    pushU(`Mode: ${userPurgeDryRun ? "DRY RUN (no deletes)" : "LIVE DELETE"}`);
    pushU("Schools, Camps, Sport, Position — untouched.");
    pushU("Note: delete non-admin user accounts via base44 dashboard → Users after this.");
    try {
      for (let i = 0; i < userPurgePlan.length; i++) {
        const t = userPurgePlan[i];
        if (!t.entity) { pushU(`[SKIP] ${t.name}: entity not found`); continue; }
        pushU(`\n[STEP] ${t.name}: listing…`);
        const rows = await withRetry(() => entityList(t.entity, {}));
        const ids = rows.map((r) => r?.id ? String(r.id) : null).filter(Boolean);
        pushU(`[STEP] ${t.name}: ${ids.length} rows`);
        if (ids.length === 0) continue;
        if (userPurgeDryRun) { pushU(`[DRY] ${t.name}: would delete ${ids.length}`); continue; }
        let ok = 0, fail = 0;
        for (let j = 0; j < ids.length; j++) {
          try {
            const deleted = await withRetry(() => tryDelete(t.entity, ids[j]));
            if (deleted) ok++; else fail++;
          } catch { fail++; }
          if ((j + 1) % 25 === 0) {
            pushU(`[PROGRESS] ${t.name}: ${j + 1}/${ids.length} ok=${ok} fail=${fail}`);
            await sleep(120);
          } else {
            await sleep(20);
          }
        }
        pushU(`[DONE] ${t.name}: ok=${ok} fail=${fail}`);
      }
      pushU("\nUSER DATA PURGE COMPLETE ✅");
      pushU("Next: delete non-admin user accounts via base44 dashboard → Users.");
    } catch (e) {
      pushU(`\n❌ PURGE FAILED: ${String(e?.message || e)}`);
    } finally {
      setUserPurgeWorking(false);
    }
  };

  const previewCounts = async () => {
    setLog([]);
    push(`Preview @ ${new Date().toISOString()}`);
    for (let i = 0; i < purgePlan.length; i++) {
      const t = purgePlan[i];
      if (!t.entity) {
        push(`- ${t.name}: entity not found (skipping)`);
        continue;
      }
      try {
        const rows = await withRetry(() => entityList(t.entity, {}));
        push(`- ${t.name}: ${rows.length}`);
        await sleep(25);
      } catch (e) {
        push(`- ${t.name}: ERROR listing (${String(e?.message || e)})`);
      }
    }
    push("Preview complete.");
  };

  const runPurge = async () => {
    setWorking(true);
    setLog([]);

    const runId = `reset_${new Date().toISOString()}`;
    push(`FACTORY RESET START @ ${runId}`);
    push(`Mode: ${dryRun ? "DRY RUN (no deletes)" : "LIVE DELETE"}`);
    push("Note: This will invalidate Camp/School IDs. That is intentional.");

    try {
      for (let i = 0; i < purgePlan.length; i++) {
        const t = purgePlan[i];
        if (!t.entity) {
          push(`[SKIP] ${t.name}: entity not found`);
          continue;
        }

        push(`\n[STEP] ${t.name}: listing…`);
        const rows = await withRetry(() => entityList(t.entity, {}));
        const ids = rows.map((r) => (r && r.id ? String(r.id) : null)).filter(Boolean);

        push(`[STEP] ${t.name}: rows=${ids.length}`);
        if (ids.length === 0) continue;

        if (dryRun) {
          push(`[DRY] ${t.name}: would delete ${ids.length}`);
          continue;
        }

        let ok = 0;
        let fail = 0;

        for (let j = 0; j < ids.length; j++) {
          const id = ids[j];

          try {
            const deleted = await withRetry(() => tryDelete(t.entity, id));
            if (deleted) ok += 1;
            else fail += 1;
          } catch {
            fail += 1;
          }

          // Throttle to reduce 429s
          if ((j + 1) % 25 === 0) {
            push(`[PROGRESS] ${t.name}: ${j + 1}/${ids.length} deleted_ok=${ok} failed=${fail}`);
            await sleep(120);
          } else {
            await sleep(20);
          }
        }

        push(`[DONE] ${t.name}: deleted_ok=${ok} failed=${fail}`);
      }

      push("\nFACTORY RESET COMPLETE ✅");
      push("Next steps:");
      push("1) Go to /AdminImport");
      push("2) Run SportsUSA Seed Schools");
      push("3) Run SportsUSA Ingest Camps");
      push("4) Open /Discover to validate");
    } catch (e) {
      push(`\n❌ RESET FAILED: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  if (!canRun) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-3xl mx-auto">
          <Card>
            <div className="text-lg font-semibold">Admin Factory Reset</div>
            <div className="text-sm text-slate-600 mt-2">Sign in first.</div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <Card>
          <div className="text-xl font-bold text-slate-900">Factory Reset (ingest + camps)</div>
          <div className="text-sm text-slate-600 mt-2">
            Deletes Schools, SchoolSportSites, Camps, and all dependent user/camp tables. Preserves Sport/Position.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run (no deletes)
            </label>

            <Button variant="outline" disabled={working} onClick={previewCounts}>
              Preview counts
            </Button>

            <Button disabled={working} onClick={runPurge}>
              {working ? "Working…" : dryRun ? "Run dry reset" : "DELETE + RESET NOW"}
            </Button>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Tip: run Preview first. Then uncheck Dry run and execute.
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-slate-900">Log</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
        </Card>

        {/* ── USER DATA PURGE ── */}
        <Card>
          <div className="text-xl font-bold text-slate-900">🧹 Pre-Launch User Data Purge</div>
          <div className="text-sm text-slate-600 mt-2">
            Deletes all athlete profiles, entitlements, camp intents, registrations, favorites, and scenarios.
            <strong className="text-slate-900"> Schools and Camps are NOT touched.</strong>
          </div>
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ After running, manually delete non-admin user accounts via the base44 dashboard → Users.
          </div>

          <div className="mt-4 text-xs text-slate-500 font-medium uppercase tracking-wide">Will delete:</div>
          <ul className="mt-1 text-xs text-slate-600 list-disc list-inside space-y-0.5">
            {["AthleteProfile", "Entitlement", "CampIntent", "CampIntentHistory", "CampDecisionScore",
              "Registration", "Favorite", "UserCamp", "Scenario", "ScenarioCamp",
              "TargetSchool", "TargetSchoolHistory"].map(n => <li key={n}>{n}</li>)}
          </ul>
          <div className="mt-2 text-xs text-green-700">✓ Preserved: School, Camp, SchoolSportSite, Sport, Position</div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={userPurgeDryRun} onChange={(e) => setUserPurgeDryRun(e.target.checked)} />
              Dry run (no deletes)
            </label>
            <Button variant="outline" disabled={userPurgeWorking} onClick={previewUserCounts}>
              Preview counts
            </Button>
            <Button disabled={userPurgeWorking} onClick={runUserPurge}>
              {userPurgeWorking ? "Working…" : userPurgeDryRun ? "Run dry purge" : "DELETE USER DATA NOW"}
            </Button>
          </div>
          <div className="mt-3 text-xs text-slate-500">Tip: run Preview first, then uncheck Dry run and execute.</div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-slate-900">User Purge Log</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{userPurgeLog.join("\n")}</pre>
        </Card>
      </div>
    </div>
  );
}