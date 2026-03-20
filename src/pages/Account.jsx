// src/pages/Account.jsx - Account management page
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, CreditCard, Calendar, Search, Heart,
  ChevronRight, LogOut, Plus, BookOpen, Shield,
  CheckCircle2, XCircle, Clock, RefreshCw, Trash2,
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
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0); // 0=idle, 1=confirm, 2=deleting
  const [deleteError, setDeleteError] = useState(null);

  const [emailPrefsId, setEmailPrefsId] = useState(null);
  const [monthlyOptOut, setMonthlyOptOut] = useState(false);
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false);

  async function fetchData(showSpinner = false) {
    if (!accountId) return;
    if (showSpinner) setRefreshing(true);
    try {
      const [me, athRows, entRows, prefRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.AthleteProfile.filter({ account_id: accountId }).catch(() => []),
        base44.entities.Entitlement.filter({ account_id: accountId }).catch(() => []),
        base44.entities.EmailPreferences.filter({ account_id: accountId }).catch(() => []),
      ]);
      setUser(me);
      setAthletes(Array.isArray(athRows) ? athRows : []);
      setEntitlements(Array.isArray(entRows) ? entRows : []);
      const pref = Array.isArray(prefRows) ? prefRows[0] : null;
      setEmailPrefsId(pref?.id || null);
      setMonthlyOptOut(pref?.monthly_agenda_opt_out === true);
    } catch {}
    setLoading(false);
    if (showSpinner) setRefreshing(false);
  }

  async function handleMonthlyOptOutToggle(newVal) {
    setMonthlyOptOut(newVal);
    setEmailPrefsSaving(true);
    try {
      if (emailPrefsId) {
        await base44.entities.EmailPreferences.update(emailPrefsId, { monthly_agenda_opt_out: newVal });
      } else {
        const created = await base44.entities.EmailPreferences.create({ account_id: accountId, monthly_agenda_opt_out: newVal });
        if (created?.id) setEmailPrefsId(created.id);
      }
    } catch (e) {
      console.error("Failed to save email preferences:", e?.message);
      setMonthlyOptOut(!newVal); // revert on failure
    } finally {
      setEmailPrefsSaving(false);
    }
  }

  useEffect(() => {
    if (!accountId || seasonLoading) return;
    fetchData();
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

  async function handleDeleteAccount() {
    setDeleteStep(2);
    setDeleteError(null);
    try {
      const res = await base44.functions.invoke("deleteAccount", {});
      if (!res?.data?.ok) throw new Error(res?.data?.error || "Unknown error");
      // Account data deleted — log out
      clearSeasonAccessCache();
      await safeLogout();
      navigate("/Home", { replace: true });
    } catch (e) {
      console.error("Delete account failed:", e.message);
      setDeleteError("Something went wrong. Please try again or contact support.");
      setDeleteStep(0);
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

  const totalAmountPaid = entitlements
    .filter(e => e.status === "active")
    .reduce((sum, e) => sum + (Number(e.amount_paid) || 0), 0);

  const isActive = !!hasAccess;
  const email = user?.email || "";
  const userInitials = email ? email[0].toUpperCase() : "U";

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#f9fafb", paddingBottom: 96 }}>
      <style>{FONTS}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 0" }}>
        <button
          type="button"
          onClick={() => navigate(ROUTES.Workspace)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#e8a020", display: "flex", alignItems: "center", gap: 4, marginBottom: 12, padding: 0 }}
        >
          ← HQ
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg, #e8a020, #b8790f)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 700, color: "#0a0e1a", flexShrink: 0,
          }}>
            {userInitials}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f9fafb", lineHeight: 1.2 }}>
              My Account
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
                {totalAmountPaid > 0 && (
                  <InfoPill label="Amount Paid" value={`$${totalAmountPaid}`} />
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
        <Section title="My Athletes" action={
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 4, display: "flex", alignItems: "center" }}
            title="Refresh athlete list"
          >
            <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          </button>
        }>
          {athletes.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14, padding: "8px 0" }}>No athletes set up yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {athletes.map(a => {
                const aId = a.id || a._id || null;
                const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.athlete_name || a.display_name || "Unnamed";
                const abbr = initials(a.first_name, a.last_name, name[0]?.toUpperCase() || "?");
                const sport = a.sport_name || "";
                const gradYear = a.grad_year ? `Class of ${a.grad_year}` : null;
                const location = [a.home_city, a.home_state].filter(Boolean).join(", ");
                return (
                  <button
                    key={aId}
                    onClick={() => navigate(`/Profile?id=${aId}`)}
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
              onClick={() => navigate("/Checkout?mode=addon")}
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
            <InfoRow label="Account ID" value={accountId || "—"} borderTop mono />
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

        {/* ── Communications ── */}
        <Section title="Communications">
          <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb" }}>Monthly Camp Agenda</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3, lineHeight: 1.5 }}>
                  Personalized monthly email with your registered camps, watchlist, and nearby camps.
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleMonthlyOptOutToggle(!monthlyOptOut)}
                disabled={emailPrefsSaving}
                style={{
                  flexShrink: 0,
                  width: 44, height: 24,
                  borderRadius: 12,
                  border: "none",
                  background: monthlyOptOut ? "#374151" : "#22c55e",
                  cursor: emailPrefsSaving ? "not-allowed" : "pointer",
                  position: "relative",
                  opacity: emailPrefsSaving ? 0.6 : 1,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  position: "absolute",
                  top: 3, left: monthlyOptOut ? 3 : 23,
                  width: 18, height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: monthlyOptOut ? "#ef4444" : "#22c55e", marginTop: 10, fontWeight: 600 }}>
              {emailPrefsSaving ? "Saving…" : monthlyOptOut ? "Opted out — you will not receive monthly agenda emails" : "Subscribed — you will receive monthly agenda emails"}
            </div>
          </div>
        </Section>

        {/* ── Delete Account ── */}
        <div style={{ marginTop: 32, borderTop: "1px solid #1f2937", paddingTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Danger Zone
          </div>

          {deleteStep === 0 && (
            <button
              type="button"
              onClick={() => { setDeleteStep(1); setDeleteError(null); }}
              style={{
                width: "100%", background: "transparent",
                border: "1px solid #374151", borderRadius: 12,
                padding: "14px", fontSize: 14, fontWeight: 600,
                color: "#6b7280", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Trash2 style={{ width: 15, height: 15 }} />
              Delete My Account
            </button>
          )}

          {deleteStep === 1 && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, padding: "20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fca5a5", marginBottom: 8 }}>
                Are you sure you want to delete your account?
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, lineHeight: 1.5 }}>
                This will permanently delete your profile, all athlete profiles, entitlements, favorites, and registrations. <strong style={{ color: "#f9fafb" }}>This cannot be undone.</strong>
              </div>
              {deleteError && (
                <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{deleteError}</p>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setDeleteStep(0)}
                  style={{ flex: 1, background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 600, color: "#9ca3af", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}
                >
                  Yes, Delete Everything
                </button>
              </div>
            </div>
          )}

          {deleteStep === 2 && (
            <div style={{ textAlign: "center", padding: "20px", color: "#9ca3af", fontSize: 14 }}>
              <div style={{ width: 24, height: 24, border: "2px solid #ef4444", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
              Deleting account data…
            </div>
          )}
        </div>

      </div>

      <BottomNav />
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </div>
        {action}
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

function InfoRow({ label, value, borderTop, mono }) {
  return (
    <div style={{ padding: "14px 16px", borderTop: borderTop ? "1px solid #1f2937" : "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <span style={{ fontSize: 14, color: "#9ca3af", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: mono ? 11 : 14, color: "#f9fafb", fontWeight: 600, textAlign: "right", wordBreak: "break-all", fontFamily: mono ? "monospace" : "inherit" }}>{value || "—"}</span>
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
