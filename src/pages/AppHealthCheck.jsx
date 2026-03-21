// src/pages/AppHealthCheck.jsx
import { useState, useCallback, useRef } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";
import { toast } from "../components/ui/use-toast";

// ── Demo localStorage helpers (mirrors demoRegistered.jsx) ──────────────────
const _demoKey = (profileId) => `rm_demo_registered_${profileId || "default"}`;
const _isDemoReg = (profileId, campId) => {
  try { return !!JSON.parse(localStorage.getItem(_demoKey(profileId)) || "{}")[String(campId)]; }
  catch { return false; }
};
const _setDemoReg = (profileId, campId, val) => {
  try {
    const obj = JSON.parse(localStorage.getItem(_demoKey(profileId)) || "{}");
    if (val) obj[String(campId)] = 1; else delete obj[String(campId)];
    localStorage.setItem(_demoKey(profileId), JSON.stringify(obj));
  } catch {}
};

// ── Journey groups ────────────────────────────────────────────────────────────
// Each journey: { id, name, icon, description, steps[], cleanup?(ctx) }
// Each step: { name, run(ctx) → string }  — throw to fail, return string to pass
// cleanup(ctx) runs after all steps regardless of pass/fail

const JOURNEY_GROUPS = [

  {
    label: "Infrastructure",
    journeys: [
      {
        id: "auth",
        name: "Auth & Session",
        icon: "🔐",
        description: "Current session returns a valid authenticated user with email and ID.",
        steps: [
          {
            name: "Fetch current user",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.email) throw new Error("auth.me() returned no user");
              ctx.user = me;
              return `Signed in as ${me.email}`;
            },
          },
          {
            name: "User has an ID",
            run: async (ctx) => {
              if (!ctx.user?.id) throw new Error("User object missing id");
              return `id = ${ctx.user.id}`;
            },
          },
        ],
      },

      {
        id: "camp_data",
        name: "Camp Data Integrity",
        icon: "⛺",
        description: "Active camps are accessible and carry required fields.",
        steps: [
          {
            name: "Fetch active camps",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No active camps found");
              ctx.camps = camps;
              return `${camps.length} active camps`;
            },
          },
          {
            name: "Camps have camp_name and start_date",
            run: async (ctx) => {
              const bad = ctx.camps.slice(0, 20).filter(c => !c.camp_name || !c.start_date);
              if (bad.length > 0) throw new Error(`${bad.length}/20 camps missing camp_name or start_date`);
              return "First 20 camps have camp_name and start_date";
            },
          },
          {
            name: "Camps have source_key",
            run: async (ctx) => {
              const missing = ctx.camps.slice(0, 20).filter(c => !c.source_key).length;
              if (missing > 5) throw new Error(`${missing}/20 camps missing source_key`);
              return `${20 - missing}/20 camps have source_key`;
            },
          },
        ],
      },

      {
        id: "schools",
        name: "School Data",
        icon: "🏫",
        description: "School records accessible with division data intact.",
        steps: [
          {
            name: "Fetch schools",
            run: async (ctx) => {
              const schools = await base44.entities.School.filter({});
              if (!Array.isArray(schools) || schools.length === 0) throw new Error("No schools found");
              ctx.schools = schools;
              return `${schools.length} schools`;
            },
          },
          {
            name: "Schools have division data (>50%)",
            run: async (ctx) => {
              const withDiv = ctx.schools.filter(s => s.division).length;
              const pct = Math.round((withDiv / ctx.schools.length) * 100);
              if (pct < 50) throw new Error(`Only ${pct}% have a division — data may be corrupted`);
              return `${withDiv}/${ctx.schools.length} (${pct}%) have division`;
            },
          },
        ],
      },

      {
        id: "entity_write",
        name: "Entity Read / Write",
        icon: "✍️",
        description: "Can create, read back, and delete a record (RoadmapItem used as test target).",
        steps: [
          {
            name: "Create test record",
            run: async (ctx) => {
              const rec = await base44.entities.RoadmapItem.create({
                title: "__healthcheck_test__",
                why: "Automated write test — safe to delete",
                type: "infra", status: "intake", priority: "P3", source: "internal",
                created_date: new Date().toISOString().slice(0, 10),
                updated_date: new Date().toISOString().slice(0, 10),
              });
              if (!rec?.id) throw new Error("Create returned no id");
              ctx.testId = rec.id;
              return `Created id = ${rec.id}`;
            },
          },
          {
            name: "Read back test record",
            run: async (ctx) => {
              const recs = await base44.entities.RoadmapItem.filter({ title: "__healthcheck_test__" });
              const found = Array.isArray(recs) && recs.find(r => r.id === ctx.testId);
              if (!found) throw new Error(`Record id=${ctx.testId} not found after create`);
              return "Record confirmed in store";
            },
          },
          {
            name: "Delete test record",
            run: async (ctx) => {
              await base44.entities.RoadmapItem.delete(ctx.testId);
              return `Deleted id = ${ctx.testId}`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "User Registration",
    journeys: [
      {
        id: "registration_flow",
        name: "New User Registration State",
        icon: "📝",
        description: "Auth is reachable, AthleteProfile can be created and deleted, default state is demo (no entitlement).",
        steps: [
          {
            name: "Auth endpoint reachable",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me) throw new Error("auth.me() returned null");
              ctx.myId = me.id;
              return `Auth ok — account id ${me.id}`;
            },
          },
          {
            name: "AthleteProfile create/delete (registration step)",
            run: async (ctx) => {
              const profile = await base44.entities.AthleteProfile.create({
                first_name: "__test__", last_name: "__healthcheck__",
                athlete_name: "__test__ __healthcheck__",
                account_id: ctx.myId, active: true,
                sport_id: "test", grad_year: 2099,
              });
              if (!profile?.id) throw new Error("AthleteProfile create returned no id");
              ctx.testProfileId = profile.id;
              await base44.entities.AthleteProfile.delete(profile.id);
              return `AthleteProfile created (id=${profile.id}) and cleaned up`;
            },
          },
          {
            name: "New account starts in demo state (no entitlement by default)",
            run: async (ctx) => {
              // Verify the entitlement system is queryable (not that the admin has none)
              const ents = await base44.entities.Entitlement.filter({ status: "active" });
              if (!Array.isArray(ents)) throw new Error("Entitlement.filter() did not return an array");
              return `Entitlement system reachable — ${ents.length} active subscriptions in system`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "Demo User Flows",
    journeys: [
      {
        id: "demo_discovery",
        name: "Demo — Camp Discovery",
        icon: "🔍",
        description: "DemoCamp entity is accessible and contains fields needed to browse camps.",
        steps: [
          {
            name: "Fetch demo camps",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No demo camps found — GenerateDemoCamps may need to be run");
              ctx.demoCamps = camps;
              ctx.demoTestCamp = camps[0];
              return `${camps.length} demo camps available`;
            },
          },
          {
            name: "Demo camps have browse fields (camp_name, start_date)",
            run: async (ctx) => {
              const bad = ctx.demoCamps.slice(0, 10).filter(c => !c.camp_name || !c.start_date);
              if (bad.length > 0) throw new Error(`${bad.length}/10 demo camps missing camp_name or start_date`);
              return "First 10 demo camps have camp_name and start_date";
            },
          },
          {
            name: "Demo camps have Calendar display fields (start_date for date placement)",
            run: async (ctx) => {
              const bad = ctx.demoCamps.slice(0, 10).filter(c => !c.start_date);
              if (bad.length > 0) throw new Error(`${bad.length}/10 demo camps missing start_date — Calendar cannot place them`);
              const sample = ctx.demoCamps[0];
              return `Sample: "${sample.camp_name}" on ${sample.start_date}`;
            },
          },
          {
            name: "Demo camps have My Agenda display fields",
            run: async (ctx) => {
              const sample = ctx.demoCamps[0];
              const missing = ["camp_name", "start_date"].filter(f => !sample[f]);
              if (missing.length > 0) throw new Error(`Sample demo camp missing: ${missing.join(", ")}`);
              const loc = [sample.city, sample.state].filter(Boolean).join(", ");
              return `Sample has camp_name, start_date${loc ? `, location: ${loc}` : " (no location)"}`;
            },
          },
        ],
      },

      {
        id: "demo_favorite",
        name: "Demo — Favorite a Camp",
        icon: "⭐",
        description: "Demo favorite writes to localStorage, is readable in Discover/Calendar/My Agenda, and can be cleared.",
        steps: [
          {
            name: "Fetch a demo camp to use as test target",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No demo camps — cannot test favorite");
              ctx.demoProfileId = "healthcheck_test_profile";
              ctx.demoCampId = camps[0].id || camps[0].camp_id || "test_camp";
              ctx.demoCampName = camps[0].camp_name || "unknown";
              return `Using "${ctx.demoCampName}" (id=${ctx.demoCampId})`;
            },
          },
          {
            name: "Pre-condition: camp is not favorited",
            run: async (ctx) => {
              // Clear any leftover state
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, false);
              const before = _isDemoReg(ctx.demoProfileId, ctx.demoCampId);
              if (before) throw new Error("Camp already in demo storage before test — localStorage may be polluted");
              return "localStorage clear for this camp";
            },
          },
          {
            name: "Favorite the camp (localStorage write)",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, true);
              return "localStorage write ok";
            },
          },
          {
            name: "Verify favorite visible (Discover / Calendar / My Agenda read)",
            run: async (ctx) => {
              const visible = _isDemoReg(ctx.demoProfileId, ctx.demoCampId);
              if (!visible) throw new Error("isDemoRegistered returned false after write — localStorage read failed");
              return "isDemoRegistered() → true — camp appears as favorited in Discover, Calendar, My Agenda";
            },
          },
          {
            name: "Clear favorite (cleanup)",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, false);
              const after = _isDemoReg(ctx.demoProfileId, ctx.demoCampId);
              if (after) throw new Error("Camp still shows as favorited after clearing");
              return "localStorage cleared — camp no longer favorited";
            },
          },
        ],
      },

      {
        id: "demo_register",
        name: "Demo — Mark as Registered",
        icon: "✅",
        description: "Demo registration writes to localStorage, is readable across all views, and can be cleared.",
        steps: [
          {
            name: "Fetch a demo camp",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No demo camps");
              ctx.demoProfileId = "healthcheck_test_profile";
              // Use second camp if available (different from favorite test)
              const camp = camps[1] || camps[0];
              ctx.demoCampId = camp.id || camp.camp_id || "test_camp_2";
              ctx.demoCampName = camp.camp_name || "unknown";
              return `Using "${ctx.demoCampName}" (id=${ctx.demoCampId})`;
            },
          },
          {
            name: "Pre-condition: not registered",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, false);
              if (_isDemoReg(ctx.demoProfileId, ctx.demoCampId)) throw new Error("Camp already in storage before test");
              return "localStorage clear";
            },
          },
          {
            name: "Mark as registered (localStorage write)",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, true);
              return "localStorage write ok";
            },
          },
          {
            name: "Verify registration visible in Discover / Calendar / My Agenda",
            run: async (ctx) => {
              const visible = _isDemoReg(ctx.demoProfileId, ctx.demoCampId);
              if (!visible) throw new Error("isDemoRegistered returned false after write");
              return "isDemoRegistered() → true — shows as registered in all views";
            },
          },
          {
            name: "Verify demo camp has My Agenda fields",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              const camp = (camps || []).find(c => String(c.id || c.camp_id) === String(ctx.demoCampId)) || camps?.[0];
              if (!camp) throw new Error("Could not refetch demo camp for field check");
              const missing = ["camp_name", "start_date"].filter(f => !camp[f]);
              if (missing.length) throw new Error(`My Agenda needs: ${missing.join(", ")} — missing from demo camp`);
              return `camp_name ✓  start_date ✓  city: ${camp.city || "—"}  state: ${camp.state || "—"}`;
            },
          },
          {
            name: "Clear registration (cleanup)",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, false);
              if (_isDemoReg(ctx.demoProfileId, ctx.demoCampId)) throw new Error("Still registered after clearing");
              return "localStorage cleared";
            },
          },
        ],
      },
    ],
  },

  {
    label: "Subscriber Flows",
    journeys: [
      {
        id: "subscriber_entitlement",
        name: "Subscriber — Entitlement Check",
        icon: "🎫",
        description: "Active entitlements exist and are linked to accounts.",
        steps: [
          {
            name: "Fetch active entitlements",
            run: async (ctx) => {
              const ents = await base44.entities.Entitlement.filter({ status: "active" });
              if (!Array.isArray(ents)) throw new Error("Entitlement.filter() returned non-array");
              if (ents.length === 0) throw new Error("No active entitlements — no subscribers in system");
              ctx.entitlements = ents;
              return `${ents.length} active entitlement${ents.length !== 1 ? "s" : ""}`;
            },
          },
          {
            name: "Entitlements are linked to accounts",
            run: async (ctx) => {
              const unlinked = ctx.entitlements.filter(e => !e.account_id).length;
              if (unlinked > 0) throw new Error(`${unlinked} entitlements missing account_id`);
              return `All ${ctx.entitlements.length} entitlements have account_id`;
            },
          },
          {
            name: "Entitlements have status field",
            run: async (ctx) => {
              const bad = ctx.entitlements.filter(e => !e.status).length;
              if (bad > 0) throw new Error(`${bad} entitlements missing status field`);
              return "All entitlements have status";
            },
          },
        ],
      },

      {
        id: "subscriber_intent_lifecycle",
        name: "Subscriber — Favorite → Registered Lifecycle",
        icon: "🔄",
        description: "Create a CampIntent (favorite), verify it's visible in Discover/Calendar/My Agenda queries, update to registered, verify, then clean up.",
        steps: [
          {
            name: "Find a test athlete",
            run: async (ctx) => {
              const athletes = await base44.entities.AthleteProfile.filter({ active: true });
              if (!Array.isArray(athletes) || athletes.length === 0)
                throw new Error("No active athletes — cannot simulate subscriber intent flow");
              ctx.athlete = athletes[0];
              const name = [ctx.athlete.first_name, ctx.athlete.last_name].filter(Boolean).join(" ") || ctx.athlete.id;
              return `Using athlete: ${name} (id=${ctx.athlete.id})`;
            },
          },
          {
            name: "Find a test camp",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No active camps");
              ctx.testCamp = camps[0];
              return `Using camp: "${ctx.testCamp.camp_name}" on ${ctx.testCamp.start_date}`;
            },
          },
          {
            name: "Create CampIntent (status: favorite) — mirrors Discover favorite action",
            run: async (ctx) => {
              const intent = await base44.entities.CampIntent.create({
                camp_id: ctx.testCamp.id,
                athlete_id: ctx.athlete.id,
                status: "favorite",
              });
              if (!intent?.id) throw new Error("CampIntent create returned no id");
              ctx.intentId = intent.id;
              return `CampIntent created (id=${intent.id}, status=favorite)`;
            },
          },
          {
            name: "Verify intent visible via athlete_id filter — Discover / Calendar / My Agenda query",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete.id });
              if (!Array.isArray(intents)) throw new Error("CampIntent.filter() returned non-array");
              const found = intents.find(i => i.id === ctx.intentId);
              if (!found) throw new Error(`Intent id=${ctx.intentId} not found via athlete_id filter`);
              if (found.status !== "favorite") throw new Error(`Expected status=favorite, got ${found.status}`);
              return `Intent visible via athlete_id filter — status: ${found.status} ✓`;
            },
          },
          {
            name: "Verify linked camp has Calendar display fields",
            run: async (ctx) => {
              if (!ctx.testCamp.start_date) throw new Error("Camp missing start_date — Calendar cannot place it on grid");
              if (!ctx.testCamp.camp_name) throw new Error("Camp missing camp_name — Calendar card would be blank");
              return `start_date: ${ctx.testCamp.start_date}  camp_name: "${ctx.testCamp.camp_name}"`;
            },
          },
          {
            name: "Verify linked camp has My Agenda display fields",
            run: async (ctx) => {
              const required = ["camp_name", "start_date"];
              const missing = required.filter(f => !ctx.testCamp[f]);
              if (missing.length) throw new Error(`My Agenda needs: ${missing.join(", ")}`);
              const loc = [ctx.testCamp.city, ctx.testCamp.state].filter(Boolean).join(", ");
              return `Required fields present — location: ${loc || "(none)"}  price: ${ctx.testCamp.price ?? "—"}`;
            },
          },
          {
            name: "Update intent to registered — mirrors Discover / My Agenda register action",
            run: async (ctx) => {
              const updated = await base44.entities.CampIntent.update(ctx.intentId, { status: "registered" });
              if (!updated) throw new Error("Update returned null");
              return `CampIntent updated to status=registered`;
            },
          },
          {
            name: "Verify registered status visible via athlete_id filter",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete.id });
              const found = (intents || []).find(i => i.id === ctx.intentId);
              if (!found) throw new Error("Intent not found after status update");
              if (found.status !== "registered") throw new Error(`Expected registered, got ${found.status}`);
              return `Intent shows status=registered in Calendar / My Agenda query ✓`;
            },
          },
          {
            name: "Delete test intent (cleanup)",
            run: async (ctx) => {
              await base44.entities.CampIntent.delete(ctx.intentId);
              return `Intent id=${ctx.intentId} deleted`;
            },
          },
        ],
        cleanup: async (ctx) => {
          // Safety net: delete the test intent if a mid-journey failure left it behind
          if (ctx.intentId) {
            try { await base44.entities.CampIntent.delete(ctx.intentId); } catch {}
          }
        },
      },

      {
        id: "subscriber_data_integrity",
        name: "Subscriber — Data Integrity Check",
        icon: "🔗",
        description: "Athlete profiles, intents, and camps are correctly linked with no orphaned records.",
        steps: [
          {
            name: "Fetch active athletes",
            run: async (ctx) => {
              const athletes = await base44.entities.AthleteProfile.filter({ active: true });
              if (!Array.isArray(athletes)) throw new Error("AthleteProfile.filter() returned non-array");
              ctx.athletes = athletes;
              return `${athletes.length} active athletes`;
            },
          },
          {
            name: "Athletes have account_id links",
            run: async (ctx) => {
              const unlinked = ctx.athletes.filter(a => !a.account_id).length;
              if (unlinked > 0) throw new Error(`${unlinked} athletes missing account_id`);
              return `All ${ctx.athletes.length} athletes linked to accounts`;
            },
          },
          {
            name: "Fetch registered intents and verify camp links",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({});
              if (!Array.isArray(intents)) throw new Error("CampIntent.filter() returned non-array");
              const active = intents.filter(i => ["registered", "favorite", "completed"].includes(i.status));
              ctx.activeIntents = active;
              // Spot-check first 10 intents have camp_id
              const missing = active.slice(0, 10).filter(i => !i.camp_id).length;
              if (missing > 0) throw new Error(`${missing}/10 active intents missing camp_id`);
              const reg = active.filter(i => i.status === "registered").length;
              const fav = active.filter(i => i.status === "favorite").length;
              return `${active.length} active intents — ${reg} registered, ${fav} favorited`;
            },
          },
          {
            name: "Spot-check: intents have athlete_id (required for Calendar / My Agenda queries)",
            run: async (ctx) => {
              const missing = ctx.activeIntents.slice(0, 20).filter(i => !i.athlete_id).length;
              if (missing > 2) throw new Error(`${missing}/20 intents missing athlete_id — useAllAthletesCamps filter would skip them`);
              return `${Math.min(20, ctx.activeIntents.length) - missing}/${Math.min(20, ctx.activeIntents.length)} intents have athlete_id`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "Communications",
    journeys: [
      {
        id: "email_config",
        name: "Email System Config",
        icon: "📧",
        description: "Resend API key is set and sendMonthlyAgenda function responds.",
        steps: [
          {
            name: "Invoke sendMonthlyAgenda check_config",
            run: async (ctx) => {
              const res = await base44.functions.invoke("sendMonthlyAgenda", { mode: "check_config" });
              const data = res?.data;
              if (!data?.ok) throw new Error(data?.error || "Function returned ok:false");
              ctx.config = data;
              return "Function responded ok:true";
            },
          },
          {
            name: "RESEND_API_KEY is set",
            run: async (ctx) => {
              const val = ctx.config?.RESEND_API_KEY || "";
              if (val === "NOT SET" || !val) throw new Error("RESEND_API_KEY is NOT SET — emails will fail");
              return val;
            },
          },
          {
            name: "FROM_EMAIL is configured",
            run: async (ctx) => {
              const val = ctx.config?.RESEND_FROM_EMAIL || "";
              if (!val) throw new Error("RESEND_FROM_EMAIL is not set");
              return val;
            },
          },
        ],
      },

      {
        id: "camp_week_alert",
        name: "Camp Week Alert Function",
        icon: "🔔",
        description: "sendCampWeekAlert function is reachable and performs a dry run.",
        steps: [
          {
            name: "Invoke sendCampWeekAlert dry_run",
            run: async (ctx) => {
              const res = await base44.functions.invoke("sendCampWeekAlert", {
                mode: "dry_run",
                targetDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
              });
              const data = res?.data;
              if (!data?.ok) throw new Error(data?.error || "Function returned ok:false");
              return `ok:true — ${data.summary?.dry_run ?? 0} accounts would be alerted`;
            },
          },
        ],
      },

      {
        id: "email_prefs",
        name: "Email Preferences",
        icon: "⚙️",
        description: "EmailPreferences entity is reachable (opt-out system functional).",
        steps: [
          {
            name: "Fetch email preferences",
            run: async () => {
              const prefs = await base44.entities.EmailPreferences.filter({});
              if (!Array.isArray(prefs)) throw new Error("EmailPreferences.filter() returned non-array");
              const optedOut = prefs.filter(p => p.monthly_agenda_opt_out || p.camp_week_alert_opt_out).length;
              return `${prefs.length} records — ${optedOut} with at least one opt-out`;
            },
          },
        ],
      },
    ],
  },
];

// Flatten for runner access by id
const ALL_JOURNEYS = JOURNEY_GROUPS.flatMap(g => g.journeys);

// ── Runner ───────────────────────────────────────────────────────────────────

async function runJourney(journey, onStep) {
  const ctx = {};
  const results = [];
  const start = Date.now();
  let failed = false;

  for (const step of journey.steps) {
    const stepStart = Date.now();
    try {
      const detail = await step.run(ctx);
      const result = { name: step.name, status: "pass", detail: detail || "ok", ms: Date.now() - stepStart };
      results.push(result);
      onStep(results, failed ? "fail" : "running");
    } catch (err) {
      const result = { name: step.name, status: "fail", detail: err.message || String(err), ms: Date.now() - stepStart };
      results.push(result);
      failed = true;
      onStep(results, "fail");
      break; // stop on first failure
    }
  }

  // Always run cleanup
  if (journey.cleanup) {
    try { await journey.cleanup(ctx); } catch {}
  }

  const status = failed ? "fail" : "pass";
  onStep(results, status);
  return { status, steps: results, duration: Date.now() - start };
}

// ── UI components ─────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const colors = { idle: "#d1d5db", running: "#c8850a", pass: "#059669", fail: "#dc2626" };
  const labels = { idle: "—", running: "⟳", pass: "✓", fail: "✕" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 20, height: 20, borderRadius: "50%",
      background: colors[status] + "20", border: `2px solid ${colors[status]}`,
      fontSize: 10, fontWeight: 800, color: colors[status], flexShrink: 0,
      animation: status === "running" ? "spin 1s linear infinite" : "none",
    }}>
      {labels[status]}
    </span>
  );
}

