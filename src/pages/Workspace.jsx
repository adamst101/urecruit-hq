// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Search, User, Shield, LogOut, Star, ArrowRight } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { clearDemoMode } from "../components/hooks/demoMode.jsx";
import AthleteSwitcher from "../components/workspace/AthleteSwitcher.jsx";
import AddAthleteModal from "../components/workspace/AddAthleteModal.jsx";

// ---- routes (no createPageUrl dependency) ----
const ROUTES = {
  Home: "/Home",
  Workspace: "/Workspace",
  Discover: "/Discover",
  Calendar: "/Calendar",
  Profile: "/Profile",
  Subscribe: "/Subscribe",
  MyCamps: "/MyCamps",
  RecruitingGuide: "/RecruitingGuide",
  CampPlaybook: "/CampPlaybook",
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

async function safeMe() {
  try {
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
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
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const [meEmail, setMeEmail] = useState("");
  const [meName, setMeName] = useState("");
  const [logoOk, setLogoOk] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showAddAthlete, setShowAddAthlete] = useState(false);
  const [seasonConfig, setSeasonConfig] = useState(null);

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
      const me = await safeMe();
      if (cancelled) return;
      setMeEmail(String(me?.email || me?.user_metadata?.email || "").toLowerCase());
      setMeName(String(me?.full_name || me?.user_metadata?.full_name || ""));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [meRole, setMeRole] = useState("");

  // Admin check: use role from base44.auth.me() (set on the User entity)
  const isAdmin = useMemo(() => {
    if (meRole === "admin") return true;
    // Fallback allowlist
    const allow = ["tom_adams_tx@live.com", "tom.adams101@gmail.com"];
    return !!meEmail && allow.includes(meEmail);
  }, [meEmail, meRole]);

  const loading = !!season?.isLoading || !!identityLoading;

  const isMember = !!season?.accountId && !!season?.hasAccess && !!season?.entitlement;
  const memberSeason = Number(season?.entitlement?.season_year) || season?.seasonYear || null;
  const currentYear = season?.currentYear || new Date().getFullYear();
  const demoYear = season?.demoYear || (currentYear - 1);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

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

  const displayName = meName || athleteProfile?.athlete_name || meEmail || "Athlete";

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
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(36px, 5vw, 56px)", lineHeight: 1, margin: 0, letterSpacing: 1 }}>YOUR RECRUITING HQ</h1>
        </div>
        {meEmail && <p style={{ color: "#9ca3af", fontSize: 17, margin: 0 }}>Welcome back, {displayName}</p>}
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
              <div style={{ fontSize: 15, color: "#9ca3af", marginTop: 4 }}>Subscribe to unlock {currentYear} camps, save favorites, and track registrations.</div>
            </div>
            <button onClick={() => nav(`${ROUTES.Subscribe}?source=workspace_banner`)} style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
              Subscribe Now <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
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
            onClick={() => nav(ROUTES.Profile)}
            highlight={!athleteId}
          />
          <WorkspaceTile icon="📖" title="RECRUITING GUIDE" desc="Step-by-step recruiting roadmap for families" btnLabel="Read →" onClick={() => nav(ROUTES.RecruitingGuide)} />
          <WorkspaceTile icon="📋" title="CAMP PLAYBOOK" desc="How to prepare, what to expect, and how to stand out" btnLabel="Read →" onClick={() => nav(ROUTES.CampPlaybook)} />
        </div>
      </section>

      {/* ── SUBSCRIBE CALLOUT (only if not member) ── */}
      {!isMember && (
        <section style={{ padding: "0 24px 48px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "2px solid #e8a020", borderRadius: 16, padding: "36px 28px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", letterSpacing: 1 }}>
              🔓 UNLOCK THE {currentYear} SEASON
            </div>
            <p style={{ color: "#9ca3af", fontSize: 17, marginTop: 12, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              You're in demo mode. Subscribe for $49 to access current camps, save favorites, and track registrations.
            </p>
            <button onClick={() => nav(`${ROUTES.Subscribe}?source=workspace_cta`)} style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 10, padding: "16px 36px", fontSize: 18, fontWeight: 700, cursor: "pointer", marginTop: 24 }}>
              Subscribe — $49/season
            </button>
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