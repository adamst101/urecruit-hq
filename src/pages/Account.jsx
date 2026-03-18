// src/pages/Account.jsx - Account management page
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, CreditCard, Calendar, Search, Heart,
  ChevronRight, LogOut, Plus, BookOpen, Shield,
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { base44 } from "../api/base44Client";
import { useSeasonAccess, clearSeasonAccessCache } from "../components/hooks/useSeasonAccess.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const ROUTES = {
  Workspace: "/Workspace",
  Discover: "/Discover",
  Calendar: "/Calendar",
  MyCamps: "/MyCamps",
  Profile: "/Profile",
  Subscribe: "/Subscribe",
  RecruitingGuide: "/RecruitingGuide",
  CampPlaybook: "/CampPlaybook",
};

function initials(first, last, fallback = "?") {
  const f = (first || "").trim()[0] || "";
  const l = (last || "").trim()[0] || "";
  return (f + l).toUpperCase() || fallback;
}

function fmt(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

async function safeLogout() {
  try { await base44.auth.logout?.(); return; } catch {}
  try { await base44.auth.signOut?.(); return; } catch {}
  try { await base44.auth.redirectToLogin(window.location.origin + "/Home"); } catch {}
}

export default function Account() {
  const navigate = useNavigate();
  const { hasAccess, entitlement, accountId, isLoading: seasonLoading } = useSeasonAccess();

  const [user, setUser] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!accountId || seasonLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const [me, athRows, entRows] = await Promise.all([
          base44.auth.me().catch(() => null),
          base44.entities.AthleteProfile.filter({ account_id: accountId }).catch(() => []),
          base44.entities.Entitlement.filter({ account_id: accountId }).catch(() => []),
        ]);
        if (cancelled) return;
        setUser(me);
        setAthletes(Array.isArray(athRows) ? athRows : []);
        setEntitlements(Array.isArray(entRows) ? entRows : []);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [accountId, seasonLoading]);

  useEffect(() => {
    if (!seasonLoading && !accountId) {
      navigate("/Home", { replace: true });
    }
  }, [seasonLoading, accountId, navigate]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      clearSeasonAccessCache();
      await safeLogout();
      navigate("/Home", { replace: true });
    } catch {
      setLoggingOut(false);
    }
  }

  if (seasonLoading || loading) {
    return (
      <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONTS}</style>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const primaryEnt = entitlements.find(e => e.is_primary && e.status === "active")
    || entitlements.find(e => e.status === "active")
    || entitlements[0]
    || null;

  const isActive = !!hasAccess;
  const email = user?.email || "";
  const userInitials = email ? email[0].toUpperCase() : "U";

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#f9fafb", paddingBottom: 96 }}>
      <style>{FONTS}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={{ background: "#0d1221", borderBottom: "1px solid #1f2937", padding: "20px 20px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "linear-gradient(135deg, #e8a020, #b8790f)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700, color: "#0a0e1a", flexShrink: 0,
            }}>
              {userInitials}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb", lineHeight: 1.2 }}>
                {user?.full_name || "My Account"}
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{email}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              {isActive ? (
                <span style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>
                  ACTIVE
                </span>
              ) : (
                <span style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>
                  INACTIVE
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Subscription Card ── */}
        <Section title="Subscription">
          {primaryEnt ? (
            <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", borderTop: `3px solid ${isActive ? "#22c55e" : "#ef4444"}`, padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb" }}>
                    Season {primaryEnt.season_year} Pass
                  </div>
                  <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>
                    {isActive ? "Full access active" : "Access expired"}
                  </div>
                </div>
                {isActive
                  ? <CheckCircle2 style={{ width: 28, height: 28, color: "#22c55e" }} />
                  : <XCircle style={{ width: 28, height: 28, color: "#ef4444" }} />
                }
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {primaryEnt.starts_at && (
                  <InfoPill label="Access Starts" value={fmt(primaryEnt.starts_at)} />
                )}
                {primaryEnt.ends_at && (
                  <InfoPill label="Access Ends" value={fmt(primaryEnt.ends_at)} />
                )}
                {primaryEnt.amount_paid != null && (
                  <InfoPill label="Amount Paid" value={`$${primaryEnt.amount_paid}`} />
                )}
                <InfoPill label="Athletes" value={`${athletes.length} athlete${athletes.length !== 1 ? "s" : ""}`} />
              </div>

              {!isActive && (
                <button
                  onClick={() => navigate(ROUTES.Subscribe)}
                  style={{ width: "100%", marginTop: 16, background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                >
                  Renew Season Pass →
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: "20px", textAlign: "center" }}>
              <Clock style={{ width: 32, height: 32, color: "#6b7280", margin: "0 auto 12px" }} />
              <p style={{ color: "#9ca3af", fontSize: 15, marginBottom: 16 }}>No active subscription found.</p>
              <button
                onClick={() => navigate(ROUTES.Subscribe)}
                style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
              >
                Get Season Pass →
              </button>
            </div>
          )}
        </Section>

        {/* ── Athletes ── */}
        <Section title="My Athletes">
          {athletes.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14, padding: "8px 0" }}>No athletes set up yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {athletes.map(a => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.athlete_name || a.display_name || "Unnamed";
                const abbr = initials(a.first_name, a.last_name, name[0]?.toUpperCase() || "?");
                const sport = a.sport_name || "";
                const gradYear = a.grad_year ? `Class of ${a.grad_year}` : null;
                const location = [a.home_city, a.home_state].filter(Boolean).join(", ");
                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(ROUTES.Profile)}
                    style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left", width: "100%" }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "rgba(232,160,32,0.15)", border: "1px solid rgba(232,160,32,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 700, color: "#e8a020", flexShrink: 0,
                    }}>
                      {abbr}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>{name}</div>
                      <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>
                        {[sport, gradYear, location].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: "#6b7280", flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}

          {isActive && athletes.length < 5 && (
            <button
              onClick={() => navigate(ROUTES.Profile)}
              style={{ width: "100%", marginTop: 12, background: "transparent", border: "1px dashed #374151", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 600, color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Plus style={{ width: 16, height: 16 }} /> Add Athlete
            </button>
          )}
        </Section>

        {/* ── Quick Access ── */}
        <Section title="Quick Access">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <QuickLink icon={Search} label="Discover Camps" onClick={() => navigate(ROUTES.Discover)} />
            <QuickLink icon={Calendar} label="My Calendar" onClick={() => navigate(ROUTES.Calendar)} />
            <QuickLink icon={Heart} label="My Camps" onClick={() => navigate(ROUTES.MyCamps)} />
            <QuickLink icon={BookOpen} label="Recruiting Guide" onClick={() => navigate(ROUTES.RecruitingGuide)} />
          </div>
        </Section>

        {/* ── Account Info ── */}
        <Section title="Account">
          <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", overflow: "hidden" }}>
            <InfoRow label="Email" value={email} />
            <InfoRow label="Account ID" value={accountId ? `${accountId.slice(0, 8)}…` : "—"} borderTop />
          </div>
        </Section>

        {/* ── Support ── */}
        <Section title="Support">
          <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", overflow: "hidden" }}>
            <LinkRow
              label="Contact Support"
              sub="support@urecruithq.com"
              onClick={() => window.location.href = "mailto:support@urecruithq.com"}
            />
            <LinkRow
              label="Camp Playbook"
              sub="Tips for getting the most out of camps"
              onClick={() => navigate(ROUTES.CampPlaybook)}
              borderTop
            />
          </div>
        </Section>

        {/* ── Sign Out ── */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: "100%", marginTop: 8,
            background: "transparent", border: "1px solid #374151",
            borderRadius: 12, padding: "16px",
            fontSize: 15, fontWeight: 600, color: "#ef4444",
            cursor: loggingOut ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          <LogOut style={{ width: 18, height: 18 }} />
          {loggingOut ? "Signing out…" : "Sign Out"}
        </button>

      </div>

      <BottomNav />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div style={{ background: "#0d1221", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#f9fafb", fontWeight: 600, marginTop: 3 }}>{value || "—"}</div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "16px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}
    >
      <Icon style={{ width: 18, height: 18, color: "#e8a020", flexShrink: 0 }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb" }}>{label}</span>
    </button>
  );
}

function InfoRow({ label, value, borderTop }) {
  return (
    <div style={{ padding: "14px 16px", borderTop: borderTop ? "1px solid #1f2937" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 14, color: "#9ca3af" }}>{label}</span>
      <span style={{ fontSize: 14, color: "#f9fafb", fontWeight: 600 }}>{value || "—"}</span>
    </div>
  );
}

function LinkRow({ label, sub, onClick, borderTop }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", padding: "14px 16px", borderTop: borderTop ? "1px solid #1f2937" : "none", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between" }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
      </div>
      <ChevronRight style={{ width: 16, height: 16, color: "#6b7280", flexShrink: 0 }} />
    </button>
  );
}
