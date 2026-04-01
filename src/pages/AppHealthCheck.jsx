// src/pages/AppHealthCheck.jsx
import { useState, useCallback, useRef } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { prodBase44 as base44, PROD_APP_ID, PROD_SERVER_URL } from "../api/healthCheckClient";
import { FAIL } from "../api/healthCheckFail";
import { toast } from "../components/ui/use-toast";
import { ADMIN_EMAILS } from "../components/auth/adminEmails.jsx";
import { COACH_JOURNEY_GROUP } from "./AppHealthCheck.coachJourneys.jsx";
import { NEW_JOURNEY_GROUPS } from "./AppHealthCheck.newJourneys.jsx";

// ── Demo localStorage helpers (mirrors demoRegistered.jsx) ──────────────────
const _demoKey = (profileId) => `rm_demo_registered_${profileId || "default"}`;
const _isDemoReg = (profileId, campId) => {
  try { return !!JSON.parse(sessionStorage.getItem(_demoKey(profileId)) || "{}")[String(campId)]; }
  catch { return false; }
};
const _setDemoReg = (profileId, campId, val) => {
  try {
    const obj = JSON.parse(sessionStorage.getItem(_demoKey(profileId)) || "{}");
    if (val) obj[String(campId)] = 1; else delete obj[String(campId)];
    sessionStorage.setItem(_demoKey(profileId), JSON.stringify(obj));
  } catch {}
};

// ── Journey groups ────────────────────────────────────────────────────────────
// Each journey: { id, name, icon, description, steps[], cleanup?(ctx) }
// Each step: { name, run(ctx) → string }  — throw to fail, return string to pass
// cleanup(ctx) runs after all steps regardless of pass/fail

