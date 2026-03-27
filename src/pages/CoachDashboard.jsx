// src/pages/CoachDashboard.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import { base44 } from "../api/base44Client";
import { clearSeasonAccessCache, useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;
const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// Responsive sheet styles: bottom-sheet on mobile, centered modal on desktop
const SHEET_STYLES = `
  .coach-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 85vh;
    border-top: 3px solid #e8a020;
    border-radius: 20px 20px 0 0;
  }
  @media (min-width: 640px) {
    .coach-sheet {
      top: 50%;
      left: 50%;
      right: auto;
      bottom: auto;
      transform: translate(-50%, -50%);
      width: calc(100% - 48px);
      max-width: 640px;
      max-height: 80vh;
      border-radius: 16px;
      border-top: none;
      border: 1px solid #374151;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    }
  }
`;

// Module-level cache — survives component unmount/remount within the same session.
// Cleared on logout. Prevents "No Coach Account Found" when auth token expires mid-session.
let _coachCache = null; // { coach, roster, messages, campsByAccountId }

// ── Tile component matching Workspace style ───────────────────────────────────
function CoachTile({ icon, title, desc, badge, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? "#1a2535" : "#111827",
        border: active ? "1px solid #e8a020" : "1px solid #1f2937",
        borderRadius: 14,
        padding: "24px 22px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#e8a020"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? "#e8a020" : "#1f2937"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div>
        <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#f9fafb", letterSpacing: 1 }}>{title}</div>
        <p style={{ fontSize: 15, color: "#9ca3af", marginTop: 8, lineHeight: 1.5, margin: "8px 0 0" }}>{desc}</p>
      </div>
      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#e8a020", fontSize: 15, fontWeight: 700 }}>Open →</span>
        {badge != null && badge > 0 && (
          <span style={{ background: "#e8a020", color: "#0a0e1a", borderRadius: 20, fontSize: 11, fontWeight: 800, padding: "2px 8px" }}>{badge}</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CoachDashboard() {
  const nav = useNavigate();

  const [coach, setCoach] = useState(null);
  const [roster, setRoster] = useState([]);
  const [messages, setMessages] = useState([]);
  const [campsByAccountId, setCampsByAccountId] = useState({});
  const [loading, setLoading] = useState(true);
  const { mode: seasonMode, role: seasonRole, accountId: seasonAccountId } = useSeasonAccess();
  const [setupPolling, setSetupPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [copied, setCopied] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Open sheet: null | "roster" | "monthly" | "schools" | "noCamps" | "message" | "code"
  const [openSheet, setOpenSheet] = useState(null);

  // Message compose state
  const [recipient, setRecipient] = useState("all"); // "all" | athlete roster id
  const [subject, setSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // ── Load coach profile ──────────────────────────────────────────────────────
  async function loadCoach() {
    // If we have a cached profile from earlier in this session, use it immediately
    // so the UI shows correctly even when the auth token has expired mid-session.
    if (_coachCache) {
      setCoach(_coachCache.coach);
      setRoster(_coachCache.roster);
      setCampsByAccountId(_coachCache.campsByAccountId);
      setMessages(_coachCache.messages);
      return _coachCache.coach;
    }

    try {
      // Get accountId directly from frontend auth — more reliable than waiting
      // for useSeasonAccess to finish its async refresh on each mount
      let frontendAccountId = seasonAccountId || "";
      if (!frontendAccountId) {
        try {
          const me = await base44.auth.me();
          frontendAccountId = me?.id || "";
        } catch {}
      }
      const res = await base44.functions.invoke("getMyCoachProfile", { accountId: frontendAccountId || undefined });
      const data = res?.data;
      if (!data?.ok || !data.coach) return null;
      const sortedMessages = Array.isArray(data.messages)
        ? data.messages.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
        : [];
      // Cache for subsequent navigations within the same session
      _coachCache = {
        coach: data.coach,
        roster: Array.isArray(data.roster) ? data.roster : [],
        messages: sortedMessages,
        campsByAccountId: data.campsByAccountId || {},
      };
      setCoach(data.coach);
      setRoster(_coachCache.roster);
      setCampsByAccountId(_coachCache.campsByAccountId);
      setMessages(sortedMessages);
      return data.coach;
    } catch (e) {
      console.error("CoachDashboard load error:", e?.message);
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      const found = await loadCoach();
      if (!found) setSetupPolling(true);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!setupPolling || pollAttempts >= 5) return;
    const t = setTimeout(async () => {
      const found = await loadCoach();
      if (found) setSetupPolling(false);
      else setPollAttempts(a => a + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [setupPolling, pollAttempts]);

  // ── Refresh roster (clears module cache so fresh data is fetched) ───────────
  async function handleRefresh() {
    _coachCache = null;
    setLoading(true);
    await loadCoach();
    setLoading(false);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    _coachCache = null;
    clearSeasonAccessCache();
    try { await base44.auth.logout(); } catch {}
    window.location.assign("/Home");
  }

  // ── Copy invite code ────────────────────────────────────────────────────────
  function copyCode() {
    if (!coach?.invite_code) return;
    navigator.clipboard.writeText(coach.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Send message ────────────────────────────────────────────────────────────
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!msgBody.trim()) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      const selectedAthlete = recipient !== "all" ? roster.find(r => r.id === recipient) : null;
      const res = await base44.functions.invoke("sendCoachMessage", {
        subject: subject.trim() || undefined,
        message: msgBody.trim(),
        recipientAthleteId: selectedAthlete?.athlete_id || undefined,
        recipientName: selectedAthlete?.athlete_name || undefined,
      });
      if (res?.data?.ok) {
        setSendSuccess(true);
        setSubject("");
        setMsgBody("");
        setRecipient("all");
        setTimeout(() => setSendSuccess(false), 3000);
        // Reload messages
        const reload = await base44.functions.invoke("getMyCoachProfile", {}).catch(() => null);
        const reloadMsgs = reload?.data?.messages;
        if (Array.isArray(reloadMsgs)) {
          setMessages(reloadMsgs.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)));
        }
      } else {
        setSendError(res?.data?.error || "Failed to send message.");
      }
    } catch (err) {
      setSendError(err?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  // ── Loading spinner ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONTS}</style>
        <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── No coach record ─────────────────────────────────────────────────────────
  if (!coach) {
    const stillSetting = setupPolling && pollAttempts < 5;
    const isCoachRole = seasonMode === "coach" || seasonMode === "coach_pending" || seasonRole === "coach" || seasonRole === "coach_pending";
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#f9fafb", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{FONTS}</style>
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 32px" }}>
            {stillSetting ? (
              <>
                <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Finishing setup…</div>
                <p style={{ fontSize: 14, color: "#9ca3af" }}>Your coach account is being created. This only takes a moment.</p>
              </>
            ) : isCoachRole ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🎽</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f9fafb", marginBottom: 12, letterSpacing: 1 }}>Application Received</div>
                <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.7, maxWidth: 380, margin: "0 auto 24px" }}>
                  We verify all coaches before granting access — usually within 1 business day. You'll receive an email once approved.
                </p>
                <div style={{ textAlign: "left", maxWidth: 340, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
                  {[["📋", "Application submitted"], ["🔍", "Verification in progress"], ["📧", "Approval email sent to you"], ["🔗", "Full dashboard access granted"]].map(([icon, text]) => (
                    <div key={text} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14, color: "#d1d5db" }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>{text}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb", marginBottom: 12 }}>No Coach Account Found</div>
                <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6 }}>
                  Contact us at <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020" }}>support@urecruithq.com</a>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isRejected = coach.status === "rejected";
  const isPending = !isRejected && coach.status !== "approved";

  if (isRejected) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#f9fafb", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{FONTS}</style>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Application Not Approved</div>
          <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6 }}>
            Contact us at <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020" }}>support@urecruithq.com</a> if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#f9fafb", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{FONTS}</style>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🕐</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, marginBottom: 8, letterSpacing: 1 }}>Pending Approval</div>
          <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6, marginBottom: 20 }}>
            Your application is under review. You'll receive an email once approved — usually within 1 business day.
          </p>
          <div style={{ background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8, padding: "14px 20px", display: "inline-block" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Submitted as</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{coach.first_name} {coach.last_name}</div>
            {coach.title && <div style={{ fontSize: 13, color: "#e8a020" }}>{coach.title}</div>}
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{coach.school_or_org} · {coach.sport}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Computed data for Players Dashboard ────────────────────────────────────
  const _now = new Date();
  const _thisMonth = _now.getMonth();
  const _thisYear = _now.getFullYear();
  const _monthName = _now.toLocaleString("en-US", { month: "long" });

  const athletesThisMonth = roster.filter(r => {
    const camps = campsByAccountId[r.account_id] || [];
    return camps.some(c => {
      if (!c.start_date) return false;
      const d = new Date(c.start_date + "T00:00:00");
      return d.getMonth() === _thisMonth && d.getFullYear() === _thisYear;
    });
  });

  const _schoolCounts = {};
  Object.values(campsByAccountId).forEach(camps => {
    camps.forEach(c => {
      const name = c.school_name || c.camp_name || "Unknown";
      _schoolCounts[name] = (_schoolCounts[name] || 0) + 1;
    });
  });
  const topSchools = Object.entries(_schoolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const athletesNoCamps = roster.filter(r => (campsByAccountId[r.account_id] || []).length === 0);

  // ── Full approved dashboard ─────────────────────────────────────────────────
  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", paddingBottom: 80, fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      {/* ── HEADER ── */}
      <section style={{ padding: "48px 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 3, height: 32, background: "#e8a020", borderRadius: 2 }} />
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1, margin: 0, letterSpacing: 1, flex: 1 }}>
            COACH HQ
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", color: "#9ca3af", fontSize: 13, fontWeight: 600 }}
            >
              ↻ Refresh
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", color: "#9ca3af", fontSize: 13, fontWeight: 600 }}
            >
              <LogOut style={{ width: 14, height: 14 }} />
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
        <p style={{ color: "#9ca3af", fontSize: 17, margin: 0 }}>
          Welcome back, Coach {coach.last_name}
        </p>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
          {coach.title ? `${coach.title} · ` : ""}{coach.school_or_org} · {coach.sport} · {roster.length} athlete{roster.length !== 1 ? "s" : ""} on roster
        </p>
        {(coach.phone || coach.website) && (
          <p style={{ color: "#4b5563", fontSize: 13, marginTop: 2 }}>
            {coach.phone && <span>{coach.phone}</span>}
            {coach.phone && coach.website && <span> · </span>}
            {coach.website && <a href={coach.website} target="_blank" rel="noopener noreferrer" style={{ color: "#4b5563" }}>{coach.website}</a>}
          </p>
        )}
      </section>

      {/* ── TILES ── */}
      <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <CoachTile
            icon="👥"
            title="PLAYERS DASHBOARD"
            desc="Player insights, camp attendance, and roster overview"
            badge={roster.length}
            active={openSheet === "roster"}
            onClick={() => setOpenSheet("roster")}
          />
          <CoachTile
            icon="💬"
            title="MESSAGE ROSTER"
            desc="Send a message to all athletes or an individual"
            badge={messages.length}
            active={openSheet === "message"}
            onClick={() => setOpenSheet("message")}
          />
          <CoachTile
            icon="🔍"
            title="DISCOVER CAMPS"
            desc="Browse football camps by division, state, and date"
            active={false}
            onClick={() => nav("/Discover")}
          />
          <CoachTile
            icon="🔗"
            title="INVITE CODE"
            desc="Share your code with athletes to connect them to your roster"
            active={openSheet === "code"}
            onClick={() => setOpenSheet("code")}
          />
        </div>
      </section>

      {/* ── PLAYERS DASHBOARD ── */}
      <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 22, background: "#e8a020", borderRadius: 2 }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, color: "#f9fafb" }}>PLAYERS DASHBOARD</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[
            { key: "roster",   label: "Players Connected",  value: roster.length,              sub: "Athletes on roster",             accent: "#e8a020", cta: "View Roster →" },
            { key: "monthly",  label: "Camps This Month",   value: athletesThisMonth.length,   sub: `Players attending in ${_monthName}`, accent: "#e8a020", cta: "View Details →" },
            { key: "schools",  label: "Top Schools",        value: topSchools.length,           sub: "Schools with registrations",     accent: "#e8a020", cta: "View Rankings →" },
            { key: "noCamps",  label: "No Camps Planned",   value: athletesNoCamps.length,     sub: "Players with no registrations",  accent: athletesNoCamps.length > 0 ? "#f87171" : "#e8a020", cta: "View Players →" },
          ].map(({ key, label, value, sub, accent, cta }) => (
            <div
              key={key}
              onClick={() => setOpenSheet(key)}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: "20px", cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#e8a020"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
            >
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: accent, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>{sub}</div>
              <div style={{ fontSize: 12, color: "#e8a020", marginTop: 12, fontWeight: 600 }}>{cta}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SHEET OVERLAY ── */}
      {openSheet && (
        <>
          <style>{SHEET_STYLES}</style>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200 }}
            onClick={() => setOpenSheet(null)}
          />
          {/* Sheet */}
          <div
            className="coach-sheet"
            style={{ position: "fixed", zIndex: 201, background: "#111827", overflowY: "auto", WebkitOverflowScrolling: "touch" }}
          >
            {/* Drag handle (mobile visual) */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
              <div style={{ width: 40, height: 4, background: "#374151", borderRadius: 2 }} />
            </div>

            {/* Sheet header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0", position: "sticky", top: 0, background: "#111827", zIndex: 1 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: "#f9fafb" }}>
                {openSheet === "roster"  && `ROSTER — ${roster.length} ATHLETE${roster.length !== 1 ? "S" : ""}`}
                {openSheet === "monthly" && `CAMPS IN ${_monthName.toUpperCase()} — ${athletesThisMonth.length} PLAYER${athletesThisMonth.length !== 1 ? "S" : ""}`}
                {openSheet === "schools" && "TOP SCHOOLS"}
                {openSheet === "noCamps" && `NO CAMPS PLANNED — ${athletesNoCamps.length}`}
                {openSheet === "message" && "MESSAGE ROSTER"}
                {openSheet === "code"    && "INVITE CODE"}
              </div>
              <button
                onClick={() => setOpenSheet(null)}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 22, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Sheet body */}
            <div style={{ padding: "16px 20px 32px" }}>

              {/* ── Roster detail ── */}
              {openSheet === "roster" && (
                roster.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🏈</div>
                    <p style={{ fontSize: 14, color: "#9ca3af" }}>No athletes yet. Share your invite code to get started.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 3fr", gap: 12, padding: "0 0 10px", borderBottom: "1px solid #1f2937", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>Joined</span><span>Registered Camps</span>
                    </div>
                    {roster.map((r, i) => {
                      const athleteCamps = campsByAccountId[r.account_id] || [];
                      return (
                        <div key={r.id || i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 3fr", gap: 12, padding: "14px 0", borderBottom: i < roster.length - 1 ? "1px solid #1f2937" : "none", alignItems: "start" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 15 }}>{r.athlete_name || "Athlete"}</div>
                            {r.athlete_grad_year && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Class of {r.athlete_grad_year}</div>}
                          </div>
                          <div style={{ fontSize: 13, color: "#9ca3af", paddingTop: 2 }}>
                            {r.joined_at ? new Date(r.joined_at).toLocaleDateString() : "—"}
                          </div>
                          <div>
                            {athleteCamps.length === 0 ? (
                              <span style={{ fontSize: 13, color: "#4b5563" }}>No camps registered</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {athleteCamps.map((c, ci) => (
                                  <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>
                                      {c.start_date ? new Date(c.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                                    </span>
                                    <span style={{ fontSize: 13, color: "#d1d5db" }}>{c.school_name || c.camp_name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )
              )}

              {/* ── Monthly camps detail ── */}
              {openSheet === "monthly" && (
                athletesThisMonth.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
                    <p style={{ fontSize: 14, color: "#9ca3af" }}>No athletes have camps scheduled this month.</p>
                  </div>
                ) : (
                  athletesThisMonth.map((r, i) => {
                    const monthlyCamps = (campsByAccountId[r.account_id] || []).filter(c => {
                      if (!c.start_date) return false;
                      const d = new Date(c.start_date + "T00:00:00");
                      return d.getMonth() === _thisMonth && d.getFullYear() === _thisYear;
                    });
                    return (
                      <div key={r.id || i} style={{ padding: "14px 0", borderBottom: i < athletesThisMonth.length - 1 ? "1px solid #1f2937" : "none" }}>
                        <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 15, marginBottom: 6 }}>
                          {r.athlete_name || "Athlete"}
                          {r.athlete_grad_year && <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>Class of {r.athlete_grad_year}</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {monthlyCamps.map((c, ci) => (
                            <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>
                                {new Date(c.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                              <span style={{ fontSize: 13, color: "#d1d5db" }}>{c.school_name || c.camp_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {/* ── Top schools detail ── */}
              {openSheet === "schools" && (
                topSchools.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
                    <p style={{ fontSize: 14, color: "#9ca3af" }}>No camp registrations yet. Rankings will appear once athletes register for camps.</p>
                  </div>
                ) : (
                  topSchools.map(([school, count], i) => (
                    <div key={school} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: i < topSchools.length - 1 ? "1px solid #1f2937" : "none" }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: i === 0 ? "#e8a020" : "#4b5563", width: 28, textAlign: "center", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, fontWeight: 600, color: "#f9fafb", fontSize: 15 }}>{school}</div>
                      <div style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                        {count} reg{count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  ))
                )
              )}

              {/* ── No camps detail ── */}
              {openSheet === "noCamps" && (
                athletesNoCamps.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
                    <p style={{ fontSize: 14, color: "#9ca3af" }}>All athletes have at least one camp registered.</p>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
                      These athletes haven't registered for any camps yet — consider reaching out.
                    </p>
                    {athletesNoCamps.map((r, i) => (
                      <div key={r.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < athletesNoCamps.length - 1 ? "1px solid #1f2937" : "none" }}>
                        <div style={{ width: 32, height: 32, background: "#1f2937", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#6b7280", fontWeight: 700, flexShrink: 0 }}>
                          {(r.athlete_name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 15 }}>{r.athlete_name || "Athlete"}</div>
                          {r.athlete_grad_year && <div style={{ fontSize: 12, color: "#6b7280" }}>Class of {r.athlete_grad_year}</div>}
                        </div>
                      </div>
                    ))}
                  </>
                )
              )}

              {/* ── Message sheet ── */}
              {openSheet === "message" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Compose form */}
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, marginBottom: 14, color: "#9ca3af" }}>COMPOSE</div>
                    <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>To</label>
                        <select
                          value={recipient}
                          onChange={e => setRecipient(e.target.value)}
                          style={{ width: "100%", background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#f9fafb", outline: "none", boxSizing: "border-box" }}
                        >
                          <option value="all">All Athletes ({roster.length})</option>
                          {roster.map(r => (
                            <option key={r.id} value={r.id}>{r.athlete_name || "Athlete"}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Subject (optional)</label>
                        <input
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          placeholder="Subject…"
                          style={{ width: "100%", background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#f9fafb", outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Message</label>
                        <textarea
                          value={msgBody}
                          onChange={e => setMsgBody(e.target.value)}
                          placeholder="Write your message…"
                          required
                          style={{ width: "100%", background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#f9fafb", outline: "none", boxSizing: "border-box", resize: "vertical", minHeight: 100, fontFamily: "'DM Sans', system-ui" }}
                        />
                      </div>
                      {sendError && <p style={{ fontSize: 13, color: "#fca5a5", margin: 0 }}>{sendError}</p>}
                      {sendSuccess && <p style={{ fontSize: 13, color: "#86efac", margin: 0 }}>✓ Message sent successfully</p>}
                      <button
                        type="submit"
                        disabled={sending || !msgBody.trim()}
                        style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: sending ? "not-allowed" : "pointer", opacity: sending || !msgBody.trim() ? 0.6 : 1 }}
                      >
                        {sending ? "Sending…" : recipient === "all" ? `Send to All ${roster.length} Athletes →` : `Send to ${roster.find(r => r.id === recipient)?.athlete_name || "Athlete"} →`}
                      </button>
                    </form>
                  </div>

                  {/* Sent history */}
                  {messages.length > 0 && (
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, marginBottom: 14, color: "#9ca3af" }}>SENT ({messages.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {messages.map((m, i) => (
                          <div key={m.id || i} style={{ padding: "12px 0", borderBottom: i < messages.length - 1 ? "1px solid #1f2937" : "none" }}>
                            {m.recipient_name && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>→ {m.recipient_name}</div>
                            )}
                            {!m.recipient_name && !m.recipient_athlete_id && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>→ All Athletes</div>
                            )}
                            {m.subject && <div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb", marginBottom: 4 }}>{m.subject}</div>}
                            <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.message}</div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Invite code sheet ── */}
              {openSheet === "code" && (
                <>
                  <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 24 }}>
                    Share this code with athletes and parents. They enter it during signup at <span style={{ color: "#9ca3af" }}>urecruithq.com</span> to connect with you automatically.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 700, color: "#e8a020", letterSpacing: 3, background: "#0a0e1a", border: "1px solid #374151", borderRadius: 10, padding: "16px 24px" }}>
                      {coach.invite_code}
                    </div>
                    <button
                      onClick={copyCode}
                      style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "14px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                    >
                      {copied ? "✓ Copied!" : "Copy Code"}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
