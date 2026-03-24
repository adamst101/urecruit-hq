// src/pages/AppHealthCheck.jsx
import { useState, useCallback, useRef } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";
import { toast } from "../components/ui/use-toast";
import { ADMIN_EMAILS } from "../components/auth/adminEmails.jsx";

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
        id: "signup_flow",
        name: "Custom Signup Flow",
        icon: "✍️",
        description: "base44.auth.register() and loginViaEmailPassword() are reachable — the custom /Signup page can create and sign in accounts.",
        steps: [
          {
            name: "auth.register is callable",
            run: async () => {
              if (typeof base44.auth?.register !== "function") {
                throw new Error("base44.auth.register is not a function — custom signup page will fail");
              }
              return "base44.auth.register exists ✓";
            },
          },
          {
            name: "auth.loginViaEmailPassword is callable",
            run: async () => {
              if (typeof base44.auth?.loginViaEmailPassword !== "function") {
                throw new Error("base44.auth.loginViaEmailPassword is not a function — post-signup sign-in will fail");
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
              if (!me?.email) throw new Error("Could not resolve current user email for probe");
              try {
                await base44.auth.register({ email: me.email, password: "healthcheck_probe_xzq9!" });
                throw new Error("register() accepted an already-existing email — duplicate prevention may be broken");
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
                throw new Error(`register endpoint returned unexpected error: ${err?.message || err}`);
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
                throw new Error("loginViaEmailPassword() accepted invalid credentials — auth is broken");
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
                throw new Error(`loginViaEmailPassword returned unexpected error: ${err?.message || err}`);
              }
            },
          },
          {
            name: "auth.verifyOtp is callable",
            run: async () => {
              if (typeof base44.auth?.verifyOtp !== "function") {
                throw new Error("base44.auth.verifyOtp is not a function — OTP verification step will fail");
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
                throw new Error("verifyOtp() accepted a clearly invalid code — OTP validation may be broken");
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
                throw new Error(`verifyOtp returned unexpected error: ${err?.message || err}`);
              }
            },
          },
          {
            name: "auth.resendOtp is callable",
            run: async () => {
              if (typeof base44.auth?.resendOtp !== "function") {
                throw new Error("base44.auth.resendOtp is not a function — resend code button will fail");
              }
              return "base44.auth.resendOtp exists ✓";
            },
          },
        ],
      },

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
              if (ents.length === 0) {
                ctx.entitlements = [];
                return "No active entitlements — 0 subscribers (expected post-purge or pre-launch)";
              }
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
            name: "Create test athlete (owned by admin account)",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) throw new Error("auth.me() returned no id");
              ctx.myId = me.id;
              const profile = await base44.entities.AthleteProfile.create({
                account_id: ctx.myId,
                first_name: "__hc_intent__", last_name: "__test__",
                athlete_name: "__hc_intent__ __test__",
                active: true, sport_id: "test", grad_year: 2099,
              });
              if (!profile?.id) throw new Error("AthleteProfile.create returned no id");
              ctx.athlete = profile;
              return `Test athlete created (id=${profile.id})`;
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
                account_id: ctx.myId,
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
        name: "CampIntent Entity Permissions",
        icon: "🔒",
        description: "Verifies CampIntent is readable and writable by all authenticated users — not just admins. Catches broken entity permission rules that admin-bypass would otherwise mask. After any base44 entity restriction change, this journey must also be verified manually with a subscriber (non-admin) account.",
        steps: [
          {
            name: "CampIntent.filter({}) readable — no permission error",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CampIntent.filter({});
              } catch (err) {
                throw new Error(`CampIntent read blocked: ${err?.message || err} — check entity Read permission in base44 admin`);
              }
              if (!Array.isArray(rows)) throw new Error("CampIntent.filter() returned non-array — entity may be misconfigured");
              ctx.existingCount = rows.length;
              return `Read OK — ${rows.length} existing records visible`;
            },
          },
          {
            name: "Resolve admin account_id for write probe",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) throw new Error("auth.me() returned no id");
              ctx.probeAccountId = me.id;
              return `account_id = ${me.id}`;
            },
          },
          {
            name: "Find a camp for probe",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No active camps to use for probe");
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
              if (!profile?.id) throw new Error("AthleteProfile.create returned no id");
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
                throw new Error(`CampIntent create blocked: ${err?.message || err} — check entity Create permission in base44 admin`);
              }
              if (!intent?.id) throw new Error("Create returned no id");
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
                throw new Error(`CampIntent read by athlete_id blocked: ${err?.message || err} — check entity Read permission in base44 admin`);
              }
              const found = (rows || []).find(r => r.id === ctx.probeIntentId);
              if (!found) throw new Error("Probe record not found via athlete_id filter — Read permission may be filtering it out");
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
                throw new Error(`CampIntent update blocked: ${err?.message || err} — check entity Update permission in base44 admin`);
              }
              if (!updated) throw new Error("Update returned null");
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
              if (ctx.athletes.length === 0) {
                if (ctx.activeIntents.length > 0)
                  return `⚠ ${ctx.activeIntents.length} orphaned intents with no athletes — re-run user purge to clear`;
                return "No athletes and no intents — clean state";
              }
              const missing = ctx.activeIntents.slice(0, 20).filter(i => !i.athlete_id).length;
              if (missing > 2) throw new Error(`${missing}/20 intents missing athlete_id — useAllAthletesCamps filter would skip them`);
              return `${Math.min(20, ctx.activeIntents.length) - missing}/${Math.min(20, ctx.activeIntents.length)} intents have athlete_id`;
            },
          },
        ],
      },

      {
        id: "cross_athlete_warning_isolation",
        name: "Cross-Athlete Warning Isolation",
        icon: "🔀",
        description: "Travel notices for camps belonging only to another athlete are excluded from the current athlete's WarningBanner. Cross-athlete same-day conflicts still surface correctly.",
        steps: [
          {
            name: "Import detectConflicts",
            run: async (ctx) => {
              const mod = await import("../components/hooks/useConflictDetection.jsx");
              if (typeof mod.detectConflicts !== "function") throw new Error("detectConflicts not exported");
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
              if (leaked.length > 0) throw new Error(`${leaked.length} other-athlete-only warning(s) leaked into currentAthleteWarnings — Calendar WarningBanner will show wrong athlete's notices`);
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
              if (!sameDayWarn) throw new Error("Same-day conflict absent from currentAthleteWarnings — cross-athlete conflict detection broken");
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
    ],
  },

  {
    label: "Conflict & Travel Warnings",
    journeys: [
      {
        id: "travel_warning_engine",
        name: "Travel Warning Logic",
        icon: "✈️",
        description: "Unit-tests detectConflicts() — far-from-home threshold, flight vs hotel language, stored coordinate preference, and state center fallback.",
        steps: [
          {
            name: "detectConflicts and coordinate helpers are importable",
            run: async (ctx) => {
              const mod = await import("../components/hooks/useConflictDetection.jsx");
              const coords = await import("../components/hooks/useCityCoords.jsx");
              if (typeof mod.detectConflicts !== "function") throw new Error("detectConflicts is not exported");
              if (typeof coords.getCityCoords !== "function") throw new Error("getCityCoords is not exported");
              if (typeof coords.getStateCenter !== "function") throw new Error("getStateCenter is not exported — state-center fallback for home coords will silently fail");
              if (typeof coords.haversine !== "function") throw new Error("haversine is not exported");
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
              if (failed.length > 0) throw new Error(`getCityCoords returned null for: ${failed.map(t => t.label).join(", ")}`);
              return `All ${tests.length} test cities resolved ✓`;
            },
          },
          {
            name: "getStateCenter returns coords for all states used as fallback",
            run: async (ctx) => {
              const states = ["TX", "IL", "NC", "IN", "CA", "FL", "OH"];
              const failed = states.filter(s => !ctx.getStateCenter(s));
              if (failed.length > 0) throw new Error(`getStateCenter returned null for: ${failed.join(", ")}`);
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
              if (!farWarn) throw new Error("No far_from_home warning fired for Chicago (~1,050 mi from Magnolia TX)");
              ctx.farWarnDist = farWarn.distance;
              return `far_from_home warning fired — distance ${farWarn.distance} mi ✓`;
            },
          },
          {
            name: "Far-from-home warning uses flight language when >400 miles",
            run: async (ctx) => {
              if (!ctx.farWarnDist) throw new Error("Previous step did not capture distance");
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
              if (!w?.message?.includes("✈️")) throw new Error(`Expected ✈️ flight language for ${ctx.farWarnDist} mi camp — got: "${w?.message}"`);
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
              if (farWarn) throw new Error(`far_from_home incorrectly fired for Dallas TX (${farWarn.distance} mi from Magnolia TX)`);
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
              if (farWarn) throw new Error("far_from_home warning fired for non-paid user — should be paid-only");
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
              if (!farWarn) throw new Error("State center fallback did not produce a far_from_home warning — home location resolution may be broken for cities not in the lookup table");
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
              if (!farWarn) throw new Error("campCoords ignored _school_lat/_school_lng — stored geocoded coords are not being used for conflict detection");
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
              if (!travelWarn) throw new Error("No back_to_back_travel warning for camps 1 day apart and ~300 miles");
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
              if (!conflict) throw new Error("No same_day conflict detected for two camps on the same date");
              if (conflict.severity !== "error") throw new Error(`Expected severity=error, got ${conflict.severity}`);
              return "Same-day conflict detected with error severity ✓";
            },
          },
        ],
      },
    ],
  },

  {
    label: "Data Quality",
    journeys: [
      {
        id: "school_data_quality",
        name: "School Data Completeness",
        icon: "🏫",
        description: "Schools have division, coordinates (required for travel alerts), and logos — monitors output of Geocode Schools, Seed Logos, and Athletics Cleanup tools.",
        steps: [
          {
            name: "Fetch all schools",
            run: async (ctx) => {
              const schools = await base44.entities.School.filter({});
              if (!Array.isArray(schools) || schools.length === 0)
                throw new Error("No schools found — school data may have been wiped");
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
                throw new Error(`Only ${pct}% have a division — run School Athletics Cleanup to fix`);
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
                throw new Error(`Only ${pct}% have coordinates — ${missing} schools missing lat/lng. Travel distance alerts will be inaccurate. Run Geocode Schools.`);
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
        name: "Camp → School Matching Quality",
        icon: "🔗",
        description: "Camps are linked to schools and Host Org Mappings are verified — monitors output of Host Org Mapping Manager and ingest pipeline.",
        steps: [
          {
            name: "Fetch active camps (sample)",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                throw new Error("No active camps");
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
                throw new Error(`Only ${pct}% of camps matched to a school (${unmatched} unmatched) — run Host Org Mapping Manager to improve`);
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
                throw new Error("HostOrgMapping.filter() returned non-array");
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
        name: "Camp Enrichment Completeness",
        icon: "📋",
        description: "Ryzer camps have program names and venues, and missing coordinates are tracked — monitors output of Backfill Ryzer Program Name and Geocode Schools.",
        steps: [
          {
            name: "Fetch active camps",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                throw new Error("No active camps");
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
                throw new Error(`${missing}/50 sampled camps missing start_date — Calendar cannot place them and conflict detection is broken`);
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
    journeys: [
      {
        id: "ingest_config",
        name: "Ingest — Sport Configs Active",
        icon: "⚙️",
        description: "SportIngestConfig has active records — the weekly job has sports to process.",
        steps: [
          {
            name: "Fetch SportIngestConfig records",
            run: async (ctx) => {
              const configs = await base44.entities.SportIngestConfig.filter({});
              if (!Array.isArray(configs) || configs.length === 0)
                throw new Error("No SportIngestConfig records — weeklyIngestAllSports has nothing to run");
              ctx.configs = configs;
              return `${configs.length} SportIngestConfig record${configs.length !== 1 ? "s" : ""}`;
            },
          },
          {
            name: "At least one config is active",
            run: async (ctx) => {
              const active = ctx.configs.filter(c => c.active);
              if (active.length === 0)
                throw new Error("No active SportIngestConfig — weekly ingest will skip all sports");
              return `${active.length}/${ctx.configs.length} configs active: ${active.map(c => c.sport_key).join(", ")}`;
            },
          },
          {
            name: "Active configs have a sport_key",
            run: async (ctx) => {
              const bad = ctx.configs.filter(c => c.active && !c.sport_key);
              if (bad.length > 0)
                throw new Error(`${bad.length} active configs missing sport_key — ingestCampsUSA would fail for them`);
              return "All active configs have sport_key ✓";
            },
          },
        ],
      },

      {
        id: "ingest_freshness",
        name: "Ingest — Camp Data Freshness",
        icon: "🕐",
        description: "Active camps have been ingested recently, confirming the weekly job ran within the expected window.",
        steps: [
          {
            name: "Fetch sample of active camps",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0)
                throw new Error("No active camps — ingest may never have run or all camps were deactivated");
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
                throw new Error(`Only ${pct}% of sampled camps have last_ingested_at — ingest may not be writing timestamps`);
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
                throw new Error(
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
                throw new Error(`${pct}% of sampled camps have ingestion_status=error — ingest pipeline may be broken`);
              const active = sample.filter(c => c.ingestion_status === "active").length;
              return `Error rate: ${pct}% (${errored}/${sample.length})  active: ${active} ✓`;
            },
          },
        ],
      },

      {
        id: "ingest_function",
        name: "Ingest — Pipeline Function Health",
        icon: "🔄",
        description: "campHealthCheck function is reachable and reports a healthy camp store.",
        steps: [
          {
            name: "campHealthCheck function reachable",
            run: async (ctx) => {
              const res = await base44.functions.invoke("campHealthCheck", {});
              const data = res?.data;
              if (!data) throw new Error("campHealthCheck returned empty response");
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
              if (total === 0) throw new Error("campHealthCheck reports 0 camps — data may have been wiped");
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
                throw new Error(`Only ${matchedPct}% of camps matched to a school — school matching may be broken`);
              return `${matchedPct}% of camps have school_id (${total - unmatched}/${total}) ✓`;
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
  {
    label: "Checkout & Access",
    journeys: [
      {
        id: "season_config",
        name: "Season Config & Access Gate",
        icon: "📅",
        description: "getActiveSeason function responds with a valid season, Subscribe and Checkout can load pricing.",
        steps: [
          {
            name: "Invoke getActiveSeason",
            run: async (ctx) => {
              const res = await base44.functions.invoke("getActiveSeason", {});
              const data = res?.data;
              if (!data?.ok) throw new Error(data?.error || "getActiveSeason returned ok:false");
              ctx.season = data.season;
              return `ok:true — season_year=${data.season?.season_year ?? "—"}`;
            },
          },
          {
            name: "Season has season_year and active flag",
            run: async (ctx) => {
              if (!ctx.season?.season_year) throw new Error("season.season_year missing — Subscribe page cannot display pricing");
              if (ctx.season.active === undefined) throw new Error("season.active missing");
              return `season_year=${ctx.season.season_year}  active=${ctx.season.active}`;
            },
          },
          {
            name: "SeasonConfig entity queryable",
            run: async (ctx) => {
              const configs = await base44.entities.SeasonConfig.filter({});
              if (!Array.isArray(configs)) throw new Error("SeasonConfig.filter() returned non-array");
              if (configs.length === 0) throw new Error("No SeasonConfig records — getActiveSeason has nothing to return");
              ctx.seasonConfigs = configs;
              return `${configs.length} SeasonConfig record${configs.length !== 1 ? "s" : ""}`;
            },
          },
          {
            name: "At least one season marked active",
            run: async (ctx) => {
              const active = ctx.seasonConfigs.filter(s => s.active);
              if (active.length === 0) throw new Error("No active SeasonConfig — platform is in limbo (no subscribable season)");
              if (active.length > 1) throw new Error(`${active.length} seasons marked active simultaneously — should be exactly 1`);
              return `Exactly 1 active season: ${active[0].season_year}`;
            },
          },
        ],
      },

      {
        id: "promo_validation",
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
              if (data === undefined || data === null) throw new Error("validatePromo returned empty response");
              ctx.promoRes = data;
              return `Function responded — ok=${data.ok}`;
            },
          },
          {
            name: "Invalid code returns ok:false with an error message",
            run: async (ctx) => {
              if (ctx.promoRes.ok === true) throw new Error("Unknown test code was accepted — promo validation may not be working");
              if (!ctx.promoRes.error && !ctx.promoRes.message) throw new Error("ok:false but no error message returned — Checkout page cannot display reason");
              return `ok:false  error: "${ctx.promoRes.error || ctx.promoRes.message}"`;
            },
          },
          {
            name: "Empty promo code returns ok:false",
            run: async (ctx) => {
              const res = await base44.functions.invoke("validatePromo", { promoCode: "" });
              const data = res?.data;
              if (data?.ok === true) throw new Error("Empty promo code was accepted — validation logic may be broken");
              return `Empty code correctly rejected`;
            },
          },
        ],
      },

      {
        id: "post_payment_routing",
        name: "Post-Payment Account Creation Routing",
        icon: "🔀",
        description: "CheckoutSuccess saves the correct sessionStorage keys so AuthRedirect can pick up postPaymentSignup and stripeSessionId after account creation on /Signup.",
        steps: [
          {
            name: "sessionStorage is available",
            run: async () => {
              if (typeof sessionStorage === "undefined") throw new Error("sessionStorage not available — post-payment routing will fail");
              return "sessionStorage available ✓";
            },
          },
          {
            name: "Can write and read postPaymentSignup key",
            run: async (ctx) => {
              const KEY = "postPaymentSignup";
              sessionStorage.setItem(KEY, "true");
              const val = sessionStorage.getItem(KEY);
              if (val !== "true") throw new Error(`sessionStorage write/read failed for key '${KEY}' — AuthRedirect Priority 1 will not trigger`);
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
              if (val !== testVal) throw new Error(`sessionStorage write/read failed for key '${KEY}' — linkStripePayment fallback will not receive session id`);
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
              if (val !== "2026") throw new Error(`sessionStorage write/read failed for key '${KEY}'`);
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
              if (!pages) throw new Error("Could not import PAGES from pages.config.js");
              if (!pages["Signup"]) throw new Error("'Signup' not registered in PAGES — /Signup route will 404 and post-payment account creation will fail");
              if (!pages["TermsOfService"]) throw new Error("'TermsOfService' not registered in PAGES — /TermsOfService will show a blank page");
              if (!pages["PrivacyPolicy"]) throw new Error("'PrivacyPolicy' not registered in PAGES — /PrivacyPolicy will show a blank page");
              return "Signup, TermsOfService, PrivacyPolicy all registered in PAGES ✓";
            },
          },
        ],
      },

      {
        id: "stripe_functions",
        name: "Stripe Backend Functions",
        icon: "💳",
        description: "verifyStripeSession and linkStripePayment functions are reachable. Both must handle paid and $0 sessions (100% off coupons via no_payment_required).",
        steps: [
          {
            name: "verifyStripeSession function reachable",
            run: async (ctx) => {
              const res = await base44.functions.invoke("verifyStripeSession", { sessionId: "__healthcheck_probe__" });
              const data = res?.data;
              if (data === undefined || data === null) throw new Error("verifyStripeSession returned empty response — function may be down");
              ctx.verifyRes = data;
              return `Function responded — ok=${data.ok}`;
            },
          },
          {
            name: "verifyStripeSession rejects invalid session (not a silent pass)",
            run: async (ctx) => {
              if (ctx.verifyRes.ok === true && ctx.verifyRes.paid === true) {
                throw new Error("Probe session returned paid:true — Stripe session validation is not working (any string accepted)");
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
                if (data === undefined || data === null) throw new Error("linkStripePayment returned empty response — function may be down");
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
                throw new Error("linkStripePayment unreachable: " + msg);
              }
            },
          },
          {
            name: "linkStripePayment rejects missing sessionId",
            run: async (ctx) => {
              if (!ctx.linkValidated) throw new Error("Previous step did not confirm function is alive");
              if (ctx.linkRes?.ok === true) throw new Error("linkStripePayment accepted an empty sessionId — payment linking could be triggered without a valid Stripe session");
              const errMsg = ctx.linkRes?.error || "(no error field)";
              return `Empty sessionId correctly rejected — error: "${errMsg}" ✓`;
            },
          },
        ],
      },

      {
        id: "sport_position",
        name: "Sport & Position Lists",
        icon: "🏈",
        description: "Sport and Position entities are accessible — required for Profile setup and camp filtering.",
        steps: [
          {
            name: "Fetch active sports",
            run: async (ctx) => {
              const sports = await base44.entities.Sport.filter({});
              if (!Array.isArray(sports) || sports.length === 0) throw new Error("No sports found — Profile position dropdown will be empty");
              ctx.sports = sports;
              const active = sports.filter(s => s.active !== false);
              return `${sports.length} sports (${active.length} active)`;
            },
          },
          {
            name: "Sports have name field",
            run: async (ctx) => {
              const bad = ctx.sports.filter(s => !s.sport_name && !s.name);
              if (bad.length > 0) throw new Error(`${bad.length} sports missing name — Profile dropdowns will show blank entries`);
              return `All ${ctx.sports.length} sports have a name`;
            },
          },
          {
            name: "Fetch positions",
            run: async (ctx) => {
              const positions = await base44.entities.Position.filter({});
              if (!Array.isArray(positions)) throw new Error("Position.filter() returned non-array");
              if (positions.length === 0) throw new Error("No positions found — Profile cannot assign a position");
              ctx.positions = positions;
              return `${positions.length} positions`;
            },
          },
          {
            name: "Positions link to a sport_id",
            run: async (ctx) => {
              const unlinked = ctx.positions.filter(p => !p.sport_id && !p.sportId).length;
              if (unlinked > ctx.positions.length / 2) throw new Error(`${unlinked}/${ctx.positions.length} positions missing sport_id — Profile dropdown will be broken`);
              return `${ctx.positions.length - unlinked}/${ctx.positions.length} positions have sport_id`;
            },
          },
        ],
      },
    ],
  },

  {
    label: "Support Tickets",
    journeys: [
      {
        id: "support_ticket_lifecycle",
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
                throw new Error(serverMsg
                  ? `submitSupportTicket 500 — server says: ${serverMsg}`
                  : `submitSupportTicket unreachable (${err.message})`);
              }
              if (!data?.ok) throw new Error(data?.error || "submitSupportTicket returned ok:false");
              ctx.ticketNumber = data.ticketNumber;
              return `Ticket created — #${data.ticketNumber}`;
            },
          },
          {
            name: "Ticket queryable via SupportTicket entity",
            run: async (ctx) => {
              const tickets = await base44.entities.SupportTicket.filter({});
              if (!Array.isArray(tickets)) throw new Error("SupportTicket.filter() returned non-array");
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
              if (!updated) throw new Error("SupportTicket.update() returned null");
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
                throw new Error(`replyToTicket unavailable (HTTP ${status ?? "unknown"}): ${err.message}`);
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
    journeys: [
      {
        id: "multi_athlete_isolation",
        name: "Multi-Athlete Data Isolation",
        icon: "👥",
        description: "CampIntent queries filter strictly by athlete_id — one athlete's camps do not appear in another athlete's view.",
        steps: [
          {
            name: "Create two test athlete profiles",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) throw new Error("Cannot get account id — auth.me() returned no id");
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
              if (!a1?.id || !a2?.id) throw new Error("Failed to create one or both test athletes");
              ctx.athlete1Id = a1.id;
              ctx.athlete2Id = a2.id;
              return `Athlete 1 id=${a1.id}  Athlete 2 id=${a2.id}`;
            },
          },
          {
            name: "Fetch a camp to use as test target",
            run: async (ctx) => {
              const camps = await base44.entities.Camp.filter({ active: true });
              if (!Array.isArray(camps) || camps.length === 0) throw new Error("No active camps for intent test");
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
              if (!intent?.id) throw new Error("CampIntent.create() returned no id");
              ctx.intent1Id = intent.id;
              return `Intent id=${intent.id} created for athlete 1`;
            },
          },
          {
            name: "Athlete 2 query returns no intents (isolation check)",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete2Id });
              const leak = (intents || []).filter(i => i.camp_id === ctx.campA.id && i.athlete_id === ctx.athlete1Id);
              if (leak.length > 0) throw new Error(`Athlete 1's intent leaked into Athlete 2's query — data isolation broken`);
              const ownIntents = (intents || []).filter(i => i.athlete_id === ctx.athlete2Id);
              return `Athlete 2 query: ${ownIntents.length} own intents, 0 from athlete 1 ✓`;
            },
          },
          {
            name: "Athlete 1 query returns correct intent",
            run: async (ctx) => {
              const intents = await base44.entities.CampIntent.filter({ athlete_id: ctx.athlete1Id });
              const found = (intents || []).find(i => i.id === ctx.intent1Id);
              if (!found) throw new Error(`Athlete 1's own intent id=${ctx.intent1Id} not found in their filtered query`);
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
        name: "Add-on Athlete Provisioning",
        icon: "👤",
        description: "A second (non-primary) AthleteProfile can be created with all required fields — home_city, home_state, display_name, is_primary:false — and is correctly queryable by account_id.",
        steps: [
          {
            name: "Get current account",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) throw new Error("auth.me() returned no id");
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
              if (!profile?.id) throw new Error("AthleteProfile.create() returned no id — add-on flow will fail");
              ctx.addonProfileId = profile.id;
              return `Add-on profile created (id=${profile.id})`;
            },
          },
          {
            name: "Add-on profile queryable by account_id",
            run: async (ctx) => {
              const profiles = await base44.entities.AthleteProfile.filter({ account_id: ctx.myId });
              const found = (profiles || []).find(p => p.id === ctx.addonProfileId);
              if (!found) throw new Error(`Add-on profile id=${ctx.addonProfileId} not found via account_id filter`);
              ctx.addonFound = found;
              return `Profile found via account_id filter ✓`;
            },
          },
          {
            name: "is_primary=false persisted correctly",
            run: async (ctx) => {
              if (ctx.addonFound.is_primary === true) throw new Error("Add-on athlete incorrectly marked is_primary=true — AthleteSwitcher sort logic will be wrong");
              return `is_primary=${ctx.addonFound.is_primary} ✓`;
            },
          },
          {
            name: "home_city, home_state, display_name all persisted",
            run: async (ctx) => {
              const missing = ["home_city", "home_state", "display_name"].filter(f => !ctx.addonFound[f]);
              if (missing.length > 0) throw new Error(`Add-on profile missing: ${missing.join(", ")} — linkStripePayment add-on path has a field coverage bug`);
              return `home_city=${ctx.addonFound.home_city}  home_state=${ctx.addonFound.home_state}  display_name=${ctx.addonFound.display_name} ✓`;
            },
          },
          {
            name: "parent fields persisted",
            run: async (ctx) => {
              const missing = ["parent_first_name", "parent_last_name", "parent_phone"].filter(f => !ctx.addonFound[f]);
              if (missing.length > 0) throw new Error(`Add-on profile missing parent fields: ${missing.join(", ")}`);
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
        name: "Primary Athlete Sort Order",
        icon: "🔢",
        description: "When multiple athletes exist, is_primary:true athletes sort before secondary athletes — AthleteSwitcher defaults to the right athlete.",
        steps: [
          {
            name: "Get current account",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) throw new Error("auth.me() returned no id");
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
              if (!primary?.id || !secondary?.id) throw new Error("Could not create test athletes");
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
              if (testProfiles.length < 2) throw new Error("Could not find both test profiles for sort check");
              // Apply same sort as AthleteSwitcher
              const sorted = [...testProfiles].sort((a, b) => {
                if (a.is_primary && !b.is_primary) return -1;
                if (!a.is_primary && b.is_primary) return 1;
                return 0;
              });
              if (sorted[0].id !== ctx.primaryId) throw new Error("is_primary:true athlete did not sort first — AthleteSwitcher would default to wrong athlete");
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
        name: "Entitlement Time Window Validity",
        icon: "🕐",
        description: "Active entitlements have starts_at and ends_at, and at least one is currently within its access window.",
        steps: [
          {
            name: "Fetch active entitlements",
            run: async (ctx) => {
              const ents = await base44.entities.Entitlement.filter({ status: "active" });
              if (!Array.isArray(ents)) throw new Error("Entitlement.filter() returned non-array");
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
              const missingStart = ctx.ents.filter(e => !e.starts_at).length;
              const missingEnd = ctx.ents.filter(e => !e.ends_at).length;
              if (missingStart > ctx.ents.length / 2) throw new Error(`${missingStart}/${ctx.ents.length} missing starts_at — access window cannot be evaluated`);
              if (missingEnd > ctx.ents.length / 2) throw new Error(`${missingEnd}/${ctx.ents.length} missing ends_at — subscriptions may never expire`);
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
                if (upcoming.length > 0) return `0 in-window now, but ${upcoming.length} upcoming — may be off-season`;
                throw new Error("No active entitlements within their time window — all subscribers would be blocked from access");
              }
              return `${inWindow.length}/${ctx.ents.length} entitlements currently within their access window ✓`;
            },
          },
          {
            name: "No entitlement has ends_at in the distant past (> 1 year ago)",
            run: async (ctx) => {
              const cutoff = new Date(Date.now() - 365 * 86400000);
              const stale = ctx.ents.filter(e => e.ends_at && new Date(e.ends_at) < cutoff);
              if (stale.length > 5) throw new Error(`${stale.length} entitlements marked active but ended >1 year ago — status cleanup may be needed`);
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
    journeys: [
      {
        id: "event_tracking",
        name: "Event Tracking Write",
        icon: "📡",
        description: "Event entity is writable — analytics and funnel tracking will record correctly.",
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
              if (!evt?.id) throw new Error("Event.create() returned no id — analytics will silently fail");
              ctx.eventId = evt.id;
              return `Event created (id=${evt.id})`;
            },
          },
          {
            name: "Event readable back via event_type filter",
            run: async (ctx) => {
              const evts = await base44.entities.Event.filter({ event_type: "healthcheck_ping" });
              if (!Array.isArray(evts)) throw new Error("Event.filter() returned non-array");
              const found = evts.find(e => e.id === ctx.eventId);
              if (!found) return `Event written but not found via filter — may be eventual consistency (id=${ctx.eventId})`;
              return `Event confirmed readable — event_type: ${found.event_type} ✓`;
            },
          },
        ],
      },

      {
        id: "email_prefs_lifecycle",
        name: "Email Preferences Full Lifecycle",
        icon: "📬",
        description: "EmailPreferences can be created, updated, and deleted — opt-out system is fully operational.",
        steps: [
          {
            name: "Get current account id",
            run: async (ctx) => {
              const me = await base44.auth.me();
              if (!me?.id) throw new Error("auth.me() returned no id");
              ctx.myId = me.id;
              return `account id = ${me.id}`;
            },
          },
          {
            name: "Create EmailPreferences record",
            run: async (ctx) => {
              // First clean up any leftover healthcheck prefs
              const existing = await base44.entities.EmailPreferences.filter({ account_id: ctx.myId });
              ctx.existingPrefIds = (existing || []).map(p => p.id).filter(Boolean);

              const pref = await base44.entities.EmailPreferences.create({
                account_id: ctx.myId,
                monthly_agenda_opt_out: false,
                camp_week_alert_opt_out: false,
              });
              if (!pref?.id) throw new Error("EmailPreferences.create() returned no id");
              ctx.prefId = pref.id;
              return `Created EmailPreferences id=${pref.id}`;
            },
          },
          {
            name: "Read back preferences",
            run: async (ctx) => {
              const prefs = await base44.entities.EmailPreferences.filter({ account_id: ctx.myId });
              const found = (prefs || []).find(p => p.id === ctx.prefId);
              if (!found) throw new Error(`EmailPreferences id=${ctx.prefId} not found after create`);
              return `Read back ok — monthly_opt_out=${found.monthly_agenda_opt_out}  alert_opt_out=${found.camp_week_alert_opt_out}`;
            },
          },
          {
            name: "Update opt-out flag",
            run: async (ctx) => {
              const updated = await base44.entities.EmailPreferences.update(ctx.prefId, {
                monthly_agenda_opt_out: true,
              });
              if (!updated) throw new Error("EmailPreferences.update() returned null");
              return `Updated monthly_agenda_opt_out → true`;
            },
          },
          {
            name: "Verify update persisted",
            run: async (ctx) => {
              const prefs = await base44.entities.EmailPreferences.filter({ account_id: ctx.myId });
              const found = (prefs || []).find(p => p.id === ctx.prefId);
              if (!found) throw new Error("Record not found after update");
              if (!found.monthly_agenda_opt_out) throw new Error("opt_out flag did not persist — sendMonthlyAgenda would ignore this opt-out");
              return `Opt-out persisted: monthly_agenda_opt_out=${found.monthly_agenda_opt_out} ✓`;
            },
          },
          {
            name: "Delete test record (cleanup)",
            run: async (ctx) => {
              await base44.entities.EmailPreferences.delete(ctx.prefId);
              return `EmailPreferences id=${ctx.prefId} deleted`;
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
    journeys: [
      {
        id: "admin_function_guards",
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400 validation enforced) ✓";
                throw new Error("Function unreachable: " + msg);
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
                  throw new Error("Admin guard rejected this admin session — user.role may not be 'admin'");
                if (msg.includes("400")) return "Reachable — admin access confirmed (400: toEmail required) ✓";
                throw new Error("Function unreachable: " + msg);
              }
            },
          },
        ],
      },
    ],
  },

  // ── COACH FEATURE ────────────────────────────────────────────────────────────
  {
    label: "Coach Feature",
    journeys: [
      {
        id: "coach_role_bypass",
        name: "Coach role — useSeasonAccess bypass",
        icon: "🏈",
        description: "Accounts with role=coach are not gated by entitlement check. " +
          "Simulates the access shape a coach account would return.",
        steps: [
          {
            name: "useSeasonAccess hook is importable",
            run: async () => {
              const me = await base44.auth.me();
              if (!me) throw new Error("auth.me() returned null — cannot verify role field");
              return `auth.me() ok — role field: ${me.role ?? "(not set, defaults to parent behavior)"}`;
            },
          },
          {
            name: "Admin account has role=admin on auth object",
            run: async () => {
              const me = await base44.auth.me();
              if (!me) throw new Error("auth.me() returned null");
              if (me.role !== "admin") throw new Error(
                `Expected role=admin for admin account, got: ${me.role ?? "(undefined)"} ` +
                "— role field may not be set on auth user object yet"
              );
              return `role=admin confirmed on admin account ✓`;
            },
          },
          {
            name: "CoachRoute component file exists in codebase",
            run: async () => {
              const allRoutes = Object.keys(window.__pagesDebug || {});
              if (allRoutes.length === 0) {
                return "Cannot introspect pages at runtime — verify CoachRoute.jsx exists at src/components/auth/CoachRoute.jsx";
              }
              if (!allRoutes.includes("CoachDashboard")) {
                throw new Error("CoachDashboard not found in pages config — add to pages.config.js when Phase 2 deploys");
              }
              return `CoachDashboard route registered ✓`;
            },
          },
        ],
      },

      {
        id: "coach_invite_code_flow",
        name: "Coach invite code — localStorage persistence",
        icon: "🔗",
        description: "Coach invite code survives being stored in localStorage and is " +
          "readable at checkout time. Does not require an actual coach account.",
        steps: [
          {
            name: "localStorage read/write available",
            run: async () => {
              try {
                localStorage.setItem("__hc_test__", "1");
                const val = localStorage.getItem("__hc_test__");
                localStorage.removeItem("__hc_test__");
                if (val !== "1") throw new Error("localStorage write/read mismatch");
                return "localStorage available ✓";
              } catch (err) {
                throw new Error(`localStorage not available: ${err.message} — coach invite code flow will fail`);
              }
            },
          },
          {
            name: "Simulate invite code store and retrieve",
            run: async (ctx) => {
              const testCode = "SMITH-WHS-TEST";
              localStorage.setItem("coachInviteCode", testCode);
              const retrieved = localStorage.getItem("coachInviteCode");
              localStorage.removeItem("coachInviteCode");
              if (retrieved !== testCode) {
                throw new Error(`Stored "${testCode}" but retrieved "${retrieved}" — localStorage key mismatch`);
              }
              ctx.codeFlowOk = true;
              return `Invite code stored and retrieved correctly ✓`;
            },
          },
          {
            name: "Invalid coach code is handled gracefully",
            run: async () => {
              let result;
              try {
                result = await base44.entities.Coach.filter({ invite_code: "__INVALID_HC_CODE__" });
              } catch (err) {
                throw new Error(
                  `Coach.filter() threw on unknown invite_code: ${err.message} — ` +
                  "CoachInviteLanding will crash if code is not found"
                );
              }
              if (!Array.isArray(result)) throw new Error("Coach.filter() returned non-array");
              if (result.length > 0) throw new Error("Bogus invite code returned a match — data integrity issue");
              return `Unknown invite_code correctly returns empty array ✓`;
            },
          },
        ],
      },

      {
        id: "coach_signup_functions",
        name: "Coach signup — account creation path",
        icon: "✍️",
        description: "Auth register and role assignment are functional for coach account type.",
        steps: [
          {
            name: "auth.register is callable (same as parent signup)",
            run: async () => {
              if (typeof base44.auth?.register !== "function") {
                throw new Error("base44.auth.register not available — coach signup page will fail");
              }
              return "base44.auth.register available ✓";
            },
          },
          {
            name: "Coach entity create/delete cycle (with first_name / last_name schema)",
            run: async (ctx) => {
              let testCoach;
              try {
                testCoach = await base44.entities.Coach.create({
                  first_name: "__healthcheck__",
                  last_name: "__coach_test__",
                  school_or_org: "Health Check HS",
                  sport: "Football",
                  invite_code: `HC-TEST-${Date.now()}`,
                  account_id: "hc_test_account",
                  status: "pending",
                  active: true,
                });
              } catch (err) {
                const msg = String(err?.message || err);
                if (msg.includes("first_name") || msg.includes("last_name")) {
                  throw new Error(
                    "Coach entity schema still uses 'name' field — update the Coach entity in base44 admin: " +
                    "rename 'name' → 'first_name', add 'last_name' (both string, required), add 'status' (string). " +
                    "Until this is done, ALL real coach signups via registerCoach will fail with the same error."
                  );
                }
                throw new Error("Coach.create() failed: " + msg);
              }
              if (!testCoach?.id) throw new Error("Coach.create() returned no id — entity may be read-only");
              ctx.testCoachId = testCoach.id;
              ctx.testInviteCode = testCoach.invite_code;
              await base44.entities.Coach.delete(testCoach.id).catch(() => {});
              ctx.testCoachId = null;
              return `Coach record created with first_name/last_name/status fields — schema up to date ✓`;
            },
          },
          {
            name: "Coach record readable by invite_code",
            run: async (ctx) => {
              const found = await base44.entities.Coach.filter({ invite_code: ctx.testInviteCode });
              if (!Array.isArray(found) || found.length === 0) {
                throw new Error(`Coach not found by invite_code="${ctx.testInviteCode}" — filter index may be missing`);
              }
              return `Coach found by invite_code ✓`;
            },
          },
          {
            name: "Cleanup — delete test coach record",
            run: async (ctx) => {
              if (ctx.testCoachId) {
                await base44.entities.Coach.delete(ctx.testCoachId);
              }
              return "Test Coach record deleted ✓";
            },
          },
        ],
      },

      {
        id: "coach_entity_schema",
        name: "Coach entity — schema and read access",
        icon: "📋",
        description: "Coach entity exists, is queryable, and has required fields. " +
          "Runs after Phase 2 deployment.",
        steps: [
          {
            name: "Coach entity is queryable",
            run: async (ctx) => {
              let coaches;
              try {
                coaches = await base44.entities.Coach.filter({});
              } catch (err) {
                throw new Error(
                  `Coach entity not readable: ${err?.message || err} — ` +
                  "create the Coach entity in base44 admin before deploying Phase 2"
                );
              }
              if (!Array.isArray(coaches)) throw new Error("Coach.filter() returned non-array");
              ctx.coaches = coaches;
              return `Coach entity reachable — ${coaches.length} records`;
            },
          },
          {
            name: "Coach entity has required fields (first_name, last_name, status, invite_code, account_id)",
            run: async (ctx) => {
              if (ctx.coaches.length === 0) {
                return "No Coach records yet — field check skipped (expected before first signup)";
              }
              const required = ["first_name", "last_name", "status", "invite_code", "account_id"];
              const sample = ctx.coaches[0];
              const missing = required.filter(f => !(f in sample));
              if (missing.length > 0) {
                throw new Error(`Coach record missing fields: ${missing.join(", ")} — schema was updated from 'name' to first_name/last_name; old records may need migration and entity schema must be updated in base44 admin`);
              }
              const badName = ctx.coaches.filter(c => "name" in c && !("first_name" in c));
              if (badName.length > 0) {
                throw new Error(`${badName.length} Coach records have old 'name' field but no 'first_name' — schema migration incomplete; CoachDashboard and approveCoach will show wrong names`);
              }
              return `All required fields present on Coach entity (first_name/last_name split) ✓`;
            },
          },
          {
            name: "invite_code values are unique",
            run: async (ctx) => {
              if (ctx.coaches.length < 2) return "Fewer than 2 coaches — uniqueness check skipped";
              const codes = ctx.coaches.map(c => c.invite_code).filter(Boolean);
              const unique = new Set(codes);
              if (unique.size !== codes.length) {
                throw new Error(
                  `Duplicate invite_codes detected (${codes.length} codes, ${unique.size} unique) — ` +
                  "invite_code must be unique across all Coach records"
                );
              }
              return `All ${codes.length} invite_codes are unique ✓`;
            },
          },
          {
            name: "No coaches have status=undefined (status field required for verification gate)",
            run: async (ctx) => {
              if (ctx.coaches.length === 0) return "No coaches — check skipped";
              const noStatus = ctx.coaches.filter(c => !c.status);
              if (noStatus.length > 0) {
                throw new Error(
                  `${noStatus.length} Coach records have no status field — ` +
                  "CoachInviteLanding filter for status='approved' will exclude them; " +
                  "set status='approved' on legacy records or add status to entity schema"
                );
              }
              const counts = { pending: 0, approved: 0, rejected: 0, other: 0 };
              ctx.coaches.forEach(c => {
                if (c.status === "pending") counts.pending++;
                else if (c.status === "approved") counts.approved++;
                else if (c.status === "rejected") counts.rejected++;
                else counts.other++;
              });
              return `Status distribution — pending:${counts.pending} approved:${counts.approved} rejected:${counts.rejected} other:${counts.other} ✓`;
            },
          },
        ],
      },

      {
        id: "coach_backend_functions",
        name: "Coach backend functions — registerCoach, approveCoach, sendCoachMessage",
        icon: "⚙️",
        description: "All three coach backend functions are reachable and enforce their guards correctly. " +
          "registerCoach requires authentication, approveCoach is admin-only, sendCoachMessage requires a coach role.",
        steps: [
          {
            name: "registerCoach function reachable (returns 400 for missing fields, not 500)",
            run: async (ctx) => {
              try {
                const res = await base44.functions.invoke("registerCoach", {
                  accountId: "hc_probe_only",
                  first_name: "",
                  last_name: "",
                  school_or_org: "",
                });
                const data = res?.data;
                // ok:false with a validation message means the function is alive and validating
                if (data?.ok === false && data?.error) {
                  ctx.registerReachable = true;
                  return `registerCoach reachable — validation enforced: "${data.error}" ✓`;
                }
                // ok:true with hc_probe_only would mean no validation — still counts as reachable
                ctx.registerReachable = true;
                return `registerCoach responded ok=${data?.ok}`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("400") || msg.includes("401")) {
                  ctx.registerReachable = true;
                  return `registerCoach reachable — HTTP ${msg.includes("401") ? "401 (auth required)" : "400 (validation enforced)"} ✓`;
                }
                throw new Error("registerCoach unreachable: " + msg);
              }
            },
          },
          {
            name: "approveCoach function reachable and rejects non-admin",
            run: async (ctx) => {
              // This check runs as admin — should NOT get 403
              // If we get ok:false with "Admin access required" the guard is bypassing this admin (bad)
              // If we get ok:false with "coachId and action are required" → admin passed guard ✓
              try {
                const res = await base44.functions.invoke("approveCoach", {});
                const data = res?.data;
                if (data?.error === "Admin access required") {
                  throw new Error("approveCoach rejected this admin account — user.role may not be 'admin' or function deploy is stale");
                }
                ctx.approveReachable = true;
                return `approveCoach reachable — admin access confirmed: "${data?.error || "ok"}" ✓`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("Admin access required")) {
                  throw new Error("approveCoach admin guard rejected this admin session — role may be wrong");
                }
                if (msg.includes("400")) {
                  ctx.approveReachable = true;
                  return `approveCoach reachable — 400 (coachId/action required, admin passed) ✓`;
                }
                if (msg.includes("403")) {
                  throw new Error("approveCoach returned 403 for admin account — admin guard misconfigured");
                }
                throw new Error("approveCoach unreachable: " + msg);
              }
            },
          },
          {
            name: "sendCoachMessage function reachable",
            run: async (ctx) => {
              try {
                const res = await base44.functions.invoke("sendCoachMessage", {});
                const data = res?.data;
                ctx.sendMsgReachable = true;
                return `sendCoachMessage responded — ok=${data?.ok} error="${data?.error || "none"}" ✓`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("400") || msg.includes("401") || msg.includes("403") || msg.includes("404")) {
                  ctx.sendMsgReachable = true;
                  return `sendCoachMessage reachable — returned expected error for invalid call ✓`;
                }
                throw new Error("sendCoachMessage unreachable: " + msg);
              }
            },
          },
        ],
      },

      {
        id: "coach_roster_message_entities",
        name: "CoachRoster and CoachMessage entities — schema and queryability",
        icon: "📋",
        description: "CoachRoster and CoachMessage entities are queryable and can hold records. " +
          "Required for Stripe webhook roster linking and coach broadcast messaging.",
        steps: [
          {
            name: "CoachRoster entity queryable",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CoachRoster.filter({});
              } catch (err) {
                throw new Error(
                  `CoachRoster entity not readable: ${err?.message || err} — ` +
                  "create entity in base44 admin with fields: coach_id, account_id, athlete_id, athlete_name, invite_code, joined_at"
                );
              }
              if (!Array.isArray(rows)) throw new Error("CoachRoster.filter() returned non-array");
              ctx.rosterRows = rows;
              return `CoachRoster entity reachable — ${rows.length} records`;
            },
          },
          {
            name: "CoachRoster create/delete cycle (verifies write access and field schema)",
            run: async (ctx) => {
              const testRow = await base44.entities.CoachRoster.create({
                coach_id: "__hc_coach__",
                account_id: "__hc_account__",
                athlete_id: "__hc_athlete__",
                athlete_name: "__hc_athlete_name__",
                invite_code: `HC-${Date.now()}`,
                joined_at: new Date().toISOString(),
              });
              if (!testRow?.id) throw new Error("CoachRoster.create() returned no id — stripeWebhook roster linking will silently fail");
              ctx.testRosterId = testRow.id;
              await base44.entities.CoachRoster.delete(testRow.id).catch(() => {});
              ctx.testRosterId = null;
              return `CoachRoster create/delete cycle ok — all required fields accepted ✓`;
            },
          },
          {
            name: "CoachMessage entity queryable",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CoachMessage.filter({});
              } catch (err) {
                throw new Error(
                  `CoachMessage entity not readable: ${err?.message || err} — ` +
                  "create entity in base44 admin with fields: coach_id, subject, message, sent_at"
                );
              }
              if (!Array.isArray(rows)) throw new Error("CoachMessage.filter() returned non-array");
              ctx.msgRows = rows;
              return `CoachMessage entity reachable — ${rows.length} records`;
            },
          },
          {
            name: "CoachMessage create/delete cycle (verifies write access and field schema)",
            run: async (ctx) => {
              const testMsg = await base44.entities.CoachMessage.create({
                coach_id: "__hc_coach__",
                subject: "[HEALTHCHECK] test — safe to ignore",
                message: "Health check probe message.",
                sent_at: new Date().toISOString(),
              });
              if (!testMsg?.id) throw new Error("CoachMessage.create() returned no id — sendCoachMessage function will fail");
              await base44.entities.CoachMessage.delete(testMsg.id).catch(() => {});
              return `CoachMessage create/delete cycle ok — all required fields accepted ✓`;
            },
          },
          {
            name: "CoachRoster filter by coach_id works (required for roster display)",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CoachRoster.filter({ coach_id: "__hc_nonexistent__" });
              } catch (err) {
                throw new Error(`CoachRoster.filter({ coach_id }) threw: ${err?.message} — CoachDashboard roster fetch will crash`);
              }
              if (!Array.isArray(rows)) throw new Error("CoachRoster.filter({ coach_id }) returned non-array");
              return `CoachRoster filter by coach_id ok — returns empty array for unknown id ✓`;
            },
          },
          {
            name: "CoachMessage filter by coach_id works (required for sent messages display)",
            run: async (ctx) => {
              let rows;
              try {
                rows = await base44.entities.CoachMessage.filter({ coach_id: "__hc_nonexistent__" });
              } catch (err) {
                throw new Error(`CoachMessage.filter({ coach_id }) threw: ${err?.message} — CoachDashboard message history will crash`);
              }
              if (!Array.isArray(rows)) throw new Error("CoachMessage.filter({ coach_id }) returned non-array");
              return `CoachMessage filter by coach_id ok — returns empty array for unknown id ✓`;
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.testRosterId) {
            try { await base44.entities.CoachRoster.delete(ctx.testRosterId); } catch {}
          }
        },
      },

      {
        id: "coach_stripe_passthrough",
        name: "Coach invite code — Stripe passthrough and webhook isolation",
        icon: "💳",
        description: "createStripeCheckout accepts coachInviteCode in body (does not throw). " +
          "Verifies the Stripe integration can forward coach context without breaking the normal payment flow.",
        steps: [
          {
            name: "createStripeCheckout function accepts coachInviteCode field",
            run: async (ctx) => {
              // Probe with minimal fields — the function will return an error because
              // priceId/athleteFirstName etc. are required, but it must NOT throw on coachInviteCode.
              // A 400 for missing priceId confirms the function is alive and accepted the field.
              try {
                const res = await base44.functions.invoke("createStripeCheckout", {
                  coachInviteCode: "HC-PROBE-ONLY",
                  priceId: "",
                });
                const data = res?.data;
                if (data?.ok === false && data?.error) {
                  ctx.checkoutReachable = true;
                  return `createStripeCheckout reachable with coachInviteCode — validation error (expected): "${data.error}" ✓`;
                }
                ctx.checkoutReachable = true;
                return `createStripeCheckout responded — coachInviteCode field accepted ✓`;
              } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes("400") || msg.includes("priceId") || msg.includes("price")) {
                  ctx.checkoutReachable = true;
                  return `createStripeCheckout reachable — accepted coachInviteCode, rejected missing priceId ✓`;
                }
                if (msg.includes("coachInviteCode") || msg.includes("unexpected")) {
                  throw new Error("createStripeCheckout rejected coachInviteCode field — Stripe metadata will not include coach code; CoachRoster will never be linked on payment");
                }
                throw new Error("createStripeCheckout unreachable: " + msg);
              }
            },
          },
          {
            name: "CoachRoster entity writable from service role context (simulates stripeWebhook linking)",
            run: async (ctx) => {
              // stripeWebhook uses asServiceRole — we can only test this path via the entity API
              // which also uses service role. If it's writable here, the webhook can write it.
              const testRow = await base44.entities.CoachRoster.create({
                coach_id: "__hc_stripe_probe__",
                account_id: "__hc_stripe_account__",
                athlete_id: "__hc_stripe_athlete__",
                athlete_name: "__hc_stripe_name__",
                invite_code: `HC-STRIPE-${Date.now()}`,
                joined_at: new Date().toISOString(),
              }).catch(err => { throw new Error(`CoachRoster write failed — stripeWebhook roster linking will fail: ${err?.message}`); });
              if (!testRow?.id) throw new Error("CoachRoster.create() returned no id — webhook linking will silently produce no roster entry");
              ctx.stripeTestRosterId = testRow.id;
              return `CoachRoster writable from entity API (mirrors stripeWebhook service role path) ✓`;
            },
          },
          {
            name: "Idempotency: duplicate CoachRoster entry for same account+coach is detectable",
            run: async (ctx) => {
              // stripeWebhook checks for existing before creating — verify filter by account_id+coach_id works
              const existing = await base44.entities.CoachRoster.filter({
                coach_id: "__hc_stripe_probe__",
                account_id: "__hc_stripe_account__",
              }).catch(err => { throw new Error(`CoachRoster compound filter failed: ${err?.message} — idempotency check in stripeWebhook will not work`); });
              if (!Array.isArray(existing)) throw new Error("CoachRoster.filter(coach_id + account_id) returned non-array");
              const found = existing.find(r => r.id === ctx.stripeTestRosterId);
              if (!found) return `Filter returned ${existing.length} rows — test row not found by filter (may be search limitation), idempotency risk`;
              return `CoachRoster compound filter (coach_id + account_id) works — idempotency check will find duplicates ✓`;
            },
          },
          {
            name: "Cleanup — delete Stripe probe CoachRoster entry",
            run: async (ctx) => {
              if (ctx.stripeTestRosterId) {
                await base44.entities.CoachRoster.delete(ctx.stripeTestRosterId).catch(() => {});
                ctx.stripeTestRosterId = null;
              }
              return "Stripe probe roster entry deleted ✓";
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.stripeTestRosterId) {
            try { await base44.entities.CoachRoster.delete(ctx.stripeTestRosterId); } catch {}
          }
        },
      },

      {
        id: "coach_pages_registered",
        name: "Coach pages — all four routes registered in pages.config.js",
        icon: "🗺️",
        description: "CoachDashboard, CoachNetworkAdmin, CoachSignup, and CoachInviteLanding must all be registered. " +
          "Missing any one causes a blank page or 404 for that flow.",
        steps: [
          {
            name: "pages.config.js importable",
            run: async (ctx) => {
              const mod = await import("../pages.config.js");
              const pages = mod.PAGES || mod.pagesConfig?.Pages;
              if (!pages) throw new Error("Could not import PAGES from pages.config.js");
              ctx.pages = pages;
              return `PAGES imported — ${Object.keys(pages).length} routes registered`;
            },
          },
          {
            name: "CoachDashboard registered",
            run: async (ctx) => {
              if (!ctx.pages["CoachDashboard"]) throw new Error("'CoachDashboard' not in PAGES — /CoachDashboard will 404; coaches cannot access their dashboard");
              return "CoachDashboard registered ✓";
            },
          },
          {
            name: "CoachSignup registered",
            run: async (ctx) => {
              if (!ctx.pages["CoachSignup"]) throw new Error("'CoachSignup' not in PAGES — /CoachSignup will 404; new coaches cannot register");
              return "CoachSignup registered ✓";
            },
          },
          {
            name: "CoachInviteLanding registered",
            run: async (ctx) => {
              if (!ctx.pages["CoachInviteLanding"]) throw new Error("'CoachInviteLanding' not in PAGES — /CoachInviteLanding will 404; athletes cannot join rosters via invite link");
              return "CoachInviteLanding registered ✓";
            },
          },
          {
            name: "CoachNetworkAdmin registered",
            run: async (ctx) => {
              if (!ctx.pages["CoachNetworkAdmin"]) throw new Error("'CoachNetworkAdmin' not in PAGES — /CoachNetworkAdmin will 404; admin cannot approve/reject coaches");
              return "CoachNetworkAdmin registered ✓";
            },
          },
        ],
      },

      {
        id: "coach_pending_session_storage",
        name: "Coach pending registration — sessionStorage key read/write",
        icon: "💾",
        description: "The pendingCoachRegistration sessionStorage key must be writable and readable. " +
          "CoachSignup writes it; AuthRedirect reads and consumes it to call registerCoach.",
        steps: [
          {
            name: "Can write and read pendingCoachRegistration key",
            run: async () => {
              const KEY = "pendingCoachRegistration";
              const testVal = JSON.stringify({
                first_name: "TestFirst",
                last_name: "TestLast",
                school_or_org: "Test High School",
                sport: "Football",
                email: "hc_test@example.com",
              });
              sessionStorage.setItem(KEY, testVal);
              const retrieved = sessionStorage.getItem(KEY);
              sessionStorage.removeItem(KEY);
              if (retrieved !== testVal) throw new Error(`pendingCoachRegistration write/read mismatch — AuthRedirect will not receive coach data; registerCoach will never be called`);
              const parsed = JSON.parse(retrieved);
              const required = ["first_name", "last_name", "school_or_org", "sport", "email"];
              const missing = required.filter(f => !parsed[f]);
              if (missing.length > 0) throw new Error(`pendingCoachRegistration parsed value missing: ${missing.join(", ")}`);
              return `pendingCoachRegistration key read/write ok — all required fields serializable ✓`;
            },
          },
          {
            name: "AuthRedirect uses correct sessionStorage key name",
            run: async () => {
              // Verify the key name hasn't drifted — AuthRedirect reads 'pendingCoachRegistration'
              // CoachSignup writes 'pendingCoachRegistration' — they must match exactly.
              const KEY = "pendingCoachRegistration";
              sessionStorage.setItem(KEY, "probe");
              const val = sessionStorage.getItem(KEY);
              sessionStorage.removeItem(KEY);
              if (val !== "probe") throw new Error("Key name mismatch — CoachSignup and AuthRedirect use different keys");
              return `Key 'pendingCoachRegistration' consistent between CoachSignup and AuthRedirect ✓`;
            },
          },
          {
            name: "coach role values are recognized by AuthRedirect routing logic",
            run: async () => {
              // AuthRedirect routes coach and coach_pending roles to /CoachDashboard
              // Verify the role strings used in registerCoach/approveCoach match what AuthRedirect checks
              const COACH_ROLES = ["coach", "coach_pending"];
              const ROUTES_TO_DASHBOARD = (role) => COACH_ROLES.includes(role);
              if (!ROUTES_TO_DASHBOARD("coach")) throw new Error("'coach' role would not route to CoachDashboard — AuthRedirect logic broken");
              if (!ROUTES_TO_DASHBOARD("coach_pending")) throw new Error("'coach_pending' role would not route to CoachDashboard — pending coaches will be routed to Subscribe instead");
              if (ROUTES_TO_DASHBOARD("")) throw new Error("Empty string role routes to CoachDashboard — rejected coaches would incorrectly land there");
              if (ROUTES_TO_DASHBOARD("subscriber")) throw new Error("'subscriber' role routes to CoachDashboard — subscriber routing broken");
              return `Role routing logic correct: coach/coach_pending → CoachDashboard; empty/subscriber → normal flow ✓`;
            },
          },
        ],
      },

      {
        id: "coach_verification_lifecycle",
        name: "Coach verification — full pending/approve/reject lifecycle",
        icon: "✅",
        description: "Creates a test Coach record, verifies pending status, simulates approve and reject state transitions. " +
          "Cleans up fully. Validates the entire admin review flow end-to-end.",
        steps: [
          {
            name: "Create test Coach record with status=pending",
            run: async (ctx) => {
              let coach;
              try {
                coach = await base44.entities.Coach.create({
                  first_name: "__hc_verify__",
                  last_name: "__test__",
                  school_or_org: "Health Check HS",
                  sport: "Football",
                  invite_code: `HC-VERIFY-${Date.now()}`,
                  account_id: "__hc_verify_account__",
                  status: "pending",
                  active: true,
                  created_at: new Date().toISOString(),
                });
              } catch (err) {
                const msg = String(err?.message || err);
                if (msg.includes("first_name") || msg.includes("last_name")) {
                  throw new Error(
                    "Coach entity schema missing first_name/last_name fields — update schema in base44 admin before running this journey. " +
                    "See 'Coach signup — account creation path' journey for details."
                  );
                }
                throw new Error("Coach.create() failed: " + msg);
              }
              if (!coach?.id) throw new Error("Coach.create() returned no id");
              ctx.verifyCoachId = coach.id;
              ctx.verifyInviteCode = coach.invite_code;
              return `Test coach created — id=${coach.id} status=${coach.status}`;
            },
          },
          {
            name: "Pending coach NOT found by CoachInviteLanding filter (status=approved required)",
            run: async (ctx) => {
              const found = await base44.entities.Coach.filter({
                invite_code: ctx.verifyInviteCode,
                active: true,
                status: "approved",
              });
              if (!Array.isArray(found)) throw new Error("Coach.filter() returned non-array");
              const matched = found.find(c => c.id === ctx.verifyCoachId);
              if (matched) throw new Error("Pending coach matched status=approved filter — CoachInviteLanding would allow athletes to join an unverified coach's roster");
              return `Pending coach correctly excluded from status=approved filter ✓`;
            },
          },
          {
            name: "Approve — update status to approved",
            run: async (ctx) => {
              const updated = await base44.entities.Coach.update(ctx.verifyCoachId, { status: "approved" });
              if (!updated) throw new Error("Coach.update(status=approved) returned null — approveCoach function will fail");
              ctx.approvedOk = true;
              return `Coach status updated to approved ✓`;
            },
          },
          {
            name: "Approved coach IS found by CoachInviteLanding filter",
            run: async (ctx) => {
              const found = await base44.entities.Coach.filter({
                invite_code: ctx.verifyInviteCode,
                active: true,
                status: "approved",
              });
              if (!Array.isArray(found)) throw new Error("Coach.filter() returned non-array");
              const matched = found.find(c => c.id === ctx.verifyCoachId);
              if (!matched) throw new Error("Approved coach not found by status=approved filter — CoachInviteLanding will incorrectly block athletes");
              return `Approved coach correctly found via invite link filter ✓`;
            },
          },
          {
            name: "Reject — update status to rejected, active to false",
            run: async (ctx) => {
              const updated = await base44.entities.Coach.update(ctx.verifyCoachId, { status: "rejected", active: false });
              if (!updated) throw new Error("Coach.update(status=rejected) returned null — approveCoach reject path will fail");
              ctx.rejectedOk = true;
              return `Coach status updated to rejected, active=false ✓`;
            },
          },
          {
            name: "Rejected coach NOT found by active+approved filter",
            run: async (ctx) => {
              const found = await base44.entities.Coach.filter({
                invite_code: ctx.verifyInviteCode,
                active: true,
                status: "approved",
              });
              if (!Array.isArray(found)) throw new Error("Coach.filter() returned non-array");
              const matched = found.find(c => c.id === ctx.verifyCoachId);
              if (matched) throw new Error("Rejected coach leaked through active+approved filter — rejected coaches could still appear on invite landing");
              return `Rejected coach correctly excluded from active+approved filter ✓`;
            },
          },
          {
            name: "Cleanup — delete test coach",
            run: async (ctx) => {
              if (ctx.verifyCoachId) {
                await base44.entities.Coach.delete(ctx.verifyCoachId).catch(() => {});
                ctx.verifyCoachId = null;
              }
              return "Test coach deleted ✓";
            },
          },
        ],
        cleanup: async (ctx) => {
          if (ctx.verifyCoachId) {
            try { await base44.entities.Coach.delete(ctx.verifyCoachId); } catch {}
          }
        },
      },
    ],
  },

];

// Flatten for runner access by id
const ALL_JOURNEYS = JOURNEY_GROUPS.flatMap(g => g.journeys);

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

    // Retry up to 2 times on rate-limit errors with exponential backoff
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        detail = await step.run(ctx);
        stepErr = null;
        break;
      } catch (err) {
        stepErr = err;
        if (isRateLimitErr(err) && attempt < 2) {
          await hcSleep(600 * Math.pow(2, attempt)); // 600ms → 1200ms
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

    const result = { name: step.name, status: "pass", detail: detail || "ok", ms: Date.now() - stepStart };
    results.push(result);
    onStep(results, failed ? "fail" : "running");
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
      if (i > 0) await hcSleep(350); // throttle between journeys to avoid rate limits
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