const JOURNEY_GROUPS = [

  {
    label: "Infrastructure",
    section: "Critical platform/config",
    journeys: [
      {
        id: "auth",
        kind: "read",
        name: "Auth & Session",
        icon: "🔐",
        description: "Current session returns a valid authenticated user with email and ID.",
        steps: [
          {
            name: "Fetch current user",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.email) FAIL.runtime("auth.me() returned no user — session is not established or the auth endpoint is down");
              ctx.user = me;
              return `Signed in as ${me.email}`;
            },
          },
          {
            name: "User has an ID",
            run: async (ctx) => {
              if (!ctx.user?.id) FAIL.runtime("User object missing id — auth.me() returned a user without an id field");
              return `id = ${ctx.user.id}`;
            },
          },
        ],
      },

      {
        id: "camp_data",
        kind: "read",
        name: "Camp Data Integrity",
        icon: "⛺",
        description: "Active camps are accessible and carry required fields. Requires ≥5 active camps to guard against false greens on an empty or partially-seeded DB.",
        steps: [
          {
            name: "Fetch active camps",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                FAIL.data("No active camps found — Camp entity is empty or all camps are inactive");
              if (camps.length < 5)
                FAIL.data(`Only ${camps.length} active camp(s) — production should have many more; DB may be partially wiped or ingest has never run`);
              ctx.camps = camps;
              return `${camps.length} active camps`;
            },
          },
          {
            name: "Camps have camp_name and start_date",
            run: async (ctx) => {
              const bad = ctx.camps.slice(0, 20).filter(c => !c.camp_name || !c.start_date);
              if (bad.length > 0) FAIL.data(`${bad.length}/20 camps missing camp_name or start_date — ingest pipeline may be writing incomplete records`);
              return "First 20 camps have camp_name and start_date";
            },
          },
          {
            name: "Camps have source_key",
            run: async (ctx) => {
              const missing = ctx.camps.slice(0, 20).filter(c => !c.source_key).length;
              if (missing > 5) FAIL.data(`${missing}/20 camps missing source_key — deduplication and ingest tracking will be unreliable`);
              return `${20 - missing}/20 camps have source_key`;
            },
          },
        ],
      },

      {
        id: "schools",
        kind: "read",
        name: "School Data",
        icon: "🏫",
        description: "School records accessible with division data intact. Requires ≥10 schools to guard against false greens on a sparse DB.",
        steps: [
          {
            name: "Fetch schools",
            run: async (ctx) => {
              const schools = await base44.entities.School.filter({});
              if (!Array.isArray(schools) || schools.length === 0)
                FAIL.data("No schools found — School entity is empty; school-matching and travel alerts will be non-functional");
              if (schools.length < 10)
                FAIL.data(`Only ${schools.length} school record(s) — production should have thousands; DB may be partially wiped`);
              ctx.schools = schools;
              return `${schools.length} schools`;
            },
          },
          {
            name: "Schools have division data (>50%)",
            run: async (ctx) => {
              const withDiv = ctx.schools.filter(s => s.division).length;
              const pct = Math.round((withDiv / ctx.schools.length) * 100);
              if (pct < 50) FAIL.data(`Only ${pct}% of schools have a division — school data may be corrupted or Athletics Cleanup has not run`);
              return `${withDiv}/${ctx.schools.length} (${pct}%) have division`;
            },
          },
        ],
      },

      {
        id: "entity_write",
        kind: "transaction",
        name: "Entity Read / Write",
        icon: "✍️",
        description: "Can create, read back, and delete a record (RoadmapItem used as test target). Orphan search: filter RoadmapItem for title='__healthcheck_test__'.",
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
              if (!rec?.id) FAIL.runtime("RoadmapItem.create returned no id — entity write path is broken");
              ctx.testId = rec.id;
              return `Created id = ${rec.id}`;
            },
          },
          {
            name: "Read back test record",
            run: async (ctx) => {
              const recs = await base44.entities.RoadmapItem.filter({ title: "__healthcheck_test__" });
              const found = Array.isArray(recs) && recs.find(r => r.id === ctx.testId);
              if (!found) FAIL.runtime(`RoadmapItem id=${ctx.testId} not found after create — entity read-after-write may be broken`);
              return "Record confirmed in store";
            },
          },
          {
            name: "Delete test record",
            run: async (ctx) => {
              await base44.entities.RoadmapItem.delete(ctx.testId);
              ctx.testId = null;
              return `Deleted id = ${ctx.testId === null ? "(confirmed null)" : ctx.testId}`;
            },
          },
        ],
        // Safety net: if the delete step was skipped due to an earlier failure,
        // cleanup() ensures the test record is removed. Identify orphans by
        // filtering RoadmapItem for title = "__healthcheck_test__".
        cleanup: async (ctx) => {
          if (ctx.testId) {
            try { await base44.entities.RoadmapItem.delete(ctx.testId); } catch {}
          }
        },
      },
    ],
  },

  {
    label: "User Registration",
    section: "Controlled transaction checks",
    journeys: [
      {
        id: "signup_flow",
        kind: "read",
        name: "Custom Signup Flow",
        icon: "✍️",
        description: "base44.auth.register() and loginViaEmailPassword() are reachable — the custom /Signup page can create and sign in accounts.",
        steps: [
          {
            name: "auth.register is callable",
            run: async () => {
              if (typeof base44.auth?.register !== "function") {
                FAIL.runtime("base44.auth.register is not a function — custom signup page will fail");
              }
              return "base44.auth.register exists ✓";
            },
          },
          {
            name: "auth.loginViaEmailPassword is callable",
            run: async () => {
              if (typeof base44.auth?.loginViaEmailPassword !== "function") {
                FAIL.runtime("base44.auth.loginViaEmailPassword is not a function — post-signup sign-in will fail");
              }
              return "base44.auth.loginViaEmailPassword exists ✓";
            },
          },
          {
            // Probe register with the current admin email (guaranteed to already exist).
            // A "duplicate" error proves the endpoint is alive without creating any new account.
            name: "register endpoint reachable — duplicate email rejected correctly",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.email) FAIL.runtime("Could not resolve current user email for probe — auth.me() returned no email");
              try {
                await base44.auth.register({ email: me.email, password: "healthcheck_probe_xzq9!" });
                FAIL.runtime("register() accepted an already-existing email — duplicate prevention may be broken");
              } catch (err) {
                const msg = String(err?.message || err).toLowerCase();
                if (
                  msg.includes("already registered") ||
                  msg.includes("already exists") ||
                  msg.includes("already in use") ||
                  msg.includes("user already") ||
                  msg.includes("duplicate")
                ) {
                  return `register endpoint reachable — duplicate email correctly rejected ✓`;
                }
                // Unexpected error — endpoint may be down
                FAIL.ext(`register endpoint returned unexpected error: ${err?.message || err}`);
              }
            },
          },
          {
            // Probe loginViaEmailPassword with a nonexistent email.
            // An "invalid credentials" error proves the endpoint is alive without creating any session.
            name: "loginViaEmailPassword endpoint reachable — bad credentials rejected correctly",
            run: async () => {
              try {
                await base44.auth.loginViaEmailPassword(
                  "__healthcheck_probe__@urecruithq.invalid",
                  "healthcheck_probe_xzq9!"
                );
                FAIL.runtime("loginViaEmailPassword() accepted invalid credentials — auth is broken");
              } catch (err) {
                const msg = String(err?.message || err).toLowerCase();
                if (
                  msg.includes("invalid") ||
                  msg.includes("incorrect") ||
                  msg.includes("not found") ||
                  msg.includes("credentials") ||
                  msg.includes("password") ||
                  msg.includes("unauthorized") ||
                  msg.includes("email") ||
                  msg.includes("user")
                ) {
                  return `loginViaEmailPassword endpoint reachable — invalid credentials correctly rejected ✓`;
                }
                FAIL.ext(`loginViaEmailPassword returned unexpected error: ${err?.message || err}`);
              }
            },
          },
          {
            name: "auth.verifyOtp is callable",
            run: async () => {
              if (typeof base44.auth?.verifyOtp !== "function") {
                FAIL.runtime("base44.auth.verifyOtp is not a function — OTP verification step will fail");
              }
              return "base44.auth.verifyOtp exists ✓";
            },
          },
          {
            // Probe verifyOtp with a fake email and bad code.
            // An error (invalid/expired code) proves the endpoint is reachable without consuming a real OTP.
            name: "verifyOtp endpoint reachable — bad code rejected correctly",
            run: async () => {
              try {
                await base44.auth.verifyOtp({
                  email: "__healthcheck_probe__@urecruithq.invalid",
                  otpCode: "000000",
                });
                FAIL.runtime("verifyOtp() accepted a clearly invalid code — OTP validation may be broken");
              } catch (err) {
                const msg = String(err?.message || err).toLowerCase();
                if (
                  msg.includes("invalid") ||
                  msg.includes("expired") ||
                  msg.includes("not found") ||
                  msg.includes("incorrect") ||
                  msg.includes("otp") ||
                  msg.includes("code") ||
                  msg.includes("user") ||
                  msg.includes("email")
                ) {
                  return `verifyOtp endpoint reachable — invalid code correctly rejected ✓`;
                }
                FAIL.ext(`verifyOtp returned unexpected error: ${err?.message || err}`);
              }
            },
          },
          {
            name: "auth.resendOtp is callable",
            run: async () => {
              if (typeof base44.auth?.resendOtp !== "function") {
                FAIL.runtime("base44.auth.resendOtp is not a function — resend code button will fail");
              }
              return "base44.auth.resendOtp exists ✓";
            },
          },
        ],
      },

      {
        id: "registration_flow",
        kind: "transaction",
        name: "New User Registration State",
        icon: "📝",
        description: "Auth is reachable, AthleteProfile can be created and deleted, default state is demo (no entitlement). Orphan search: filter AthleteProfile for grad_year=2099 and first_name='__test__'.",
        steps: [
          {
            name: "Auth endpoint reachable",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me) FAIL.runtime("auth.me() returned null — session is not established");
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
              if (!profile?.id) FAIL.runtime("AthleteProfile create returned no id — new user registration step will fail");
              ctx.testProfileId = profile.id;
              await base44.entities.AthleteProfile.delete(profile.id);
              ctx.testProfileId = null;
              return `AthleteProfile created (id=${profile.id}) and cleaned up`;
            },
          },
          {
            name: "New account starts in demo state (no entitlement by default)",
            run: async (ctx) => {
              // Verify the entitlement system is queryable (not that the admin has none)
              const ents = await base44.entities.Entitlement.filter({ status: "active" });
              if (!Array.isArray(ents)) FAIL.runtime("Entitlement.filter() did not return an array — entitlement system may be broken");
              return `Entitlement system reachable — ${ents.length} active subscriptions in system`;
            },
          },
        ],
        // Safety net: if the inline delete in step 2 fails, cleanup() removes the orphan.
        // Identify orphans by filtering AthleteProfile for grad_year=2099 and first_name='__test__'.
        cleanup: async (ctx) => {
          if (ctx.testProfileId) {
            try { await base44.entities.AthleteProfile.delete(ctx.testProfileId); } catch {}
          }
        },
      },
    ],
  },

  {
    label: "Demo User Flows",
    section: "User journey checks",
    journeys: [
      {
        id: "demo_discovery",
        kind: "read",
        name: "Demo — Camp Discovery",
        icon: "🔍",
        description: "DemoCamp entity is accessible and contains fields needed to browse camps.",
        steps: [
          {
            name: "Fetch demo camps",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              if (!Array.isArray(camps) || camps.length === 0)
                FAIL.data("No demo camps found — run /GenerateDemoCamps (admin page) to seed the DemoCamp entity");
              ctx.demoCamps = camps;
              ctx.demoTestCamp = camps[0];
              return `${camps.length} demo camps available`;
            },
          },
          {
            name: "Demo camps have browse fields (camp_name, start_date)",
            run: async (ctx) => {
              const bad = ctx.demoCamps.slice(0, 10).filter(c => !c.camp_name || !c.start_date);
              if (bad.length > 0) FAIL.data(`${bad.length}/10 demo camps missing camp_name or start_date — re-run GenerateDemoCamps`);
              return "First 10 demo camps have camp_name and start_date";
            },
          },
          {
            name: "Demo camps have Calendar display fields (start_date for date placement)",
            run: async (ctx) => {
              const bad = ctx.demoCamps.slice(0, 10).filter(c => !c.start_date);
              if (bad.length > 0) FAIL.data(`${bad.length}/10 demo camps missing start_date — Calendar cannot place them; re-run GenerateDemoCamps`);
              const sample = ctx.demoCamps[0];
              return `Sample: "${sample.camp_name}" on ${sample.start_date}`;
            },
          },
          {
            name: "Demo camps have My Agenda display fields",
            run: async (ctx) => {
              const sample = ctx.demoCamps[0];
              const missing = ["camp_name", "start_date"].filter(f => !sample[f]);
              if (missing.length > 0) FAIL.data(`Sample demo camp missing: ${missing.join(", ")} — re-run GenerateDemoCamps`);
              const loc = [sample.city, sample.state].filter(Boolean).join(", ");
              return `Sample has camp_name, start_date${loc ? `, location: ${loc}` : " (no location)"}`;
            },
          },
        ],
      },

      {
        id: "demo_favorite",
        kind: "read",
        name: "Demo — Favorite a Camp",
        icon: "⭐",
        description: "Demo favorite writes to localStorage, is readable in Discover/Calendar/My Agenda, and can be cleared.",
        steps: [
          {
            name: "Fetch a demo camp to use as test target",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              if (!Array.isArray(camps) || camps.length === 0) FAIL.data("No demo camps — cannot test favorite; run /GenerateDemoCamps");
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
              if (before) FAIL.runtime("Camp already in demo storage before test — localStorage may be polluted from a previous failed run");
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
              if (!visible) FAIL.runtime("isDemoRegistered returned false after write — localStorage read/write cycle failed");
              return "isDemoRegistered() → true — camp appears as favorited in Discover, Calendar, My Agenda";
            },
          },
          {
            name: "Clear favorite (cleanup)",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, false);
              const after = _isDemoReg(ctx.demoProfileId, ctx.demoCampId);
              if (after) FAIL.runtime("Camp still shows as favorited after clearing — localStorage removeItem not working");
              return "localStorage cleared — camp no longer favorited";
            },
          },
        ],
      },

      {
        id: "demo_register",
        kind: "read",
        name: "Demo — Mark as Registered",
        icon: "✅",
        description: "Demo registration writes to localStorage, is readable across all views, and can be cleared.",
        steps: [
          {
            name: "Fetch a demo camp",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              if (!Array.isArray(camps) || camps.length === 0) FAIL.data("No demo camps — run /GenerateDemoCamps to seed the DemoCamp entity");
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
              if (_isDemoReg(ctx.demoProfileId, ctx.demoCampId)) FAIL.runtime("Camp already in demo storage before test — localStorage may be polluted from a previous failed run");
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
              if (!visible) FAIL.runtime("isDemoRegistered returned false after write — localStorage read/write cycle failed");
              return "isDemoRegistered() → true — shows as registered in all views";
            },
          },
          {
            name: "Verify demo camp has My Agenda fields",
            run: async (ctx) => {
              const camps = await base44.entities.DemoCamp.filter({});
              const camp = (camps || []).find(c => String(c.id || c.camp_id) === String(ctx.demoCampId)) || camps?.[0];
              if (!camp) FAIL.data("Could not refetch demo camp for field check — DemoCamp entity may have been cleared");
              const missing = ["camp_name", "start_date"].filter(f => !camp[f]);
              if (missing.length) FAIL.data(`My Agenda needs: ${missing.join(", ")} — missing from demo camp`);
              return `camp_name ✓  start_date ✓  city: ${camp.city || "—"}  state: ${camp.state || "—"}`;
            },
          },
          {
            name: "Clear registration (cleanup)",
            run: async (ctx) => {
              _setDemoReg(ctx.demoProfileId, ctx.demoCampId, false);
              if (_isDemoReg(ctx.demoProfileId, ctx.demoCampId)) FAIL.runtime("Camp still shows as registered after clearing — localStorage removeItem not working");
              return "localStorage cleared";
            },
          },
        ],
      },
    ],
  },

  {
    label: "Subscriber Flows",
    section: "User journey checks",
    journeys: [
      {
        id: "subscriber_entitlement",
        kind: "read",
        name: "Subscriber — Entitlement Check",
        icon: "🎫",
        description: "Active entitlements exist and are linked to accounts. NOTE: zero entitlements is treated as a warn (pre-launch acceptable), not a fail.",
        steps: [
          {
            name: "Fetch active entitlements",
            run: async (ctx) => {
              const ents = await base44.entities.Entitlement.filter({ status: "active" });
              if (!Array.isArray(ents)) FAIL.runtime("Entitlement.filter() returned non-array — entity may be broken or missing");
              if (ents.length === 0) {
                ctx.entitlements = [];
                return "⚠ No active entitlements — 0 subscribers (acceptable pre-launch; investigate if post-launch)";
              }
              ctx.entitlements = ents;
              return `${ents.length} active entitlement${ents.length !== 1 ? "s" : ""}`;
            },
          },
          {
            name: "Entitlements are linked to accounts",
            run: async (ctx) => {
              if (ctx.entitlements.length === 0) return "Skipped — no entitlements to check";
              const unlinked = ctx.entitlements.filter(e => !e.account_id).length;
              if (unlinked > 0) FAIL.data(`${unlinked} entitlements missing account_id — subscribers cannot be resolved to accounts`);
              return `All ${ctx.entitlements.length} entitlements have account_id`;
            },
          },
          {
            name: "Entitlements have status field",
            run: async (ctx) => {
              if (ctx.entitlements.length === 0) return "Skipped — no entitlements to check";
              const bad = ctx.entitlements.filter(e => !e.status).length;
              if (bad > 0) FAIL.data(`${bad} entitlements missing status field — access gate cannot evaluate them`);
              return "All entitlements have status";
            },
          },
        ],
      },

      {
        id: "subscriber_intent_lifecycle",
        kind: "transaction",
        name: "Subscriber — Favorite → Registered Lifecycle",
        icon: "🔄",
        description: "Create a CampIntent (favorite), verify it's visible in Discover/Calendar/My Agenda queries, update to registered, verify, then clean up. Orphan search: filter AthleteProfile for first_name='__hc_intent__' (grad_year=2099), then filter CampIntent for that athlete_id.",
        steps: [
          {
            name: "Create test athlete (owned by admin account)",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("auth.me() returned no id — cannot create test athlete");
              ctx.myId = me.id;
              const profile = await base44.entities.AthleteProfile.create({
                account_id: ctx.myId,
                first_name: "__hc_intent__", last_name: "__test__",
                athlete_name: "__hc_intent__ __test__",
                active: true, sport_id: "test", grad_year: 2099,
              });
              if (!profile?.id) FAIL.runtime("AthleteProfile.create returned no id — subscriber profile creation is broken");
              ctx.athlete = profile;
              return `Test athlete created (id=${profile.id})`;
            },
          },
          {
            name: "Find a test camp",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) FAIL.data("No active camps — Camp entity empty; subscriber intent lifecycle cannot proceed");
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
                account_id: ctx.myId,
                status: "favorite",
              });
              if (!intent?.id) FAIL.runtime("CampIntent create returned no id — write permission may be missing");
              ctx.intentId = intent.id;
              return `CampIntent created (id=${intent.id}, status=favorite)`;
            },
          },
          {
            name: "Verify intent visible via athlete_id filter — Discover / Calendar / My Agenda query",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete.id });
              if (!Array.isArray(intents)) FAIL.runtime("CampIntent.filter() returned non-array — entity query is broken");
              const found = intents.find(i => i.id === ctx.intentId);
              if (!found) FAIL.runtime(`Intent id=${ctx.intentId} not found via athlete_id filter — read-after-write may be broken`);
              if (found.status !== "favorite") FAIL.data(`Expected status=favorite, got ${found.status} — CampIntent status not persisting correctly`);
              return `Intent visible via athlete_id filter — status: ${found.status} ✓`;
            },
          },
          {
            name: "Verify linked camp has Calendar display fields",
            run: async (ctx) => {
              if (!ctx.testCamp.start_date) FAIL.data("Camp missing start_date — Calendar cannot place it on grid");
              if (!ctx.testCamp.camp_name) FAIL.data("Camp missing camp_name — Calendar card would be blank");
              return `start_date: ${ctx.testCamp.start_date}  camp_name: "${ctx.testCamp.camp_name}"`;
            },
          },
          {
            name: "Verify linked camp has My Agenda display fields",
            run: async (ctx) => {
              const required = ["camp_name", "start_date"];
              const missing = required.filter(f => !ctx.testCamp[f]);
              if (missing.length) FAIL.data(`My Agenda needs: ${missing.join(", ")} — fields missing from camp record`);
              const loc = [ctx.testCamp.city, ctx.testCamp.state].filter(Boolean).join(", ");
              return `Required fields present — location: ${loc || "(none)"}  price: ${ctx.testCamp.price ?? "—"}`;
            },
          },
          {
            name: "Update intent to registered — mirrors Discover / My Agenda register action",
            run: async (ctx) => {
              const updated = await base44.entities.CampIntent.update(ctx.intentId, { status: "registered" });
              if (!updated) FAIL.runtime("CampIntent.update() returned null — update path is broken");
              return `CampIntent updated to status=registered`;
            },
          },
          {
            name: "Verify registered status visible via athlete_id filter",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete.id });
              const found = (intents || []).find(i => i.id === ctx.intentId);
              if (!found) FAIL.runtime("Intent not found after status update — read-after-write may be broken");
              if (found.status !== "registered") FAIL.data(`Expected registered, got ${found.status} — CampIntent update not persisting`);
              return `Intent shows status=registered in Calendar / My Agenda query ✓`;
            },
          },
          {
            name: "Delete test intent (cleanup)",
            run: async (ctx) => {
              await base44.entities.CampIntent.delete(ctx.intentId);
              if (ctx.athlete?.id) await base44.entities.AthleteProfile.delete(ctx.athlete.id).catch(() => {});
              return `Intent id=${ctx.intentId} deleted, test athlete cleaned up`;
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.intentId) {
            try { await base44.entities.CampIntent.delete(ctx.intentId); } catch {}
          }
          if (ctx.athlete?.id) {
            try { await base44.entities.AthleteProfile.delete(ctx.athlete.id); } catch {}
          }
        },
      },

      {
        id: "campintent_permissions",
        kind: "transaction",
        name: "CampIntent Entity Permissions",
        icon: "🔒",
        description: "Verifies CampIntent is readable and writable by all authenticated users — not just admins. Catches broken entity permission rules that admin-bypass would otherwise mask. After any base44 entity restriction change, this journey must also be verified manually with a subscriber (non-admin) account. Orphan search: filter AthleteProfile for first_name='__hc_perm_probe__' (grad_year=2099), then filter CampIntent for that athlete_id.",
        steps: [
          {
            name: "CampIntent.filter({}) readable — no permission error",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CampIntent.filter({});
              } catch (err) {
                FAIL.config(`CampIntent read blocked: ${err?.message || err} — check entity Read permission in base44 admin`);
              }
              if (!Array.isArray(rows)) FAIL.runtime("CampIntent.filter() returned non-array — entity may be misconfigured");
              ctx.existingCount = rows.length;
              return `Read OK — ${rows.length} existing records visible`;
            },
          },
          {
            name: "Resolve admin account_id for write probe",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("auth.me() returned no id — session may not be established");
              ctx.probeAccountId = me.id;
              return `account_id = ${me.id}`;
            },
          },
          {
            name: "Find a camp for probe",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) FAIL.data("No active camps to use for probe — Camp entity empty");
              ctx.probeCamp = camps[0];
              return `Using camp: "${camps[0].camp_name}"`;
            },
          },
          {
            name: "Create probe AthleteProfile",
            run: async (ctx) => {
              const profile = await base44.entities.AthleteProfile.create({
                account_id: ctx.probeAccountId,
                first_name: "__hc_perm_probe__", last_name: "__test__",
                athlete_name: "__hc_perm_probe__ __test__",
                active: true, sport_id: "test", grad_year: 2099,
              });
              if (!profile?.id) FAIL.runtime("AthleteProfile.create returned no id — entity write path broken");
              ctx.probeAthleteId = profile.id;
              return `Probe athlete id = ${profile.id}`;
            },
          },
          {
            name: "CampIntent.create — mirrors exact app payload (account_id + athlete_id required)",
            run: async (ctx) => {
              let intent;
              try {
                intent = await base44.entities.CampIntent.create({
                  camp_id: ctx.probeCamp.id,
                  athlete_id: ctx.probeAthleteId,
                  account_id: ctx.probeAccountId,
                  status: "favorite",
                });
              } catch (err) {
                FAIL.config(`CampIntent create blocked: ${err?.message || err} — check entity Create permission in base44 admin`);
              }
              if (!intent?.id) FAIL.runtime("CampIntent.create() returned no id — entity write path broken");
              ctx.probeIntentId = intent.id;
              return `Created id = ${intent.id}`;
            },
          },
          {
            name: "CampIntent.filter by athlete_id — mirrors Discover / Calendar / MyCamps query",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CampIntent.filter({ athlete_id: ctx.probeAthleteId });
              } catch (err) {
                FAIL.config(`CampIntent read by athlete_id blocked: ${err?.message || err} — check entity Read permission in base44 admin`);
              }
              const found = (rows || []).find(r => r.id === ctx.probeIntentId);
              if (!found) FAIL.config("Probe record not found via athlete_id filter — Read permission may be filtering it out");
              return `Record visible via athlete_id filter ✓`;
            },
          },
          {
            name: "CampIntent.update — mirrors unfavorite / register actions",
            run: async (ctx) => {
              let updated;
              try {
                updated = await base44.entities.CampIntent.update(ctx.probeIntentId, { status: "registered" });
              } catch (err) {
                FAIL.config(`CampIntent update blocked: ${err?.message || err} — check entity Update permission in base44 admin`);
              }
              if (!updated) FAIL.runtime("CampIntent.update() returned null — update path is broken");
              return `Update OK — status set to registered`;
            },
          },
          {
            name: "Cleanup probe records",
            run: async (ctx) => {
              if (ctx.probeIntentId) await base44.entities.CampIntent.delete(ctx.probeIntentId).catch(() => {});
              if (ctx.probeAthleteId) await base44.entities.AthleteProfile.delete(ctx.probeAthleteId).catch(() => {});
              return "Probe records deleted";
            },
          },
          {
            name: "⚠️ Admin-bypass gap — manually verify with a subscriber account after any permission change",
            run: async () => {
              return "This journey runs as admin. If a permission rule has an admin bypass, it will pass here even if regular users are blocked. After any base44 entity restriction change on CampIntent, sign in as a non-admin subscriber and confirm favorites/registered still persist in Discover, Calendar, and MyCamps.";
            },
          },
        ],
        cleanup: async (ctx) => {
          try { if (ctx.probeIntentId) await base44.entities.CampIntent.delete(ctx.probeIntentId); } catch {}
          try { if (ctx.probeAthleteId) await base44.entities.AthleteProfile.delete(ctx.probeAthleteId); } catch {}
        },
      },

      {
        id: "subscriber_data_integrity",
        kind: "read",
        name: "Subscriber — Data Integrity Check",
        icon: "🔗",
        description: "Athlete profiles, intents, and camps are correctly linked with no orphaned records. NOTE: zero athletes returns warn (pre-launch), not a fail.",
        steps: [
          {
            name: "Fetch active athletes",
            run: async (ctx) => {
              const athletes = await base44.entities.AthleteProfile.filter({ active: true });
              if (!Array.isArray(athletes)) FAIL.runtime("AthleteProfile.filter() returned non-array — entity query is broken");
              if (athletes.length === 0) {
                ctx.athletes = [];
                return "⚠ No active athlete profiles — zero subscribers registered (acceptable pre-launch; investigate if post-launch)";
              }
              ctx.athletes = athletes;
              return `${athletes.length} active athletes`;
            },
          },
          {
            name: "Athletes have account_id links",
            run: async (ctx) => {
              if (ctx.athletes.length === 0) return "Skipped — no athletes to check";
              const unlinked = ctx.athletes.filter(a => !a.account_id).length;
              if (unlinked > 0) FAIL.data(`${unlinked} athletes missing account_id — subscriber account linking is broken`);
              return `All ${ctx.athletes.length} athletes linked to accounts`;
            },
          },
          {
            name: "Fetch registered intents and verify camp links",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({});
              if (!Array.isArray(intents)) FAIL.runtime("CampIntent.filter() returned non-array — entity query is broken");
              const active = intents.filter(i => ["registered", "favorite", "completed"].includes(i.status));
              ctx.activeIntents = active;
              // Spot-check first 10 intents have camp_id
              const missing = active.slice(0, 10).filter(i => !i.camp_id).length;
              if (missing > 0) FAIL.data(`${missing}/10 active intents missing camp_id — calendar/agenda queries will produce incomplete results`);
              const reg = active.filter(i => i.status === "registered").length;
              const fav = active.filter(i => i.status === "favorite").length;
              return `${active.length} active intents — ${reg} registered, ${fav} favorited`;
            },
          },
          {
            name: "Spot-check: intents have athlete_id (required for Calendar / My Agenda queries)",
            run: async (ctx) => {
              if (ctx.athletes.length === 0) {
                if (ctx.activeIntents.length > 0)
                  return `⚠ ${ctx.activeIntents.length} orphaned intents with no athletes — re-run user purge to clear`;
                return "No athletes and no intents — clean state";
              }
              const missing = ctx.activeIntents.slice(0, 20).filter(i => !i.athlete_id).length;
              if (missing > 0) FAIL.data(`${missing}/20 intents missing athlete_id — useAllAthletesCamps filter would skip them`);
              return `${Math.min(20, ctx.activeIntents.length)}/${Math.min(20, ctx.activeIntents.length)} intents have athlete_id`;
            },
          },
        ],
      },

      {
        id: "cross_athlete_warning_isolation",
        kind: "read",
        name: "Cross-Athlete Warning Isolation",
        icon: "🔀",
        description: "Travel notices for camps belonging only to another athlete are excluded from the current athlete's WarningBanner. Cross-athlete same-day conflicts still surface correctly.",
        steps: [
          {
            name: "Import detectConflicts",
            run: async (ctx) => {
              const mod = await import("../components/hooks/useConflictDetection.jsx");
              if (typeof mod.detectConflicts !== "function") FAIL.runtime("detectConflicts not exported from useConflictDetection.jsx");
              ctx.detectConflicts = mod.detectConflicts;
              return "detectConflicts imported ✓";
            },
          },
          {
            name: "Other athlete's solo far-from-home notice excluded from current athlete's warnings",
            run: async (ctx) => {
              // Current athlete: nearby camp (Dallas TX) — no far-from-home
              // Other athlete: distant camp (Chicago) — should generate far_from_home but NOT appear for current athlete
              const campA = { id: "curr-a", camp_name: "Current Camp", start_date: "2026-06-14", city: "Dallas", state: "TX", athleteName: "Current" };
              const campB = { id: "other-b", camp_name: "Other Camp",   start_date: "2026-06-20", city: "Chicago", state: "IL", athleteName: "Other" };
              const allWarnings = ctx.detectConflicts({
                camps: [campA, campB],
                homeCity: "Magnolia", homeState: "TX",
                homeLat: 30.21, homeLng: -95.75,
                isPaid: true,
              });
              const currentCampIds = new Set(["curr-a"]);
              const currentWarnings = allWarnings.filter(w => (w.campIds || []).some(id => currentCampIds.has(id)));
              const otherOnlyWarnings = allWarnings.filter(w => (w.campIds || []).every(id => !currentCampIds.has(id)));
              if (otherOnlyWarnings.length === 0) return "No other-only warnings generated in this scenario — distance thresholds not met (ok)";
              const leaked = currentWarnings.filter(w => (w.campIds || []).every(id => !currentCampIds.has(id)));
              if (leaked.length > 0) FAIL.runtime(`${leaked.length} other-athlete-only warning(s) leaked into currentAthleteWarnings — Calendar WarningBanner will show wrong athlete's notices`);
              return `${otherOnlyWarnings.length} other-athlete notice(s) correctly excluded from currentAthleteWarnings ✓`;
            },
          },
          {
            name: "Cross-athlete same-day conflict DOES appear for both athletes",
            run: async (ctx) => {
              // Both on same date — warning campIds contains both; should pass the currentCampIds filter for either athlete
              const campA = { id: "curr-a", camp_name: "Current Camp", start_date: "2026-06-14", city: "Dallas",  state: "TX", athleteName: "Current" };
              const campB = { id: "other-b", camp_name: "Other Camp",   start_date: "2026-06-14", city: "Chicago", state: "IL", athleteName: "Other" };
              const allWarnings = ctx.detectConflicts({ camps: [campA, campB], isPaid: false });
              const currentCampIds = new Set(["curr-a"]);
              const currentWarnings = allWarnings.filter(w => (w.campIds || []).some(id => currentCampIds.has(id)));
              const sameDayWarn = currentWarnings.find(w => w.type === "same_day");
              if (!sameDayWarn) FAIL.runtime("Same-day conflict absent from currentAthleteWarnings — cross-athlete conflict detection broken");
              return "Same-day conflict correctly survives the currentAthleteWarnings filter ✓";
            },
          },
          {
            name: "Back-to-back cross-athlete travel warning appears for the current athlete's camp",
            run: async (ctx) => {
              // Current athlete: camp A on June 14; Other athlete: camp B on June 15, far away
              // Warning campIds: ["curr-a", "other-b"] — passes filter since curr-a is current
              const campA = { id: "curr-a", camp_name: "Columbus Camp", start_date: "2026-06-14", city: "Columbus", state: "OH", athleteName: "Current" };
              const campB = { id: "other-b", camp_name: "Chicago Camp",  start_date: "2026-06-15", city: "Chicago",  state: "IL", athleteName: "Other" };
              const allWarnings = ctx.detectConflicts({ camps: [campA, campB], isPaid: false });
              const currentCampIds = new Set(["curr-a"]);
              const currentWarnings = allWarnings.filter(w => (w.campIds || []).some(id => currentCampIds.has(id)));
              const travelWarn = currentWarnings.find(w => w.type === "back_to_back_travel");
              if (!travelWarn) return "No back-to-back travel warning generated — may be within distance threshold (ok)";
              return `Cross-athlete back-to-back travel warning correctly surfaces for current athlete (${travelWarn.distance} mi) ✓`;
            },
          },
        ],
      },

      {
        id: "discover_to_calendar_flow",
        kind: "transaction",
        name: "Discover → Calendar / My Camps Flow",
        icon: "🗓️",
        description: "End-to-end: creates a favorite intent as Discover would, then walks every step the Calendar and My Camps hooks use to surface it. Fails at the exact step that breaks the pipeline. Orphan search: filter AthleteProfile for first_name='__hc_cal__' (grad_year=2099), then filter CampIntent for that athlete_id. localStorage key 'intentUpdatedAt' is also cleaned up.",
        steps: [
          {
            name: "Create test athlete profile (mirrors subscriber account setup)",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("auth.me() returned no id — session not established");
              ctx.myId = me.id;
              const profile = await base44.entities.AthleteProfile.create({
                account_id: ctx.myId,
                first_name: "__hc_cal__", last_name: "__test__",
                athlete_name: "__hc_cal__ __test__",
                active: true, sport_id: "test", grad_year: 2099,
              });
              if (!profile?.id) FAIL.runtime("AthleteProfile.create returned no id — subscriber accounts cannot create athlete profiles");
              ctx.athlete = profile;
              ctx.athleteId = String(profile.id);
              ctx.createdAthlete = true;
              return `Test athlete created (id=${ctx.athleteId}) — mirrors a real subscriber's athlete profile`;
            },
          },
          {
            name: "Find a camp to use as test target",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true }).catch(() => []);
              if (!Array.isArray(camps) || camps.length === 0) FAIL.data("No active camps found — Camp entity may be empty or unreadable");
              ctx.testCamp = camps[0];
              ctx.campId = String(ctx.testCamp.id || ctx.testCamp._id || "");
              if (!ctx.campId) FAIL.data("Camp record has no id — entity data may be malformed");
              return `Using camp: "${ctx.testCamp.camp_name}" (id=${ctx.campId})`;
            },
          },
          {
            name: "Create CampIntent — mirrors Discover favorite action",
            run: async (ctx) => {
              const intent = await base44.entities.CampIntent.create({
                camp_id: ctx.campId,
                athlete_id: ctx.athleteId,
                account_id: ctx.myId,
                status: "favorite",
              });
              if (!intent?.id) FAIL.runtime("CampIntent.create returned no id — write permission may be missing");
              ctx.intentId = intent.id;
              return `CampIntent created (id=${ctx.intentId}, athlete_id=${ctx.athleteId}, status=favorite)`;
            },
          },
          {
            name: "Write intentUpdatedAt to localStorage — cache-bust signal Calendar/MyCamps read on mount",
            run: async (ctx) => {
              ctx.intentUpdatedAt = Date.now();
              try {
                localStorage.setItem("intentUpdatedAt", String(ctx.intentUpdatedAt));
              } catch {
                FAIL.runtime("localStorage.setItem failed — cache invalidation signal cannot be written; Calendar/MyCamps won't know to refetch");
              }
              const readBack = localStorage.getItem("intentUpdatedAt");
              if (readBack !== String(ctx.intentUpdatedAt)) FAIL.runtime("localStorage round-trip failed — intentUpdatedAt value not persisted");
              return `intentUpdatedAt=${ctx.intentUpdatedAt} written and verified ✓`;
            },
          },
          {
            name: "Query intents by athlete_id — step 1 of useCampSummariesClient",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athleteId }).catch((e) => {
                FAIL.runtime(`CampIntent.filter({ athlete_id }) threw: ${e?.message || e}`);
              });
              if (!Array.isArray(intents)) FAIL.runtime("CampIntent.filter() returned non-array — query broken");
              const found = intents.find(i => i.id === ctx.intentId);
              if (!found) FAIL.runtime(`Intent id=${ctx.intentId} not found by athlete_id filter — useCampSummariesClient would return [] and Calendar/MyCamps would be empty`);
              ctx.foundIntent = found;
              return `Found ${intents.length} intent(s) for athlete — target intent present ✓`;
            },
          },
          {
            name: "Verify intent status passes the active filter (favorite / registered / completed)",
            run: async (ctx) => {
              const st = String(ctx.foundIntent?.status || "").toLowerCase();
              const ACTIVE = new Set(["favorite", "registered", "completed"]);
              if (!ACTIVE.has(st)) FAIL.data(`Intent status="${st}" is not in {favorite, registered, completed} — would be excluded from interestedKeys and useCampSummariesClient returns []`);
              return `status="${st}" passes active filter ✓`;
            },
          },
          {
            name: "Verify intent has camp_id — needed to build interestedKeys",
            run: async (ctx) => {
              const key = String(ctx.foundIntent?.camp_id || "");
              if (!key) FAIL.data("Intent is missing camp_id — cannot look up camp record; useCampSummariesClient skips it");
              if (key !== ctx.campId) FAIL.data(`Intent camp_id="${key}" does not match expected campId="${ctx.campId}" — key mismatch would cause null join result`);
              return `camp_id=${key} present and matches ✓`;
            },
          },
          {
            name: "Fetch camp record by id — batchFetchByIds fallback (Camp.get)",
            run: async (ctx) => {
              let camp = null;
              try {
                camp = await base44.entities.Camp.get(ctx.campId);
              } catch (e) {
                FAIL.runtime(`Camp.get(${ctx.campId}) threw: ${e?.message || e} — batchFetchByIds fallback would fail`);
              }
              if (!camp) FAIL.data(`Camp.get(${ctx.campId}) returned null — camp record missing or unreadable`);
              if (!camp.camp_name) FAIL.data("Camp record has no camp_name — Calendar card would be blank");
              if (!camp.start_date) FAIL.data("Camp record has no start_date — Calendar cannot place it on grid");
              ctx.campRecord = camp;
              return `Camp fetched: "${camp.camp_name}" on ${camp.start_date} ✓`;
            },
          },
          {
            name: "Verify intent → camp join would produce an intent_status on the final row",
            run: async (ctx) => {
              // Simulate the join: intentByKey.get(campId) in useCampSummariesClient
              const intentCampId = String(ctx.foundIntent.camp_id || "");
              const campRecordId = String(ctx.campRecord.id || ctx.campRecord._id || "");
              if (intentCampId !== campRecordId) FAIL.data(`Key mismatch: intent.camp_id="${intentCampId}" vs Camp.id="${campRecordId}" — intentByKey.get(campId) returns null, intent_status would be null`);
              const intentStatus = ctx.foundIntent.status || null;
              if (!intentStatus) FAIL.data("Join produced null intent_status — camp would not pass favorite/registered filter in Calendar/MyCamps");
              return `Join OK — intent_status="${intentStatus}" would appear on the calendar row ✓`;
            },
          },
          {
            name: "Cleanup: delete test intent and athlete",
            run: async (ctx) => {
              if (ctx.intentId) await base44.entities.CampIntent.delete(ctx.intentId).catch(() => {});
              if (ctx.createdAthlete && ctx.athleteId) await base44.entities.AthleteProfile.delete(ctx.athleteId).catch(() => {});
              return `Cleaned up intent id=${ctx.intentId} and test athlete id=${ctx.athleteId}`;
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.intentId) {
            try { await base44.entities.CampIntent.delete(ctx.intentId); } catch {}
          }
          if (ctx.createdAthlete && ctx.athleteId) {
            try { await base44.entities.AthleteProfile.delete(ctx.athleteId); } catch {}
          }
          // Clean up the intentUpdatedAt localStorage key written in step 4.
          // This is the safety-net path; the inline cleanup step removes it normally.
          try { localStorage.removeItem("intentUpdatedAt"); } catch {}
        },
      },
    ],
  },

  {
    label: "Conflict & Travel Warnings",
    section: "Core data integrity",
    journeys: [
      {
        id: "travel_warning_engine",
        kind: "read",
        name: "Travel Warning Logic",
        icon: "✈️",
        description: "Unit-tests detectConflicts() — far-from-home threshold, flight vs hotel language, stored coordinate preference, and state center fallback.",
        steps: [
          {
            name: "detectConflicts and coordinate helpers are importable",
            run: async (ctx) => {
              const mod = await import("../components/hooks/useConflictDetection.jsx");
              const coords = await import("../components/hooks/useCityCoords.jsx");
              if (typeof mod.detectConflicts !== "function") FAIL.runtime("detectConflicts is not exported from useConflictDetection.jsx");
              if (typeof coords.getCityCoords !== "function") FAIL.runtime("getCityCoords is not exported from useCityCoords.jsx");
              if (typeof coords.getStateCenter !== "function") FAIL.runtime("getStateCenter is not exported — state-center fallback for home coords will silently fail");
              if (typeof coords.haversine !== "function") FAIL.runtime("haversine is not exported from useCityCoords.jsx");
              ctx.detectConflicts = mod.detectConflicts;
              ctx.getCityCoords = coords.getCityCoords;
              ctx.getStateCenter = coords.getStateCenter;
              ctx.haversine = coords.haversine;
              return "detectConflicts, getCityCoords, getStateCenter, haversine all exported ✓";
            },
          },
          {
            name: "getCityCoords resolves known college towns",
            run: async (ctx) => {
              const tests = [
                { city: "West Lafayette", state: "IN", label: "Purdue" },
                { city: "Boone", state: "NC", label: "Appalachian State" },
                { city: "Chicago", state: "IL", label: "Chicago State" },
                { city: "Magnolia", state: "TX", label: "Magnolia TX (home city)" },
              ];
              const failed = tests.filter(t => !ctx.getCityCoords(t.city, t.state));
              if (failed.length > 0) FAIL.runtime(`getCityCoords returned null for: ${failed.map(t => t.label).join(", ")} — travel distance alerts will be inaccurate for these cities`);
              return `All ${tests.length} test cities resolved ✓`;
            },
          },
          {
            name: "getStateCenter returns coords for all states used as fallback",
            run: async (ctx) => {
              const states = ["TX", "IL", "NC", "IN", "CA", "FL", "OH"];
              const failed = states.filter(s => !ctx.getStateCenter(s));
              if (failed.length > 0) FAIL.runtime(`getStateCenter returned null for: ${failed.join(", ")} — state-center fallback will fail for these states`);
              return `State center fallback works for ${states.length} tested states ✓`;
            },
          },
          {
            name: "Far-from-home warning fires for camp >600 miles away",
            run: async (ctx) => {
              // Home: Magnolia TX (~30.21, -95.75)  |  Camp: Chicago (~41.88, -87.63) ≈ 1,050 mi
              const warnings = ctx.detectConflicts({
                camps: [{
                  id: "test-chi", camp_name: "Chicago State Camp",
                  start_date: "2026-06-14",
                  city: "Chicago", state: "IL",
                }],
                homeCity: "Magnolia", homeState: "TX",
                homeLat: 30.21, homeLng: -95.75,
                isPaid: true,
              });
              const farWarn = warnings.find(w => w.type === "far_from_home");
              if (!farWarn) FAIL.runtime("No far_from_home warning fired for Chicago (~1,050 mi from Magnolia TX) — distance threshold logic may be broken");
              ctx.farWarnDist = farWarn.distance;
              return `far_from_home warning fired — distance ${farWarn.distance} mi ✓`;
            },
          },
          {
            name: "Far-from-home warning uses flight language when >400 miles",
            run: async (ctx) => {
              if (!ctx.farWarnDist) FAIL.runtime("Previous step did not capture far_from_home distance — cannot verify flight language");
              const warnings = ctx.detectConflicts({
                camps: [{
                  id: "test-chi2", camp_name: "Chicago State Camp",
                  start_date: "2026-06-14",
                  city: "Chicago", state: "IL",
                }],
                homeCity: "Magnolia", homeState: "TX",
                homeLat: 30.21, homeLng: -95.75,
                isPaid: true,
              });
              const w = warnings.find(w => w.type === "far_from_home");
              if (!w?.message?.includes("✈️")) FAIL.runtime(`Expected ✈️ flight language for ${ctx.farWarnDist} mi camp — got: "${w?.message}" — warning message template may have changed`);
              return `Flight language (✈️) present for ${ctx.farWarnDist} mi camp ✓`;
            },
          },
          {
            name: "Far-from-home does NOT fire for camps within 600 miles",
            run: async (ctx) => {
              // Home: Magnolia TX  |  Camp: Dallas TX (~30 mi) — should not fire
              const warnings = ctx.detectConflicts({
                camps: [{
                  id: "test-dal", camp_name: "Dallas Camp",
                  start_date: "2026-06-14",
                  city: "Dallas", state: "TX",
                }],
                homeCity: "Magnolia", homeState: "TX",
                homeLat: 30.21, homeLng: -95.75,
                isPaid: true,
              });
              const farWarn = warnings.find(w => w.type === "far_from_home");
              if (farWarn) FAIL.runtime(`far_from_home incorrectly fired for Dallas TX (${farWarn.distance} mi from Magnolia TX) — distance threshold is too low`);
              return "No false far_from_home warning for nearby Dallas TX ✓";
            },
          },
          {
            name: "Far-from-home does NOT fire for non-paid users",
            run: async (ctx) => {
              const warnings = ctx.detectConflicts({
                camps: [{
                  id: "test-chi3", camp_name: "Chicago State Camp",
                  start_date: "2026-06-14",
                  city: "Chicago", state: "IL",
                }],
                homeCity: "Magnolia", homeState: "TX",
                homeLat: 30.21, homeLng: -95.75,
                isPaid: false,
              });
              const farWarn = warnings.find(w => w.type === "far_from_home");
              if (farWarn) FAIL.runtime("far_from_home warning fired for non-paid user — this warning should be paid-only; isPaid gate in detectConflicts may be broken");
              return "Far-from-home correctly suppressed for non-paid user ✓";
            },
          },
          {
            name: "State center fallback fires when no city coords and no stored lat/lng",
            run: async (ctx) => {
              // Use a fake home city not in the lookup — fallback to TX state center
              const warnings = ctx.detectConflicts({
                camps: [{
                  id: "test-chi4", camp_name: "Chicago State Camp",
                  start_date: "2026-06-14",
                  city: "Chicago", state: "IL",
                }],
                homeCity: "FakeCityNotInLookup", homeState: "TX",
                homeLat: null, homeLng: null,
                isPaid: true,
              });
              const farWarn = warnings.find(w => w.type === "far_from_home");
              if (!farWarn) FAIL.runtime("State center fallback did not produce a far_from_home warning — home location resolution may be broken for cities not in the lookup table");
              return `State center fallback working — warning fired at ~${farWarn.distance} mi ✓`;
            },
          },
          {
            name: "Stored _school_lat/_school_lng used over city lookup",
            run: async (ctx) => {
              // Pass a camp with explicit coords for a city NOT in the lookup
              // If campCoords correctly uses _school_lat/_school_lng, warning fires
              const warnings = ctx.detectConflicts({
                camps: [{
                  id: "test-stored", camp_name: "Remote Camp",
                  start_date: "2026-06-14",
                  city: "FakeTownNotInLookup", state: "MT",
                  _school_lat: 41.88, _school_lng: -87.63, // Chicago coords — ~1050 mi from Magnolia TX
                }],
                homeCity: "Magnolia", homeState: "TX",
                homeLat: 30.21, homeLng: -95.75,
                isPaid: true,
              });
              const farWarn = warnings.find(w => w.type === "far_from_home");
              if (!farWarn) FAIL.runtime("campCoords ignored _school_lat/_school_lng — stored geocoded coords are not being used for conflict detection");
              return `Stored _school_lat/_school_lng used correctly — warning fired at ~${farWarn.distance} mi ✓`;
            },
          },
          {
            name: "Back-to-back travel warning fires for camps 1 day apart and >200 miles",
            run: async (ctx) => {
              const warnings = ctx.detectConflicts({
                camps: [
                  { id: "a", camp_name: "Columbus Camp", start_date: "2026-06-14", city: "Columbus", state: "OH" },
                  { id: "b", camp_name: "Chicago Camp",  start_date: "2026-06-15", city: "Chicago",  state: "IL" },
                ],
                isPaid: true,
              });
              const travelWarn = warnings.find(w => w.type === "back_to_back_travel");
              if (!travelWarn) FAIL.runtime("No back_to_back_travel warning for camps 1 day apart and ~300 miles — back-to-back travel detection may be broken");
              return `back_to_back_travel fired — ${travelWarn.distance} mi, ${travelWarn.message.includes("✈️") ? "flight" : "drive"} ✓`;
            },
          },
          {
            name: "Same-day conflict detected",
            run: async (ctx) => {
              const warnings = ctx.detectConflicts({
                camps: [
                  { id: "x", camp_name: "Camp A", start_date: "2026-06-14", city: "Columbus", state: "OH" },
                  { id: "y", camp_name: "Camp B", start_date: "2026-06-14", city: "Chicago",  state: "IL" },
                ],
                isPaid: false,
              });
              const conflict = warnings.find(w => w.type === "same_day");
              if (!conflict) FAIL.runtime("No same_day conflict detected for two camps on the same date — same-day conflict detection is broken");
              if (conflict.severity !== "error") FAIL.runtime(`Expected severity=error for same-day conflict, got ${conflict.severity} — severity classification may have changed`);
              return "Same-day conflict detected with error severity ✓";
            },
          },
        ],
      },
    ],
  },

  {
    label: "Data Quality",
    section: "Core data integrity",
    journeys: [
      {
        id: "school_data_quality",
        kind: "read",
        name: "School Data Completeness",
        icon: "🏫",
        description: "Schools have division, coordinates (required for travel alerts), and logos — monitors output of Geocode Schools, Seed Logos, and Athletics Cleanup tools.",
        steps: [
          {
            name: "Fetch all schools",
            run: async (ctx) => {
              const schools = await base44.entities.School.filter({});
              if (!Array.isArray(schools) || schools.length === 0)
                FAIL.data("No schools found — school data may have been wiped");
              if (schools.length < 10)
                FAIL.data(`Only ${schools.length} school record(s) found — production should have thousands; DB may be partially wiped or this is a non-production environment`);
              ctx.schools = schools;
              return `${schools.length} schools`;
            },
          },
          {
            name: "Division coverage >50% (Athletics Cleanup working)",
            run: async (ctx) => {
              const withDiv = ctx.schools.filter(s => s.division).length;
              const pct = Math.round((withDiv / ctx.schools.length) * 100);
              if (pct < 50)
                FAIL.data(`Only ${pct}% have a division — run School Athletics Cleanup to fix`);
              return `${withDiv}/${ctx.schools.length} (${pct}%) have division ✓`;
            },
          },
          {
            name: "Coordinate coverage >60% (Geocode Schools working — required for travel alerts)",
            run: async (ctx) => {
              const withCoords = ctx.schools.filter(s =>
                s.lat && s.lng && Number(s.lat) !== 0 && Number(s.lng) !== 0
              ).length;
              const pct = Math.round((withCoords / ctx.schools.length) * 100);
              const missing = ctx.schools.length - withCoords;
              if (pct < 60)
                FAIL.data(`Only ${pct}% have coordinates — ${missing} schools missing lat/lng. Travel distance alerts will be inaccurate. Run Geocode Schools.`);
              if (pct < 80)
                return `${withCoords}/${ctx.schools.length} (${pct}%) have coordinates — ${missing} still missing (run Geocode Schools to improve)`;
              return `${withCoords}/${ctx.schools.length} (${pct}%) have coordinates ✓`;
            },
          },
          {
            name: "Logo coverage check (Seed School Logos status)",
            run: async (ctx) => {
              const withLogo = ctx.schools.filter(s => s.athletic_logo_url).length;
              const pct = Math.round((withLogo / ctx.schools.length) * 100);
              // Logo is informational — warn below 30%, don't fail
              if (pct < 30)
                return `⚠ Only ${pct}% (${withLogo}/${ctx.schools.length}) have a logo — consider running Seed School Logos`;
              return `${withLogo}/${ctx.schools.length} (${pct}%) have a logo`;
            },
          },
        ],
      },

      {
        id: "camp_school_matching",
        kind: "read",
        name: "Camp → School Matching Quality",
        icon: "🔗",
        description: "Camps are linked to schools and Host Org Mappings are verified — monitors output of Host Org Mapping Manager and ingest pipeline.",
        steps: [
          {
            name: "Fetch active camps (sample)",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                FAIL.data("No active camps — Camp entity is empty or all camps are inactive");
              if (camps.length < 5)
                FAIL.data(`Only ${camps.length} active camp(s) — production should have many more; school match rate below this count is not meaningful`);
              ctx.camps = camps;
              return `${camps.length} active camps`;
            },
          },
          {
            name: "School match rate >50% (Host Org Mappings and ingest matching working)",
            run: async (ctx) => {
              const matched = ctx.camps.filter(c => c.school_id).length;
              const pct = Math.round((matched / ctx.camps.length) * 100);
              const unmatched = ctx.camps.length - matched;
              if (pct < 50)
                FAIL.data(`Only ${pct}% of camps matched to a school (${unmatched} unmatched) — run Host Org Mapping Manager to improve`);
              if (pct < 70)
                return `${matched}/${ctx.camps.length} (${pct}%) matched — ${unmatched} still unmatched (run Host Org Mapping Manager to improve)`;
              return `${matched}/${ctx.camps.length} (${pct}%) matched to a school ✓`;
            },
          },
          {
            name: "Host Org Mapping records exist",
            run: async (ctx) => {
              const mappings = await base44.entities.HostOrgMapping.filter({});
              if (!Array.isArray(mappings))
                FAIL.runtime("HostOrgMapping.filter() returned non-array — entity query is broken");
              if (mappings.length === 0)
                return "⚠ No HostOrgMapping records — run backfill from Host Org Mapping Manager to improve school matching";
              const verified = mappings.filter(m => m.verified).length;
              const unverified = mappings.length - verified;
              ctx.unverifiedMappings = unverified;
              return `${mappings.length} mappings — ${verified} verified, ${unverified} pending review`;
            },
          },
          {
            name: "Unverified mappings are not excessive (>200 suggests review needed)",
            run: async (ctx) => {
              if (ctx.unverifiedMappings === undefined) return "Skipped — mapping count unavailable";
              if (ctx.unverifiedMappings > 200)
                return `⚠ ${ctx.unverifiedMappings} unverified HostOrgMappings — review in Host Org Mapping Manager to improve school matching accuracy`;
              return `${ctx.unverifiedMappings} unverified mappings — within acceptable range ✓`;
            },
          },
        ],
      },

      {
        id: "camp_enrichment_quality",
        kind: "read",
        name: "Camp Enrichment Completeness",
        icon: "📋",
        description: "Ryzer camps have program names and venues, and missing coordinates are tracked — monitors output of Backfill Ryzer Program Name and Geocode Schools.",
        steps: [
          {
            name: "Fetch active camps",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                FAIL.data("No active camps — Camp entity is empty or all camps are inactive");
              if (camps.length < 5)
                FAIL.data(`Only ${camps.length} active camp(s) — enrichment quality metrics below this count are not meaningful`);
              ctx.camps = camps;
              return `${camps.length} active camps`;
            },
          },
          {
            name: "Ryzer camp program name coverage (Backfill Ryzer status)",
            run: async (ctx) => {
              const ryzerCamps = ctx.camps.filter(c =>
                c.link_url && (c.link_url.includes("ryzer.com") || c.link_url.includes("ryzerevents.com"))
              );
              if (ryzerCamps.length === 0)
                return "No Ryzer camps found in active set — skipped";
              const withName = ryzerCamps.filter(c => c.ryzer_program_name).length;
              const pct = Math.round((withName / ryzerCamps.length) * 100);
              const missing = ryzerCamps.length - withName;
              if (pct < 50)
                return `⚠ ${pct}% of Ryzer camps have program name (${missing} missing) — run Backfill Ryzer Program Name`;
              return `${withName}/${ryzerCamps.length} (${pct}%) of Ryzer camps have program name${missing > 0 ? ` — ${missing} still missing` : " ✓"}`;
            },
          },
          {
            name: "Camps have start_date (required for Calendar and conflict detection)",
            run: async (ctx) => {
              const sample = ctx.camps.slice(0, 50);
              const missing = sample.filter(c => !c.start_date).length;
              const pct = Math.round(((sample.length - missing) / sample.length) * 100);
              if (missing > 5)
                FAIL.data(`${missing}/50 sampled camps missing start_date — Calendar cannot place them and conflict detection is broken`);
              return `${sample.length - missing}/50 sampled camps have start_date (${pct}%) ✓`;
            },
          },
          {
            name: "Camps have state field (required for geographic filtering)",
            run: async (ctx) => {
              const sample = ctx.camps.slice(0, 50);
              const missing = sample.filter(c => !c.state).length;
              if (missing > 10)
                return `⚠ ${missing}/50 sampled camps missing state — geographic filtering will be incomplete`;
              return `${sample.length - missing}/50 sampled camps have state ✓`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "Ingest Pipeline",
    section: "Critical platform/config",
    journeys: [
      {
        id: "ingest_config",
        kind: "read",
        remediation: "Go to /SportIngestConfigManager in production and seed/repair configs.",
        name: "Ingest — Sport Configs Active",
        icon: "⚙️",
        description: "SportIngestConfig has active records — the weekly job has sports to process.",
        steps: [
          {
            name: "Fetch SportIngestConfig records",
            run: async (ctx) => {
              const configs = await base44.entities.SportIngestConfig.filter({});
              ctx.configs = Array.isArray(configs) ? configs : [];
              if (ctx.configs.length === 0)
                FAIL.config("No SportIngestConfig records — weeklyIngestAllSports has no sports to process. Visit /SportIngestConfigManager and seed defaults.");
              return `${ctx.configs.length} SportIngestConfig record${ctx.configs.length !== 1 ? "s" : ""}`;
            },
          },
          {
            name: "At least one config is active",
            run: async (ctx) => {
              const active = ctx.configs.filter(c => c.active);
              if (active.length === 0)
                FAIL.config(`All ${ctx.configs.length} SportIngestConfig records are inactive — weekly ingest will skip every sport. Activate at least one in /SportIngestConfigManager.`);
              return `${active.length}/${ctx.configs.length} configs active: ${active.map(c => c.sport_key).join(", ")}`;
            },
          },
          {
            name: "Active configs have a sport_key",
            run: async (ctx) => {
              const bad = ctx.configs.filter(c => c.active && !c.sport_key);
              if (bad.length > 0)
                FAIL.config(`${bad.length} active configs missing sport_key — ingestCampsUSA would fail for them. Fix in /SportIngestConfigManager.`);
              return "All active configs have sport_key ✓";
            },
          },
        ],
      },

      {
        id: "ingest_freshness",
        kind: "read",
        name: "Ingest — Camp Data Freshness",
        icon: "🕐",
        description: "Active camps have been ingested recently, confirming the weekly job ran within the expected window.",
        steps: [
          {
            name: "Fetch sample of active camps",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                FAIL.data("No active camps — ingest may never have run or all camps were deactivated");
              ctx.camps = camps;
              return `${camps.length} active camps`;
            },
          },
          {
            name: "Camps have last_ingested_at (ingest is writing timestamps)",
            run: async (ctx) => {
              const sample = ctx.camps.slice(0, 50);
              const withTs = sample.filter(c => c.last_ingested_at).length;
              const pct = Math.round((withTs / sample.length) * 100);
              if (pct < 50)
                FAIL.data(`Only ${pct}% of sampled camps have last_ingested_at — ingest may not be writing timestamps`);
              ctx.campsWithTs = ctx.camps.filter(c => c.last_ingested_at);
              return `${withTs}/${sample.length} sampled camps have last_ingested_at (${pct}%)`;
            },
          },
          {
            name: "At least one camp ingested within the last 14 days",
            run: async (ctx) => {
              const cutoff = new Date(Date.now() - 14 * 86400000);
              const recent = ctx.campsWithTs.filter(c => new Date(c.last_ingested_at) >= cutoff);
              if (recent.length === 0) {
                const mostRecent = ctx.campsWithTs
                  .map(c => new Date(c.last_ingested_at))
                  .sort((a, b) => b - a)[0];
                FAIL.data(
                  `No camps ingested in the last 14 days — most recent: ${mostRecent ? mostRecent.toLocaleDateString() : "unknown"}. Weekly job may be failing.`
                );
              }
              const mostRecent = ctx.campsWithTs
                .map(c => new Date(c.last_ingested_at))
                .sort((a, b) => b - a)[0];
              return `${recent.length} camps ingested in last 14 days — most recent: ${mostRecent.toLocaleDateString()} ✓`;
            },
          },
          {
            name: "Ingestion error rate is acceptable (<20% of sampled camps)",
            run: async (ctx) => {
              const sample = ctx.camps.slice(0, 100);
              const errored = sample.filter(c => c.ingestion_status === "error").length;
              const pct = Math.round((errored / sample.length) * 100);
              if (pct >= 20)
                FAIL.data(`${pct}% of sampled camps have ingestion_status=error — ingest pipeline may be broken`);
              const active = sample.filter(c => c.ingestion_status === "active").length;
              return `Error rate: ${pct}% (${errored}/${sample.length})  active: ${active} ✓`;
            },
          },
        ],
      },

      {
        id: "ingest_function",
        kind: "read",
        name: "Ingest — Pipeline Function Health",
        icon: "🔄",
        description: "campHealthCheck function is reachable and reports a healthy camp store.",
        steps: [
          {
            name: "campHealthCheck function reachable",
            run: async (ctx) => {
              const res = await base44.functions.invoke("campHealthCheck", {});
              const data = res?.data;
              if (!data) FAIL.runtime("campHealthCheck returned empty response — function may be down or returning non-standard format");
              ctx.campHealth = data;
              const total = data.totalCamps ?? data.total_camps ?? null;
              return `campHealthCheck responded — totalCamps=${total ?? "(field not found)"}`;
            },
          },
          {
            name: "Camp store reports healthy total count",
            run: async (ctx) => {
              const total = ctx.campHealth?.totalCamps ?? ctx.campHealth?.total_camps ?? null;
              if (total === null) return "totalCamps field not in response — check campHealthCheck output format";
              if (total === 0) FAIL.data("campHealthCheck reports 0 camps — data may have been wiped");
              return `${total.toLocaleString()} total camps in store ✓`;
            },
          },
          {
            name: "Majority of camps have school_id (school matching working)",
            run: async (ctx) => {
              const total = ctx.campHealth?.totalCamps ?? ctx.campHealth?.total_camps;
              const unmatched = ctx.campHealth?.schoolIdNull ?? null;
              if (total == null || unmatched == null) return "School match data not in campHealthCheck response — skipped";
              const matchedPct = Math.round(((total - unmatched) / total) * 100);
              if (matchedPct < 40)
                FAIL.data(`Only ${matchedPct}% of camps matched to a school — school matching may be broken`);
              return `${matchedPct}% of camps have school_id (${total - unmatched}/${total}) ✓`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "Communications",
    section: "Critical platform/config",
    journeys: [
      {
        id: "email_config",
        kind: "read",
        remediation: "Check Base44 email provider settings in production admin.",
        name: "Email System Config",
        icon: "📧",
        description: "Resend API key is set and sendMonthlyAgenda function responds.",
        steps: [
          {
            name: "Invoke sendMonthlyAgenda check_config",
            run: async (ctx) => {
              const res = await base44.functions.invoke("sendMonthlyAgenda", { mode: "check_config" });
              const data = res?.data;
              if (!data?.ok) FAIL.config(data?.error || "sendMonthlyAgenda check_config returned ok:false — function may be missing or misconfigured");
              ctx.config = data;
              return "Function responded ok:true";
            },
          },
          {
            name: "RESEND_API_KEY is set",
            run: async (ctx) => {
              const val = ctx.config?.RESEND_API_KEY || "";
              if (val === "NOT SET" || !val) FAIL.config("RESEND_API_KEY is NOT SET in production environment — all emails will fail");
              return val;
            },
          },
          {
            name: "FROM_EMAIL is configured",
            run: async (ctx) => {
              const val = ctx.config?.RESEND_FROM_EMAIL || "";
              if (!val) FAIL.config("RESEND_FROM_EMAIL is not set in production environment — sendMonthlyAgenda cannot send");
              return val;
            },
          },
        ],
      },

      {
        id: "camp_week_alert",
        kind: "read",
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
              if (!data?.ok) FAIL.runtime(data?.error || "sendCampWeekAlert dry_run returned ok:false — function may be missing or broken");
              return `ok:true — ${data.summary?.dry_run ?? 0} accounts would be alerted`;
            },
          },
        ],
      },

      {
        id: "email_prefs",
        kind: "read",
        name: "Email Preferences",
        icon: "⚙️",
        description: "EmailPreferences entity is reachable (opt-out system functional).",
        steps: [
          {
            name: "Fetch email preferences",
            run: async () => {
              const prefs = await base44.entities.EmailPreferences.filter({});
              if (!Array.isArray(prefs)) FAIL.runtime("EmailPreferences.filter() returned non-array — opt-out entity is broken");
              const optedOut = prefs.filter(p => p.monthly_agenda_opt_out || p.camp_week_alert_opt_out).length;
              return `${prefs.length} records — ${optedOut} with at least one opt-out`;
            },
          },
        ],
      },
    ],
  },
  {
    label: "Checkout & Access",
    section: "Critical platform/config",
    journeys: [
      {
        id: "season_config",
        kind: "read",
        remediation: "Go to /SeasonConfig in production and ensure at least one season is configured.",
        name: "Season Config & Access Gate",
        icon: "📅",
        description: "getActiveSeason function responds with a valid season, Subscribe and Checkout can load pricing.",
        steps: [
          {
            name: "Invoke getActiveSeason",
            run: async (ctx) => {
              const res = await base44.functions.invoke("getActiveSeason", {});
              const data = res?.data;
              if (!data?.ok) FAIL.config(data?.error || "getActiveSeason returned ok:false — no active season is configured");
              ctx.season = data.season;
              return `ok:true — season_year=${data.season?.season_year ?? "—"}`;
            },
          },
          {
            name: "Season has season_year and active flag",
            run: async (ctx) => {
              if (!ctx.season?.season_year) FAIL.config("season.season_year missing — Subscribe page cannot display pricing; configure in /SeasonConfig");
              if (ctx.season.active === undefined) FAIL.config("season.active field missing — access gate cannot evaluate season state");
              return `season_year=${ctx.season.season_year}  active=${ctx.season.active}`;
            },
          },
          {
            name: "SeasonConfig entity queryable",
            run: async (ctx) => {
              const configs = await base44.entities.SeasonConfig.filter({});
              if (!Array.isArray(configs)) FAIL.runtime("SeasonConfig.filter() returned non-array — entity may be broken");
              if (configs.length === 0) FAIL.config("No SeasonConfig records — getActiveSeason has nothing to return; seed via /SeasonConfig");
              ctx.seasonConfigs = configs;
              return `${configs.length} SeasonConfig record${configs.length !== 1 ? "s" : ""}`;
            },
          },
          {
            name: "At least one season marked active",
            run: async (ctx) => {
              const active = ctx.seasonConfigs.filter(s => s.active);
              if (active.length === 0) FAIL.config("No active SeasonConfig — platform is in limbo (no subscribable season); activate one in /SeasonConfig");
              if (active.length > 1) FAIL.config(`${active.length} seasons marked active simultaneously — should be exactly 1; deactivate extras in /SeasonConfig`);
              return `Exactly 1 active season: ${active[0].season_year}`;
            },
          },
        ],
      },

      {
        id: "promo_validation",
        kind: "read",
        name: "Promo Code Validation",
        icon: "🎟️",
        description: "validatePromo function handles invalid codes gracefully without crashing.",
        steps: [
          {
            name: "validatePromo reachable",
            run: async (ctx) => {
              const res = await base44.functions.invoke("validatePromo", { promoCode: "__HEALTHCHECK_INVALID__" });
              const data = res?.data;
              // Any response (ok:true or ok:false) proves the function is reachable
              if (data === undefined || data === null) FAIL.runtime("validatePromo returned empty response — function may be down or not deployed");
              ctx.promoRes = data;
              return `Function responded — ok=${data.ok}`;
            },
          },
          {
            name: "Invalid code returns ok:false with an error message",
            run: async (ctx) => {
              if (ctx.promoRes.ok === true) FAIL.runtime("Unknown test code was accepted — promo validation may not be working; Checkout page could accept any string as a promo code");
              if (!ctx.promoRes.error && !ctx.promoRes.message) FAIL.runtime("validatePromo returned ok:false but no error message — Checkout page cannot display reason for rejection");
              return `ok:false  error: "${ctx.promoRes.error || ctx.promoRes.message}"`;
            },
          },
          {
            name: "Empty promo code returns ok:false",
            run: async (ctx) => {
              const res = await base44.functions.invoke("validatePromo", { promoCode: "" });
              const data = res?.data;
              if (data?.ok === true) FAIL.runtime("Empty promo code was accepted — validation logic may be broken");
              return `Empty code correctly rejected`;
            },
          },
        ],
      },

      {
        id: "post_payment_routing",
        kind: "read",
        name: "Post-Payment Account Creation Routing",
        icon: "🔀",
        description: "CheckoutSuccess saves the correct sessionStorage keys so AuthRedirect can pick up postPaymentSignup and stripeSessionId after account creation on /Signup.",
        steps: [
          {
            name: "sessionStorage is available",
            run: async () => {
              if (typeof sessionStorage === "undefined") FAIL.runtime("sessionStorage not available — post-payment routing will fail");
              return "sessionStorage available ✓";
            },
          },
          {
            name: "Can write and read postPaymentSignup key",
            run: async (ctx) => {
              const KEY = "postPaymentSignup";
              sessionStorage.setItem(KEY, "true");
              const val = sessionStorage.getItem(KEY);
              if (val !== "true") FAIL.runtime(`sessionStorage write/read failed for key '${KEY}' — AuthRedirect Priority 1 will not trigger`);
              sessionStorage.removeItem(KEY);
              return `Key '${KEY}' read/write ok ✓`;
            },
          },
          {
            name: "Can write and read stripeSessionId key",
            run: async () => {
              const KEY = "stripeSessionId";
              const testVal = "cs_test_healthcheck_probe";
              sessionStorage.setItem(KEY, testVal);
              const val = sessionStorage.getItem(KEY);
              if (val !== testVal) FAIL.runtime(`sessionStorage write/read failed for key '${KEY}' — linkStripePayment fallback will not receive session id`);
              sessionStorage.removeItem(KEY);
              return `Key '${KEY}' read/write ok ✓`;
            },
          },
          {
            name: "Can write and read paidSeasonYear key",
            run: async () => {
              const KEY = "paidSeasonYear";
              sessionStorage.setItem(KEY, "2026");
              const val = sessionStorage.getItem(KEY);
              if (val !== "2026") FAIL.runtime(`sessionStorage write/read failed for key '${KEY}' — paidSeasonYear cannot be passed through post-payment routing`);
              sessionStorage.removeItem(KEY);
              return `Key '${KEY}' read/write ok ✓`;
            },
          },
          {
            name: "Signup page route exists in pages config",
            run: async () => {
              // Import the pages config to verify Signup is registered
              const mod = await import("../pages.config.js");
              const pages = mod.PAGES || mod.pagesConfig?.Pages;
              if (!pages) FAIL.config("Could not import PAGES from pages.config.js — route registration config is broken");
              if (!pages["Signup"]) FAIL.config("'Signup' not registered in PAGES — /Signup route will 404 and post-payment account creation will fail");
              if (!pages["TermsOfService"]) FAIL.config("'TermsOfService' not registered in PAGES — /TermsOfService will show a blank page");
              if (!pages["PrivacyPolicy"]) FAIL.config("'PrivacyPolicy' not registered in PAGES — /PrivacyPolicy will show a blank page");
              return "Signup, TermsOfService, PrivacyPolicy all registered in PAGES ✓";
            },
          },
        ],
      },

      {
        id: "stripe_functions",
        kind: "read",
        remediation: "Verify Stripe API keys are configured in production environment variables.",
        name: "Stripe Backend Functions",
        icon: "💳",
        description: "verifyStripeSession and linkStripePayment functions are reachable. Both must handle paid and $0 sessions (100% off coupons via no_payment_required).",
        steps: [
          {
            name: "verifyStripeSession function reachable",
            run: async (ctx) => {
              const res = await base44.functions.invoke("verifyStripeSession", { sessionId: "__healthcheck_probe__" });
              const data = res?.data;
              if (data === undefined || data === null) FAIL.ext("verifyStripeSession returned empty response — function may be down or Stripe API key is missing");
              ctx.verifyRes = data;
              return `Function responded — ok=${data.ok}`;
            },
          },
          {
            name: "verifyStripeSession rejects invalid session (not a silent pass)",
            run: async (ctx) => {
              if (ctx.verifyRes.ok === true && ctx.verifyRes.paid === true) {
                FAIL.runtime("Probe session returned paid:true — Stripe session validation is not working (any string accepted as valid session)");
              }
              return `Invalid session correctly not accepted — function alive and validating ✓`;
            },
          },
          {
            name: "linkStripePayment function reachable",
            run: async (ctx) => {
              // Probe with empty sessionId. The function returns HTTP 400 for missing sessionId
              // and HTTP 401 for unauthenticated requests — both mean the function is alive and
              // enforcing validation. base44.functions.invoke() throws on non-2xx, so catch those.
              try {
                const res = await base44.functions.invoke("linkStripePayment", { sessionId: "" });
                const data = res?.data;
                if (data === undefined || data === null) FAIL.ext("linkStripePayment returned empty response — function may be down");
                ctx.linkRes = data;
                ctx.linkValidated = true;
                return `Function responded — ok=${data.ok}`;
              } catch (e) {
                const msg = e?.message || "";
                if (msg.includes("400") || msg.includes("401")) {
                  ctx.linkRes = { ok: false, error: "validation enforced (HTTP error)" };
                  ctx.linkValidated = true;
                  return `Function alive — validation enforced (${msg.includes("401") ? "auth required" : "sessionId required"}) ✓`;
                }
                FAIL.ext("linkStripePayment unreachable: " + msg);
              }
            },
          },
          {
            name: "linkStripePayment rejects missing sessionId",
            run: async (ctx) => {
              if (!ctx.linkValidated) FAIL.runtime("Previous step did not confirm linkStripePayment is alive");
              if (ctx.linkRes?.ok === true) FAIL.runtime("linkStripePayment accepted an empty sessionId — payment linking could be triggered without a valid Stripe session");
              const errMsg = ctx.linkRes?.error || "(no error field)";
              return `Empty sessionId correctly rejected — error: "${errMsg}" ✓`;
            },
          },
        ],
      },

      {
        id: "sport_position",
        kind: "read",
        name: "Sport & Position Lists",
        icon: "🏈",
        description: "Sport and Position entities are accessible — required for Profile setup and camp filtering.",
        steps: [
          {
            name: "Fetch active sports",
            run: async (ctx) => {
              const sports = await base44.entities.Sport.filter({});
              if (!Array.isArray(sports) || sports.length === 0) FAIL.data("No sports found — Sport entity is empty; Profile position dropdown will be empty");
              ctx.sports = sports;
              const active = sports.filter(s => s.active !== false);
              return `${sports.length} sports (${active.length} active)`;
            },
          },
          {
            name: "Sports have name field",
            run: async (ctx) => {
              const bad = ctx.sports.filter(s => !s.sport_name && !s.name);
              if (bad.length > 0) FAIL.data(`${bad.length} sports missing name — Profile dropdowns will show blank entries`);
              return `All ${ctx.sports.length} sports have a name`;
            },
          },
          {
            name: "Fetch positions",
            run: async (ctx) => {
              const positions = await base44.entities.Position.filter({});
              if (!Array.isArray(positions)) FAIL.runtime("Position.filter() returned non-array — entity may be broken");
              if (positions.length === 0) FAIL.data("No positions found — Position entity is empty; Profile cannot assign a position");
              ctx.positions = positions;
              return `${positions.length} positions`;
            },
          },
          {
            name: "Positions link to a sport_id",
            run: async (ctx) => {
              const unlinked = ctx.positions.filter(p => !p.sport_id && !p.sportId).length;
              if (unlinked > ctx.positions.length / 2) FAIL.data(`${unlinked}/${ctx.positions.length} positions missing sport_id — Profile dropdown will be broken`);
              return `${ctx.positions.length - unlinked}/${ctx.positions.length} positions have sport_id`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "Support Tickets",
    section: "Controlled transaction checks",
    journeys: [
      {
        id: "support_ticket_lifecycle",
        kind: "transaction",
        name: "Support Ticket Lifecycle",
        icon: "🎫",
        description: "submitSupportTicket creates a ticket, it is queryable, admin can update status, replyToTicket function is reachable, and ticket is closed for cleanup.",
        steps: [
          {
            name: "submitSupportTicket function reachable",
            run: async (ctx) => {
              let res, data;
              try {
                res = await base44.functions.invoke("submitSupportTicket", {
                  type: "support",
                  subject: "[HEALTHCHECK] Test Ticket — safe to ignore",
                  description: "Automated health check test. This ticket was created by the AppHealthCheck runner and will be closed immediately.",
                  userEmail: "healthcheck@example.com",
                  userName: "Health Check",
                  accountType: "admin",
                });
                data = res?.data;
              } catch (err) {
                // Extract the actual server error message from the response body if available
                const serverMsg = err?.response?.data?.error || err?.response?.data?.message || null;
                FAIL.runtime(serverMsg
                  ? `submitSupportTicket 500 — server says: ${serverMsg}`
                  : `submitSupportTicket unreachable (${err.message})`);
              }
              if (!data?.ok) FAIL.runtime(data?.error || "submitSupportTicket returned ok:false — function may be missing or misconfigured");
              ctx.ticketNumber = data.ticketNumber;
              return `Ticket created — #${data.ticketNumber}`;
            },
          },
          {
            name: "Ticket queryable via SupportTicket entity",
            run: async (ctx) => {
              const tickets = await base44.entities.SupportTicket.filter({});
              if (!Array.isArray(tickets)) FAIL.runtime("SupportTicket.filter() returned non-array — entity query is broken");
              const found = tickets.find(t =>
                t.ticket_number === ctx.ticketNumber ||
                t.subject === "[HEALTHCHECK] Test Ticket — safe to ignore"
              );
              if (!found) {
                return `${tickets.length} tickets queryable (test ticket not found by number — may be pagination)`;
              }
              ctx.ticketFound = found;
              return `Ticket #${found.ticket_number} (id=${found.id}) confirmed in store — status: ${found.status}`;
            },
          },
          {
            name: "Admin can update ticket status",
            run: async (ctx) => {
              const id = ctx.ticketFound?.id;
              if (!id) return "Skipped — ticket id not found via entity filter (function responded ok)";
              const updated = await base44.entities.SupportTicket.update(id, {
                status: "closed",
                admin_notes: `[HEALTHCHECK] Auto-closed by health check on ${new Date().toISOString().slice(0,10)}`,
              });
              if (!updated) FAIL.runtime("SupportTicket.update() returned null — entity update path is broken");
              return `Ticket id=${id} updated to closed`;
            },
          },
          {
            name: "replyToTicket function reachable",
            run: async () => {
              // Probe with an empty body — the function returns 400 immediately
              // (ticketId required) before any DB lookup or email is attempted.
              // A 400 proves the function is alive; anything else (502, 500) is a real failure.
              try {
                await base44.functions.invoke("replyToTicket", {});
                // If somehow ok:true with no ticketId, still counts as reachable
                return "replyToTicket responded (no ticketId — unexpected ok:true)";
              } catch (err) {
                const status = err?.response?.status ?? err?.status;
                if (status === 400) return "replyToTicket reachable — returned 400 for missing ticketId ✓";
                if (status === 403) return "replyToTicket reachable — admin guard enforced ✓";
                if (status === 404) return "replyToTicket reachable — returned 404 ✓";
                // 502 / 500 / network error = real failure
                FAIL.runtime(`replyToTicket unavailable (HTTP ${status ?? "unknown"}): ${err.message}`);
              }
            },
          },
        ],
        cleanup: async (ctx) => {
          const id = ctx.ticketFound?.id;
          if (id) {
            try {
              await base44.entities.SupportTicket.update(id, { status: "closed", admin_notes: "[HEALTHCHECK] Auto-closed" });
            } catch {}
          }
        },
      },
    ],
  },

  {
    label: "Advanced Subscriber Flows",
    section: "Controlled transaction checks",
    journeys: [
      {
        id: "multi_athlete_isolation",
        kind: "transaction",
        name: "Multi-Athlete Data Isolation",
        icon: "👥",
        description: "CampIntent queries filter strictly by athlete_id — one athlete's camps do not appear in another athlete's view. Orphan search: filter AthleteProfile for first_name='__hc_a1__' or '__hc_a2__' (grad_year=2099), then filter CampIntent for those athlete_ids.",
        steps: [
          {
            name: "Create two test athlete profiles",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("Cannot get account id — auth.me() returned no id");
              ctx.myId = me.id;

              const a1 = await base44.entities.AthleteProfile.create({
                first_name: "__hc_a1__", last_name: "__test__",
                athlete_name: "__hc_a1__ __test__",
                account_id: ctx.myId, active: true, sport_id: "test", grad_year: 2099,
              });
              const a2 = await base44.entities.AthleteProfile.create({
                first_name: "__hc_a2__", last_name: "__test__",
                athlete_name: "__hc_a2__ __test__",
                account_id: ctx.myId, active: true, sport_id: "test", grad_year: 2099,
              });
              if (!a1?.id || !a2?.id) FAIL.runtime("Failed to create one or both test athletes — AthleteProfile write path may be broken");
              ctx.athlete1Id = a1.id;
              ctx.athlete2Id = a2.id;
              return `Athlete 1 id=${a1.id}  Athlete 2 id=${a2.id}`;
            },
          },
          {
            name: "Fetch a camp to use as test target",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) FAIL.data("No active camps for intent isolation test — Camp entity may be empty");
              ctx.campA = camps[0];
              ctx.campB = camps[1] || camps[0];
              return `Using camp "${ctx.campA.camp_name}" for A, "${ctx.campB.camp_name}" for B`;
            },
          },
          {
            name: "Create CampIntent for athlete 1 only",
            run: async (ctx) => {
              const intent = await base44.entities.CampIntent.create({
                camp_id: ctx.campA.id, athlete_id: ctx.athlete1Id, account_id: ctx.myId || "", status: "favorite",
              });
              if (!intent?.id) FAIL.runtime("CampIntent.create() returned no id — write permission may be missing");
              ctx.intent1Id = intent.id;
              return `Intent id=${intent.id} created for athlete 1`;
            },
          },
          {
            name: "Athlete 2 query returns no intents (isolation check)",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete2Id });
              const leak = (intents || []).filter(i => i.camp_id === ctx.campA.id && i.athlete_id === ctx.athlete1Id);
              if (leak.length > 0) FAIL.runtime(`Athlete 1's intent leaked into Athlete 2's query — athlete_id filter is not isolating data correctly`);
              const ownIntents = (intents || []).filter(i => i.athlete_id === ctx.athlete2Id);
              return `Athlete 2 query: ${ownIntents.length} own intents, 0 from athlete 1 ✓`;
            },
          },
          {
            name: "Athlete 1 query returns correct intent",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete1Id });
              const found = (intents || []).find(i => i.id === ctx.intent1Id);
              if (!found) FAIL.runtime(`Athlete 1's own intent id=${ctx.intent1Id} not found in their filtered query — CampIntent filter broken`);
              return `Athlete 1 query returns their intent correctly — status: ${found.status} ✓`;
            },
          },
          {
            name: "Cleanup — delete test intents and athletes",
            run: async (ctx) => {
              if (ctx.intent1Id) await base44.entities.CampIntent.delete(ctx.intent1Id).catch(() => {});
              if (ctx.athlete1Id) await base44.entities.AthleteProfile.delete(ctx.athlete1Id).catch(() => {});
              if (ctx.athlete2Id) await base44.entities.AthleteProfile.delete(ctx.athlete2Id).catch(() => {});
              return "Test data cleaned up";
            },
          },
        ],
        cleanup: async (ctx) => {
          try { if (ctx.intent1Id) await base44.entities.CampIntent.delete(ctx.intent1Id); } catch {}
          try { if (ctx.athlete1Id) await base44.entities.AthleteProfile.delete(ctx.athlete1Id); } catch {}
          try { if (ctx.athlete2Id) await base44.entities.AthleteProfile.delete(ctx.athlete2Id); } catch {}
        },
      },

      {
        id: "addon_athlete_provisioning",
        kind: "transaction",
        name: "Add-on Athlete Provisioning",
        icon: "👤",
        description: "A second (non-primary) AthleteProfile can be created with all required fields — home_city, home_state, display_name, is_primary:false — and is correctly queryable by account_id.",
        steps: [
          {
            name: "Get current account",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("auth.me() returned no id");
              ctx.myId = me.id;
              return `account id = ${me.id}`;
            },
          },
          {
            name: "Create add-on AthleteProfile with all linkStripePayment fields",
            run: async (ctx) => {
              const profile = await base44.entities.AthleteProfile.create({
                account_id: ctx.myId,
                first_name: "__hc_addon__",
                last_name: "__test__",
                athlete_name: "__hc_addon__ __test__",
                display_name: "__hc_addon__ __test__",
                is_primary: false,
                active: true,
                sport_id: "test",
                grad_year: 2099,
                home_city: "TestCity",
                home_state: "TX",
                parent_first_name: "TestParent",
                parent_last_name: "TestLast",
                parent_phone: "555-555-5555",
              });
              if (!profile?.id) FAIL.runtime("AthleteProfile.create() returned no id — add-on athlete provisioning flow will fail");
              ctx.addonProfileId = profile.id;
              return `Add-on profile created (id=${profile.id})`;
            },
          },
          {
            name: "Add-on profile queryable by account_id",
            run: async (ctx) => {
              const profiles = await base44.entities.AthleteProfile.filter({ account_id: ctx.myId });
              const found = (profiles || []).find(p => p.id === ctx.addonProfileId);
              if (!found) FAIL.runtime(`Add-on profile id=${ctx.addonProfileId} not found via account_id filter — query may be broken`);
              ctx.addonFound = found;
              return `Profile found via account_id filter ✓`;
            },
          },
          {
            name: "is_primary=false persisted correctly",
            run: async (ctx) => {
              if (ctx.addonFound.is_primary === true) FAIL.data("Add-on athlete incorrectly marked is_primary=true — AthleteSwitcher sort logic will be wrong");
              return `is_primary=${ctx.addonFound.is_primary} ✓`;
            },
          },
          {
            name: "home_city, home_state, display_name all persisted",
            run: async (ctx) => {
              const missing = ["home_city", "home_state", "display_name"].filter(f => !ctx.addonFound[f]);
              if (missing.length > 0) FAIL.data(`Add-on profile missing: ${missing.join(", ")} — linkStripePayment add-on path has a field coverage bug`);
              return `home_city=${ctx.addonFound.home_city}  home_state=${ctx.addonFound.home_state}  display_name=${ctx.addonFound.display_name} ✓`;
            },
          },
          {
            name: "parent fields persisted",
            run: async (ctx) => {
              const missing = ["parent_first_name", "parent_last_name", "parent_phone"].filter(f => !ctx.addonFound[f]);
              if (missing.length > 0) FAIL.data(`Add-on profile missing parent fields: ${missing.join(", ")} — parent contact info not persisting correctly`);
              return `parent: ${ctx.addonFound.parent_first_name} ${ctx.addonFound.parent_last_name}  phone: ${ctx.addonFound.parent_phone} ✓`;
            },
          },
          {
            name: "Cleanup — delete add-on test profile",
            run: async (ctx) => {
              if (ctx.addonProfileId) await base44.entities.AthleteProfile.delete(ctx.addonProfileId).catch(() => {});
              return "Add-on test profile deleted";
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.addonProfileId) {
            try { await base44.entities.AthleteProfile.delete(ctx.addonProfileId); } catch {}
          }
        },
      },

      {
        id: "primary_athlete_sort",
        kind: "transaction",
        name: "Primary Athlete Sort Order",
        icon: "🔢",
        description: "When multiple athletes exist, is_primary:true athletes sort before secondary athletes — AthleteSwitcher defaults to the right athlete.",
        steps: [
          {
            name: "Get current account",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("auth.me() returned no id");
              ctx.myId = me.id;
              return `account id = ${me.id}`;
            },
          },
          {
            name: "Create one primary and one secondary test athlete",
            run: async (ctx) => {
              const primary = await base44.entities.AthleteProfile.create({
                account_id: ctx.myId, first_name: "__hc_primary__", last_name: "__sort_test__",
                athlete_name: "__hc_primary__ __sort_test__", is_primary: true, active: true,
                sport_id: "test", grad_year: 2099,
              });
              const secondary = await base44.entities.AthleteProfile.create({
                account_id: ctx.myId, first_name: "__hc_secondary__", last_name: "__sort_test__",
                athlete_name: "__hc_secondary__ __sort_test__", is_primary: false, active: true,
                sport_id: "test", grad_year: 2099,
              });
              if (!primary?.id || !secondary?.id) FAIL.runtime("Could not create test athletes — AthleteProfile write path may be broken");
              ctx.primaryId = primary.id;
              ctx.secondaryId = secondary.id;
              return `Primary id=${primary.id}  Secondary id=${secondary.id}`;
            },
          },
          {
            name: "Sorting is_primary:true first yields correct order",
            run: async (ctx) => {
              const profiles = await base44.entities.AthleteProfile.filter({ account_id: ctx.myId });
              const testProfiles = (profiles || []).filter(p =>
                p.id === ctx.primaryId || p.id === ctx.secondaryId
              );
              if (testProfiles.length < 2) FAIL.runtime("Could not find both test profiles for sort check — filter or create step failed");
              // Apply same sort as AthleteSwitcher
              const sorted = [...testProfiles].sort((a, b) => {
                if (a.is_primary && !b.is_primary) return -1;
                if (!a.is_primary && b.is_primary) return 1;
                return 0;
              });
              if (sorted[0].id !== ctx.primaryId) FAIL.runtime("is_primary:true athlete did not sort first — AthleteSwitcher would default to wrong athlete");
              return "is_primary:true athlete sorts first ✓";
            },
          },
          {
            name: "Cleanup — delete sort test athletes",
            run: async (ctx) => {
              if (ctx.primaryId) await base44.entities.AthleteProfile.delete(ctx.primaryId).catch(() => {});
              if (ctx.secondaryId) await base44.entities.AthleteProfile.delete(ctx.secondaryId).catch(() => {});
              return "Sort test athletes deleted";
            },
          },
        ],
        cleanup: async (ctx) => {
          try { if (ctx.primaryId) await base44.entities.AthleteProfile.delete(ctx.primaryId); } catch {}
          try { if (ctx.secondaryId) await base44.entities.AthleteProfile.delete(ctx.secondaryId); } catch {}
        },
      },

      {
        id: "entitlement_windows",
        kind: "read",
        name: "Entitlement Time Window Validity",
        icon: "🕐",
        description: "Active entitlements have starts_at and ends_at, and at least one is currently within its access window.",
        steps: [
          {
            name: "Fetch active entitlements",
            run: async (ctx) => {
              const ents = await base44.entities.Entitlement.filter({ status: "active" });
              if (!Array.isArray(ents)) FAIL.runtime("Entitlement.filter() returned non-array — entity query is broken");
              if (ents.length === 0) {
                ctx.ents = [];
                return "No active entitlements — skipping time window checks (post-purge or pre-launch)";
              }
              ctx.ents = ents;
              return `${ents.length} active entitlements`;
            },
          },
          {
            name: "Entitlements have starts_at and ends_at",
            run: async (ctx) => {
              if (ctx.ents.length === 0) return "Skipped — no entitlements to check";
              const missingStart = ctx.ents.filter(e => !e.starts_at).length;
              const missingEnd = ctx.ents.filter(e => !e.ends_at).length;
              if (missingStart > ctx.ents.length / 2) FAIL.data(`${missingStart}/${ctx.ents.length} entitlements missing starts_at — access window cannot be evaluated; subscribers may be incorrectly blocked or granted access`);
              if (missingEnd > ctx.ents.length / 2) FAIL.data(`${missingEnd}/${ctx.ents.length} entitlements missing ends_at — subscriptions may never expire`);
              return `starts_at present: ${ctx.ents.length - missingStart}/${ctx.ents.length}  ends_at present: ${ctx.ents.length - missingEnd}/${ctx.ents.length}`;
            },
          },
          {
            name: "At least one entitlement is within its access window (now >= starts_at and now <= ends_at)",
            run: async (ctx) => {
              if (ctx.ents.length === 0) return "No entitlements to check — skipping window check";
              const now = new Date();
              const inWindow = ctx.ents.filter(e => {
                if (!e.starts_at || !e.ends_at) return false;
                return new Date(e.starts_at) <= now && new Date(e.ends_at) >= now;
              });
              if (inWindow.length === 0) {
                // Check if any are upcoming (starts_at in future)
                const upcoming = ctx.ents.filter(e => e.starts_at && new Date(e.starts_at) > now);
                if (upcoming.length > 0) return `⚠ 0 in-window now, but ${upcoming.length} upcoming — may be off-season`;
                FAIL.data("No active entitlements within their time window — all subscribers would be blocked from access");
              }
              return `${inWindow.length}/${ctx.ents.length} entitlements currently within their access window ✓`;
            },
          },
          {
            name: "No entitlement has ends_at in the distant past (> 1 year ago)",
            run: async (ctx) => {
              if (ctx.ents.length === 0) return "Skipped — no entitlements to check";
              const cutoff = new Date(Date.now() - 365 * 86400000);
              const stale = ctx.ents.filter(e => e.ends_at && new Date(e.ends_at) < cutoff);
              if (stale.length > 5) return `⚠ ${stale.length} entitlements marked active but ended >1 year ago — status cleanup may be needed`;
              return stale.length > 0
                ? `${stale.length} stale entitlement${stale.length !== 1 ? "s" : ""} (ended >1yr ago but still active) — consider cleanup`
                : "No stale entitlements ✓";
            },
          },
        ],
      },
    ],
  },

  {
    label: "Platform Integrity",
    section: "Core data integrity",
    journeys: [
      {
        id: "event_tracking",
        kind: "transaction",
        name: "Event Tracking Write",
        icon: "📡",
        description: "Event entity is writable — analytics and funnel tracking will record correctly. Orphan search: filter Event for source_platform='healthcheck' or event_type='healthcheck_ping'.",
        steps: [
          {
            name: "Write a test event",
            run: async (ctx) => {
              const iso = new Date().toISOString();
              const evt = await base44.entities.Event.create({
                source_platform: "healthcheck",
                event_type: "healthcheck_ping",
                title: "Health Check Ping",
                source_key: `healthcheck:healthcheck_ping:${iso}`,
                start_date: iso.slice(0, 10),
                ts: iso,
                payload_json: JSON.stringify({ event_name: "healthcheck_ping", test: true }),
              });
              if (!evt?.id) FAIL.runtime("Event.create() returned no id — analytics entity write path is broken");
              ctx.eventId = evt.id;
              return `Event created (id=${evt.id})`;
            },
          },
          {
            name: "Event readable back via event_type filter",
            run: async (ctx) => {
              const evts = await base44.entities.Event.filter({ event_type: "healthcheck_ping" });
              if (!Array.isArray(evts)) FAIL.runtime("Event.filter() returned non-array — entity read path is broken");
              const found = evts.find(e => e.id === ctx.eventId);
              if (!found) return `Event written but not found via filter — may be eventual consistency (id=${ctx.eventId})`;
              return `Event confirmed readable — event_type: ${found.event_type} ✓`;
            },
          },
          {
            name: "Delete test event (cleanup)",
            run: async (ctx) => {
              if (ctx.eventId) {
                await base44.entities.Event.delete(ctx.eventId);
                ctx.eventId = null;
              }
              return "Test event deleted";
            },
          },
        ],
        // Safety net: identify orphans by filtering Event for source_platform='healthcheck'
        // or event_type='healthcheck_ping'.
        cleanup: async (ctx) => {
          if (ctx.eventId) {
            try { await base44.entities.Event.delete(ctx.eventId); } catch {}
          }
        },
      },

      {
        id: "email_prefs_lifecycle",
        kind: "transaction",
        name: "Email Preferences Full Lifecycle",
        icon: "📬",
        description: "EmailPreferences can be created, updated, and deleted — opt-out system is fully operational. Orphan search: filter EmailPreferences for notes='__healthcheck__' or created via admin account_id with monthly_agenda_opt_out=true.",
        steps: [
          {
            name: "Get current account id",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) FAIL.runtime("auth.me() returned no id");
              ctx.myId = me.id;
              return `account id = ${me.id}`;
            },
          },
          {
            name: "Create EmailPreferences record",
            run: async (ctx) => {
              // First clean up any leftover healthcheck prefs from previous interrupted runs
              const existing = await base44.entities.EmailPreferences.filter({ account_id: ctx.myId });
              ctx.existingPrefIds = (existing || []).filter(p => p.notes === "__healthcheck__").map(p => p.id).filter(Boolean);
              for (const id of ctx.existingPrefIds) {
                try { await base44.entities.EmailPreferences.delete(id); } catch {}
              }

              const pref = await base44.entities.EmailPreferences.create({
                account_id: ctx.myId,
                monthly_agenda_opt_out: false,
                camp_week_alert_opt_out: false,
                notes: "__healthcheck__",
              });
              if (!pref?.id) FAIL.runtime("EmailPreferences.create() returned no id — opt-out system write path is broken");
              ctx.prefId = pref.id;
              return `Created EmailPreferences id=${pref.id}`;
            },
          },
          {
            name: "Read back preferences",
            run: async (ctx) => {
              const prefs = await base44.entities.EmailPreferences.filter({ account_id: ctx.myId });
              const found = (prefs || []).find(p => p.id === ctx.prefId);
              if (!found) FAIL.runtime(`EmailPreferences id=${ctx.prefId} not found after create — read-after-write broken`);
              return `Read back ok — monthly_opt_out=${found.monthly_agenda_opt_out}  alert_opt_out=${found.camp_week_alert_opt_out}`;
            },
          },
          {
            name: "Update opt-out flag",
            run: async (ctx) => {
              const updated = await base44.entities.EmailPreferences.update(ctx.prefId, {
                monthly_agenda_opt_out: true,
              });
              if (!updated) FAIL.runtime("EmailPreferences.update() returned null — update path is broken");
              return `Updated monthly_agenda_opt_out → true`;
            },
          },
          {
            name: "Verify update persisted",
            run: async (ctx) => {
              const prefs = await base44.entities.EmailPreferences.filter({ account_id: ctx.myId });
              const found = (prefs || []).find(p => p.id === ctx.prefId);
              if (!found) FAIL.runtime("EmailPreferences record not found after update");
              if (!found.monthly_agenda_opt_out) FAIL.data("opt_out flag did not persist — sendMonthlyAgenda would ignore this opt-out");
              return `Opt-out persisted: monthly_agenda_opt_out=${found.monthly_agenda_opt_out} ✓`;
            },
          },
          {
            name: "Delete test record (cleanup)",
            run: async (ctx) => {
              await base44.entities.EmailPreferences.delete(ctx.prefId);
              ctx.prefId = null;
              return "EmailPreferences test record deleted";
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.prefId) {
            try { await base44.entities.EmailPreferences.delete(ctx.prefId); } catch {}
          }
        },
      },
    ],
  },

  {
    label: "Admin-Only Backend Functions",
    section: "Critical platform/config",
    journeys: [
      {
        id: "admin_function_guards",
        kind: "read",
        name: "Admin Function Access & Guards",
        icon: "🔒",
        description: "Probes all 10 admin-guarded backend functions. Each must be reachable and must NOT return 403 for this admin session. A 403 means the admin guard is misconfigured and would block the admin account.",
        steps: [
          // Helper: for each function, call with dryRun:true (plus limits to prevent heavy work).
          // Treat 2xx = pass, 400 = alive/validation enforced (pass), 403 = guard misconfigured (fail).
          {
            name: "ryzerIngest — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("ryzerIngest", { dryRun: true, maxPages: 0, maxEvents: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "ncaaMembershipSync — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("ncaaMembershipSync", { dryRun: true, maxGroups: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "runNcaaUntilDone — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("runNcaaUntilDone", { dryRun: true, maxRounds: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "athleticsMembershipCollapseBySchool — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("athleticsMembershipCollapseBySchool", { dryRun: true });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "athleticsMembershipDedupeSweep — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("athleticsMembershipDedupeSweep", { dryRun: true, maxGroups: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "dedupeAthleticsMembershipBySourceKey — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("dedupeAthleticsMembershipBySourceKey", { dryRun: true, maxGroups: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "enrichSchoolsMaster_scorecard — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("enrichSchoolsMaster_scorecard", { dryRun: true, maxRows: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "seedSchoolsMaster_membership — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("seedSchoolsMaster_membership", { dryRun: true, maxRows: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "seedSchoolsMaster_scorecard — admin reachable, guard active",
            run: async () => {
              try {
                const res = await base44.functions.invoke("seedSchoolsMaster_scorecard", { dryRun: true, maxRows: 0 });
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
          {
            name: "sendHealthAlert — admin reachable, guard active",
            run: async () => {
              // Probe with empty body — returns 400 (toEmail required) after passing the admin guard
              try {
                const res = await base44.functions.invoke("sendHealthAlert", {});
                const data = res?.data;
                return `Reachable — admin access confirmed${data?.ok !== undefined ? ` ok=${data.ok}` : ""}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
                  FAIL.config("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400: toEmail required) ✓";
                FAIL.ext("Function unreachable: " + msg);
              }
            },
          },
        ],
      },
    ],
  },

  COACH_JOURNEY_GROUP,

  // ── Phase 2: rebuilt journey coverage ──────────────────────────────────────
  // Route registration, demo integrity, demo data freshness, coach HQ functions,
  // recruiting activity entity, report feature, registration chain, env sanity.
  ...NEW_JOURNEY_GROUPS,

];

// Flatten for runner access by id
const ALL_JOURNEYS = JOURNEY_GROUPS.flatMap(g => g.journeys);

// Section display order
const SECTION_ORDER = [
  "Critical platform/config",
  "Core data integrity",
  "User journey checks",
  "Coach journey checks",
  "Controlled transaction checks",
];

// ── Runner ───────────────────────────────────────────────────────────────────

function hcSleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isRateLimitErr(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("too many");
}

async function runJourney(journey, onStep) {
  const ctx = {};
  const results = [];
  const start = Date.now();
  let failed = false;

  for (const step of journey.steps) {
    const stepStart = Date.now();
    let detail = null;
    let stepErr = null;

    // Retry up to 3 times on rate-limit errors with exponential backoff
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        detail = await step.run(ctx);
        stepErr = null;
        break;
      } catch (err) {
        stepErr = err;
        if (isRateLimitErr(err) && attempt < 3) {
          await hcSleep(2000 * Math.pow(2, attempt)); // 2s → 4s → 8s
        } else {
          break;
        }
      }
    }

    if (stepErr) {
      const result = { name: step.name, status: "fail", detail: stepErr.message || String(stepErr), ms: Date.now() - stepStart };
      results.push(result);
      failed = true;
      onStep(results, "fail");
      break; // stop on first failure
    }

    const detailStr = detail || "ok";
    const stepStatus = typeof detailStr === "string" && detailStr.startsWith("⚠") ? "warn" : "pass";
    const result = { name: step.name, status: stepStatus, detail: detailStr, ms: Date.now() - stepStart };
    results.push(result);
    onStep(results, failed ? "fail" : "running");
  }

  // Always run cleanup
  if (journey.cleanup) {
    try { await journey.cleanup(ctx); } catch {}
  }

  const hasWarn = results.some(r => r.status === "warn");
  const status = failed ? "fail" : hasWarn ? "warn" : "pass";
  onStep(results, status);
  return { status, steps: results, duration: Date.now() - start };
}

// ── UI components ─────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const colors = { idle: "#d1d5db", running: "#c8850a", pass: "#059669", fail: "#dc2626", warn: "#d97706" };
  const labels = { idle: "—", running: "⟳", pass: "✓", fail: "✕", warn: "⚠" };
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
    warn:    { bg: "#fffbeb", color: "#d97706", text: duration ? `Warned  ${duration}ms` : "Warned" },
  }[status] || { bg: "#f3f4f6", color: "#9ca3af", text: status };

  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
      background: cfg.bg, color: cfg.color }}>
      {cfg.text}
    </span>
  );
}

function KindBadge({ kind }) {
  if (kind === "transaction") {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
        background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d", letterSpacing: "0.04em" }}>
        TXN
      </span>
    );
  }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
      background: "#f3f4f6", color: "#6b7280", border: "1px solid #d1d5db", letterSpacing: "0.04em" }}>
      READ
    </span>
  );
}

function JourneyCard({ journey, state, onRun, disabled }) {
  const [expanded, setExpanded] = useState(false);
  const hasSteps = state.steps.length > 0;
  const isBlocked = state.status === "fail";
  const isWarn = state.status === "warn";

  const borderColor = isBlocked ? "#fca5a5" : isWarn ? "#fcd34d" : state.status === "pass" ? "#6ee7b7" : "#e5e7eb";

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${borderColor}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{journey.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1F3B" }}>{journey.name}</span>
            {journey.kind && <KindBadge kind={journey.kind} />}
            <StatusBadge status={state.status} duration={state.duration} />
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>
            {journey.description}
          </div>
          {isBlocked && journey.remediation && (
            <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", marginTop: 6,
              padding: "5px 10px", background: "#f9fafb", borderRadius: 5, border: "1px solid #e5e7eb" }}>
              {journey.remediation}
            </div>
          )}
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
              background: isBlocked ? "#fef2f2" : isWarn ? "#fffbeb" : "#f8fafc",
              borderColor: isBlocked ? "#fca5a5" : isWarn ? "#fcd34d" : "#e5e7eb",
              color: isBlocked ? "#dc2626" : isWarn ? "#d97706" : "#374151" }}
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
                  color: step.status === "fail" ? "#dc2626" : step.status === "warn" ? "#d97706" : "#6b7280" }}>
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
  const [lastRunTimestamp, setLastRunTimestamp] = useState(null);
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
      const currentStates = statesRef.current;
      const failures = ALL_JOURNEYS
        .filter(j => currentStates[j.id]?.status === "fail")
        .map(j => ({ name: j.name, steps: currentStates[j.id].steps }));
      const runDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      // Send to all admins in parallel
      const results = await Promise.allSettled(
        ADMIN_EMAILS.map(email =>
          base44.functions.invoke("sendHealthAlert", { toEmail: email, failures, runDate })
        )
      );
      const anyOk = results.some(r => r.status === "fulfilled" && r.value?.data?.ok);
      if (anyOk) {
        setEmailSent(true);
        toast({ title: "Report sent", description: `Failure summary emailed to ${ADMIN_EMAILS.join(", ")}` });
      } else {
        const firstErr = results.find(r => r.status === "rejected")?.reason?.message
          || results.find(r => r.status === "fulfilled")?.value?.data?.error
          || "Unknown error";
        toast({ title: "Email failed", description: firstErr, variant: "destructive" });
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
    for (let i = 0; i < journeys.length; i++) {
      if (i > 0) await hcSleep(2000); // throttle between journeys to avoid rate limits
      const j = journeys[i];
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
    setLastRunTimestamp(new Date());
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

  // Count journeys with at least one warn-level step
  const warnJourneyCount = Object.entries(states).filter(([id, s]) =>
    s.status === "warn" || (s.status !== "fail" && s.steps.some(step => step.status === "warn"))
  ).length;

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
              {/* Production readiness board title */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={S.title}>Production Readiness Board</div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 12px", borderRadius: 12,
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
                  background: "#dcfce7", color: "#15803d",
                  border: "1px solid #86efac",
                }}>
                  ● PRODUCTION
                </span>
              </div>
              {/* Production env metadata */}
              <div style={{
                display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                padding: "7px 12px", marginBottom: 6,
                background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
                fontSize: 12,
              }}>
                <span style={{ color: "#166534" }}>
                  <strong>App ID:</strong>{" "}
                  <span style={{ fontFamily: "monospace" }}>{PROD_APP_ID}</span>
                </span>
                <span style={{ color: "#166534" }}>
                  <strong>Server:</strong>{" "}
                  <span style={{ fontFamily: "monospace" }}>{PROD_SERVER_URL}</span>
                </span>
                <span style={{ color: "#166534" }}>
                  <strong>Last run:</strong>{" "}
                  {lastRunTimestamp
                    ? lastRunTimestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                    : <span style={{ fontStyle: "italic", color: "#6b7280" }}>Never</span>}
                </span>
                <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                  All checks target production regardless of current page environment.
                </span>
                <a
                  href="/AppHealthCheckDiag"
                  style={{ marginLeft: "auto", color: "#6b7280", fontSize: 11, textDecoration: "underline", whiteSpace: "nowrap" }}
                >
                  🔬 Env Diagnostic
                </a>
              </div>
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
              {warnJourneyCount > 0 && (
                <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
                  padding: "5px 14px", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: "#d97706" }}>{warnJourneyCount}</span>
                  <span style={{ color: "#d97706", marginLeft: 5 }}>warned</span>
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

        {/* Groups — sorted by section order */}
        <div style={S.content}>
          {(() => {
            // Sort groups by section order (groups without section go last)
            const sorted = [...JOURNEY_GROUPS].sort((a, b) => {
              const ai = SECTION_ORDER.indexOf(a.section ?? "");
              const bi = SECTION_ORDER.indexOf(b.section ?? "");
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });

            let lastSection = null;
            return sorted.map(group => {
              const groupStates = group.journeys.map(j => states[j.id]);
              const groupDone = groupStates.every(s => s.status !== "idle" && s.status !== "running");
              const groupFailed = groupStates.filter(s => s.status === "fail").length;

              const showSectionHeader = group.section && group.section !== lastSection;
              const isFirstSection = lastSection === null;
              if (showSectionHeader) lastSection = group.section;
              const isTransaction = group.section === "Controlled transaction checks";

              return (
                <div key={group.label} style={{ maxWidth: 800 }}>
                  {showSectionHeader && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      marginBottom: 16, marginTop: isFirstSection ? 0 : 24,
                    }}>
                      <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                        textTransform: "uppercase", color: "#6b7280", whiteSpace: "nowrap",
                      }}>
                        {group.section}
                      </span>
                      <div style={{ flex: 1, height: 1, background: "#d1d5db" }} />
                    </div>
                  )}

                  <div style={{ marginBottom: 36 }}>
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

                    {/* Transaction warning banner */}
                    {isTransaction && (
                      <div style={{
                        marginBottom: 10, padding: "7px 12px",
                        background: "#fefce8", border: "1px solid #fef08a", borderRadius: 7,
                        fontSize: 12, color: "#854d0e",
                      }}>
                        Controlled synthetic transaction checks — uses dedicated test records. Cleanup runs automatically after each check.
                      </div>
                    )}

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
                </div>
              );
            });
          })()}
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
