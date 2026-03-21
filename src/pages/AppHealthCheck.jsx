// src/pages/AppHealthCheck.jsx
import { useState, useCallback } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";

// ── Journey definitions ──────────────────────────────────────────────────────
// Each step: { name, run(ctx) → string }
// run() returns a detail string on success, throws on failure.
// ctx is shared within a journey — steps can pass data forward.

const JOURNEYS = [
  {
    id: "auth",
    name: "Auth & Session",
    icon: "🔐",
    description: "Current session is valid and returns an authenticated user.",
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
          if (!ctx.user?.id) throw new Error("User object has no ID");
          return `id = ${ctx.user.id}`;
        },
      },
    ],
  },

  {
    id: "camps",
    name: "Camp Data",
    icon: "⛺",
    description: "Active camps are accessible and contain required fields.",
    steps: [
      {
        name: "Fetch active camps",
        run: async (ctx) => {
          const camps = await base44.entities.Camp.filter({ active: true });
          if (!Array.isArray(camps)) throw new Error("Camp.filter() did not return an array");
          if (camps.length === 0) throw new Error("No active camps found — data may be missing");
          ctx.camps = camps;
          return `${camps.length} active camps`;
        },
      },
      {
        name: "Camps have required fields",
        run: async (ctx) => {
          const missing = ctx.camps.slice(0, 20).filter(
            c => !c.camp_name || !c.start_date
          );
          if (missing.length > 0)
            throw new Error(`${missing.length} of first 20 camps missing camp_name or start_date`);
          return `First 20 camps have camp_name and start_date`;
        },
      },
      {
        name: "Camps have source_key",
        run: async (ctx) => {
          const missing = ctx.camps.slice(0, 20).filter(c => !c.source_key);
          if (missing.length > 5)
            throw new Error(`${missing.length} of first 20 camps missing source_key`);
          const ok = 20 - missing.length;
          return `${ok}/20 camps have source_key${missing.length > 0 ? ` (${missing.length} missing)` : ""}`;
        },
      },
    ],
  },

  {
    id: "schools",
    name: "School Data",
    icon: "🏫",
    description: "School records are accessible and linked to divisions.",
    steps: [
      {
        name: "Fetch schools",
        run: async (ctx) => {
          const schools = await base44.entities.School.filter({});
          if (!Array.isArray(schools)) throw new Error("School.filter() did not return an array");
          if (schools.length === 0) throw new Error("No schools found");
          ctx.schools = schools;
          return `${schools.length} schools`;
        },
      },
      {
        name: "Schools have division data",
        run: async (ctx) => {
          const withDiv = ctx.schools.filter(s => s.division).length;
          const pct = Math.round((withDiv / ctx.schools.length) * 100);
          if (pct < 50) throw new Error(`Only ${pct}% of schools have a division`);
          return `${withDiv}/${ctx.schools.length} (${pct}%) have division`;
        },
      },
    ],
  },

  {
    id: "subscribers",
    name: "Subscriber Data",
    icon: "👥",
    description: "Entitlements, athlete profiles, and camp intents are readable.",
    steps: [
      {
        name: "Fetch active entitlements",
        run: async (ctx) => {
          const ents = await base44.entities.Entitlement.filter({ status: "active" });
          if (!Array.isArray(ents)) throw new Error("Entitlement.filter() did not return an array");
          ctx.entitlements = ents;
          return `${ents.length} active entitlement${ents.length !== 1 ? "s" : ""}`;
        },
      },
      {
        name: "Fetch athlete profiles",
        run: async (ctx) => {
          const athletes = await base44.entities.AthleteProfile.filter({ active: true });
          if (!Array.isArray(athletes)) throw new Error("AthleteProfile.filter() did not return an array");
          ctx.athletes = athletes;
          return `${athletes.length} active athlete profile${athletes.length !== 1 ? "s" : ""}`;
        },
      },
      {
        name: "Fetch camp intents",
        run: async (ctx) => {
          const intents = await base44.entities.CampIntent.filter({});
          if (!Array.isArray(intents)) throw new Error("CampIntent.filter() did not return an array");
          ctx.intents = intents;
          const reg = intents.filter(i => i.status === "registered").length;
          const fav = intents.filter(i => i.status === "favorite").length;
          return `${intents.length} total — ${reg} registered, ${fav} favorited`;
        },
      },
      {
        name: "Athlete → account links intact",
        run: async (ctx) => {
          const unlinked = ctx.athletes.filter(a => !a.account_id).length;
          if (unlinked > 0) throw new Error(`${unlinked} athlete profiles missing account_id`);
          return `All ${ctx.athletes.length} athletes have account_id`;
        },
      },
    ],
  },

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
          if (val === "NOT SET" || !val) throw new Error("RESEND_API_KEY is NOT SET");
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
    description: "sendCampWeekAlert function is reachable and responds.",
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
          ctx.alertData = data;
          return `Responded ok:true — ${data.summary?.dry_run ?? 0} accounts would be alerted`;
        },
      },
    ],
  },

  {
    id: "entity_write",
    name: "Entity Read / Write",
    icon: "✍️",
    description: "Can create, read back, and delete a record (uses RoadmapItem as test target).",
    steps: [
      {
        name: "Create test record",
        run: async (ctx) => {
          const rec = await base44.entities.RoadmapItem.create({
            title: "__healthcheck_test__",
            why: "Automated write test — safe to delete",
            type: "infra",
            status: "intake",
            priority: "P3",
            source: "internal",
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
          return `Record confirmed in store`;
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

  {
    id: "email_prefs",
    name: "Email Preferences",
    icon: "⚙️",
    description: "EmailPreferences entity is reachable (opt-out system).",
    steps: [
      {
        name: "Fetch email preferences",
        run: async () => {
          const prefs = await base44.entities.EmailPreferences.filter({});
          if (!Array.isArray(prefs)) throw new Error("EmailPreferences.filter() did not return an array");
          const optedOut = prefs.filter(p => p.monthly_agenda_opt_out || p.camp_week_alert_opt_out).length;
          return `${prefs.length} records — ${optedOut} with at least one opt-out`;
        },
      },
    ],
  },
];

// ── Runner logic ─────────────────────────────────────────────────────────────

const IDLE_STATE = () => ({ status: "idle", steps: [], duration: null, error: null });

async function runJourney(journey, onStep) {
  const ctx = {};
  const results = [];
  const start = Date.now();

  for (const step of journey.steps) {
    const stepStart = Date.now();
    try {
      const detail = await step.run(ctx);
      const result = { name: step.name, status: "pass", detail: detail || "ok", ms: Date.now() - stepStart };
      results.push(result);
      onStep(results, "running");
    } catch (err) {
      const result = { name: step.name, status: "fail", detail: err.message || String(err), ms: Date.now() - stepStart };
      results.push(result);
      onStep(results, "fail");
      return { status: "fail", steps: results, duration: Date.now() - start };
    }
  }

  onStep(results, "pass");
  return { status: "pass", steps: results, duration: Date.now() - start };
}

// ── UI components ─────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const colors = { idle: "#d1d5db", running: "#c8850a", pass: "#059669", fail: "#dc2626" };
  const labels = { idle: "—", running: "…", pass: "✓", fail: "✕" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 22, height: 22, borderRadius: "50%",
      background: colors[status] + "22", border: `2px solid ${colors[status]}`,
      fontSize: 11, fontWeight: 700, color: colors[status],
      flexShrink: 0,
    }}>
      {status === "running"
        ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
        : labels[status]}
    </span>
  );
}

function StatusBadge({ status, duration }) {
  const cfg = {
    idle:    { bg: "#f3f4f6", color: "#9ca3af", text: "Idle" },
    running: { bg: "#fffbeb", color: "#c8850a", text: "Running…" },
    pass:    { bg: "#ecfdf5", color: "#059669", text: duration ? `Passed ${duration}ms` : "Passed" },
    fail:    { bg: "#fef2f2", color: "#dc2626", text: "Failed" },
  }[status] || { bg: "#f3f4f6", color: "#9ca3af", text: status };

  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
      background: cfg.bg, color: cfg.color,
    }}>{cfg.text}</span>
  );
}