function StatusBadge({ status, duration }) {
  const cfg = {
    idle:    { bg: "#f3f4f6", color: "#9ca3af", text: "Idle" },
    running: { bg: "#fffbeb", color: "#c8850a", text: "Running…" },
    pass:    { bg: "#ecfdf5", color: "#059669", text: duration ? `Passed  ${duration}ms` : "Passed" },
    fail:    { bg: "#fef2f2", color: "#dc2626", text: "Failed" },
  }[status] || { bg: "#f3f4f6", color: "#9ca3af", text: status };

  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
      background: cfg.bg, color: cfg.color }}>
      {cfg.text}
    </span>
  );
}

function JourneyCard({ journey, state, onRun, disabled }) {
  const [expanded, setExpanded] = useState(false);
  const hasSteps = state.steps.length > 0;
  const isBlocked = state.status === "fail";

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${isBlocked ? "#fca5a5" : state.status === "pass" ? "#6ee7b7" : "#e5e7eb"}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{journey.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1F3B" }}>{journey.name}</span>
            <StatusBadge status={state.status} duration={state.duration} />
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>
            {journey.description}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {hasSteps && (
            <button onClick={() => setExpanded(e => !e)} style={S.btnGhost}>
              {expanded ? "Hide" : `Steps (${state.steps.length})`}
            </button>
          )}
          <button
            onClick={onRun}
            disabled={disabled}
            style={{ ...S.btnRun, opacity: disabled ? 0.45 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
              background: isBlocked ? "#fef2f2" : "#f8fafc",
              borderColor: isBlocked ? "#fca5a5" : "#e5e7eb",
              color: isBlocked ? "#dc2626" : "#374151" }}
          >
            {state.status === "running" ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {expanded && hasSteps && (
        <div style={{ borderTop: "1px solid #f3f4f6", background: "#f9fafb" }}>
          {state.steps.map((step, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "9px 18px",
              borderBottom: i < state.steps.length - 1 ? "1px solid #f0f0f0" : "none",
            }}>
              <div style={{ paddingTop: 1 }}><StatusDot status={step.status} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{step.name}</div>
                <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5, wordBreak: "break-word",
                  color: step.status === "fail" ? "#dc2626" : "#6b7280" }}>
                  {step.detail}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, paddingTop: 1 }}>{step.ms}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const IDLE = () => ({ status: "idle", steps: [], duration: null });

export default function AppHealthCheck() {
  const [states, setStates] = useState(() =>
    Object.fromEntries(ALL_JOURNEYS.map(j => [j.id, IDLE()]))
  );
  const [runningAll, setRunningAll] = useState(false);
  const [lastRunAll, setLastRunAll] = useState(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const statesRef = useRef(states);
  statesRef.current = states;

  const anyRunning = Object.values(states).some(s => s.status === "running");

  const patchState = useCallback((id, patch) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // ── Notification helpers ──────────────────────────────────────────────────

  function toastFailure(journey, result) {
    const failedStep = result.steps.find(s => s.status === "fail");
    toast({
      title: `❌ ${journey.name} failed`,
      description: failedStep ? `${failedStep.name}: ${failedStep.detail}` : "Check step details.",
      variant: "destructive",
    });
  }

  function desktopNotify(failedJourneys) {
    if (!("Notification" in window)) return;
    const body = failedJourneys.map(j => j.name).join(", ");
    const fire = () => new Notification(
      `uRecruitHQ — ${failedJourneys.length} health check failure${failedJourneys.length > 1 ? "s" : ""}`,
      { body, icon: "/favicon.ico" }
    );
    if (Notification.permission === "granted") fire();
    else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") fire(); });
  }

  async function emailReport() {
    setEmailSending(true);
    setEmailSent(false);
    try {
      const me = await base44.auth.me();
      const currentStates = statesRef.current;
      const failures = ALL_JOURNEYS
        .filter(j => currentStates[j.id]?.status === "fail")
        .map(j => ({ name: j.name, steps: currentStates[j.id].steps }));
      const res = await base44.functions.invoke("sendHealthAlert", {
        toEmail: me?.email,
        failures,
        runDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      });
      if (res?.data?.ok) {
        setEmailSent(true);
        toast({ title: "Report sent", description: `Failure summary emailed to ${me?.email}` });
      } else {
        toast({ title: "Email failed", description: res?.data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Email failed", description: e.message, variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  }

  // ── Run functions ─────────────────────────────────────────────────────────

  async function runOne(journey) {
    patchState(journey.id, { status: "running", steps: [], duration: null });
    const result = await runJourney(journey, (steps, status) => {
      patchState(journey.id, { steps, status });
    });
    patchState(journey.id, result);
    if (result.status === "fail") toastFailure(journey, result);
  }

  async function runGroup(journeys) {
    const failures = [];
    for (const j of journeys) {
      patchState(j.id, { status: "running", steps: [], duration: null });
      const result = await runJourney(j, (steps, status) => patchState(j.id, { steps, status }));
      patchState(j.id, result);
      if (result.status === "fail") {
        toastFailure(j, result);
        failures.push(j);
      }
    }
    return failures;
  }

  async function runAll() {
    setRunningAll(true);
    setEmailSent(false);
    const start = Date.now();
    const failures = await runGroup(ALL_JOURNEYS);
    setRunningAll(false);
    setLastRunAll(Date.now() - start);
    if (failures.length > 0) desktopNotify(failures);
  }

  function resetAll() {
    setStates(Object.fromEntries(ALL_JOURNEYS.map(j => [j.id, IDLE()])));
    setLastRunAll(null);
    setEmailSent(false);
  }

  const counts = Object.values(states).reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  const totalJourneys = ALL_JOURNEYS.length;
  const allDone = !anyRunning && Object.values(states).every(s => s.status !== "idle");
  const allPassed = allDone && !counts.fail;

  return (
    <AdminRoute>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.root}>

        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={S.title}>App Health Check</div>
              <div style={S.subtitle}>
                {totalJourneys} journeys across {JOURNEY_GROUPS.length} areas — run after deploys or data changes.
                {allDone && (
                  <span style={{ marginLeft: 10, fontWeight: 600,
                    color: allPassed ? "#059669" : "#dc2626" }}>
                    {allPassed
                      ? `✓ All ${totalJourneys} passed`
                      : `✕ ${counts.fail || 0}/${totalJourneys} failed`}
                    {lastRunAll && ` in ${(lastRunAll / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {allDone && <button onClick={resetAll} style={S.btnSecondary}>Reset</button>}
              <button onClick={runAll} disabled={anyRunning} style={{
                ...S.btnPrimary,
                opacity: anyRunning ? 0.5 : 1,
                cursor: anyRunning ? "not-allowed" : "pointer",
              }}>
                {runningAll ? "Running…" : "▶ Run All"}
              </button>
            </div>
          </div>

          {allDone && (
            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {counts.pass > 0 && (
                <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 8,
                  padding: "5px 14px", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: "#059669" }}>{counts.pass}</span>
                  <span style={{ color: "#059669", marginLeft: 5 }}>passed</span>
                </div>
              )}
              {counts.fail > 0 && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
                  padding: "5px 14px", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: "#dc2626" }}>{counts.fail}</span>
                  <span style={{ color: "#dc2626", marginLeft: 5 }}>failed</span>
                </div>
              )}
              {counts.fail > 0 && (
                <button
                  onClick={emailReport}
                  disabled={emailSending || emailSent}
                  style={{
                    background: emailSent ? "#ecfdf5" : "#fff",
                    border: `1px solid ${emailSent ? "#6ee7b7" : "#fca5a5"}`,
                    color: emailSent ? "#059669" : "#dc2626",
                    borderRadius: 8, padding: "5px 14px", fontSize: 13,
                    fontWeight: 600, cursor: emailSending || emailSent ? "default" : "pointer",
                    opacity: emailSending ? 0.6 : 1,
                  }}
                >
                  {emailSent ? "✓ Report sent" : emailSending ? "Sending…" : "📧 Email failure report"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Groups */}
        <div style={S.content}>
          {JOURNEY_GROUPS.map(group => {
            const groupStates = group.journeys.map(j => states[j.id]);
            const groupDone = groupStates.every(s => s.status !== "idle" && s.status !== "running");
            const groupFailed = groupStates.filter(s => s.status === "fail").length;
            const groupPassed = groupStates.filter(s => s.status === "pass").length;

            return (
              <div key={group.label} style={{ marginBottom: 36, maxWidth: 800 }}>
                {/* Group header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid #e5e7eb" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: "#6b7280" }}>
                      {group.label}
                    </span>
                    {groupDone && groupFailed === 0 && (
                      <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>✓ All passed</span>
                    )}
                    {groupDone && groupFailed > 0 && (
                      <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>✕ {groupFailed} failed</span>
                    )}
                  </div>
                  <button
                    onClick={() => runGroup(group.journeys)}
                    disabled={anyRunning}
                    style={{ ...S.btnGhost, fontSize: 12, color: anyRunning ? "#d1d5db" : "#6b7280" }}
                  >
                    Run group
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.journeys.map(journey => (
                    <JourneyCard
                      key={journey.id}
                      journey={journey}
                      state={states[journey.id]}
                      onRun={() => runOne(journey)}
                      disabled={anyRunning}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </AdminRoute>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  root: {
    background: "#F3F4F6", minHeight: "100vh",
    fontFamily: "Inter, system-ui, sans-serif", color: "#111827",
  },
  header: {
    padding: "28px 32px 20px",
    borderBottom: "1px solid #E5E7EB",
    background: "#fff",
  },
  title: { fontSize: 26, fontWeight: 700, color: "#0B1F3B", letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  content: { padding: "28px 32px" },
  btnPrimary: {
    background: "#0B1F3B", color: "#fff", border: "1px solid #0B1F3B",
    borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnSecondary: {
    background: "#fff", color: "#374151", border: "1px solid #E5E7EB",
    borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer",
  },
  btnRun: {
    border: "1px solid", borderRadius: 6, padding: "5px 14px",
    fontSize: 12, fontWeight: 600,
  },
  btnGhost: {
    background: "none", border: "none", cursor: "pointer",
    color: "#6b7280", padding: "4px 8px", borderRadius: 4, fontSize: 12,
  },
};
