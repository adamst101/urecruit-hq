// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { CalendarDays, Search, User, Shield, LogOut, Star, ArrowRight } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess, clearSeasonAccessCache } from "../components/hooks/useSeasonAccess.jsx";
import { useActiveAthlete, clearActiveAthlete } from "../components/hooks/useActiveAthlete.jsx";
import { clearDemoMode } from "../components/hooks/demoMode.jsx";
import { isAdminEmail } from "../components/auth/adminEmails.jsx";
import { trackEventOnce } from "../utils/trackEvent.js";
import AthleteSwitcher from "../components/workspace/AthleteSwitcher.jsx";
import AddAthleteModal from "../components/workspace/AddAthleteModal.jsx";
import InstallButton from "../components/pwa/InstallButton.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { useDemoCampSummaries } from "../components/hooks/useDemoCampSummaries.jsx";
import {
  initDemoUserState,
  resetDemoSession,
  DEMO_SEASON_YEAR,
  DEMO_ATHLETE,
  DEMO_JOURNEY_METRICS,
  DEMO_JOURNEY_ACTIVITIES,
} from "../lib/demoUserData.js";

// ---- routes (no createPageUrl dependency) ----
const ROUTES = {
  Home: "/Home",
  Workspace: "/Workspace",
  Discover: "/Discover",
  Calendar: "/Calendar",
  Profile: "/Profile",
  Subscribe: "/Subscribe",
  MyCamps: "/MyCamps",
  KnowledgeBase: "/KnowledgeBase",
  RecruitingJourney: "/RecruitingJourney",
  Account: "/Account",
  AdminImport: "/AdminImport",
  AdminOps: "/AdminOps",
  CampsManager: "/CampsManager",
  SchoolsManager: "/SchoolsManager",
  TestFunctions: "/TestFunctions",
  GenerateDemoCamps: "/GenerateDemoCamps",
};

// --- tiny helpers ---
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

async function safeLogout() {
  try {
    if (base44?.auth?.logout) {
      await base44.auth.logout();
      return true;
    }
  } catch {}

  try {
    if (base44?.auth?.signOut) {
      await base44.auth.signOut();
      return true;
    }
  } catch {}

  try {
    if (base44?.auth?.redirectToLogout) {
      await base44.auth.redirectToLogout();
      return true;
    }
  } catch {}

  return false;
}

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