function JourneyCard({ journey, state, onRun, running }) {
  const [expanded, setExpanded] = useState(false);
  const hasSteps = state.steps.length > 0;

  return (
    <div style={{
      background: "#fff", border: "1px solid",
      borderColor: state.status === "fail" ? "#fca5a5" : state.status === "pass" ? "#6ee7b7" : "#e5e7eb",
      borderRadius: 10, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {/* Card header */}
      <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{journey.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0B1F3B" }}>{journey.name}</span>
            <StatusBadge status={state.status} duration={state.duration} />
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3, lineHeight: 1.4 }}>
            {journey.description}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {hasSteps && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ ...S.btnGhost, fontSize: 12 }}
            >
              {expanded ? "Hide" : "Details"} ({state.steps.length})
            </button>
          )}
          <button
            onClick={onRun}
            disabled={running}
            style={{
              ...S.btnRun,
              opacity: running ? 0.5 : 1,
              cursor: running ? "not-allowed" : "pointer",
              background: state.status === "fail" ? "#fef2f2" : "#f8fafc",
              borderColor: state.status === "fail" ? "#fca5a5" : "#e5e7eb",
              color: state.status === "fail" ? "#dc2626" : "#374151",
            }}
          >
            {state.status === "running" ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {/* Step readout */}
      {expanded && hasSteps && (
        <div style={{ borderTop: "1px solid #f3f4f6", background: "#f9fafb" }}>
          {state.steps.map((step, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "10px 18px",
              borderBottom: i < state.steps.length - 1 ? "1px solid #f0f0f0" : "none",
            }}>
              <StatusDot status={step.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{step.name}</div>
                <div style={{
                  fontSize: 12, marginTop: 2, lineHeight: 1.5,
                  color: step.status === "fail" ? "#dc2626" : "#6b7280",
                  wordBreak: "break-word",
                }}>
                  {step.detail}
                </div>
              </div>
              <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{step.ms}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AppHealthCheck() {
  const [states, setStates] = useState(() =>
    Object.fromEntries(JOURNEYS.map(j => [j.id, IDLE_STATE()]))
  );
  const [runningAll, setRunningAll] = useState(false);
  const [lastRunAll, setLastRunAll] = useState(null);

  const anyRunning = Object.values(states).some(s => s.status === "running");

  const setJourneyState = useCallback((id, patch) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  async function runOne(journey) {
    setJourneyState(journey.id, { status: "running", steps: [], duration: null });
    const result = await runJourney(journey, (steps, status) => {
      setJourneyState(journey.id, { steps, status });
    });
    setJourneyState(journey.id, result);
  }

  async function runAll() {
    setRunningAll(true);
    const start = Date.now();
    // Run sequentially to avoid hammering the API
    for (const journey of JOURNEYS) {
      setJourneyState(journey.id, { status: "running", steps: [], duration: null });
      const result = await runJourney(journey, (steps, status) => {
        setJourneyState(journey.id, { steps, status });
      });
      setJourneyState(journey.id, result);
    }
    setRunningAll(false);
    setLastRunAll(Date.now() - start);
  }

  function resetAll() {
    setStates(Object.fromEntries(JOURNEYS.map(j => [j.id, IDLE_STATE()])));
    setLastRunAll(null);
  }

  // Summary counts
  const counts = Object.values(states).reduce(
    (acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
    {}
  );
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
                Run user journey tests after deploys or data changes.
                {allDone && (
                  <span style={{ marginLeft: 10, fontWeight: 600,
                    color: allPassed ? "#059669" : "#dc2626" }}>
                    {allPassed
                      ? `✓ All ${JOURNEYS.length} journeys passed`
                      : `✕ ${counts.fail || 0} of ${JOURNEYS.length} failed`}
                    {lastRunAll && ` in ${(lastRunAll / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {allDone && (
                <button onClick={resetAll} style={S.btnSecondary}>Reset</button>
              )}
              <button
                onClick={runAll}
                disabled={anyRunning}
                style={{ ...S.btnPrimary, opacity: anyRunning ? 0.5 : 1, cursor: anyRunning ? "not-allowed" : "pointer" }}
              >
                {runningAll ? "Running all…" : "▶ Run All"}
              </button>
            </div>
          </div>

          {/* Summary bar — only when results exist */}
          {allDone && (
            <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "Passed", key: "pass", color: "#059669", bg: "#ecfdf5" },
                { label: "Failed", key: "fail", color: "#dc2626", bg: "#fef2f2" },
              ].map(({ label, key, color, bg }) => counts[key] > 0 && (
                <div key={key} style={{ background: bg, border: `1px solid ${color}33`,
                  borderRadius: 8, padding: "6px 14px", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color }}>{counts[key]}</span>
                  <span style={{ color, marginLeft: 5 }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Journey cards */}
        <div style={S.content}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 780 }}>
            {JOURNEYS.map(journey => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                state={states[journey.id]}
                onRun={() => runOne(journey)}
                running={anyRunning}
              />
            ))}
          </div>
        </div>

      </div>
    </AdminRoute>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

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
  title: {
    fontSize: 26, fontWeight: 700, color: "#0B1F3B", letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13, color: "#6B7280", marginTop: 4,
  },
  content: {
    padding: "28px 32px",
  },
  btnPrimary: {
    background: "#0B1F3B", color: "#fff", border: "1px solid #0B1F3B",
    borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "#fff", color: "#374151", border: "1px solid #E5E7EB",
    borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 500,
    cursor: "pointer",
  },
  btnRun: {
    border: "1px solid", borderRadius: 6, padding: "6px 14px",
    fontSize: 12, fontWeight: 600, background: "#f8fafc",
  },
  btnGhost: {
    background: "none", border: "none", cursor: "pointer",
    color: "#6b7280", padding: "4px 8px", borderRadius: 4, fontSize: 13,
  },
};
