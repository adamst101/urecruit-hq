// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

  const season = useSeasonAccess();
  const { activeAthlete: athleteProfile, isLoading: identityLoading } = useActiveAthlete();
  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

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

  useEffect(() => {
    trackEventOnce("workspace_viewed", "evt_workspace_viewed_v1", { paid: isMember });
  }, [isMember]);
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
  // season.firstName/lastName come from auth.me() full_name (set during checkout flows)
  const seasonName = season?.firstName
    ? [season.firstName, season.lastName].filter(Boolean).join(" ")
    : null;
  const displayName = parentFull || seasonName || athleteProfile?.athlete_name || meName || meEmail || "Athlete";

  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
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

      {/* Add Athlete Modal */}
      {showAddAthlete && (
        <AddAthleteModal
          seasonConfig={seasonConfig}
          accountId={season?.accountId}
          onClose={() => setShowAddAthlete(false)}
        />
      )}

      {/* ── HERO GREETING ── */}
      <section style={{ padding: "48px 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 3, height: 32, background: "#e8a020", borderRadius: 2 }} />
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(36px, 5vw, 56px)", lineHeight: 1, margin: 0, letterSpacing: 1, flex: 1 }}>YOUR RECRUITING HQ</h1>
          {season?.accountId && (
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
        </div>
        {season?.accountId && <p style={{ color: "#9ca3af", fontSize: 17, margin: 0 }}>Welcome back, {displayName}</p>}
        <p style={{ color: "#6b7280", fontSize: 15, marginTop: 4 }}>
          {isMember
            ? `Season ${memberSeason} · Active`
            : `Demo Mode · ${demoYear} Season`}
        </p>

        {/* Demo banner */}
        {!isMember && (
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

        {/* ── DIAGNOSTIC PANEL (remove after root cause found) ── */}
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
                    const msg = JSON.stringify(rows, null, 2);
                    alert("Client-side entitlement query result:\n" + msg);
                    console.log("[DIAG:Workspace] manual entitlement check:", rows);
                  } catch (e) {
                    alert("Query threw: " + e?.message);
                  }
                }}
                style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", marginRight: 8 }}
              >
                Check Entitlement
              </button>
              <button
                onClick={async () => {
                  try {
                    const me = await base44.auth.me();
                    alert("auth.me():\n" + JSON.stringify(me, null, 2));
                    console.log("[DIAG:Workspace] auth.me():", me);
                  } catch (e) {
                    alert("auth.me() threw: " + e?.message);
                  }
                }}
                style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
              >
                Check Auth
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── MAIN TILES ── */}
      <section style={{ padding: "0 24px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <WorkspaceTile icon="🔍" title="DISCOVER CAMPS" desc="Browse football camps by division, state, and date" btnLabel="Go →" onClick={() => nav(ROUTES.Discover)} />
          <WorkspaceTile icon="📅" title="MY CALENDAR" desc="View your schedule · Spot conflicts" btnLabel="Go →" onClick={() => nav(ROUTES.Calendar)} />
          <WorkspaceTile icon="⭐" title="MY CAMPS" desc="Favorites & registrations" btnLabel="Go →" onClick={() => nav(ROUTES.MyCamps)} />
          <WorkspaceTile
            icon="👤"
            title="ATHLETE PROFILE"
            desc={athleteId ? (athleteProfile?.athlete_name || "Profile set up") : "Set up your athlete profile"}
            btnLabel={athleteId ? "View Profile" : "Create Profile"}
            onClick={() => nav(athleteId ? `${ROUTES.Profile}?id=${athleteId}` : ROUTES.Profile)}
            highlight={!athleteId}
          />
          <WorkspaceTile icon="📚" title="THE PLAYBOOK" desc="Recruiting rules, camp strategy, film, offers & more" btnLabel="Read →" onClick={() => nav(ROUTES.KnowledgeBase)} />
          <WorkspaceTile icon="🏈" title="RECRUITING JOURNEY" desc="Track recruiting interest, DMs, camp conversations, and offers" btnLabel="View →" onClick={() => nav(ROUTES.RecruitingJourney)} />
        </div>
      </section>



      {/* ── CONNECT TO COACH ── */}
      {isMember && (
        <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              🔗 Connect to a Coach
            </div>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 14px" }}>
              If a coach gave you an invite code, enter it here to appear on their roster.
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
            <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              Messages from {coachName}
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
    </div>
  );
}

function WorkspaceTile({ icon, title, desc, btnLabel, onClick, highlight }) {
  return (
    <div style={{
      background: "#111827", border: highlight ? "1px solid #e8a020" : "1px solid #1f2937",
      borderRadius: 14, padding: "24px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between",
      transition: "border-color 0.15s, transform 0.15s", cursor: "pointer",
    }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#e8a020"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = highlight ? "#e8a020" : "#1f2937"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div>
        <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#f9fafb", letterSpacing: 1 }}>{title}</div>
        <p style={{ fontSize: 16, color: "#9ca3af", marginTop: 8, lineHeight: 1.5 }}>{desc}</p>
      </div>
      <div style={{ marginTop: 20 }}>
        <span style={{ color: "#e8a020", fontSize: 16, fontWeight: 700 }}>{btnLabel}</span>
      </div>
    </div>
  );
}