export default function Workspace() {
  const nav = useNavigate();
  const loc = useLocation();

  const isUserDemo = useMemo(() => {
    try { return new URLSearchParams(loc?.search || "").get("demo") === "user"; }
    catch { return false; }
  }, [loc?.search]);

  const season = useSeasonAccess();
  const { activeAthlete: athleteProfile, isLoading: identityLoading } = useActiveAthlete();
  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);
  const { demoProfileId } = useDemoProfile();
  const queryClient = useQueryClient();

  // ── Demo camp summaries — session-backed live counts ──────────────────────
  const { data: demoCampData = [] } = useDemoCampSummaries({
    seasonYear: DEMO_SEASON_YEAR,
    demoProfileId,
    enabled: isUserDemo,
  });

  // ── Demo dashboard snapshot — derived from live session-backed camp data ──
  const demoSnapshotStats = useMemo(() => ({
    campsSaved: demoCampData.filter(c => c.intent_status === "favorite" || c.intent_status === "registered").length,
    upcomingCamps: demoCampData.filter(c => c.intent_status === "registered").length,
    activityCount: DEMO_JOURNEY_ACTIVITIES.length,
  }), [demoCampData]);

  const demoNextStep = useMemo(() => ({
    eyebrow: "MARCUS'S NEXT STEP",
    headline: "Three camps locked in. Keep building.",
    body: `WKU, Tennessee, and Auburn are confirmed for spring. Seven more schools are on the radar — check the calendar for back-to-back conflicts, review the full saved list, and log every coach contact as it comes in. ${DEMO_JOURNEY_METRICS.true_traction_school_count} schools are showing real traction.`,
    actions: [
      { label: "View My Camps →", route: `${ROUTES.MyCamps}?demo=user` },
      { label: "View Calendar →", route: `${ROUTES.Calendar}?demo=user` },
      { label: "Recruiting Tracker →", route: `${ROUTES.RecruitingJourney}?demo=user` },
    ],
  }), []);

  const [meEmail, setMeEmail] = useState("");
  const [meName, setMeName] = useState("");
  const [logoOk, setLogoOk] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showAddAthlete, setShowAddAthlete] = useState(false);
  const [seasonConfig, setSeasonConfig] = useState(null);
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachName, setCoachName] = useState("");
  const [coachCodeInput, setCoachCodeInput] = useState("");
  const [coachLinkState, setCoachLinkState] = useState(null); // null | "loading" | { ok, msg, error }
  const [snapshotStats, setSnapshotStats] = useState({ campsSaved: null, upcomingCamps: null }); // null = loading

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("getActiveSeason", {});
        if (!cancelled && res.data?.ok && res.data?.season) setSeasonConfig(res.data.season);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (cancelled || !me) return;
        setMeEmail(String(me.email || "").toLowerCase());

        // Try full_name from auth first
        const name = String(me.full_name || "").trim();
        setMeName(name);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Load coach messages for members who joined via a coach invite link
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inviteCode = localStorage.getItem("coachInviteCode");
        if (!inviteCode) return;
        const coaches = await base44.entities.Coach.filter({ invite_code: inviteCode, active: true }).catch(() => []);
        if (cancelled || !Array.isArray(coaches) || coaches.length === 0) return;
        const coach = coaches[0];
        setCoachName(`${coach.first_name || ""} ${coach.last_name || ""}`.trim() || coach.school_or_org || "Your Coach");

        // Resolve current athlete_id from CoachRoster to filter targeted messages
        let myAthleteId = "";
        try {
          const me = await base44.auth.me();
          if (me?.id) {
            const rosterEntry = await base44.entities.CoachRoster.filter({
              coach_id: coach.id,
              account_id: me.id,
            }).catch(() => []);
            myAthleteId = Array.isArray(rosterEntry) && rosterEntry.length > 0
              ? (rosterEntry[0].athlete_id || "")
              : "";
          }
        } catch {}

        const allMsgs = await base44.entities.CoachMessage.filter({ coach_id: coach.id }).catch(() => []);
        if (!cancelled) {
          // Show broadcast messages (no specific recipient) and messages addressed to this athlete
          const filtered = Array.isArray(allMsgs)
            ? allMsgs.filter(m => !m.recipient_athlete_id || (myAthleteId && m.recipient_athlete_id === myAthleteId))
            : [];
          setCoachMessages(filtered.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const isAdmin = isAdminEmail(meEmail);

  const loading = !!season?.isLoading;

  const isMember = !!season?.accountId && !!season?.hasAccess && (!!season?.entitlement || season?.role === "admin");

  // Load snapshot stats (camp count) for progress row — members only
  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("getMyCampIntents", {
          athleteId: athleteId || undefined,
          accountId: season?.accountId || undefined,
        });
        if (cancelled) return;
        const intents = Array.isArray(res?.data?.intents) ? res.data.intents : [];
        const active = intents.filter(i => {
          const st = String(i?.status || "").toLowerCase();
          return st === "favorite" || st === "registered";
        });
        const registered = intents.filter(i => String(i?.status || "").toLowerCase() === "registered");
        setSnapshotStats({ campsSaved: active.length, upcomingCamps: registered.length });
      } catch {
        setSnapshotStats({ campsSaved: 0, upcomingCamps: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [isMember, athleteId, season?.accountId]);

  useEffect(() => {
    trackEventOnce("workspace_viewed", "evt_workspace_viewed_v1", { paid: isMember });
  }, [isMember]);

  // Seed demo user sessionStorage state on first visit, then refresh camp summaries
  useEffect(() => {
    if (!isUserDemo || !demoProfileId) return;
    initDemoUserState(demoProfileId, DEMO_SEASON_YEAR);
    queryClient.invalidateQueries({ queryKey: ["demoCampSummaries"] });
  }, [isUserDemo, demoProfileId, queryClient]);
  const memberSeason = Number(season?.entitlement?.season_year) || season?.seasonYear || null;
  const currentYear = season?.currentYear || new Date().getFullYear();
  const demoYear = season?.demoYear || (currentYear - 1);

  // Self-healing: if the user is authenticated but has no entitlement, and a
  // stripeSessionId is in sessionStorage (payment made but webhook/AuthRedirect
  // didn't link it in time), call linkStripePayment now and re-check access.
  const _healedRef = useRef(false);
  useEffect(() => {
    if (_healedRef.current) return;
    if (season?.isLoading) return;
    if (!season?.accountId) return;
    if (season?.hasAccess) return;

    let stripeSessionId = null;
    try { stripeSessionId = sessionStorage.getItem("stripeSessionId"); } catch {}
    console.log("[DIAG:Workspace] auth'd but no access — stripeSessionId in storage:", stripeSessionId, "accountId:", season?.accountId);
    if (!stripeSessionId) return;

    _healedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        sessionStorage.removeItem("stripeSessionId");
        console.log("[DIAG:Workspace] calling linkStripePayment with sessionId:", stripeSessionId);
        const res = await base44.functions.invoke("linkStripePayment", { sessionId: stripeSessionId });
        console.log("[DIAG:Workspace] linkStripePayment result:", JSON.stringify(res?.data || res));
        const ok = res?.data?.ok || res?.ok;
        if (ok && !cancelled) {
          clearSeasonAccessCache();
          season.refresh();
        }
      } catch (e) {
        console.log("[DIAG:Workspace] linkStripePayment threw:", e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [season?.isLoading, season?.accountId, season?.hasAccess]);

  async function handleCoachLink(e) {
    e.preventDefault();
    const code = coachCodeInput.trim().toUpperCase();
    if (!code) return;
    setCoachLinkState("loading");
    try {
      const res = await base44.functions.invoke("linkToCoach", { inviteCode: code });
      const d = res?.data;
      if (d?.ok) {
        const name = d.coachName || d.schoolOrOrg || "your coach";
        const msg = d.already_connected
          ? `You're already connected to ${name}.`
          : `Connected! You're now on ${name}'s roster.`;
        setCoachLinkState({ ok: true, msg });
        setCoachCodeInput("");
        if (!d.already_connected) {
          try { localStorage.setItem("coachInviteCode", code); } catch {}
        }
      } else {
        setCoachLinkState({ ok: false, error: d?.error || "Could not connect. Check the code and try again." });
      }
    } catch {
      setCoachLinkState({ ok: false, error: "Something went wrong. Please try again." });
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    clearSeasonAccessCache();
    clearActiveAthlete();
    try {
      clearDemoMode();
    } catch {}

    try {
      sessionStorage.removeItem("demo_mode_v1");
    } catch {}
    try {
      sessionStorage.removeItem("demo_year_v1");
    } catch {}
    try {
      sessionStorage.removeItem("post_login_next");
    } catch {}

    await safeLogout();

    window.location.assign(`${window.location.origin}${ROUTES.Home}?signin=1&src=logout`);
  }

  if (loading) return <div style={{ minHeight: "100vh", background: "#0a0e1a" }} />;

  const parentName = (athleteProfile?.parent_first_name || "").trim();
  const parentLast = (athleteProfile?.parent_last_name || "").trim();
  const parentFull = parentName ? `${parentName}${parentLast ? ` ${parentLast}` : ""}` : null;
  const seasonName = season?.firstName
    ? [season.firstName, season.lastName].filter(Boolean).join(" ")
    : null;
  const displayName = parentFull || seasonName || athleteProfile?.athlete_name || meName || meEmail || "Athlete";

  // Next Step panel — dynamic based on what the family has done
  const profileComplete = !!athleteId;
  const hasCampsSaved = (snapshotStats.campsSaved ?? 0) > 0;

  const nextStep = !profileComplete
    ? {
        eyebrow: "START HERE",
        headline: "Build your athlete's profile first.",
        body: "The profile is the foundation. Add your athlete's measurables, grad year, and details so every other tool works better from the start.",
        actions: [
          { label: "Complete Profile →", route: athleteId ? `${ROUTES.Profile}?id=${athleteId}` : ROUTES.Profile },
          { label: "Find Camps →", route: ROUTES.Discover },
        ],
      }
    : !hasCampsSaved
    ? {
        eyebrow: "YOUR NEXT STEP",
        headline: "Profile set. Now find your target camps.",
        body: "Search college football camps by division, state, and date. Save the ones that fit your athlete's timeline and start building your plan.",
        actions: [
          { label: "Find Camps →", route: ROUTES.Discover },
          { label: "Read the Playbook →", route: ROUTES.KnowledgeBase },
        ],
      }
    : {
        eyebrow: "YOUR NEXT STEP",
        headline: "Keep building momentum.",
        body: "Review your saved camps, check your calendar for conflicts, and start logging recruiting activity as conversations and camp invites come in.",
        actions: [
          { label: "View My Camps →", route: ROUTES.MyCamps },
          { label: "View Calendar →", route: ROUTES.Calendar },
          { label: "Recruiting Tracker →", route: ROUTES.RecruitingJourney },
        ],
      };

  // Active step: demo uses Marcus-specific panel, members use dynamic panel
  const activeStep = isUserDemo ? demoNextStep : nextStep;

  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", paddingBottom: 80, fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* ── ATHLETE SWITCHER ── */}
      {isMember && season?.accountId && (
        <section style={{ padding: "16px 24px 0", maxWidth: 1100, margin: "0 auto" }}>
          <AthleteSwitcher
            accountId={season.accountId}
            seasonYear={memberSeason || currentYear}
            onAddAthlete={() => setShowAddAthlete(true)}
          />
        </section>
      )}

      {showAddAthlete && (
        <AddAthleteModal
          seasonConfig={seasonConfig}
          accountId={season?.accountId}
          onClose={() => setShowAddAthlete(false)}
        />
      )}

      {/* ── HEADER ── */}
      <section style={{ padding: "48px 24px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 3, height: 40, background: "#e8a020", borderRadius: 2, flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(36px, 5vw, 56px)", lineHeight: 1, margin: 0, letterSpacing: 1 }}>
              YOUR RECRUITING HQ
            </h1>
            {isUserDemo && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, background: "rgba(232,160,32,0.07)", border: "1px solid rgba(232,160,32,0.18)", borderRadius: 6, padding: "4px 10px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sample Demo</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {DEMO_ATHLETE.athlete_name} · {DEMO_ATHLETE.position} · Class of {DEMO_ATHLETE.grad_year} · {DEMO_ATHLETE.home_city}, {DEMO_ATHLETE.state}
                </span>
              </div>
            )}
            {season?.accountId && !isUserDemo && (
              <p style={{ color: "#9ca3af", fontSize: 16, margin: "8px 0 0" }}>
                Welcome back, {displayName}
              </p>
            )}
            {!isUserDemo && (
              <p style={{ color: "#6b7280", fontSize: 14, margin: "4px 0 0" }}>
                Support your athlete's goal of playing college football with a clearer plan, better organization, and smarter next steps.
              </p>
            )}
            {isMember && (
              <p style={{ color: "#4b5563", fontSize: 12, margin: "4px 0 0", letterSpacing: "0.04em" }}>
                Season {memberSeason} · Active
              </p>
            )}
          </div>
          {season?.accountId && !isUserDemo && (
            <button
              onClick={() => nav(ROUTES.Account)}
              style={{
                background: "#111827", border: "1px solid #1f2937",
                borderRadius: 10, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", color: "#f9fafb",
              }}
            >
              <User style={{ width: 16, height: 16, color: "#e8a020" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>My Account</span>
            </button>
          )}
          {isUserDemo && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => nav(`${ROUTES.Subscribe}?source=user_demo_workspace`)}
                style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
              >
                Start Your Family's Workspace <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
              <span style={{ fontSize: 11, color: "#4b5563" }}>$49 · one season · no auto-renew</span>
            </div>
          )}
        </div>

        {/* Demo banner */}
        {!isMember && !isUserDemo && (
          <div style={{ marginTop: 20, background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.25)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#e8a020" }}>📋 You're viewing {demoYear} demo data</div>
              <div style={{ fontSize: 15, color: "#9ca3af", marginTop: 4 }}>Get your Season Pass to unlock {currentYear} camps, save favorites, and track registrations.</div>
            </div>
            <button onClick={() => nav(`${ROUTES.Subscribe}?source=workspace_banner`)} style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
              Get Season Pass <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
          </div>
        )}

        {/* Demo context note — replaces marketing hero in favour of the real dashboard flow below */}
        {isUserDemo && (
          <div style={{ marginTop: 14, marginBottom: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
              This account is pre-loaded with Marcus Johnson's recruiting story — real platform, synthetic data.
            </p>
            <button
              onClick={() => {
                resetDemoSession(demoProfileId, DEMO_SEASON_YEAR);
                window.location.reload();
              }}
              style={{ background: "none", border: "none", color: "#374151", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationColor: "#374151", flexShrink: 0, fontFamily: "inherit" }}
            >
              Reset to Marcus's story
            </button>
          </div>
        )}

        {/* Diagnostic panel */}
        {!isMember && season?.accountId && (
          <div style={{ marginTop: 12, background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8, padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "#9ca3af" }}>
            <div style={{ color: "#e8a020", fontWeight: 700, marginBottom: 8 }}>🔍 DIAG (share with support)</div>
            <div>accountId: {season?.accountId || "null"}</div>
            <div>mode: {season?.mode || "?"} | hasAccess: {String(season?.hasAccess)}</div>
            <div>activeSeason: {season?.activeSeason} | soldSeason: {season?.soldSeason}</div>
            <div>entitlement: {season?.entitlement ? `id=${season.entitlement.id} season=${season.entitlement.season_year}` : "null"}</div>
            <div style={{ marginTop: 4 }}>
              <button
                onClick={async () => {
                  try {
                    const rows = await base44.entities.Entitlement.filter({ account_id: season.accountId, status: "active" });
                    alert("Client-side entitlement query result:\n" + JSON.stringify(rows, null, 2));
                  } catch (e) { alert("Query threw: " + e?.message); }
                }}
                style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", marginRight: 8 }}
              >Check Entitlement</button>
              <button
                onClick={async () => {
                  try {
                    const me = await base44.auth.me();
                    alert("auth.me():\n" + JSON.stringify(me, null, 2));
                  } catch (e) { alert("auth.me() threw: " + e?.message); }
                }}
                style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
              >Check Auth</button>
            </div>
          </div>
        )}
      </section>

      {/* ── YOUR NEXT STEP PANEL ── */}
      {(isMember || isUserDemo) && (
        <section style={{ padding: "0 24px 24px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            background: "linear-gradient(135deg, #0f1a2e 0%, #111827 100%)",
            border: "1px solid #e8a020",
            borderLeft: "4px solid #e8a020",
            borderRadius: 14,
            padding: "24px 28px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              {activeStep.eyebrow}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(20px, 3vw, 26px)", color: "#f9fafb", letterSpacing: 1, marginBottom: 10 }}>
              {activeStep.headline}
            </div>
            <p style={{ fontSize: 14, color: "#9ca3af", margin: "0 0 20px", lineHeight: 1.65, maxWidth: 640 }}>
              {activeStep.body}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {activeStep.actions.map((a, i) => (
                <button
                  key={a.label}
                  onClick={() => nav(a.route)}
                  style={{
                    background: i === 0 ? "#e8a020" : "transparent",
                    color: i === 0 ? "#0a0e1a" : "#e8a020",
                    border: i === 0 ? "none" : "1px solid #e8a020",
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PROGRESS SNAPSHOT ROW ── */}
      {(isMember || isUserDemo) && (
        <section style={{ padding: "0 24px 24px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {(isUserDemo ? [
              {
                label: "Profile",
                value: "Complete",
                sub: "Athlete details ready",
                accent: "#22c55e",
                onClick: () => nav(`${ROUTES.Profile}?demo=user`),
              },
              {
                label: "Camps Saved",
                value: String(demoSnapshotStats.campsSaved),
                sub: "Target camps in the plan",
                accent: "#e8a020",
                onClick: () => nav(`${ROUTES.MyCamps}?demo=user`),
              },
              {
                label: "Registered",
                value: String(demoSnapshotStats.upcomingCamps),
                sub: "Camps confirmed & paid",
                accent: "#22c55e",
                onClick: () => nav(`${ROUTES.MyCamps}?demo=user`),
              },
              {
                label: "Activity",
                value: String(demoSnapshotStats.activityCount),
                sub: "Recruiting contacts logged",
                accent: "#e8a020",
                onClick: () => nav(`${ROUTES.RecruitingJourney}?demo=user`),
              },
            ] : [
              {
                label: "Profile",
                value: profileComplete ? "Complete" : "Incomplete",
                sub: profileComplete ? "Athlete details ready" : "Add athlete details",
                accent: profileComplete ? "#22c55e" : "#f87171",
                onClick: () => nav(athleteId ? `${ROUTES.Profile}?id=${athleteId}` : ROUTES.Profile),
              },
              {
                label: "Camps Saved",
                value: snapshotStats.campsSaved === null ? "—" : String(snapshotStats.campsSaved),
                sub: "Target camps in your plan",
                accent: "#e8a020",
                onClick: () => nav(ROUTES.MyCamps),
              },
              {
                label: "Registered",
                value: snapshotStats.upcomingCamps === null ? "—" : String(snapshotStats.upcomingCamps),
                sub: "Camps you've signed up for",
                accent: "#e8a020",
                onClick: () => nav(ROUTES.MyCamps),
              },
              {
                label: "Activity",
                value: "Track",
                sub: "Log recruiting progress",
                accent: "#6b7280",
                onClick: () => nav(ROUTES.RecruitingJourney),
              },
            ]).map(({ label, value, sub, accent, onClick }) => (
              <div
                key={label}
                onClick={onClick}
                style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: accent, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── MICRO MESSAGE ── */}
      {(isMember || isUserDemo) && (
        <section style={{ padding: "0 24px 24px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ borderLeft: "3px solid #1f2937", paddingLeft: 16 }}>
            <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.7, fontStyle: "italic" }}>
              {isUserDemo
                ? "Marcus finished 10th grade with strong film and a plan already in motion. Three camps confirmed, seven schools on the radar — the next move is showing up, competing, and capturing every coach conversation as it comes."
                : "Most families start with camps, posts, and hope. This workspace helps you build something more intentional — a clearer plan, better structure, and smarter next steps for your athlete's path to college football."}
            </p>
          </div>
        </section>
      )}

      {/* ── MAIN MODULES ── */}
      <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 18, background: "#e8a020", borderRadius: 2 }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: "#6b7280" }}>
            YOUR TOOLS
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {/* 1 — Athlete Profile */}
          <WorkspaceTile
            icon="👤"
            title="ATHLETE PROFILE"
            desc="Build the foundation with your athlete's info, measurables, and profile details."
            btnLabel={isUserDemo ? "View Sample Profile →" : profileComplete ? "View Profile →" : "Complete Profile →"}
            onClick={() => isUserDemo
              ? nav(`${ROUTES.Profile}?demo=user`)
              : nav(athleteId ? `${ROUTES.Profile}?id=${athleteId}` : ROUTES.Profile)
            }
            highlight={!isUserDemo && !profileComplete}
          />
          {/* 2 — The Playbook */}
          <WorkspaceTile
            icon="📚"
            title="THE PLAYBOOK"
            desc="Learn how recruiting works — timelines, camp strategy, film, offers, and what to do next."
            btnLabel="Read →"
            onClick={() => nav(ROUTES.KnowledgeBase)}
          />
          {/* 3 — Discover Camps */}
          <WorkspaceTile
            icon="🔍"
            title="DISCOVER CAMPS"
            desc="Find the right college football camps by division, state, and date."
            btnLabel="Find Camps →"
            onClick={() => nav(isUserDemo ? `${ROUTES.Discover}?demo=user` : ROUTES.Discover)}
          />
          {/* 4 — My Camps */}
          <WorkspaceTile
            icon="⭐"
            title="MY CAMPS"
            desc="Keep track of saved camps, registrations, and your target list."
            btnLabel="View Camps →"
            onClick={() => nav(isUserDemo ? `${ROUTES.MyCamps}?demo=user` : ROUTES.MyCamps)}
          />
          {/* 5 — My Calendar */}
          <WorkspaceTile
            icon="📅"
            title="MY CALENDAR"
            desc="See your camp plan, avoid conflicts, and stay organized."
            btnLabel="View Calendar →"
            onClick={() => nav(isUserDemo ? `${ROUTES.Calendar}?demo=user` : ROUTES.Calendar)}
          />
          {/* 6 — Recruiting Tracker (renamed from Recruiting Journey) */}
          <WorkspaceTile
            icon="🏈"
            title="RECRUITING TRACKER"
            desc="Track progress as interest builds — from early activity to camp invites, conversations, and offers."
            btnLabel="View Tracker →"
            onClick={() => nav(isUserDemo ? `${ROUTES.RecruitingJourney}?demo=user` : ROUTES.RecruitingJourney)}
          />
        </div>
      </section>

      {/* ── CONNECT TO COACH OR TRAINER ── */}
      {isMember && (
        <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 3, height: 16, background: "#374151", borderRadius: 2 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Connect to a Coach or Trainer
              </div>
            </div>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 14px" }}>
              If a high school coach or trainer gave you a code, enter it here so they can support your athlete's camp planning and recruiting progress.
            </p>
            <form onSubmit={handleCoachLink} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
              <input
                value={coachCodeInput}
                onChange={e => { setCoachCodeInput(e.target.value.toUpperCase()); setCoachLinkState(null); }}
                placeholder="e.g. ADAMS-SCH-1234"
                style={{
                  background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8,
                  padding: "10px 14px", fontSize: 14, color: "#f9fafb", fontFamily: "monospace",
                  letterSpacing: 1, outline: "none", flexGrow: 1, minWidth: 200,
                }}
              />
              <button
                type="submit"
                disabled={!coachCodeInput.trim() || coachLinkState === "loading"}
                style={{
                  background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8,
                  padding: "10px 20px", fontSize: 14, fontWeight: 700,
                  cursor: (!coachCodeInput.trim() || coachLinkState === "loading") ? "not-allowed" : "pointer",
                  opacity: (!coachCodeInput.trim() || coachLinkState === "loading") ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {coachLinkState === "loading" ? "Connecting…" : "Connect →"}
              </button>
            </form>
            {coachLinkState && coachLinkState !== "loading" && (
              <p style={{ margin: "10px 0 0", fontSize: 14, color: coachLinkState.ok ? "#22c55e" : "#f87171" }}>
                {coachLinkState.ok ? coachLinkState.msg : coachLinkState.error}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── PWA INSTALL PROMPT ── */}
      <section style={{ padding: "0 24px 16px", maxWidth: 1100, margin: "0 auto" }}>
        <InstallButton />
      </section>

      {/* ── COACH MESSAGES ── */}
      {isMember && coachMessages.length > 0 && (
        <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "24px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, background: "#e8a020", borderRadius: 2 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Messages from {coachName}
              </div>
            </div>
            {coachMessages.map((m, i) => (
              <div key={m.id || i} style={{ padding: "14px 0", borderBottom: i < coachMessages.length - 1 ? "1px solid #1f2937" : "none" }}>
                {m.subject && <div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb", marginBottom: 4 }}>{m.subject}</div>}
                <div style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.message}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : ""}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── ADMIN SECTION ── */}
      {isAdmin && (
        <section style={{ padding: "0 24px 48px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "24px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Shield style={{ width: 16, height: 16, color: "#9ca3af" }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#9ca3af", letterSpacing: 1 }}>ADMIN TOOLS</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {[
                { label: "Admin Ops", route: ROUTES.AdminOps },
                { label: "Camps Manager", route: ROUTES.CampsManager },
                { label: "Schools Manager", route: ROUTES.SchoolsManager },
                { label: "Ingest Runner", route: ROUTES.TestFunctions },
                { label: "Demo Generator", route: ROUTES.GenerateDemoCamps },
              ].map(t => (
                <button key={t.label} onClick={() => nav(t.route)} style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 8, padding: "12px 16px", color: "#9ca3af", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                  {t.label} →
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <BottomNav />
    </div>
  );
}

function WorkspaceTile({ icon, title, desc, btnLabel, onClick, highlight }) {
  return (
    <div
      style={{
        background: "#111827",
        border: highlight ? "1px solid #e8a020" : "1px solid #1f2937",
        borderRadius: 14,
        padding: "24px 22px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        transition: "border-color 0.15s, transform 0.15s",
        cursor: "pointer",
      }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#e8a020"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = highlight ? "#e8a020" : "#1f2937"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div>
        <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#f9fafb", letterSpacing: 1 }}>{title}</div>
        <p style={{ fontSize: 14, color: "#9ca3af", marginTop: 8, lineHeight: 1.6, margin: "8px 0 0" }}>{desc}</p>
      </div>
      <div style={{ marginTop: 20 }}>
        <span style={{ color: "#e8a020", fontSize: 14, fontWeight: 700 }}>{btnLabel}</span>
      </div>
    </div>
  );
}