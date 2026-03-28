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
      max-width: 860px;
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
  const [rosterFilter, setRosterFilter] = useState("all"); // "all" | "hasCamps" | "noCamps" | "thisMonth"
  const [monthlyView, setMonthlyView] = useState("byCamp"); // "byCamp" | "byAthlete"
  const [expandedSchool, setExpandedSchool] = useState(null); // school name string

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

  // ── Quick-message a specific athlete from another sheet ───────────────────
  function messageAthlete(rosterEntry) {
    if (rosterEntry) setRecipient(rosterEntry.id || "all");
    setOpenSheet("message");
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

  // ── Computed data ───────────────────────────────────────────────────────────
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

  // Per-athlete helpers used across sheets
  function getNextCamp(r) {
    const camps = campsByAccountId[r.account_id] || [];
    const upcoming = camps
      .filter(c => c.start_date && new Date(c.start_date + "T00:00:00") >= _now)
      .sort((a, b) => new Date(a.start_date + "T00:00:00") - new Date(b.start_date + "T00:00:00"));
    return upcoming[0] || null;
  }

  function uniqueSchoolCount(r) {
    return new Set((campsByAccountId[r.account_id] || []).map(c => c.school_name).filter(Boolean)).size;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr + "T00:00:00") - _now) / 86400000);
  }

  // Filtered roster for the roster sheet
  const filteredRoster = roster.filter(r => {
    const camps = campsByAccountId[r.account_id] || [];
    if (rosterFilter === "hasCamps") return camps.length > 0;
    if (rosterFilter === "noCamps") return camps.length === 0;
    if (rosterFilter === "thisMonth") return camps.some(c => {
      if (!c.start_date) return false;
      const d = new Date(c.start_date + "T00:00:00");
      return d.getMonth() === _thisMonth && d.getFullYear() === _thisYear;
    });
    return true;
  });

  // Camp-centric groups for monthly/upcoming sheet
  function buildCampGroups(upcomingOnly) {
    const campMap = new Map();
    roster.forEach(r => {
      (campsByAccountId[r.account_id] || []).forEach(c => {
        if (!c.start_date) return;
        const d = new Date(c.start_date + "T00:00:00");
        const include = upcomingOnly
          ? d >= _now
          : (d.getMonth() === _thisMonth && d.getFullYear() === _thisYear);
        if (!include) return;
        const key = c.camp_id || c.event_key || (String(c.school_name) + "|" + c.start_date);
        if (!campMap.has(key)) campMap.set(key, { camp: c, athletes: [] });
        campMap.get(key).athletes.push(r);
      });
    });
    return Array.from(campMap.values()).sort((a, b) =>
      new Date(a.camp.start_date + "T00:00:00") - new Date(b.camp.start_date + "T00:00:00")
    );
  }

  // School detail map for schools sheet
  const schoolRows = (() => {
    const m = new Map();
    Object.entries(campsByAccountId).forEach(([accountId, camps]) => {
      const ath = roster.find(r => r.account_id === accountId);
      camps.forEach(c => {
        const name = c.school_name || c.camp_name || "Unknown School";
        if (!m.has(name)) m.set(name, { name, division: null, count: 0, athletes: new Set() });
        const e = m.get(name);
        e.count++;
        if (!e.division && c.school_division) e.division = c.school_division;
        if (ath) e.athletes.add(ath.athlete_name || "Athlete");
      });
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  })();

  // Attention items queue
  const attentionItems = (() => {
    const items = [];
    // No camps — high priority
    athletesNoCamps.forEach(r => {
      items.push({ athlete: r, issue: "No camps planned", detail: "Has not saved or registered for any camps yet", priority: "high", color: "#f87171" });
    });
    // Upcoming within 7 days — urgent (send reminder)
    roster.forEach(r => {
      const next = getNextCamp(r);
      if (!next) return;
      const days = daysUntil(next.start_date);
      if (days !== null && days >= 0 && days <= 7) {
        items.push({
          athlete: r,
          issue: days === 0 ? "Camp today" : `Camp in ${days} day${days === 1 ? "" : "s"}`,
          detail: (next.school_name || next.camp_name || "Camp") + " · " + new Date(next.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          priority: "urgent",
          color: "#f59e0b",
        });
      }
    });
    // Recently joined (≤ 21 days) with no camps
    const twentyOneDaysAgo = new Date(_now - 21 * 86400000);
    roster.forEach(r => {
      if (!r.joined_at) return;
      const joinDate = new Date(r.joined_at);
      const camps = campsByAccountId[r.account_id] || [];
      if (joinDate >= twentyOneDaysAgo && camps.length === 0) {
        // Only add if not already in the no-camps list
        if (!items.find(i => i.athlete.id === r.id && i.priority === "high")) {
          items.push({
            athlete: r,
            issue: "Recently joined",
            detail: `Connected ${Math.ceil((_now - joinDate) / 86400000)} days ago — no camps saved yet`,
            priority: "medium",
            color: "#818cf8",
          });
        }
      }
    });
    return items;
  })();

  // Role detection — use coach_type stored on the Coach entity ("HS Coach" | "Trainer")
  const coachType = coach.coach_type || "HS Coach";
  const isTrainer = coachType === "Trainer";
  const dashTitle = isTrainer ? "TRAINER HQ" : "COACH HQ";
  const boardTitle = isTrainer ? "CAMP ACTIVITY TRACKER" : "RECRUITING BOARD";

  // Sort board: athletes with no camps first (action needed), then by joined date
  const boardRoster = [...roster].sort((a, b) => {
    const aCamps = (campsByAccountId[a.account_id] || []).length;
    const bCamps = (campsByAccountId[b.account_id] || []).length;
    if (aCamps === 0 && bCamps > 0) return -1;
    if (bCamps === 0 && aCamps > 0) return 1;
    return 0;
  });

  // Next upcoming camp across all athletes
  const _allUpcoming = [];
  roster.forEach(r => {
    (campsByAccountId[r.account_id] || []).forEach(c => {
      if (c.start_date) {
        const d = new Date(c.start_date + "T00:00:00");
        if (d >= _now) _allUpcoming.push({ athlete: r.athlete_name, camp: c, date: d });
      }
    });
  });
  _allUpcoming.sort((a, b) => a.date - b.date);
  const nextCamps = _allUpcoming.slice(0, 4);

  // ── Full approved dashboard ─────────────────────────────────────────────────
  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", paddingBottom: 100, fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      {/* ── HEADER ── */}
      <section style={{ padding: "48px 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 3, height: 40, background: "#e8a020", borderRadius: 2, flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1, margin: 0, letterSpacing: 1 }}>
              {dashTitle}
            </h1>
            <p style={{ color: "#9ca3af", fontSize: 15, margin: "6px 0 0" }}>
              Welcome back, {isTrainer ? "Trainer" : "Coach"} {coach.last_name}
              {coach.title ? ` · ${coach.title}` : ""}
            </p>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
              {coach.school_or_org}{coach.sport ? ` · ${coach.sport}` : ""}
              {(coach.phone || coach.website) && (
                <>
                  {coach.phone ? ` · ${coach.phone}` : ""}
                  {coach.website && (
                    <> · <a href={coach.website} target="_blank" rel="noopener noreferrer" style={{ color: "#4b5563" }}>{coach.website}</a></>
                  )}
                </>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
      </section>

      {/* ── SNAPSHOT METRICS ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { key: "roster",  label: "Athletes",        value: roster.length,             sub: "on roster",                    accent: "#e8a020" },
            { key: "monthly", label: "Active This Month", value: athletesThisMonth.length, sub: `camps in ${_monthName}`,       accent: "#e8a020" },
            { key: "schools", label: "Schools Targeted",  value: topSchools.length,         sub: "with registrations",           accent: "#e8a020" },
            { key: "noCamps", label: "Need Attention",    value: athletesNoCamps.length,    sub: "no camps registered",          accent: athletesNoCamps.length > 0 ? "#f87171" : "#6b7280" },
          ].map(({ key, label, value, sub, accent }) => (
            <div
              key={key}
              onClick={() => setOpenSheet(key)}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#e8a020"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
            >
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: accent, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRIMARY BOARD ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 20, background: "#e8a020", borderRadius: 2 }} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: "#f9fafb" }}>{boardTitle}</div>
          </div>
          <button
            onClick={() => setOpenSheet("roster")}
            style={{ background: "none", border: "none", color: "#e8a020", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            Full Roster →
          </button>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
          {boardRoster.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🏈</div>
              <p style={{ fontSize: 14, color: "#9ca3af", margin: 0 }}>No athletes yet. Share your invite code to connect with players.</p>
              <button
                onClick={() => setOpenSheet("code")}
                style={{ marginTop: 16, background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Get Invite Code →
              </button>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 12, padding: "10px 20px", borderBottom: "1px solid #1f2937", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Athlete</span>
                <span>Class</span>
                <span>Registered Camps</span>
              </div>
              {boardRoster.slice(0, 10).map((r, i) => {
                const athleteCamps = campsByAccountId[r.account_id] || [];
                const noCamps = athleteCamps.length === 0;
                return (
                  <div
                    key={r.id || i}
                    style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 12, padding: "14px 20px", borderBottom: i < Math.min(boardRoster.length, 10) - 1 ? "1px solid #1f2937" : "none", alignItems: "center", background: noCamps ? "rgba(248,113,113,0.03)" : "transparent" }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 14 }}>{r.athlete_name || "Athlete"}</div>
                      {noCamps && (
                        <div style={{ fontSize: 11, color: "#f87171", marginTop: 2, fontWeight: 600 }}>No camps registered</div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#9ca3af" }}>
                      {r.athlete_grad_year ? `'${String(r.athlete_grad_year).slice(-2)}` : "—"}
                    </div>
                    <div>
                      {noCamps ? (
                        <button
                          onClick={() => nav("/Discover")}
                          style={{ background: "none", border: "1px solid #374151", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#9ca3af", cursor: "pointer" }}
                        >
                          Browse Camps →
                        </button>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {athleteCamps.slice(0, 3).map((c, ci) => (
                            <span key={ci} style={{ background: "rgba(232,160,32,0.1)", color: "#e8a020", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
                              {c.start_date ? new Date(c.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                              {" "}{c.school_name ? c.school_name.split(" ").slice(-1)[0] : c.camp_name?.split(" ")[0] || ""}
                            </span>
                          ))}
                          {athleteCamps.length > 3 && (
                            <span style={{ fontSize: 11, color: "#6b7280", padding: "3px 0" }}>+{athleteCamps.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {boardRoster.length > 10 && (
                <div
                  onClick={() => setOpenSheet("roster")}
                  style={{ padding: "12px 20px", textAlign: "center", fontSize: 13, color: "#e8a020", fontWeight: 600, cursor: "pointer", borderTop: "1px solid #1f2937" }}
                >
                  View all {boardRoster.length} athletes →
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── SECONDARY INSIGHTS ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>

          {/* Top Schools */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
            <div
              onClick={() => setOpenSheet("schools")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer", borderBottom: "1px solid #1f2937" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: "#e8a020", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, color: "#f9fafb" }}>TOP SCHOOLS</span>
              </div>
              <span style={{ fontSize: 12, color: "#e8a020", fontWeight: 600 }}>View All →</span>
            </div>
            <div style={{ padding: "8px 0" }}>
              {topSchools.length === 0 ? (
                <p style={{ fontSize: 13, color: "#4b5563", padding: "16px 20px", margin: 0 }}>No registrations yet. Rankings appear once athletes register.</p>
              ) : (
                topSchools.map(([school, count], i) => (
                  <div key={school} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i < topSchools.length - 1 ? "1px solid #1f2937" : "none" }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: i === 0 ? "#e8a020" : "#374151", width: 22, textAlign: "center", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", flexShrink: 0 }}>{count} reg{count !== 1 ? "s" : ""}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Camps */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
            <div
              onClick={() => setOpenSheet("monthly")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer", borderBottom: "1px solid #1f2937" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: "#e8a020", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, color: "#f9fafb" }}>UPCOMING CAMPS</span>
              </div>
              <span style={{ fontSize: 12, color: "#e8a020", fontWeight: 600 }}>View Month →</span>
            </div>
            <div style={{ padding: "8px 0" }}>
              {nextCamps.length === 0 ? (
                <p style={{ fontSize: 13, color: "#4b5563", padding: "16px 20px", margin: 0 }}>No upcoming camps scheduled.</p>
              ) : (
                nextCamps.map(({ athlete, camp, date }, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "10px 20px", borderBottom: i < nextCamps.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                    <div style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, textAlign: "center", flexShrink: 0, minWidth: 44 }}>
                      <div>{date.toLocaleDateString("en-US", { month: "short" })}</div>
                      <div style={{ fontSize: 15, lineHeight: 1 }}>{date.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{camp.school_name || camp.camp_name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{athlete}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ── RECENT MESSAGES ── */}
      {messages.length > 0 && (
        <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
            <div
              onClick={() => setOpenSheet("message")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer", borderBottom: "1px solid #1f2937" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: "#e8a020", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, color: "#f9fafb" }}>RECENT MESSAGES</span>
              </div>
              <span style={{ fontSize: 12, color: "#e8a020", fontWeight: 600 }}>Compose + View →</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {messages.slice(0, 3).map((m, i) => (
                <div key={m.id || i} style={{ padding: "12px 20px", borderBottom: i < Math.min(messages.length, 3) - 1 ? "1px solid #1f2937" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      → {m.recipient_name || "All Athletes"}
                    </span>
                    <span style={{ fontSize: 11, color: "#4b5563", flexShrink: 0 }}>{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : ""}</span>
                  </div>
                  {m.subject && <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", marginBottom: 2 }}>{m.subject}</div>}
                  <div style={{ fontSize: 13, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.message}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── UTILITY ACTIONS ── */}
      <section style={{ padding: "0 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 3, height: 16, background: "#374151", borderRadius: 2 }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: "#6b7280" }}>QUICK ACTIONS</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[
            { icon: "💬", label: "Message Roster", sub: `${messages.length} sent`, sheet: "message" },
            { icon: "🔗", label: "Invite Code", sub: coach.invite_code || "Share with athletes", sheet: "code" },
            { icon: "🔍", label: "Discover Camps", sub: "Browse by school, state, date", nav: "/Discover" },
          ].map(({ icon, label, sub, sheet, nav: navTo }) => (
            <div
              key={label}
              onClick={() => navTo ? nav(navTo) : setOpenSheet(sheet)}
              style={{ background: "#0d1421", border: "1px solid #1f2937", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#d1d5db" }}>{label}</div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}>{sub}</div>
              </div>
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
                {openSheet === "roster"  && `ATHLETE ROSTER — ${filteredRoster.length} OF ${roster.length}`}
                {openSheet === "monthly" && (monthlyView === "upcoming" ? "UPCOMING CAMPS" : `CAMP ACTIVITY — ${_monthName.toUpperCase()}`)}
                {openSheet === "schools" && `SCHOOLS TARGETED — ${schoolRows.length}`}
                {openSheet === "noCamps" && `NEEDS ATTENTION — ${attentionItems.length}`}
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

              {/* ── ROSTER SHEET ── */}
              {openSheet === "roster" && (
                <>
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
                    Full roster view — track camp activity and follow up with athletes who need support.
                  </p>
                  {/* Filter chips */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {[
                      { key: "all", label: `All (${roster.length})` },
                      { key: "hasCamps", label: "Has Camps" },
                      { key: "noCamps", label: "No Camps" },
                      { key: "thisMonth", label: "This Month" },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setRosterFilter(f.key)}
                        style={{
                          padding: "5px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: "pointer",
                          background: rosterFilter === f.key ? "#e8a020" : "#1f2937",
                          color: rosterFilter === f.key ? "#0a0e1a" : "#9ca3af",
                          border: "none",
                        }}
                      >{f.label}</button>
                    ))}
                  </div>

                  {filteredRoster.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>🏈</div>
                      {roster.length === 0
                        ? <p style={{ fontSize: 14, color: "#9ca3af" }}>No athletes connected yet. Once athletes connect to your roster, you'll be able to track camps, activity, and who may need support.</p>
                        : <p style={{ fontSize: 14, color: "#9ca3af" }}>No athletes match this filter.</p>
                      }
                    </div>
                  ) : (
                    <>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 52px 80px 60px 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        <span>Athlete</span><span>Camps</span><span>Next Camp</span><span>Schools</span><span>Action</span>
                      </div>
                      {filteredRoster.map((r, i) => {
                        const athleteCamps = campsByAccountId[r.account_id] || [];
                        const noCamps = athleteCamps.length === 0;
                        const nextCamp = getNextCamp(r);
                        const schoolCount = uniqueSchoolCount(r);
                        const days = nextCamp ? daysUntil(nextCamp.start_date) : null;
                        return (
                          <div
                            key={r.id || i}
                            style={{ display: "grid", gridTemplateColumns: "2fr 52px 80px 60px 80px", gap: 8, padding: "12px 0", borderBottom: i < filteredRoster.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {noCamps && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171", display: "inline-block", flexShrink: 0 }} title="Needs attention" />}
                                <span style={{ fontWeight: 600, color: "#f9fafb", fontSize: 14 }}>{r.athlete_name || "Athlete"}</span>
                              </div>
                              {r.athlete_grad_year && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>Class of {r.athlete_grad_year}</div>}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: noCamps ? "#f87171" : "#e8a020", textAlign: "center" }}>
                              {athleteCamps.length}
                            </div>
                            <div style={{ fontSize: 12, color: nextCamp ? "#d1d5db" : "#4b5563" }}>
                              {nextCamp
                                ? <><div>{new Date(nextCamp.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                                    {days !== null && days <= 14 && <div style={{ fontSize: 10, color: days <= 7 ? "#f59e0b" : "#6b7280" }}>{days === 0 ? "Today" : `${days}d away`}</div>}
                                  </>
                                : "—"
                              }
                            </div>
                            <div style={{ fontSize: 13, color: schoolCount > 0 ? "#9ca3af" : "#4b5563", textAlign: "center" }}>
                              {schoolCount > 0 ? schoolCount : "—"}
                            </div>
                            <div>
                              <button
                                onClick={() => messageAthlete(r)}
                                style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", background: "none", border: "1px solid #374151", borderRadius: 6, padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                              >
                                Message →
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}

              {/* ── MONTHLY / UPCOMING CAMPS SHEET ── */}
              {openSheet === "monthly" && (() => {
                const upcomingOnly = monthlyView === "upcoming";
                const campGroups = buildCampGroups(upcomingOnly);
                const byAthleteList = roster.filter(r => {
                  const camps = (campsByAccountId[r.account_id] || []).filter(c => {
                    if (!c.start_date) return false;
                    const d = new Date(c.start_date + "T00:00:00");
                    return upcomingOnly ? d >= _now : (d.getMonth() === _thisMonth && d.getFullYear() === _thisYear);
                  });
                  return camps.length > 0;
                });

                return (
                  <>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
                      {upcomingOnly ? "All upcoming camp activity across the roster." : `Camp activity across the roster for ${_monthName}.`}
                    </p>
                    {/* View toggle */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                      {[
                        { key: "byCamp", label: "By Camp" },
                        { key: "byAthlete", label: "By Athlete" },
                        { key: "upcoming", label: "All Upcoming" },
                      ].map(v => (
                        <button
                          key={v.key}
                          onClick={() => setMonthlyView(v.key)}
                          style={{
                            padding: "5px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: "pointer",
                            background: monthlyView === v.key ? "#e8a020" : "#1f2937",
                            color: monthlyView === v.key ? "#0a0e1a" : "#9ca3af",
                            border: "none",
                          }}
                        >{v.label}</button>
                      ))}
                    </div>

                    {monthlyView !== "byAthlete" ? (
                      campGroups.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "32px 0" }}>
                          <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                          <p style={{ fontSize: 14, color: "#9ca3af" }}>No camp activity {upcomingOnly ? "upcoming" : "for this month"} yet. As athletes register for camps, this view will help you track who is going where and what needs follow-up.</p>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 1fr", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            <span>Camp</span><span>Date</span><span>Location</span><span>Athletes</span>
                          </div>
                          {campGroups.map(({ camp, athletes }, i) => {
                            const d = new Date(camp.start_date + "T00:00:00");
                            const days = daysUntil(camp.start_date);
                            return (
                              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 1fr", gap: 8, padding: "12px 0", borderBottom: i < campGroups.length - 1 ? "1px solid #1f2937" : "none", alignItems: "start" }}>
                                <div>
                                  <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 13, lineHeight: 1.3 }}>{camp.school_name || camp.camp_name}</div>
                                  {days !== null && days >= 0 && days <= 14 && (
                                    <div style={{ fontSize: 10, color: days <= 7 ? "#f59e0b" : "#6b7280", marginTop: 2 }}>{days === 0 ? "Today" : `${days}d away`}</div>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: "#d1d5db" }}>
                                  {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </div>
                                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                                  {[camp.city, camp.state].filter(Boolean).join(", ") || "—"}
                                </div>
                                <div>
                                  {athletes.map((a, ai) => (
                                    <div key={ai} style={{ fontSize: 12, color: "#d1d5db" }}>{a.athlete_name || "Athlete"}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )
                    ) : (
                      byAthleteList.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "32px 0" }}>
                          <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                          <p style={{ fontSize: 14, color: "#9ca3af" }}>No camp activity {upcomingOnly ? "upcoming" : "this month"} yet.</p>
                        </div>
                      ) : (
                        byAthleteList.map((r, i) => {
                          const camps = (campsByAccountId[r.account_id] || []).filter(c => {
                            if (!c.start_date) return false;
                            const d = new Date(c.start_date + "T00:00:00");
                            return upcomingOnly ? d >= _now : (d.getMonth() === _thisMonth && d.getFullYear() === _thisYear);
                          }).sort((a, b) => new Date(a.start_date + "T00:00:00") - new Date(b.start_date + "T00:00:00"));
                          return (
                            <div key={r.id || i} style={{ padding: "12px 0", borderBottom: i < byAthleteList.length - 1 ? "1px solid #1f2937" : "none" }}>
                              <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 14, marginBottom: 6 }}>
                                {r.athlete_name || "Athlete"}
                                {r.athlete_grad_year && <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>Class of {r.athlete_grad_year}</span>}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {camps.map((c, ci) => {
                                  const days = daysUntil(c.start_date);
                                  return (
                                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>
                                        {new Date(c.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </span>
                                      <span style={{ fontSize: 13, color: "#d1d5db", flex: 1 }}>{c.school_name || c.camp_name}</span>
                                      {days !== null && days >= 0 && days <= 7 && (
                                        <span style={{ fontSize: 11, color: "#f59e0b", whiteSpace: "nowrap" }}>{days === 0 ? "Today" : `${days}d`}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )
                    )}
                  </>
                );
              })()}

              {/* ── SCHOOLS TARGETED SHEET ── */}
              {openSheet === "schools" && (
                schoolRows.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🏫</div>
                    <p style={{ fontSize: 14, color: "#9ca3af" }}>No school activity tracked yet. As athletes save camps, register, and log activity, this view will show which programs are most connected to your roster.</p>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
                      Programs ranked by camp registrations across the roster. Tap a school to see which athletes are connected.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px 70px 50px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>#</span><span>School</span><span>Division</span><span>Regs</span><span>Athletes</span>
                    </div>
                    {schoolRows.map((s, i) => {
                      const isExpanded = expandedSchool === s.name;
                      const athleteList = Array.from(s.athletes);
                      return (
                        <div key={s.name}>
                          <div
                            onClick={() => setExpandedSchool(isExpanded ? null : s.name)}
                            style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px 70px 50px", gap: 8, padding: "12px 0", borderBottom: isExpanded ? "none" : (i < schoolRows.length - 1 ? "1px solid #1f2937" : "none"), alignItems: "center", cursor: "pointer" }}
                          >
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: i === 0 ? "#e8a020" : "#4b5563", textAlign: "center" }}>{i + 1}</div>
                            <div>
                              <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 14 }}>{s.name}</div>
                              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{isExpanded ? "▲ collapse" : "▼ show athletes"}</div>
                            </div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{s.division || "—"}</div>
                            <div style={{ textAlign: "center" }}>
                              <span style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{s.count}</span>
                            </div>
                            <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center" }}>{s.athletes.size}</div>
                          </div>
                          {isExpanded && (
                            <div style={{ background: "#0d1421", borderRadius: 8, padding: "10px 14px", marginBottom: 8, borderBottom: i < schoolRows.length - 1 ? "1px solid #1f2937" : "none" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Athletes</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {athleteList.map(name => (
                                  <span key={name} style={{ background: "#1f2937", color: "#d1d5db", fontSize: 12, padding: "4px 10px", borderRadius: 20 }}>{name}</span>
                                ))}
                              </div>
                              <button
                                onClick={() => nav("/Discover")}
                                style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#e8a020", background: "none", border: "1px solid #374151", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
                              >
                                Find Similar Camps →
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )
              )}

              {/* ── NEEDS ATTENTION SHEET ── */}
              {openSheet === "noCamps" && (
                attentionItems.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                    <p style={{ fontSize: 14, color: "#9ca3af" }}>Nothing needs attention right now. This view will surface athletes and camp situations that may need follow-up.</p>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
                      Athletes or situations that may need your follow-up, sorted by priority.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>Issue</span><span>Action</span>
                    </div>
                    {attentionItems.map((item, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 8, padding: "12px 0", borderBottom: i < attentionItems.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: "#f9fafb", fontSize: 14 }}>{item.athlete.athlete_name || "Athlete"}</div>
                          {item.athlete.athlete_grad_year && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>Class of {item.athlete.athlete_grad_year}</div>}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.issue}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>{item.detail}</div>
                        </div>
                        <div>
                          <button
                            onClick={() => messageAthlete(item.athlete)}
                            style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", background: "none", border: "1px solid #374151", borderRadius: 6, padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            Message →
                          </button>
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
