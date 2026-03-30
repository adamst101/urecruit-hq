// src/pages/CoachDashboard.jsx -- v2
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import { base44 } from "../api/base44Client";
import { clearSeasonAccessCache, useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";
import { T } from "../lib/theme.js";

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
      border: 1px solid rgba(148,163,184,0.20);
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    }
  }
`;

// Module-level cache — survives component unmount/remount within the same session.
// Cleared on logout. Prevents "No Coach Account Found" when auth token expires mid-session.
let _coachCache = null;   // { coach, roster, messages, campsByAccountId }
let _journeyCache = null; // { athleteJourneys, programMetrics }

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
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: T.textPrimary, letterSpacing: 1 }}>{title}</div>
        <p style={{ fontSize: 15, color: T.textSecondary, marginTop: 8, lineHeight: 1.5, margin: "8px 0 0" }}>{desc}</p>
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

  // Journey data — loaded non-blocking after main profile loads
  const [athleteJourneys, setAthleteJourneys] = useState({});
  const [programMetrics, setProgramMetrics] = useState(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  // Open sheet: null | "roster" | "monthly" | "schools" | "noCamps" | "message" | "code" | "invite_parents" | "my_account"
  const [openSheet, setOpenSheet] = useState(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [emailPrefs, setEmailPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("urecruit_email_prefs") || "null") || { weekly: true, monthly: true }; } catch { return { weekly: true, monthly: true }; }
  });
  const [rosterFilter, setRosterFilter] = useState("all"); // "all" | "hasCamps" | "noCamps" | "thisMonth"
  const [monthlyView, setMonthlyView] = useState("byCamp"); // "byCamp" | "byAthlete"
  const [expandedSchool, setExpandedSchool] = useState(null); // school name string (used in schools sheet)
  const [expandedCollege, setExpandedCollege] = useState(null); // college name string (Colleges Engaging section)
  const [selectedCoachContact, setSelectedCoachContact] = useState(null); // coach contact popup data
  const [activityExpanded, setActivityExpanded] = useState(false);

  // COACH UPDATE — period filter + last-visit tracking via localStorage
  const [lastVisitDate] = useState(() => {
    try { return localStorage.getItem("urecruit_coach_last_visit") || null; } catch { return null; }
  });
  const [cuPeriod, setCuPeriod] = useState(() => {
    try { return localStorage.getItem("urecruit_coach_last_visit") ? "last_visit" : "30d"; } catch { return "30d"; }
  });

  // Message compose state
  const [recipient, setRecipient] = useState("all"); // "all" | athlete roster id
  const [subject, setSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // ── Load recruiting journey data (non-blocking, called after loadCoach) ─────
  async function loadJourneyData() {
    if (_journeyCache) {
      setAthleteJourneys(_journeyCache.athleteJourneys);
      setProgramMetrics(_journeyCache.programMetrics);
      return;
    }
    setJourneyLoading(true);
    try {
      let frontendAccountId = seasonAccountId || "";
      if (!frontendAccountId) {
        try { const me = await base44.auth.me(); frontendAccountId = me?.id || ""; } catch {}
      }
      const res = await base44.functions.invoke("getCoachRosterMetrics", { accountId: frontendAccountId || undefined });
      const data = res?.data;
      if (data?.ok) {
        _journeyCache = {
          athleteJourneys: data.athleteJourneys || {},
          programMetrics: data.program_metrics || null,
        };
        setAthleteJourneys(_journeyCache.athleteJourneys);
        setProgramMetrics(_journeyCache.programMetrics);
      }
    } catch (e) {
      console.error("CoachDashboard journey load error:", e?.message);
    } finally {
      setJourneyLoading(false);
    }
  }

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
      else loadJourneyData(); // non-blocking: runs in background
      setLoading(false);
    })();
    // Record this visit so the next session can use "Since Last Visit"
    try { localStorage.setItem("urecruit_coach_last_visit", new Date().toISOString()); } catch {}
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
    _journeyCache = null;
    setLoading(true);
    const found = await loadCoach();
    setLoading(false);
    if (found) loadJourneyData(); // non-blocking
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    _coachCache = null;
    _journeyCache = null;
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
      <div style={{ minHeight: "100vh", background: T.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
      <div style={{ minHeight: "100vh", background: T.pageBg, color: T.textPrimary, fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{FONTS}</style>
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 32px" }}>
            {stillSetting ? (
              <>
                <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ fontSize: 17, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>Finishing setup…</div>
                <p style={{ fontSize: 14, color: T.textSecondary }}>Your coach account is being created. This only takes a moment.</p>
              </>
            ) : isCoachRole ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🎽</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: T.textPrimary, marginBottom: 12, letterSpacing: 1 }}>Application Received</div>
                <p style={{ fontSize: 15, color: T.textSecondary, lineHeight: 1.7, maxWidth: 380, margin: "0 auto 24px" }}>
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
                <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>No Coach Account Found</div>
                <p style={{ fontSize: 15, color: T.textSecondary, lineHeight: 1.6 }}>
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
      <div style={{ minHeight: "100vh", background: T.pageBg, color: T.textPrimary, fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{FONTS}</style>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Application Not Approved</div>
          <p style={{ fontSize: 15, color: T.textSecondary, lineHeight: 1.6 }}>
            Contact us at <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020" }}>support@urecruithq.com</a> if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div style={{ minHeight: "100vh", background: T.pageBg, color: T.textPrimary, fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{FONTS}</style>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🕐</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, marginBottom: 8, letterSpacing: 1 }}>Pending Approval</div>
          <p style={{ fontSize: 15, color: T.textSecondary, lineHeight: 1.6, marginBottom: 20 }}>
            Your application is under review. You'll receive an email once approved — usually within 1 business day.
          </p>
          <div style={{ background: T.pageBg, border: "1px solid #374151", borderRadius: 8, padding: "14px 20px", display: "inline-block" }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>Submitted as</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{coach.first_name} {coach.last_name}</div>
            {coach.title && <div style={{ fontSize: 13, color: "#e8a020" }}>{coach.title}</div>}
            <div style={{ fontSize: 13, color: T.textSecondary }}>{coach.school_or_org} · {coach.sport}</div>
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
      const name = c.school_name || c.host_org || c.ryzer_program_name || c.camp_name;
      if (!name) return; // skip unresolvable entries rather than showing "Unknown"
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
    return new Set((campsByAccountId[r.account_id] || []).map(c => c.school_name || c.host_org || c.ryzer_program_name || c.camp_name).filter(Boolean)).size;
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
        const name = c.school_name || c.host_org || c.ryzer_program_name || c.camp_name;
        if (!name) return; // skip entries with no resolvable school name
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

  // ── Journey-derived computed data ──────────────────────────────────────────
  // Athlete-school pairs with true traction (level ≥ 2), sorted by traction desc
  const tractionPairs = (() => {
    const pairs = [];
    for (const rEntry of roster) {
      const journey = athleteJourneys[rEntry.account_id];
      if (!journey) continue;
      for (const [school, sData] of Object.entries(journey.school_traction || {})) {
        if (sData.true_traction) {
          pairs.push({
            athlete_name: rEntry.athlete_name,
            athlete_grad_year: rEntry.athlete_grad_year,
            school_name: school,
            traction_level: sData.traction_level,
            relationship_status: sData.relationship_status,
            last_activity_date: sData.last_activity_date || "",
          });
        }
      }
    }
    pairs.sort((a, b) =>
      b.traction_level - a.traction_level ||
      b.last_activity_date.localeCompare(a.last_activity_date)
    );
    return pairs;
  })();

  // Merged recent activities across all roster athletes, newest first
  const recentJourneyActivity = (() => {
    const all = [];
    for (const [accountId, journey] of Object.entries(athleteJourneys)) {
      const rEntry = roster.find(r => r.account_id === accountId);
      for (const act of (journey.recent_activities || [])) {
        all.push({ ...act, _athlete_name: rEntry?.athlete_name || "Athlete" });
      }
    }
    all.sort((a, b) =>
      (b.activity_date || b.created_at || "").localeCompare(a.activity_date || a.created_at || "")
    );
    return all.slice(0, 15);
  })();

  // ── Signal classification helpers ────────────────────────────────────────
  const SIGNAL_PERSONAL_TYPES = new Set([
    "dm_received", "dm_sent", "text_received", "text_sent", "post_camp_followup_sent",
  ]);

  const _d30 = new Date(_now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const _d60 = new Date(_now.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const _d90 = new Date(_now.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  function _get30dCount(journey) {
    return (journey.recent_activities || []).filter(a =>
      (a.activity_date || a.created_at || "").slice(0, 10) >= _d30
    ).length;
  }
  function _get30dHighestLevel(journey) {
    let max = 0;
    for (const a of (journey.recent_activities || [])) {
      if ((a.activity_date || a.created_at || "").slice(0, 10) < _d30) continue;
      const lvl = a._traction_level ?? 0;
      if (lvl > max) max = lvl;
    }
    return max;
  }

  // ── Headline metric: Players w/ Any Interest ──────────────────────────────
  const playersWithAnyInterest = (() => {
    if (Object.keys(athleteJourneys).length === 0) return null;
    let n = 0;
    for (const r of roster) {
      const j = athleteJourneys[r.account_id];
      if (j && Object.values(j.school_traction || {}).some(s => s.traction_level >= 1)) n++;
    }
    return n;
  })();

  // ── Headline metric: Colleges Engaging Program (any level ≥ 1, broadened) ─
  const collegesEngagingProgramCount = (() => {
    const names = new Set();
    for (const j of Object.values(athleteJourneys)) {
      for (const [key, s] of Object.entries(j.school_traction || {})) {
        if (s.traction_level >= 1) names.add((s.school_name || "").trim() || key);
      }
    }
    return names.size;
  })();

  // ── Headline metric: Players Heating Up (active in last 30d) ─────────────
  const playersHeatingUpCount = (() => {
    if (Object.keys(athleteJourneys).length === 0) return null;
    let n = 0;
    for (const r of roster) {
      const j = athleteJourneys[r.account_id];
      if (j && (j.last_activity_date || "") >= _d30) n++;
    }
    return n;
  })();

  // ── Headline metric: Repeat-Interest Colleges ────────────────────────────
  const repeatInterestCollegesCount = programMetrics?.repeated_interest_college_count ?? (() => {
    const m = {};
    for (const r of roster) {
      const j = athleteJourneys[r.account_id];
      if (!j) continue;
      for (const [key, s] of Object.entries(j.school_traction || {})) {
        if (s.traction_level < 1) continue;
        const name = (s.school_name || "").trim() || key;
        if (!m[name]) m[name] = new Set();
        m[name].add(r.account_id);
      }
    }
    return Object.values(m).filter(s => s.size >= 2).length;
  })();

  // ── Players Heating Up table (ranked coach action list) ───────────────────
  const playersHeatingUpRows = (() => {
    const stageOrder = { "Visit / Offer": 0, "True Traction": 1, "Personal Signal": 2, "Watching": 3 };
    const changeOrder = c => c === "New visit / offer" ? 0 : c === "New personal outreach" ? 1 : c === "New true traction" ? 2 : c.startsWith("+") ? 3 : 4;
    const rows = [];

    for (const rEntry of roster) {
      const j = athleteJourneys[rEntry.account_id];
      if (!j) continue;
      const st = j.school_traction || {};
      const hl = j.highest_traction_level || 0;
      const engaging = Object.values(st).filter(s => s.traction_level >= 1);
      if (engaging.length === 0 && hl === 0) continue;

      let currentStage;
      if (hl >= 4) currentStage = "Visit / Offer";
      else if (hl >= 2) currentStage = "True Traction";
      else if (hl === 1) currentStage = engaging.some(s => SIGNAL_PERSONAL_TYPES.has(s.top_activity_type)) ? "Personal Signal" : "Watching";
      else currentStage = "Watching";

      let strongestSignal;
      if (hl >= 4) {
        const top = [...engaging].sort((a, b) => b.traction_level - a.traction_level)[0];
        strongestSignal = top?.relationship_status === "committed" ? "Committed" : top?.relationship_status === "offer" ? "Offer" : "Visit";
      } else if (hl === 3) strongestSignal = "Personal Invite";
      else if (hl === 2) strongestSignal = "DM / Text / Email";
      else if (hl === 1) strongestSignal = engaging.some(s => SIGNAL_PERSONAL_TYPES.has(s.top_activity_type)) ? "DM / Text" : "Follow / Like";
      else strongestSignal = "—";

      const topCollege = [...engaging].sort((a, b) => b.traction_level - a.traction_level || (b.last_activity_date || "").localeCompare(a.last_activity_date || ""))[0]?.school_name || "—";
      const lastDate = j.last_activity_date || "";
      const count30d = _get30dCount(j);
      const level30d = _get30dHighestLevel(j);

      let change30d;
      if (count30d === 0) change30d = "No change";
      else if (level30d >= 4) change30d = "New visit / offer";
      else if (level30d >= 3) change30d = "New personal outreach";
      else if (level30d >= 2) change30d = "New true traction";
      else change30d = `+${count30d} activit${count30d === 1 ? "y" : "ies"}`;

      const coachAttention = (hl >= 4 || (hl >= 2 && count30d > 0)) ? "High Priority" : (count30d > 0 || hl >= 2) ? "Heating Up" : "Watching";

      rows.push({ account_id: rEntry.account_id, athlete_name: rEntry.athlete_name, athlete_grad_year: rEntry.athlete_grad_year, currentStage, schoolsEngaging: engaging.length, strongestSignal, topCollege, change30d, coachAttention, hl, count30d, lastDate });
    }

    rows.sort((a, b) => {
      const sd = (stageOrder[a.currentStage] ?? 3) - (stageOrder[b.currentStage] ?? 3);
      if (sd !== 0) return sd;
      const cd = changeOrder(a.change30d) - changeOrder(b.change30d);
      if (cd !== 0) return cd;
      const dd = b.schoolsEngaging - a.schoolsEngaging;
      if (dd !== 0) return dd;
      return (b.lastDate || "").localeCompare(a.lastDate || "");
    });
    return rows;
  })();

  // ── Colleges Engaging the Program (cross-athlete, all level ≥ 1) ─────────
  const collegesEngagingRows = (() => {
    const map = {};
    for (const rEntry of roster) {
      const j = athleteJourneys[rEntry.account_id];
      if (!j) continue;
      for (const [key, s] of Object.entries(j.school_traction || {})) {
        if (s.traction_level < 1) continue;
        const name = (s.school_name || "").trim() || key;
        if (!name) continue;
        if (!map[name]) map[name] = { college: name, ids: new Set(), names: [], hl: 0, hs: "general_signal", lastDate: "", totalCount: 0, hasPersonal: false };
        const e = map[name];
        if (!e.ids.has(rEntry.account_id)) { e.ids.add(rEntry.account_id); if (rEntry.athlete_name) e.names.push(rEntry.athlete_name); }
        if (s.traction_level > e.hl) { e.hl = s.traction_level; e.hs = s.relationship_status; }
        if (s.traction_level === 1 && SIGNAL_PERSONAL_TYPES.has(s.top_activity_type)) e.hasPersonal = true;
        if ((s.last_activity_date || "") > e.lastDate) e.lastDate = s.last_activity_date;
        e.totalCount += s.activity_count || 1;
      }
    }
    return Object.values(map).map(e => {
      const ac = e.ids.size;
      let hs; if (e.hl >= 4) hs = "Visit / Offer"; else if (e.hl >= 2) hs = "True Traction"; else hs = e.hasPersonal ? "Personal Signal" : "Watching";
      let pv; if (e.hl >= 3 || ac >= 3) pv = "Strong"; else if (e.hl >= 2 || ac >= 2 || e.totalCount >= 3) pv = "Growing"; else pv = "Low";
      let rl = null; if (ac >= 3) rl = `×${ac} athletes`; else if (ac === 2) rl = "×2 athletes"; else if (e.totalCount >= 3) rl = "Repeat"; else if (e.lastDate >= _d30) rl = "New This Month";
      return { college: e.college, athletesEngaged: ac, athleteNames: e.names, highestStage: hs, highestLevel: e.hl, highestStatus: e.hs, lastActivityDate: e.lastDate, repeatInterest: ac >= 2 || e.totalCount >= 3, repeatLabel: rl, programValue: pv };
    }).sort((a, b) => b.highestLevel - a.highestLevel || b.athletesEngaged - a.athletesEngaged);
  })();

  // ── Colleges Engaging — enriched view model with coaches + athlete detail ──
  // Derives coach contact info (name, title, twitter) from per-athlete activity records.
  // No email/phone in schema — those fields gracefully fall back to "Not on record".
  const collegesEngagingViewModel = (() => {
    if (Object.keys(athleteJourneys).length === 0) return collegesEngagingRows.map(col => ({ ...col, coaches: [], athletes: [] }));
    return collegesEngagingRows.map(col => {
      const coachMap = {};
      const athleteDetailMap = {};
      for (const rEntry of roster) {
        const j = athleteJourneys[rEntry.account_id];
        if (!j) continue;
        // Find traction entry for this college in this athlete's school_traction
        const stData = Object.entries(j.school_traction || {}).reduce((found, [key, s]) => {
          if (found) return found;
          if ((s.school_name || "").trim() === col.college || key === col.college) return s;
          return null;
        }, null);
        if (!stData || stData.traction_level < 1) continue;
        // Stage for this athlete at this college
        const hl = stData.traction_level;
        let stage, stageColor;
        if (hl >= 4)      { stage = "Visit / Offer"; stageColor = "#f59e0b"; }
        else if (hl >= 2) { stage = "True Traction"; stageColor = "#60a5fa"; }
        else if (SIGNAL_PERSONAL_TYPES.has(stData.top_activity_type)) { stage = "Personal Signal"; stageColor = "#a78bfa"; }
        else              { stage = "Watching"; stageColor = "#9ca3af"; }
        // Scan this athlete's activities at this college for coach info
        const collegeActs = (j.recent_activities || [])
          .filter(a => (a.school_name || "").trim() === col.college)
          .sort((a, b) => (b.activity_date || b.created_at || "").localeCompare(a.activity_date || a.created_at || ""));
        let topCoachName = null;
        for (const act of collegeActs) {
          const cname = (act.coach_name || "").trim();
          if (cname) {
            if (!topCoachName) topCoachName = cname;
            if (!coachMap[cname]) {
              coachMap[cname] = { name: cname, title: null, twitter: null, athleteIds: new Set(), lastDate: "", lastActivityType: null };
            }
            if (!coachMap[cname].title && act.coach_title)   coachMap[cname].title   = act.coach_title.trim();
            if (!coachMap[cname].twitter && act.coach_twitter) coachMap[cname].twitter = (act.coach_twitter || "").trim().replace(/^@/, "");
            coachMap[cname].athleteIds.add(rEntry.account_id);
            const d = (act.activity_date || act.created_at || "").slice(0, 10);
            if (!coachMap[cname].lastDate || d > coachMap[cname].lastDate) {
              coachMap[cname].lastDate = d;
              coachMap[cname].lastActivityType = act.activity_type;
            }
          }
        }
        athleteDetailMap[rEntry.account_id] = {
          name: rEntry.athlete_name || "Athlete",
          gradYear: rEntry.athlete_grad_year,
          stage, stageColor,
          lastDate: stData.last_activity_date || "",
          topCoachName,
        };
      }
      const coaches = Object.values(coachMap)
        .map(c => ({ ...c, athleteIds: [...c.athleteIds] }))
        .sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
      const athletes = Object.values(athleteDetailMap).sort((a, b) => {
        const so = { "Visit / Offer": 0, "True Traction": 1, "Personal Signal": 2, "Watching": 3 };
        return (so[a.stage] ?? 3) - (so[b.stage] ?? 3) || (b.lastDate || "").localeCompare(a.lastDate || "");
      });
      return { ...col, coaches, athletes };
    });
  })();

  // ── Recruiting Momentum (30d vs prior 30d) ────────────────────────────────
  const recruitingMomentum = (() => {
    let p30 = 0, pP = 0, tt30 = 0, ttP = 0;
    for (const rEntry of roster) {
      const j = athleteJourneys[rEntry.account_id];
      if (!j) continue;
      const acts = j.recent_activities || [];
      const has30 = acts.some(a => (a.activity_date || a.created_at || "").slice(0, 10) >= _d30);
      const hasPrior = acts.some(a => { const d = (a.activity_date || a.created_at || "").slice(0, 10); return d >= _d60 && d < _d30; });
      if (has30) p30++;
      if (hasPrior) pP++;
      const hasTT = Object.values(j.school_traction || {}).some(s => s.true_traction);
      if (hasTT && has30) tt30++;
      if (hasTT && hasPrior) ttP++;
    }
    const c30 = new Set(), cP = new Set();
    for (const j of Object.values(athleteJourneys)) {
      for (const [key, s] of Object.entries(j.school_traction || {})) {
        if (s.traction_level < 1) continue;
        const name = (s.school_name || "").trim() || key;
        if (!name) continue;
        if ((s.last_activity_date || "") >= _d30) c30.add(name);
        else if ((s.last_activity_date || "") >= _d60) cP.add(name);
      }
    }
    const totalVO = (programMetrics?.offer_count || 0) + (programMetrics?.unofficial_visit_count || 0) + (programMetrics?.official_visit_count || 0);
    return { players30d: p30, players_prior: pP, trueTraction30d: tt30, trueTraction_prior: ttP, colleges30d: c30.size, colleges_prior: cP.size, totalVO };
  })();

  // ── COACH UPDATE — computed data ─────────────────────────────────────────
  const coachUpdateData = (() => {
    // Date cutoff based on selected period
    const cutoff =
      cuPeriod === "last_visit" && lastVisitDate ? lastVisitDate.slice(0, 10) :
      cuPeriod === "60d" ? _d60 :
      cuPeriod === "90d" ? _d90 :
      _d30;

    // Full uncapped activity list across all athletes (recentJourneyActivity is capped at 15)
    const allActs = [];
    for (const [accountId, journey] of Object.entries(athleteJourneys)) {
      const rEntry = roster.find(r => r.account_id === accountId);
      for (const act of (journey.recent_activities || [])) {
        allActs.push({ ...act, _account_id: accountId, _athlete_name: rEntry?.athlete_name || "Athlete" });
      }
    }

    const filtered = allActs.filter(a => (a.activity_date || a.created_at || "").slice(0, 10) >= cutoff);
    filtered.sort((a, b) =>
      (b.activity_date || b.created_at || "").localeCompare(a.activity_date || a.created_at || "")
    );

    // Row 1 — unique athletes with any activity
    const athleteIds = new Set(filtered.map(a => a._account_id));
    const athleteCount = athleteIds.size;

    // Row 2 — new true traction (level >= 2, excludes level 4 major outcomes for labeling but counts both)
    const tractionActs = filtered.filter(a => (a._traction_level ?? 0) >= 2);
    const tractionAthletes = new Set(tractionActs.map(a => a._account_id)).size;
    const tractionSchools = new Set(tractionActs.map(a => (a.school_name || "").trim()).filter(Boolean)).size;

    // Row 3 — major outcomes (level 4: visits, offers, commitments)
    const VISIT_TYPES  = new Set(["unofficial_visit_requested","unofficial_visit_completed","official_visit_requested","official_visit_completed"]);
    const OFFER_TYPES  = new Set(["offer","offer_received","offer_updated"]);
    const COMMIT_TYPES = new Set(["commitment","signed"]);
    const majorActs   = filtered.filter(a => (a._traction_level ?? 0) >= 4);
    const visitCount  = majorActs.filter(a => VISIT_TYPES.has(a.activity_type)).length;
    const offerCount  = majorActs.filter(a => OFFER_TYPES.has(a.activity_type)).length;
    const commitCount = majorActs.filter(a => COMMIT_TYPES.has(a.activity_type)).length;
    const majorCount  = majorActs.length;

    // Row 4 — camp activity (NOT true traction, NOT major outcomes)
    // Distinguish: camp_registered = signed up, camp_attended = actually attended
    const CAMP_REG_TYPES  = new Set(["camp_registered", "camp_attended"]);
    const campRegActs     = filtered.filter(a => a.activity_type === "camp_registered");
    const campAttendActs  = filtered.filter(a => a.activity_type === "camp_attended");
    const campAllActs     = filtered.filter(a => CAMP_REG_TYPES.has(a.activity_type));
    const campRegOnly     = campRegActs.length;
    const campAttendOnly  = campAttendActs.length;
    const campRegCount    = campAllActs.length; // total for row value
    const campRegAthletes = new Set(campAllActs.map(a => a._account_id)).size;

    // Label that accurately reflects the mix
    const campRowLabel =
      campRegOnly > 0 && campAttendOnly > 0 ? "New camp registrations & attendance"
      : campAttendOnly > 0                  ? "New camp attendance"
      :                                       "New camp registrations";

    // Short narrative phrase used in sentence-1 (no stronger outcomes) and sentence-2 (alongside stronger outcomes)
    const campNarrativePhrase = (n) =>
      campRegOnly > 0 && campAttendOnly > 0
        ? (n === 1 ? "one new camp registration or attendance" : `${n} new camp registrations and attendance events`)
        : campAttendOnly > 0
          ? (n === 1 ? "one camp attendance"   : `${n} camp attendance events`)
          : (n === 1 ? "one new camp registration" : `${n} new camp registrations`);

    // Row 5 — most active colleges: sort by highest traction level first, then count
    const collegeMap = {};
    for (const a of filtered) {
      const name = (a.school_name || "").trim();
      if (!name) continue;
      if (!collegeMap[name]) collegeMap[name] = { count: 0, highestLevel: 0 };
      collegeMap[name].count++;
      const lvl = a._traction_level ?? 0;
      if (lvl > collegeMap[name].highestLevel) collegeMap[name].highestLevel = lvl;
    }
    const topColleges = Object.entries(collegeMap)
      .sort((a, b) => b[1].highestLevel - a[1].highestLevel || b[1].count - a[1].count)
      .slice(0, 3)
      .map(([name]) => name);

    // ── Priority helpers (needed for both detail lines and narrative) ─────
    const PRIORITY_RANK = (act) => {
      const t = act.activity_type || "";
      if (COMMIT_TYPES.has(t)) return 1;
      if (OFFER_TYPES.has(t))  return 2;
      if (["official_visit_requested","official_visit_completed"].includes(t))   return 3;
      if (["unofficial_visit_requested","unofficial_visit_completed"].includes(t)) return 4;
      if ((act._traction_level ?? 0) >= 2) return 5;
      if (CAMP_REG_TYPES.has(t)) return 6;
      if (new Set(["dm_received","dm_sent","text_received","text_sent","post_camp_followup_sent","phone_call","personal_email"]).has(t)) return 7;
      return 99;
    };
    const EVENT_LABEL = (act) => {
      const t = act.activity_type || "";
      if (COMMIT_TYPES.has(t)) return "commitment";
      if (OFFER_TYPES.has(t))  return "scholarship offer";
      if (t === "official_visit_requested")   return "official visit request";
      if (t === "official_visit_completed")   return "official visit completed";
      if (t === "unofficial_visit_requested") return "unofficial visit request";
      if (t === "unofficial_visit_completed") return "unofficial visit completed";
      if ((act._traction_level ?? 0) >= 2) return "direct personal contact";
      if (t === "camp_registered") return "camp registration";
      if (t === "camp_attended")   return "camp attendance";
      if (t === "phone_call")      return "phone call";
      if (t === "personal_email")  return "personal email";
      if (["dm_received","dm_sent"].includes(t)) return "direct message";
      if (["text_received","text_sent"].includes(t)) return "text";
      if (t === "post_camp_followup_sent") return "post-camp follow-up";
      return "activity";
    };

    const ranked = [...filtered].sort((a, b) => PRIORITY_RANK(a) - PRIORITY_RANK(b));
    const topRaw  = ranked.find(a => PRIORITY_RANK(a) < 99) || null;

    // ── Signal strength label + color ─────────────────────────────────────
    const SIGNAL_STRENGTH = (rank) => {
      if (rank <= 4) return { label: "Outcome",  color: "#f59e0b" };
      if (rank === 5) return { label: "Traction", color: "#60a5fa" };
      if (rank <= 7)  return { label: "Personal", color: "#a78bfa" };
      return              { label: "Light",    color: "#6b7280"  };
    };

    // ── Rule-based coach takeaway ─────────────────────────────────────────
    // Only surfaces when data is strong enough to warrant a specific suggestion.
    const TAKEAWAY = (act) => {
      const t = act.activity_type || "";
      if (COMMIT_TYPES.has(t)) return null; // done — no action needed
      if (OFFER_TYPES.has(t))  return "Ask athlete about interest level";
      if (t === "official_visit_completed" || t === "official_visit_requested")   return "Confirm athlete's plan with family";
      if (t === "unofficial_visit_completed") return "Discuss visit experience with athlete";
      if (t === "unofficial_visit_requested") return "Discuss visit request with athlete";
      if (t === "post_camp_followup_sent" || t === "post_camp_personal_response") return "Encourage athlete to respond";
      if (t === "camp_attended")              return "Encourage follow-up with coaching staff";
      if ((act._traction_level ?? 0) >= 2)   return "Check in — ask what the coach said";
      if (t === "phone_call")                 return "Ask athlete what was discussed";
      if (t === "personal_email")             return "Confirm athlete replied";
      if (["dm_received","dm_sent"].includes(t)) return "Confirm athlete replied";
      return null;
    };

    // ── Intelligence rows: deduplicated per school–athlete–event type ─────
    // Sorted by priority rank; capped at 6. Skips generic light signals (rank 99).
    const _seenIntelKeys = new Set();
    const intelligenceRows = [];
    for (const act of ranked) {
      const rank = PRIORITY_RANK(act);
      if (rank === 99) continue;
      if (intelligenceRows.length >= 6) break;
      const school  = (act.school_name || "").trim();
      const evLabel = EVENT_LABEL(act);
      const key     = `${act._account_id}|${school}|${evLabel}`;
      if (_seenIntelKeys.has(key)) continue;
      _seenIntelKeys.add(key);
      const dateStr = (act.activity_date || act.created_at || "").slice(0, 10);
      const { label: sigLabel, color: sigColor } = SIGNAL_STRENGTH(rank);
      intelligenceRows.push({
        athlete:        act._athlete_name,
        school:         school || null,
        eventLabel:     evLabel,
        signalStrength: sigLabel,
        signalColor:    sigColor,
        coachName:      (act.coach_name  || "").trim() || null,
        coachTitle:     (act.coach_title || "").trim() || null,
        date:           dateStr,
        takeaway:       TAKEAWAY(act),
      });
    }

    // ── Detail lines: one line per athlete, events combined ───────────────
    const byAthlete = {};
    for (const act of ranked) {
      const rank = PRIORITY_RANK(act);
      if (rank === 99) continue;
      const id = act._account_id;
      if (!byAthlete[id]) byAthlete[id] = { athlete: act._athlete_name, events: [], colleges: new Set(), minRank: rank };
      const evLabel = EVENT_LABEL(act);
      if (!byAthlete[id].events.includes(evLabel) && byAthlete[id].events.length < 3) byAthlete[id].events.push(evLabel);
      if ((act.school_name || "").trim()) byAthlete[id].colleges.add(act.school_name.trim());
    }
    const detailLines = Object.values(byAthlete)
      .sort((a, b) => a.minRank - b.minRank)
      .slice(0, 3)
      .map(a => {
        const evs = a.events;
        const eventText = evs.length === 1 ? evs[0]
          : evs.length === 2 ? `${evs[0]} and ${evs[1]}`
          : `${evs.slice(0, -1).join(", ")}, and ${evs[evs.length - 1]}`;
        const cols = [...a.colleges];
        const collegeText = cols.length === 0 ? null
          : cols.length === 1 ? cols[0]
          : cols.length === 2 ? `${cols[0]} and ${cols[1]}`
          : "multiple schools";
        return { athlete: a.athlete, event: eventText, college: collegeText };
      });

    // ── Athlete narrative blocks: per-athlete period recruiting summary ─────
    // One narrative block per athlete with activity in the period.
    // Ordered strongest signal first. All meaningful contacts included.
    const _SOCIAL_TYPES  = new Set(["social_like","social_follow"]);
    const _INVITE_TYPES  = new Set(["camp_invite","generic_camp_invite","personal_camp_invite"]);
    const _joinN = (arr) =>
      arr.length === 1 ? arr[0]
      : arr.length === 2 ? `${arr[0]} and ${arr[1]}`
      : arr.slice(0,-1).join(", ") + ", and " + arr[arr.length - 1];

    // Builds a readable phrase for one contact event
    const _buildPhrase = (rank, evLabel, actType, school, coachName, coachTitle) => {
      const cs = coachName
        ? (coachTitle ? `${coachName}, ${coachTitle}` : coachName)
        : null;
      if (rank === 1) return school ? `committed to ${school}` : "committed to a program";
      if (rank === 2) return cs && school ? `a scholarship offer from ${school}, extended by ${cs}`
        : school ? `a scholarship offer from ${school}` : "a scholarship offer";
      if (rank === 3) {
        const v = evLabel === "official visit completed" ? "an official visit completion" : "an official visit request";
        return school ? `${v} from ${school}` : v;
      }
      if (rank === 4) {
        const v = evLabel === "unofficial visit completed" ? "an unofficial visit completion" : "an unofficial visit request";
        return cs && school ? `${v} from ${school}, extended by ${cs}` : school ? `${v} from ${school}` : v;
      }
      if (rank === 5) return cs && school ? `direct contact from ${cs} at ${school}`
        : school ? `direct personal contact from ${school}` : "direct personal contact";
      if (rank === 6) {
        const v = evLabel === "camp attendance" ? "camp attendance at" : "a camp registration at";
        return school ? `${v} ${school}` : evLabel;
      }
      if (rank === 7) {
        const m = evLabel === "phone call" ? "a phone call"
          : evLabel === "personal email" ? "a personal email"
          : evLabel === "direct message" ? "a direct message"
          : evLabel === "text" ? "a text message"
          : evLabel === "post-camp follow-up" ? "post-camp follow-up"
          : "direct outreach";
        return cs && school ? `${m} from ${cs} at ${school}` : school ? `${m} from ${school}` : m;
      }
      // Rank 99 semi-meaningful: camp invites, emails
      if (_INVITE_TYPES.has(actType)) return school ? `a camp invite from ${school}` : "a camp invite";
      if (["generic_email","personal_email"].includes(actType)) return school ? `an email from ${school}` : "an email from a program";
      return null;
    };

    const _athleteBlockMap = {};
    for (const rEntry of roster) {
      const athleteActs = filtered.filter(a => a._account_id === rEntry.account_id);
      if (athleteActs.length === 0) continue;
      const seen = new Set();
      const contacts = [];
      const lightSchoolSet = new Set();

      for (const act of [...athleteActs].sort((a, b) => PRIORITY_RANK(a) - PRIORITY_RANK(b))) {
        const school  = (act.school_name || "").trim() || null;
        const rank    = PRIORITY_RANK(act);
        const evLabel = EVENT_LABEL(act);
        const actType = act.activity_type || "";
        const key     = `${school}|${rank <= 7 ? evLabel : actType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (_SOCIAL_TYPES.has(actType)) { if (school) lightSchoolSet.add(school); continue; }
        const phrase = _buildPhrase(rank, evLabel, actType, school,
          (act.coach_name || "").trim() || null, (act.coach_title || "").trim() || null);
        if (phrase !== null) contacts.push({ rank, phrase });
      }

      const lightSchools = [...lightSchoolSet];
      if (contacts.length === 0 && lightSchools.length === 0) continue;

      const sentences = [];
      if (contacts.length > 0) {
        const first = contacts[0];
        sentences.push(first.rank === 1
          ? `${first.phrase.charAt(0).toUpperCase() + first.phrase.slice(1)}.`
          : `Received ${first.phrase}.`);
        if (contacts.length === 2) {
          sentences.push(`Also received ${contacts[1].phrase}.`);
        } else if (contacts.length >= 3) {
          sentences.push(`Additional contact included ${_joinN(contacts.slice(1).map(c => c.phrase))}.`);
        }
      }
      if (lightSchools.length > 0) {
        const sp = lightSchools.length === 1 ? lightSchools[0]
          : lightSchools.length <= 2 ? _joinN(lightSchools)
          : `${lightSchools.length} programs`;
        sentences.push(contacts.length === 0
          ? `Social engagement (likes, follows) was recorded from ${sp} during this period.`
          : `Social engagement was also recorded from ${sp}.`);
      }
      if (sentences.length === 0) continue;

      _athleteBlockMap[rEntry.account_id] = {
        athleteName: rEntry.athlete_name || "Athlete",
        narrative: sentences.join(" "),
        topRank: contacts.length > 0 ? contacts[0].rank : 99,
      };
    }

    const athleteNarrativeBlocks = Object.values(_athleteBlockMap)
      .sort((a, b) => a.topRank - b.topRank || a.athleteName.localeCompare(b.athleteName));

    // ── Period label + simple intro narrative ────────────────────────────
    const periodLabel =
      cuPeriod === "last_visit" ? "since your last visit" :
      cuPeriod === "60d" ? "over the last 60 days" :
      cuPeriod === "90d" ? "over the last 90 days" :
      "over the last 30 days";
    const capLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);

    let narrative = "";
    if (filtered.length === 0 || !topRaw) {
      narrative = cuPeriod === "last_visit"
        ? "No new recruiting activity since your last visit."
        : "No new recruiting activity in this period.";
    } else {
      narrative = `${capLabel}, the following recruiting activity was recorded across the roster.`;
    }

    return { cutoff, athleteCount, tractionAthletes, tractionSchools, majorCount, visitCount, offerCount, commitCount, campRegCount, campRegAthletes, campRowLabel, topColleges, narrative, detailLines, intelligenceRows, athleteNarrativeBlocks, totalFiltered: filtered.length };
  })();

  // ── Players Needing Attention ─────────────────────────────────────────────
  const playersNeedingAttentionRows = (() => {
    const rows = [];
    for (const rEntry of roster) {
      const j = athleteJourneys[rEntry.account_id];
      if (!j) continue;
      const st = j.school_traction || {};
      const hl = j.highest_traction_level || 0;
      const lastDate = j.last_activity_date || "";
      const count30d = _get30dCount(j);
      const engaging = Object.values(st).filter(s => s.traction_level >= 1);
      const tractionSchools = Object.values(st).filter(s => s.true_traction);
      const hasVisitOffer = Object.values(st).some(s => ["visit","offer","committed"].includes(s.relationship_status));
      const hasTT = tractionSchools.length > 0;

      if (hasTT && count30d === 0 && lastDate) {
        rows.push({ athlete_name: rEntry.athlete_name, athlete_grad_year: rEntry.athlete_grad_year, lastActivity: lastDate, stage: hl >= 4 ? "Visit / Offer" : "True Traction", reason: "No activity in 30 days", suggestedAction: hl >= 4 ? "High Priority Conversation" : "Follow Up", priority: hl >= 4 ? 0 : 1 });
      } else if (engaging.length >= 3 && !hasTT) {
        const hasP = engaging.some(s => SIGNAL_PERSONAL_TYPES.has(s.top_activity_type));
        rows.push({ athlete_name: rEntry.athlete_name, athlete_grad_year: rEntry.athlete_grad_year, lastActivity: lastDate, stage: hasP ? "Personal Signal" : "Watching", reason: `${engaging.length} schools engaging, no true traction`, suggestedAction: "Encourage Follow-Up", priority: 2 });
      } else if (tractionSchools.length >= 2 && !hasVisitOffer) {
        rows.push({ athlete_name: rEntry.athlete_name, athlete_grad_year: rEntry.athlete_grad_year, lastActivity: lastDate, stage: "True Traction", reason: `${tractionSchools.length} schools with traction, no visit yet`, suggestedAction: "Track Closely", priority: 2 });
      } else if (hl === 1 && !hasTT && engaging.length > 0 && !j.player_progressing) {
        rows.push({ athlete_name: rEntry.athlete_name, athlete_grad_year: rEntry.athlete_grad_year, lastActivity: lastDate, stage: "Watching", reason: "Watching only, no progression", suggestedAction: "Check In", priority: 3 });
      }
    }
    rows.sort((a, b) => a.priority - b.priority || (b.lastActivity || "").localeCompare(a.lastActivity || ""));
    return rows.slice(0, 12);
  })();

  const RELATIONSHIP_LABEL = {
    no_signal: "No Signal", general_signal: "Signal", verified_contact: "Verified",
    invite: "Invite", visit: "Visit", offer: "Offer", committed: "Committed",
  };
  const RELATIONSHIP_COLOR = {
    no_signal: "#4b5563", general_signal: "#9ca3af", verified_contact: "#60a5fa",
    invite: "#a78bfa", visit: "#34d399", offer: "#f59e0b", committed: "#e8a020",
  };
  const ACTIVITY_LABEL = {
    social_like: "Social Like", social_follow: "Follow", dm_received: "DM Received",
    dm_sent: "DM Sent", text_received: "Text Received", text_sent: "Text Sent",
    phone_call: "Phone Call", generic_email: "Generic Email", personal_email: "Personal Email",
    camp_invite: "Camp Invite", generic_camp_invite: "Camp Invite", personal_camp_invite: "Personal Invite",
    camp_registered: "Camp Registered", camp_attended: "Camp Attended", camp_meeting: "Camp Meeting",
    post_camp_followup_sent: "Camp Follow-up", post_camp_personal_response: "Personal Response",
    unofficial_visit_requested: "Unofficial Visit", unofficial_visit_completed: "Unofficial Visit ✓",
    official_visit_requested: "Official Visit", official_visit_completed: "Official Visit ✓",
    offer: "Offer", offer_received: "Offer Received", offer_updated: "Offer Updated",
    commitment: "Commitment", signed: "Signed NLI",
  };

  // ── Full approved dashboard ─────────────────────────────────────────────────
  return (
    <div style={{ background: T.pageBg, color: T.textPrimary, minHeight: "100vh", paddingBottom: 100, fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── HEADER ── */}
      <section style={{ padding: "48px 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 3, height: 40, background: "#e8a020", borderRadius: 2, flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1, margin: 0, letterSpacing: 1 }}>
              {dashTitle}
            </h1>
            <p style={{ color: T.textSecondary, fontSize: 15, margin: "6px 0 0" }}>
              {isTrainer
                ? `Welcome back, Trainer ${coach.last_name}${coach.title ? ` · ${coach.title}` : ""}`
                : "Program recruiting performance, player momentum, and college engagement across your roster"
              }
            </p>
            <p style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>
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
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", color: T.textSecondary, fontSize: 13, fontWeight: 600 }}
            >
              ↻ Refresh
            </button>
            <button
              onClick={() => setOpenSheet("invite_parents")}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", color: "#34d399", fontSize: 13, fontWeight: 600 }}
            >
              + Invite Parents
            </button>
            <button
              onClick={() => setOpenSheet("coach_tools")}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", color: T.textSecondary, fontSize: 13, fontWeight: 600 }}
            >
              ☰ Tools
            </button>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: HEADLINE PROGRAM METRICS (6 cards) ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 12 }}>

          {/* 1. Players w/ Any Interest */}
          <div
            onClick={() => setOpenSheet("tile_any_interest")}
            style={{ background: T.cardBg, border: "1px solid #1f2937", boxShadow: "inset 0 2px 0 0 #34d399", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#34d399"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
          >
            <div style={{ minHeight: 22, fontSize: 10, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "center", lineHeight: 1.2 }}>Any Interest</div>
            <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {journeyLoading && playersWithAnyInterest === null
                ? <div style={{ width: 18, height: 18, border: "2px solid #374151", borderTopColor: "#34d399", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: "#34d399", lineHeight: 1 }}>{playersWithAnyInterest ?? (roster.length > 0 ? "0" : "—")}</div>
              }
            </div>
            <div style={{ minHeight: 16, fontSize: 10, color: T.textSecondary, textAlign: "center" }}>Any signal</div>
          </div>

          {/* 2. Players w/ True Traction */}
          <div
            onClick={() => setOpenSheet("tile_true_traction")}
            style={{ background: T.cardBg, border: "1px solid #1f2937", boxShadow: "inset 0 2px 0 0 #60a5fa", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#60a5fa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
          >
            <div style={{ minHeight: 22, fontSize: 10, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "center", lineHeight: 1.2 }}>True Traction</div>
            <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {journeyLoading && !programMetrics
                ? <div style={{ width: 18, height: 18, border: "2px solid #374151", borderTopColor: "#60a5fa", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: "#60a5fa", lineHeight: 1 }}>{programMetrics?.players_with_true_traction ?? (roster.length > 0 ? "0" : "—")}</div>
              }
            </div>
            <div style={{ minHeight: 16, fontSize: 10, color: T.textSecondary, textAlign: "center" }}>Verified contact</div>
          </div>

          {/* 3. Visits / Offers */}
          <div
            onClick={() => setOpenSheet("tile_visits_offers")}
            style={{ background: T.cardBg, border: "1px solid #1f2937", boxShadow: "inset 0 2px 0 0 #f59e0b", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#f59e0b"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
          >
            <div style={{ minHeight: 22, fontSize: 10, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "center", lineHeight: 1.2 }}>Visits / Offers</div>
            <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {journeyLoading && !programMetrics
                ? <div style={{ width: 18, height: 18, border: "2px solid #374151", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: "#f59e0b", lineHeight: 1 }}>{programMetrics ? programMetrics.offer_count + programMetrics.unofficial_visit_count + programMetrics.official_visit_count : (roster.length > 0 ? "0" : "—")}</div>
              }
            </div>
            <div style={{ minHeight: 16, fontSize: 10, color: T.textSecondary, textAlign: "center" }}>Visits + offers</div>
          </div>

          {/* 4. Colleges Engaging */}
          <div
            onClick={() => setOpenSheet("tile_colleges")}
            style={{ background: T.cardBg, border: "1px solid #1f2937", boxShadow: "inset 0 2px 0 0 #a78bfa", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#a78bfa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
          >
            <div style={{ minHeight: 22, fontSize: 10, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "center", lineHeight: 1.2 }}>Engaged Colleges</div>
            <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {journeyLoading && !programMetrics
                ? <div style={{ width: 18, height: 18, border: "2px solid #374151", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: "#a78bfa", lineHeight: 1 }}>{collegesEngagingProgramCount > 0 ? collegesEngagingProgramCount : (roster.length > 0 ? "0" : "—")}</div>
              }
            </div>
            <div style={{ minHeight: 16, fontSize: 10, color: T.textSecondary, textAlign: "center" }}>Unique colleges</div>
          </div>

          {/* 5. Players Heating Up */}
          <div
            onClick={() => setOpenSheet("tile_heating_up")}
            style={{ background: T.cardBg, border: "1px solid #1f2937", boxShadow: "inset 0 2px 0 0 #fb923c", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#fb923c"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
          >
            <div style={{ minHeight: 22, fontSize: 10, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "center", lineHeight: 1.2 }}>Heating Up</div>
            <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {journeyLoading && playersHeatingUpCount === null
                ? <div style={{ width: 18, height: 18, border: "2px solid #374151", borderTopColor: "#fb923c", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: "#fb923c", lineHeight: 1 }}>{playersHeatingUpCount ?? (roster.length > 0 ? "0" : "—")}</div>
              }
            </div>
            <div style={{ minHeight: 16, fontSize: 10, color: T.textSecondary, textAlign: "center" }}>Last 30 days</div>
          </div>

          {/* 6. Repeat-Interest Colleges */}
          <div
            onClick={() => setOpenSheet("tile_repeat_colleges")}
            style={{ background: T.cardBg, border: "1px solid #1f2937", boxShadow: "inset 0 2px 0 0 #e8a020", borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#e8a020"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; }}
          >
            <div style={{ minHeight: 22, fontSize: 10, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", textAlign: "center", lineHeight: 1.2 }}>Repeat Colleges</div>
            <div style={{ minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {journeyLoading && !programMetrics
                ? <div style={{ width: 18, height: 18, border: "2px solid #374151", borderTopColor: "#e8a020", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: "#e8a020", lineHeight: 1 }}>{repeatInterestCollegesCount > 0 ? repeatInterestCollegesCount : (roster.length > 0 ? "0" : "—")}</div>
              }
            </div>
            <div style={{ minHeight: 16, fontSize: 10, color: T.textSecondary, textAlign: "center" }}>Multiple athletes</div>
          </div>

        </div>
      </section>

      {/* ── SECTION 3: PROGRAM RECRUITING SUMMARY ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ width: 3, height: 20, background: "#e8a020", borderRadius: 2 }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: T.textPrimary }}>PROGRAM RECRUITING SUMMARY</div>
          {journeyLoading && !programMetrics && <div style={{ width: 14, height: 14, border: "2px solid #374151", borderTopColor: "#e8a020", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginLeft: "auto" }} />}
        </div>
        <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 24px" }}>
          {journeyLoading && !programMetrics ? (
            <div style={{ fontSize: 13, color: "#4b5563" }}>Loading…</div>
          ) : (() => {
            // ── Proof tier counts ──────────────────────────────────────────
            const commitCount        = programMetrics?.commitment_count      ?? 0;
            const offerCount         = programMetrics?.offer_count           ?? 0;
            const officialVisitCount = programMetrics?.official_visit_count  ?? 0;
            const unofficialVisitCount = programMetrics?.unofficial_visit_count ?? 0;
            const trueTractionCount  = programMetrics?.players_with_true_traction ?? 0;
            const anyInterest        = playersWithAnyInterest ?? 0;
            const totalColleges      = collegesEngagingProgramCount;

            // ── Named athlete + college for strongest proof ────────────────
            // tractionPairs is already sorted traction_level desc, then recency desc
            const topPair      = tractionPairs[0] || null;
            const proofAthlete = topPair?.athlete_name
                               || playersHeatingUpRows[0]?.athlete_name
                               || null;
            const proofCollege = topPair?.school_name
                               || collegesEngagingRows[0]?.college
                               || null;

            // ── Additional colleges beyond the named top ───────────────────
            const additionalColleges = proofCollege
              ? Math.max(0, totalColleges - 1)
              : totalColleges;

            // ── Recency ───────────────────────────────────────────────────
            const recentCount = recruitingMomentum.colleges30d;
            const hasRecent   = recentCount > 0;

            // ── Activity type labels from actual logged activity in recentJourneyActivity ─
            // Map raw activity_type values to plain coach/AD terms
            const _actTypeMap = {
              social_like: "likes", social_follow: "follows",
              dm_received: "direct messages", dm_sent: "direct messages",
              text_received: "texts", text_sent: "texts",
              generic_email: "emails", personal_email: "emails",
              camp_invite: "camp invites", generic_camp_invite: "camp invites",
              personal_camp_invite: "camp invites",
              camp_registered: "camp registrations", camp_attended: "camp attendance",
              post_camp_followup_sent: "post-camp follow-up",
              post_camp_personal_response: "post-camp follow-up",
              phone_call: "phone calls",
            };
            const _otherActTypes = new Set();
            for (const act of recentJourneyActivity) {
              if (proofCollege && act.school_name === proofCollege) continue;
              const lbl = _actTypeMap[act.activity_type];
              if (lbl) _otherActTypes.add(lbl);
            }
            const _typeArr = [..._otherActTypes];
            const earlyTypeDesc = _typeArr.length === 0
              ? "early activity"
              : _typeArr.length === 1
                ? _typeArr[0]
                : _typeArr.slice(0, -1).join(", ") + ", and " + _typeArr[_typeArr.length - 1];

            // ── Athlete distribution across additional colleges ─────────────
            const _additionalRows   = collegesEngagingRows.filter(r => r.college !== proofCollege);
            const _addAthSet        = new Set();
            for (const r of _additionalRows) { for (const n of r.athleteNames) _addAthSet.add(n); }
            const additionalAthleteCount = _addAthSet.size;

            // ── Signal quality classification ──────────────────────────────
            const _lightSig    = new Set(["likes", "follows"]);
            const _mediumSig   = new Set(["direct messages", "texts", "emails", "camp invites", "camp registrations"]);
            const _strongSig   = new Set(["phone calls", "post-camp follow-up", "camp attendance"]);
            const hasStrongOther = [..._otherActTypes].some(t => _strongSig.has(t));
            const hasMediumOther = [..._otherActTypes].some(t => _mediumSig.has(t));
            const hasLightOnly   = _otherActTypes.size > 0 && [..._otherActTypes].every(t => _lightSig.has(t));
            const allEarlyStage  = _additionalRows.length > 0 && _additionalRows.every(r => r.highestLevel <= 1);

            // ── S2: broader engagement summary (executive phrasing) ──────
            const buildS2 = (qualifier = "") => {
              if (additionalColleges <= 0) {
                const base = proofCollege
                  ? `${proofCollege} represents the only confirmed school engagement in the pipeline at this time`
                  : `No other schools are currently recorded as engaging the roster`;
                return qualifier ? `${base}${qualifier}.` : `${base}.`;
              }
              const n         = additionalColleges;
              const schoolStr = n === 1 ? "one additional school" : `${n} other schools`;
              const recentSuffix = hasRecent ? `, with ${recentCount} active in the last 30 days` : "";
              const sigSuffix    = hasStrongOther
                ? ", including some stronger direct contact signals"
                : hasMediumOther
                  ? `, primarily through ${earlyTypeDesc}`
                  : hasLightOnly
                    ? ", largely through early-stage awareness signals"
                    : _otherActTypes.size > 0
                      ? ` through ${earlyTypeDesc}`
                      : allEarlyStage
                        ? ", all at an early-stage engagement level"
                        : "";
              let core;
              if (additionalAthleteCount >= 3) {
                core = `In addition, ${schoolStr} have been active with ${additionalAthleteCount} athletes across the roster${sigSuffix}${recentSuffix}`;
              } else if (additionalAthleteCount === 2) {
                core = `In addition, ${schoolStr} have engaged two athletes${sigSuffix}${recentSuffix}`;
              } else if (additionalAthleteCount === 1 && n >= 2) {
                core = `In addition, ${schoolStr} have been active, though most of that attention remains centered on one athlete rather than distributed across the roster${recentSuffix}`;
              } else {
                core = `In addition, ${schoolStr} have been active with the roster${sigSuffix}${recentSuffix}`;
              }
              return qualifier ? `${core}${qualifier}.` : `${core}.`;
            };

            // ── S3: neutral analytical conclusion (AD-ready executive tone) ─
            // Reads like a short assessment of the program's overall recruiting profile.
            // No action language — analytical interpretation only.
            const buildS3 = (tier) => {
              const distQual = additionalColleges > 0
                ? additionalAthleteCount >= 3
                  ? "distributed across multiple athletes"
                  : additionalAthleteCount === 2
                    ? "split across two athletes"
                    : (additionalAthleteCount === 1 && additionalColleges >= 2)
                      ? "still centered on one athlete rather than distributed across the roster"
                      : null
                : null;
              const sigQual = hasStrongOther
                ? "mixed broader engagement including stronger contact signals"
                : hasMediumOther
                  ? "a mix of personal outreach and lighter contact signals"
                  : hasLightOnly
                    ? "primarily early-stage awareness activity"
                    : allEarlyStage
                      ? "early-stage engagement"
                      : "broader recruiting activity";
              const broadDesc = distQual
                ? `${sigQual} ${distQual}`
                : additionalColleges > 0 ? `${sigQual} across the roster` : null;

              if (tier === "commit") {
                return broadDesc
                  ? `At this stage, the program's recruiting profile reflects a signed commitment alongside ${broadDesc}.`
                  : `At this stage, the signed commitment stands as the program's headline recruiting outcome with limited additional activity on the board.`;
              }
              if (tier === "offer") {
                return broadDesc
                  ? `The current recruiting picture reflects a confirmed scholarship offer as the headline outcome, supported by ${broadDesc}.`
                  : `The current recruiting picture reflects a scholarship offer as the program's headline outcome, with limited broader activity logged at this stage.`;
              }
              if (tier === "official") {
                return broadDesc
                  ? `Overall, the program's recruiting activity reflects an official visit as its highest current milestone, supported by ${broadDesc}.`
                  : `Overall, the official visit represents the program's highest current recruiting milestone, with limited additional contact on the board at this stage.`;
              }
              if (tier === "unofficial") {
                return broadDesc
                  ? `At this stage, the program's recruiting activity reflects one clear higher-end outcome supported by ${broadDesc}.`
                  : `At this stage, the unofficial visit represents the program's highest current recruiting milestone, with no other confirmed direct contact on the board.`;
              }
              if (tier === "traction") {
                return broadDesc
                  ? `The current recruiting profile reflects direct personal contact at the higher end, with ${broadDesc} providing the broader base.`
                  : `The current recruiting profile reflects direct personal contact as the program's highest-stage activity, with limited broader-roster engagement at this stage.`;
              }
              if (tier === "early") {
                if (additionalColleges > 0) {
                  return distQual
                    ? `Overall, the current recruiting picture reflects early-stage college interest ${distQual}, with no confirmed direct coach contact logged to date.`
                    : `Overall, the current recruiting picture reflects early-stage college interest across the roster, with no confirmed direct coach contact logged to date.`;
                }
                return `Overall, the current recruiting picture reflects early-stage engagement with no direct coach contact on record at this stage.`;
              }
              return "";
            };

            // ── Contact description for true-traction tier (no visit/offer) ─
            const topStatus     = topPair?.relationship_status || "";
            const contactDesc   = topStatus === "invite"
              ? "a personal camp invite"
              : "direct coach contact";

            // ── Build sentences 1, 2, 3 ───────────────────────────────────
            let s1 = "", s2 = "", s3 = "";

            if (commitCount > 0) {
              s1 = proofAthlete && proofCollege
                ? `${proofAthlete} has committed to ${proofCollege}, representing the program's strongest confirmed recruiting outcome on the board.`
                : `The program has a signed commitment on the board, its strongest confirmed recruiting outcome this cycle.`;
              s2 = buildS2();
              s3 = buildS3("commit");

            } else if (offerCount > 0) {
              s1 = proofAthlete && proofCollege
                ? `${proofAthlete} currently holds a scholarship offer from ${proofCollege}, the program's highest confirmed recruiting outcome at this stage.`
                : proofAthlete
                  ? `${proofAthlete} holds a scholarship offer, the program's highest confirmed recruiting outcome this cycle.`
                  : `The program has a scholarship offer on the board, its highest confirmed recruiting outcome this cycle.`;
              s2 = buildS2();
              s3 = buildS3("offer");

            } else if (officialVisitCount > 0) {
              s1 = proofAthlete && proofCollege
                ? `${proofAthlete} currently has an official visit on record with ${proofCollege}, representing a significant milestone in the program's recruiting pipeline.`
                : `The program has an official visit on record, representing its highest-stage recruiting contact this cycle.`;
              s2 = buildS2();
              s3 = buildS3("official");

            } else if (unofficialVisitCount > 0) {
              s1 = proofAthlete && proofCollege
                ? `${proofAthlete} currently has an unofficial visit on record with ${proofCollege}, a meaningful recruiting milestone for the program${trueTractionCount > 1 ? `, with direct coach contact confirmed at ${trueTractionCount} schools overall` : ""}.`
                : `The program has an unofficial visit on record${trueTractionCount > 1 ? `, with direct coach contact confirmed at ${trueTractionCount} schools` : ""}, a meaningful recruiting milestone this cycle.`;
              s2 = buildS2();
              s3 = buildS3("unofficial");

            } else if (trueTractionCount > 0) {
              s1 = proofAthlete && proofCollege
                ? `${proofAthlete} holds the program's highest current recruiting contact, with ${contactDesc} confirmed from ${proofCollege}.`
                : proofAthlete
                  ? `${proofAthlete} leads the roster in recruiting contact, with ${contactDesc} on record with at least one college.`
                  : `The program has ${contactDesc} on record at ${trueTractionCount} school${trueTractionCount !== 1 ? "s" : ""}.`;
              s2 = additionalColleges > 0
                ? buildS2()
                : proofCollege
                  ? `${proofCollege} is the only school with direct contact on the board — no other schools have reached this level at this stage.`
                  : `No other schools have made direct coach contact with the roster at this stage.`;
              s3 = buildS3("traction");

            } else if (anyInterest > 0) {
              const isPersonal = playersHeatingUpRows[0]?.currentStage === "Personal Signal";
              s1 = isPersonal && proofAthlete && proofCollege
                ? `${proofAthlete} leads the roster in direct college contact, with personal outreach on record from ${proofCollege}.`
                : proofAthlete && proofCollege
                  ? `${proofAthlete} is drawing the most college attention on the roster at this stage, with ${proofCollege} among the schools currently engaged.`
                  : `The roster is drawing early college interest from ${totalColleges} school${totalColleges !== 1 ? "s" : ""}, with no direct coach contact confirmed to date.`;
              s2 = additionalColleges > 0
                ? buildS2("; no direct coach contact has been confirmed to date")
                : totalColleges === 1 && proofCollege
                  ? `${proofCollege} is the only school showing engagement at this stage, with no direct coach contact on record.`
                  : `No direct coach contact has been confirmed across the roster at this stage.`;
              s3 = buildS3("early");

            } else {
              s1 = `No college recruiting activity has been logged for the program yet.`;
              s2 = `Once athletes begin adding contacts, camp invites, visits, and communications, this summary will update automatically.`;
            }

            return (
              <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.75 }}>
                <p style={{ margin: "0 0 8px", color: "#d1d5db" }}>{s1}</p>
                {s2 && <p style={{ margin: s3 ? "0 0 8px" : "0" }}>{s2}</p>}
                {s3 && <p style={{ margin: 0 }}>{s3}</p>}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── SECTION 4: COACH UPDATE ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ width: 3, height: 20, background: "#34d399", borderRadius: 2 }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: T.textPrimary }}>COACH UPDATE</div>
          <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600 }}>recent recruiting changes in the selected period</span>
          {journeyLoading && Object.keys(athleteJourneys).length === 0 && (
            <div style={{ width: 14, height: 14, border: "2px solid #374151", borderTopColor: "#34d399", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginLeft: "auto" }} />
          )}
          {/* Period toggle */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {[
              ...(lastVisitDate ? [{ key: "last_visit", label: "Since Last Visit" }] : []),
              { key: "30d", label: "30D" },
              { key: "60d", label: "60D" },
              { key: "90d", label: "90D" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setCuPeriod(key)}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "1px solid",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer",
                  background: cuPeriod === key ? "#34d399" : "transparent",
                  color:      cuPeriod === key ? "#111827" : "#6b7280",
                  borderColor: cuPeriod === key ? "#34d399" : "#374151",
                  transition: "all 0.15s",
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 24px" }}>
          {journeyLoading && Object.keys(athleteJourneys).length === 0 ? (
            <div style={{ fontSize: 13, color: "#4b5563" }}>Loading…</div>
          ) : (
            <>
              {/* Intro line */}
              <p style={{ margin: "0 0 14px", fontSize: 14, color: coachUpdateData.totalFiltered > 0 ? "#d1d5db" : "#6b7280", lineHeight: 1.7 }}>
                {coachUpdateData.narrative}
              </p>

              {/* Per-athlete narrative blocks */}
              {coachUpdateData.athleteNarrativeBlocks.length > 0 && (
                <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  {coachUpdateData.athleteNarrativeBlocks.map((block, i) => (
                    <div key={i} style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 9, padding: "10px 14px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>
                        {block.athleteName}
                      </div>
                      <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.6 }}>
                        {block.narrative}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Period recap */}
              <div style={{ borderTop: "1px solid #1f2937", paddingTop: 16 }}>

                {/* Compact stat chips — 2×2 grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    {
                      value: coachUpdateData.athleteCount,
                      label: "Athletes active",
                      qualifier: null,
                      accent: "#34d399",
                      active: coachUpdateData.athleteCount > 0,
                    },
                    {
                      value: coachUpdateData.tractionAthletes,
                      label: "With new traction",
                      qualifier: coachUpdateData.tractionAthletes > 0 && coachUpdateData.tractionSchools > 1
                        ? `${coachUpdateData.tractionSchools} schools` : null,
                      accent: "#60a5fa",
                      active: coachUpdateData.tractionAthletes > 0,
                    },
                    {
                      value: coachUpdateData.majorCount,
                      label: "Major outcomes",
                      qualifier: coachUpdateData.majorCount > 0
                        ? [
                            coachUpdateData.commitCount > 0 && `${coachUpdateData.commitCount} commit`,
                            coachUpdateData.offerCount  > 0 && `${coachUpdateData.offerCount} offer`,
                            coachUpdateData.visitCount  > 0 && `${coachUpdateData.visitCount} visit`,
                          ].filter(Boolean).join(" · ")
                        : null,
                      accent: "#f59e0b",
                      active: coachUpdateData.majorCount > 0,
                    },
                    {
                      value: coachUpdateData.campRegCount,
                      label: coachUpdateData.campRowLabel,
                      qualifier: coachUpdateData.campRegAthletes > 1
                        ? `${coachUpdateData.campRegAthletes} athletes` : null,
                      accent: "#a78bfa",
                      active: coachUpdateData.campRegCount > 0,
                    },
                  ].map(({ value, label, qualifier, accent, active }) => (
                    <div key={label} style={{
                      background: active ? `${accent}0d` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${active ? accent + "28" : "#1a2535"}`,
                      borderRadius: 10,
                      padding: "12px 13px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: active ? accent : "#2d3748", lineHeight: 1 }}>{value}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? "#6b7280" : "#2d3748", lineHeight: 1.3, letterSpacing: "0.01em" }}>{label}</span>
                      {qualifier && <span style={{ fontSize: 10, color: "#4b5563", marginTop: 3 }}>{qualifier}</span>}
                    </div>
                  ))}
                </div>

                {/* Most active programs — ranked panel */}
                {coachUpdateData.topColleges.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1a2535", borderRadius: 10, padding: "11px 13px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 9 }}>
                      Most active programs
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {coachUpdateData.topColleges.map((col, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{
                            fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, lineHeight: 1,
                            color: i === 0 ? "#e8a020" : "#374151",
                            minWidth: 11, flexShrink: 0, textAlign: "right",
                          }}>{i + 1}</span>
                          <div style={{
                            height: 2, borderRadius: 1, flexShrink: 0,
                            width: i === 0 ? 20 : i === 1 ? 12 : 6,
                            background: i === 0 ? "rgba(232,160,32,0.40)" : i === 1 ? "rgba(148,163,184,0.18)" : "rgba(255,255,255,0.05)",
                          }} />
                          <span style={{
                            fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            color: i === 0 ? "#e8a020" : i === 1 ? "#9ca3af" : "#6b7280",
                          }}>{col}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </>
          )}
        </div>
      </section>


      {/* ── SECTION 6: COLLEGES ENGAGING THE PROGRAM ── */}
      {(collegesEngagingViewModel.length > 0 || journeyLoading) && (
        <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 24, background: "#a78bfa", borderRadius: 2 }} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, color: T.textPrimary }}>COLLEGES ENGAGING THE PROGRAM</div>
            <span style={{ fontSize: 11, color: "rgba(148,163,184,0.66)", fontWeight: 600 }}>all signal levels · cross-roster · click to expand</span>
          </div>
          {/* Section shell */}
          <div style={{ background: "#101A2B", border: "1px solid rgba(148,163,184,0.20)", borderRadius: 14, overflow: "hidden", boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset" }}>
            {collegesEngagingViewModel.length === 0 ? (
              <div style={{ padding: "28px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(148,163,184,0.66)", fontSize: 14 }}>
                <div style={{ width: 16, height: 16, border: "2px solid rgba(148,163,184,0.14)", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Loading…
              </div>
            ) : (
              <>
                {/* Column header band — distinct surface */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 110px 80px 110px 36px", gap: 8, padding: "10px 20px", background: "#0C1524", borderBottom: "1px solid rgba(148,163,184,0.18)", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.82)", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                  <span>College</span><span>Athletes</span><span>Highest Stage</span><span>Last Activity</span><span>Repeat Interest</span><span></span>
                </div>

                {collegesEngagingViewModel.slice(0, 20).map((col, i) => {
                  const isExpanded = expandedCollege === col.college;
                  const isLast = i === Math.min(collegesEngagingViewModel.length, 20) - 1;
                  const isEven = i % 2 === 1; // subtle alternating rhythm
                  const rowBase = isExpanded ? "#162338" : isEven ? "rgba(255,255,255,0.015)" : "transparent";
                  const stageColors = { "Visit / Offer": "#f59e0b", "True Traction": "#60a5fa", "Personal Signal": "#a78bfa", "Watching": "#6b7280" };
                  const sc = stageColors[col.highestStage] || "#6b7280";
                  const athleteCount = col.athletesEngaged;
                  const coachCount = col.coaches.length;

                  return (
                    <div key={col.college} style={{ borderBottom: (!isLast || isExpanded) ? "1px solid rgba(148,163,184,0.14)" : "none" }}>

                      {/* ── Collapsed summary row ── */}
                      <div
                        onClick={() => setExpandedCollege(isExpanded ? null : col.college)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 60px 110px 80px 110px 36px", gap: 8, padding: "12px 20px", alignItems: "center", cursor: "pointer", background: rowBase, transition: "background-color 180ms ease" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = isExpanded ? "#162338" : "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = rowBase; }}
                      >
                        {/* College name + secondary */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.96)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.college}</div>
                          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.66)", marginTop: 2 }}>
                            {athleteCount} athlete{athleteCount !== 1 ? "s" : ""}
                            {coachCount > 0 ? ` · ${coachCount} coach${coachCount !== 1 ? "es" : ""}` : ""}
                          </div>
                        </div>
                        {/* Athlete count */}
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: athleteCount >= 2 ? "#e8a020" : "rgba(148,163,184,0.50)", lineHeight: 1 }}>{athleteCount}</div>
                        {/* Stage badge — unchanged semantics */}
                        <div><span style={{ fontSize: 10, fontWeight: 700, color: sc, background: `${sc}14`, border: `1px solid ${sc}30`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{col.highestStage}</span></div>
                        {/* Last activity */}
                        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.66)" }}>{col.lastActivityDate ? new Date(col.lastActivityDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                        {/* Repeat label — unchanged semantics */}
                        <div>{col.repeatLabel ? <span style={{ fontSize: 10, fontWeight: 700, color: "#e8a020", background: "#e8a02014", border: "1px solid #e8a02030", borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{col.repeatLabel}</span> : <span style={{ fontSize: 11, color: "rgba(148,163,184,0.30)" }}>—</span>}</div>
                        {/* Chevron */}
                        <div style={{ fontSize: 14, color: isExpanded ? "rgba(232,160,32,0.75)" : "rgba(148,163,184,0.50)", textAlign: "center", transition: "transform 0.2s, color 180ms ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>⌄</div>
                      </div>

                      {/* ── Expanded detail band ── */}
                      <div style={{ maxHeight: isExpanded ? "900px" : "0px", overflow: "hidden", transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
                        <div style={{ background: "#162B47", borderTop: "1px solid rgba(148,163,184,0.22)", borderBottom: "1px solid rgba(148,163,184,0.18)", borderLeft: "2px solid rgba(232,160,32,0.65)", padding: "0 20px 20px" }}>
                          {/* Two-column layout — vertical divider between columns on desktop, stacks on mobile */}
                          <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>

                            {/* BLOCK 1 — COACHES */}
                            <div style={{ flex: "1 1 220px", minWidth: 200, paddingRight: 28, borderRight: "1px solid rgba(148,163,184,0.12)" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.82)", textTransform: "uppercase", letterSpacing: "0.13em", padding: "14px 0 8px", borderBottom: "1px solid rgba(148,163,184,0.14)" }}>Coaches</div>
                              {col.coaches.length === 0 ? (
                                <div style={{ fontSize: 12, color: "rgba(148,163,184,0.44)", fontStyle: "italic", padding: "10px 0" }}>No coach details logged yet</div>
                              ) : col.coaches.map((coach, ci) => (
                                <div
                                  key={ci}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setSelectedCoachContact({
                                      name: coach.name,
                                      title: coach.title,
                                      twitter: coach.twitter,
                                      collegeName: col.college,
                                      athleteNames: coach.athleteIds.map(id => roster.find(r => r.account_id === id)?.athlete_name || "Athlete").filter(Boolean),
                                      lastDate: coach.lastDate,
                                      lastActivityType: coach.lastActivityType,
                                    });
                                    setOpenSheet("coach_contact");
                                  }}
                                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: ci < col.coaches.length - 1 ? "1px solid rgba(148,163,184,0.14)" : "none", cursor: "pointer", transition: "opacity 180ms ease" }}
                                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.70"; }}
                                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.96)", fontSize: 13 }}>{coach.name}</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                                      {coach.title && <span style={{ fontSize: 11, color: "rgba(148,163,184,0.84)" }}>{coach.title}</span>}
                                      {coach.twitter && (
                                        <a
                                          href={`https://twitter.com/${coach.twitter}`}
                                          onClick={e => e.stopPropagation()}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{ fontSize: 11, color: "#60a5fa", textDecoration: "none" }}
                                        >
                                          @{coach.twitter}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 11, color: "rgba(148,163,184,0.50)", flexShrink: 0 }}>Details →</div>
                                </div>
                              ))}
                            </div>

                            {/* BLOCK 2 — ATHLETES */}
                            <div style={{ flex: "1 1 220px", minWidth: 200, paddingLeft: 28 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.82)", textTransform: "uppercase", letterSpacing: "0.13em", padding: "14px 0 8px", borderBottom: "1px solid rgba(148,163,184,0.14)" }}>Athletes</div>
                              {col.athletes.length === 0 ? (
                                <div style={{ fontSize: 12, color: "rgba(148,163,184,0.44)", fontStyle: "italic", padding: "10px 0" }}>No athlete detail available</div>
                              ) : col.athletes.map((ath, ai) => (
                                <div key={ai} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: ai < col.athletes.length - 1 ? "1px solid rgba(148,163,184,0.14)" : "none" }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.96)", fontSize: 13 }}>
                                      {ath.name}
                                      {ath.gradYear && <span style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginLeft: 6 }}>'{String(ath.gradYear).slice(-2)}</span>}
                                    </div>
                                    {ath.topCoachName && <div style={{ fontSize: 11, color: "rgba(148,163,184,0.66)", marginTop: 2 }}>via {ath.topCoachName}</div>}
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                                    {/* Stage badge — semantics unchanged */}
                                    <span style={{ fontSize: 10, fontWeight: 700, color: ath.stageColor, background: `${ath.stageColor}14`, border: `1px solid ${ath.stageColor}30`, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>{ath.stage}</span>
                                    {ath.lastDate && <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)" }}>{new Date(ath.lastDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>

                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}

                {collegesEngagingViewModel.length > 20 && (
                  <div style={{ padding: "12px 20px", textAlign: "center", fontSize: 13, color: "rgba(148,163,184,0.55)", borderTop: "1px solid rgba(148,163,184,0.14)" }}>+{collegesEngagingViewModel.length - 20} more colleges</div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── SECTION 8: RECENT RECRUITING ACTIVITY ── */}
      {(recentJourneyActivity.length > 0 || journeyLoading || Object.keys(athleteJourneys).length > 0) && (
        <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #1f2937" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: "#374151", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, color: T.textSecondary }}>RECENT RECRUITING ACTIVITY</span>
                <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600 }}>supporting evidence</span>
              </div>
              {journeyLoading && <div style={{ width: 14, height: 14, border: "2px solid #374151", borderTopColor: "#6b7280", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
            </div>
            {recentJourneyActivity.length === 0 ? (
              <div style={{ padding: "28px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: T.textMuted, margin: 0, lineHeight: 1.65 }}>{journeyLoading ? "Loading recruiting activity…" : "No recruiting activity logged yet."}</p>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px 100px 80px", gap: 8, padding: "8px 20px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <span>Athlete</span><span>College</span><span>Activity</span><span>Tier</span><span>Date</span>
                </div>
                {(activityExpanded ? recentJourneyActivity : recentJourneyActivity.slice(0, 5)).map((act, i, arr) => {
                  const tl = act._traction_level ?? 0;
                  const tierLabel = tl >= 4 ? "Major Outcome" : tl >= 2 ? "True Traction" : tl === 1 ? (SIGNAL_PERSONAL_TYPES.has(act.activity_type) ? "Personal Signal" : "Watching") : "Watching";
                  const tierColors = { "Major Outcome": "#f59e0b", "True Traction": "#60a5fa", "Personal Signal": "#34d399", "Watching": "#4b5563" };
                  const tc = tierColors[tierLabel] || "#4b5563";
                  return (
                    <div key={act.id || i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px 100px 80px", gap: 8, padding: "10px 20px", borderBottom: i < arr.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{act._athlete_name}</div>
                      <div style={{ fontSize: 13, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{act.school_name || "—"}</div>
                      <div style={{ fontSize: 11, color: T.textSecondary }}>{ACTIVITY_LABEL[act.activity_type] || act.activity_type}</div>
                      <div><span style={{ fontSize: 10, fontWeight: 700, color: tc, background: `${tc}14`, border: `1px solid ${tc}30`, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>{tierLabel}</span></div>
                      <div style={{ fontSize: 11, color: "#4b5563" }}>{act.activity_date || (act.created_at || "").slice(0, 10) || "—"}</div>
                    </div>
                  );
                })}
                {recentJourneyActivity.length > 5 && (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #1f2937", textAlign: "center" }}>
                    <button onClick={() => setActivityExpanded(e => !e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 12px" }}>
                      {activityExpanded ? "SHOW LESS" : `VIEW ALL ACTIVITY (${recentJourneyActivity.length})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── SECTION 9: PLAYERS NEEDING ATTENTION ── */}
      {(playersNeedingAttentionRows.length > 0) && (
        <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 24, background: "#f87171", borderRadius: 2 }} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, color: T.textPrimary }}>PLAYERS NEEDING ATTENTION</div>
            <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600 }}>stalled momentum or at-risk athletes</span>
          </div>
          <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 90px 110px 1fr 140px", gap: 8, padding: "10px 20px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span>Athlete</span><span>Last Activity</span><span>Stage</span><span>Reason</span><span>Suggested Action</span>
            </div>
            {playersNeedingAttentionRows.map((row, i) => {
              const actionColors = { "High Priority Conversation": "#f59e0b", "Track Closely": "#a78bfa", "Follow Up": "#60a5fa", "Encourage Follow-Up": "#34d399", "Check In": "#6b7280" };
              const ac = actionColors[row.suggestedAction] || "#6b7280";
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 90px 110px 1fr 140px", gap: 8, padding: "12px 20px", borderBottom: i < playersNeedingAttentionRows.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{row.athlete_name || "Athlete"}</div>
                    {row.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>'{String(row.athlete_grad_year).slice(-2)}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{row.lastActivity ? new Date(row.lastActivity + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                  <div><span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, background: "#1f2937", borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{row.stage}</span></div>
                  <div style={{ fontSize: 12, color: T.textSecondary }}>{row.reason}</div>
                  <div><span style={{ fontSize: 10, fontWeight: 700, color: ac, background: `${ac}14`, border: `1px solid ${ac}30`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{row.suggestedAction}</span></div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── ROSTER CAMP OVERVIEW ── */}
      <section style={{ padding: "0 24px 28px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>

          {/* Left: Camp roster board */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #1f2937" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: "#374151", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: T.textMuted }}>ROSTER CAMP OVERVIEW</span>
              </div>
              <button
                onClick={() => setOpenSheet("roster")}
                style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Full Roster →
              </button>
            </div>
            {boardRoster.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#4b5563", margin: 0 }}>No athletes yet. Share your invite code to connect players.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 46px 90px 50px", gap: 8, padding: "8px 20px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <span>Athlete</span><span>Class</span><span>Next Camp</span><span style={{ textAlign: "right" }}>Camps</span>
                </div>
                {boardRoster.slice(0, 8).map((r, i) => {
                  const athleteCamps = campsByAccountId[r.account_id] || [];
                  const noCamps = athleteCamps.length === 0;
                  const nextCamp = getNextCamp(r);
                  const days = nextCamp ? daysUntil(nextCamp.start_date) : null;
                  return (
                    <div key={r.id || i} style={{ display: "grid", gridTemplateColumns: "1fr 46px 90px 50px", gap: 8, padding: "10px 20px", borderBottom: i < Math.min(boardRoster.length, 8) - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                      <div style={{ fontWeight: 500, color: "#d1d5db", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.athlete_name || "Athlete"}</div>
                      <div style={{ fontSize: 12, color: T.textMuted }}>{r.athlete_grad_year ? `'${String(r.athlete_grad_year).slice(-2)}` : "—"}</div>
                      <div style={{ fontSize: 12, color: nextCamp ? "#d1d5db" : "#4b5563" }}>
                        {nextCamp
                          ? <><div>{new Date(nextCamp.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                              {days !== null && days <= 7 && <div style={{ fontSize: 10, color: "#f59e0b" }}>{days === 0 ? "Today" : `${days}d`}</div>}
                            </>
                          : <span style={{ fontSize: 11 }}>—</span>
                        }
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: noCamps ? "#f87171" : "#6b7280", textAlign: "right" }}>{athleteCamps.length}</div>
                    </div>
                  );
                })}
                {boardRoster.length > 8 && (
                  <div onClick={() => setOpenSheet("roster")} style={{ padding: "10px 20px", textAlign: "center", fontSize: 12, color: T.textMuted, fontWeight: 600, cursor: "pointer", borderTop: "1px solid #1f2937" }}>
                    View all {boardRoster.length} athletes →
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Upcoming Camps */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
            <div
              onClick={() => setOpenSheet("monthly")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", borderBottom: "1px solid #1f2937" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: "#374151", borderRadius: 2 }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: T.textMuted }}>UPCOMING CAMPS</span>
              </div>
              <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>View Month →</span>
            </div>
            <div style={{ padding: "8px 0" }}>
              {nextCamps.length === 0 ? (
                <p style={{ fontSize: 13, color: "#4b5563", padding: "16px 20px", margin: 0 }}>No upcoming camps scheduled.</p>
              ) : (
                nextCamps.map(({ athlete, camp, date }, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "10px 20px", borderBottom: i < nextCamps.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                    <div style={{ background: "rgba(75,85,99,0.2)", color: T.textMuted, fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, textAlign: "center", flexShrink: 0, minWidth: 44 }}>
                      <div>{date.toLocaleDateString("en-US", { month: "short" })}</div>
                      <div style={{ fontSize: 15, lineHeight: 1 }}>{date.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{camp.school_name || camp.host_org || camp.ryzer_program_name || camp.camp_name}</div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 1 }}>{athlete}</div>
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
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, color: T.textPrimary }}>RECENT MESSAGES</span>
              </div>
              <span style={{ fontSize: 12, color: "#e8a020", fontWeight: 600 }}>Compose + View →</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {messages.slice(0, 3).map((m, i) => (
                <div key={m.id || i} style={{ padding: "12px 20px", borderBottom: i < Math.min(messages.length, 3) - 1 ? "1px solid #1f2937" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      → {m.recipient_name || "All Athletes"}
                    </span>
                    <span style={{ fontSize: 11, color: "#4b5563", flexShrink: 0 }}>{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : ""}</span>
                  </div>
                  {m.subject && <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", marginBottom: 2 }}>{m.subject}</div>}
                  <div style={{ fontSize: 13, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.message}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: T.textPrimary }}>
                {openSheet === "roster"               && `ATHLETE ROSTER — ${filteredRoster.length} OF ${roster.length}`}
                {openSheet === "monthly"              && (monthlyView === "upcoming" ? "UPCOMING CAMPS" : `CAMP ACTIVITY — ${_monthName.toUpperCase()}`)}
                {openSheet === "schools"              && `SCHOOLS ENGAGED — ${schoolRows.length}`}
                {openSheet === "noCamps"              && `WATCH LIST — ${attentionItems.length}`}
                {openSheet === "message"              && "MESSAGE ROSTER"}
                {openSheet === "code"                 && "INVITE CODE"}
                {openSheet === "tile_any_interest"    && `PLAYERS W/ ANY INTEREST — ${playersWithAnyInterest ?? 0}`}
                {openSheet === "tile_true_traction"   && `PLAYERS W/ TRUE TRACTION — ${tractionPairs.length > 0 ? new Set(tractionPairs.map(p => p.athlete_name)).size : (programMetrics?.players_with_true_traction ?? 0)}`}
                {openSheet === "tile_visits_offers"   && `VISITS & OFFERS — ${tractionPairs.filter(p => p.traction_level === 4).length}`}
                {openSheet === "tile_colleges"        && `COLLEGES ENGAGING PROGRAM — ${collegesEngagingRows.length}`}
                {openSheet === "tile_heating_up"      && `PLAYERS HEATING UP — ${playersHeatingUpRows.length}`}
                {openSheet === "tile_repeat_colleges" && `REPEAT-INTEREST COLLEGES — ${collegesEngagingRows.filter(r => r.repeatInterest).length}`}
                {openSheet === "coach_contact"        && (selectedCoachContact ? `COACH — ${selectedCoachContact.name.toUpperCase()}` : "COACH CONTACT")}
                {openSheet === "invite_parents"       && "INVITE PARENTS"}
                {openSheet === "my_account"           && "MY ACCOUNT"}
                {openSheet === "coach_tools"          && "TOOLS"}
              </div>
              <button
                onClick={() => setOpenSheet(null)}
                style={{ background: "none", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 22, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                aria-label="Close"
              >✕</button>
            </div>

            {/* Sheet body */}
            <div style={{ padding: "16px 20px 32px" }}>

              {/* ── ROSTER SHEET ── */}
              {openSheet === "roster" && (
                <>
                  <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>
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
                        ? <p style={{ fontSize: 14, color: T.textSecondary }}>No athletes connected yet. Once athletes connect to your roster, you'll be able to track camps, activity, and who may need support.</p>
                        : <p style={{ fontSize: 14, color: T.textSecondary }}>No athletes match this filter.</p>
                      }
                    </div>
                  ) : (
                    <>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 52px 80px 60px 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                                <span style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{r.athlete_name || "Athlete"}</span>
                              </div>
                              {r.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>Class of {r.athlete_grad_year}</div>}
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
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>
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
                          <p style={{ fontSize: 14, color: T.textSecondary }}>No camp activity {upcomingOnly ? "upcoming" : "for this month"} yet. As athletes register for camps, this view will help you track who is going where and what needs follow-up.</p>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 1fr", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            <span>Camp</span><span>Date</span><span>Location</span><span>Athletes</span>
                          </div>
                          {campGroups.map(({ camp, athletes }, i) => {
                            const d = new Date(camp.start_date + "T00:00:00");
                            const days = daysUntil(camp.start_date);
                            return (
                              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 100px 1fr", gap: 8, padding: "12px 0", borderBottom: i < campGroups.length - 1 ? "1px solid #1f2937" : "none", alignItems: "start" }}>
                                <div>
                                  <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 13, lineHeight: 1.3 }}>{camp.school_name || camp.camp_name}</div>
                                  {days !== null && days >= 0 && days <= 14 && (
                                    <div style={{ fontSize: 10, color: days <= 7 ? "#f59e0b" : "#6b7280", marginTop: 2 }}>{days === 0 ? "Today" : `${days}d away`}</div>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: "#d1d5db" }}>
                                  {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </div>
                                <div style={{ fontSize: 12, color: T.textSecondary }}>
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
                          <p style={{ fontSize: 14, color: T.textSecondary }}>No camp activity {upcomingOnly ? "upcoming" : "this month"} yet.</p>
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
                              <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14, marginBottom: 6 }}>
                                {r.athlete_name || "Athlete"}
                                {r.athlete_grad_year && <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>Class of {r.athlete_grad_year}</span>}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {camps.map((c, ci) => {
                                  const days = daysUntil(c.start_date);
                                  return (
                                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>
                                        {new Date(c.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </span>
                                      <span style={{ fontSize: 13, color: "#d1d5db", flex: 1 }}>{c.school_name || c.host_org || c.ryzer_program_name || c.camp_name}</span>
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
                    <p style={{ fontSize: 14, color: T.textSecondary }}>No school activity tracked yet. As athletes save camps, register, and log activity, this view will show which programs are most connected to your roster.</p>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>
                      Programs ranked by athlete engagement across the roster. Tap a school to see which athletes are connected.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px 70px 50px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                              <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{s.name}</div>
                              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{isExpanded ? "▲ collapse" : "▼ show athletes"}</div>
                            </div>
                            <div style={{ fontSize: 11, color: T.textMuted }}>{s.division || "—"}</div>
                            <div style={{ textAlign: "center" }}>
                              <span style={{ background: "rgba(232,160,32,0.12)", color: "#e8a020", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{s.count}</span>
                            </div>
                            <div style={{ fontSize: 13, color: T.textSecondary, textAlign: "center" }}>{s.athletes.size}</div>
                          </div>
                          {isExpanded && (
                            <div style={{ background: "#0d1421", borderRadius: 8, padding: "10px 14px", marginBottom: 8, borderBottom: i < schoolRows.length - 1 ? "1px solid #1f2937" : "none" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Athletes</div>
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
                    <p style={{ fontSize: 14, color: T.textSecondary }}>Nothing needs attention right now. This view will surface athletes and camp situations that may need follow-up.</p>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>
                      Athletes that may benefit from a check-in or follow-up, sorted by priority.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>Issue</span><span>Action</span>
                    </div>
                    {attentionItems.map((item, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 8, padding: "12px 0", borderBottom: i < attentionItems.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{item.athlete.athlete_name || "Athlete"}</div>
                          {item.athlete.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>Class of {item.athlete.athlete_grad_year}</div>}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.issue}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{item.detail}</div>
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
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, marginBottom: 14, color: T.textSecondary }}>COMPOSE</div>
                    <form onSubmit={handleSendMessage} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>To</label>
                        <select
                          value={recipient}
                          onChange={e => setRecipient(e.target.value)}
                          style={{ width: "100%", background: T.pageBg, border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.textPrimary, outline: "none", boxSizing: "border-box" }}
                        >
                          <option value="all">All Athletes ({roster.length})</option>
                          {roster.map(r => (
                            <option key={r.id} value={r.id}>{r.athlete_name || "Athlete"}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Subject (optional)</label>
                        <input
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          placeholder="Subject…"
                          style={{ width: "100%", background: T.pageBg, border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.textPrimary, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: T.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Message</label>
                        <textarea
                          value={msgBody}
                          onChange={e => setMsgBody(e.target.value)}
                          placeholder="Write your message…"
                          required
                          style={{ width: "100%", background: T.pageBg, border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.textPrimary, outline: "none", boxSizing: "border-box", resize: "vertical", minHeight: 100, fontFamily: "'DM Sans', system-ui" }}
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
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, marginBottom: 14, color: T.textSecondary }}>SENT ({messages.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {messages.map((m, i) => (
                          <div key={m.id || i} style={{ padding: "12px 0", borderBottom: i < messages.length - 1 ? "1px solid #1f2937" : "none" }}>
                            {m.recipient_name && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>→ {m.recipient_name}</div>
                            )}
                            {!m.recipient_name && !m.recipient_athlete_id && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>→ All Athletes</div>
                            )}
                            {m.subject && <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, marginBottom: 4 }}>{m.subject}</div>}
                            <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.message}</div>
                            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TILE 1: Players w/ Any Interest ── */}
              {openSheet === "tile_any_interest" && (() => {
                const rows = roster.map(r => {
                  const j = athleteJourneys[r.account_id];
                  if (!j) return null;
                  const engaging = Object.values(j.school_traction || {}).filter(s => s.traction_level >= 1);
                  if (engaging.length === 0) return null;
                  const hl = j.highest_traction_level || 0;
                  let stage;
                  if (hl >= 4) stage = "Visit / Offer";
                  else if (hl >= 2) stage = "True Traction";
                  else if (hl === 1) stage = engaging.some(s => SIGNAL_PERSONAL_TYPES.has(s.top_activity_type)) ? "Personal Signal" : "Watching";
                  else stage = "Watching";
                  const stageColor = hl >= 4 ? "#f59e0b" : hl >= 2 ? "#60a5fa" : hl === 1 ? "#9ca3af" : "#4b5563";
                  const topCollege = [...engaging].sort((a, b) => b.traction_level - a.traction_level || (b.last_activity_date || "").localeCompare(a.last_activity_date || ""))[0]?.school_name || "—";
                  const lastDate = j.last_activity_date || "";
                  return { athlete_name: r.athlete_name, athlete_grad_year: r.athlete_grad_year, stage, stageColor, schoolsEngaging: engaging.length, topCollege, lastDate };
                }).filter(Boolean);
                rows.sort((a, b) => {
                  const so = { "Visit / Offer": 0, "True Traction": 1, "Personal Signal": 2, "Watching": 3 };
                  return (so[a.stage] ?? 3) - (so[b.stage] ?? 3) || (b.lastDate || "").localeCompare(a.lastDate || "");
                });
                return rows.length === 0 ? (
                  <p style={{ fontSize: 14, color: T.textMuted }}>No athletes with recruiting interest logged yet.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>All athletes with at least one recruiting signal from any college.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 110px 50px 1fr 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>Stage</span><span>Schools</span><span>Top College</span><span>Last Activity</span>
                    </div>
                    {rows.map((r, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 110px 50px 1fr 80px", gap: 8, padding: "11px 0", borderBottom: i < rows.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{r.athlete_name}</div>
                          {r.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted }}>Class of {r.athlete_grad_year}</div>}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: r.stageColor }}>{r.stage}</div>
                        <div style={{ fontSize: 13, color: "#d1d5db", textAlign: "center" }}>{r.schoolsEngaging}</div>
                        <div style={{ fontSize: 13, color: T.textSecondary }}>{r.topCollege}</div>
                        <div style={{ fontSize: 12, color: T.textMuted }}>{r.lastDate ? new Date(r.lastDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* ── TILE 2: Players w/ True Traction ── */}
              {openSheet === "tile_true_traction" && (() => {
                return tractionPairs.length === 0 ? (
                  <p style={{ fontSize: 14, color: T.textMuted }}>No athletes with verified personal contact or higher logged yet.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>All athlete-school pairs with verified personal contact (level 2+). Sorted by traction level, then recency.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 100px 80px 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>School</span><span>Status</span><span>Level</span><span>Last Activity</span>
                    </div>
                    {tractionPairs.map((p, i) => {
                      const statusColor = RELATIONSHIP_COLOR[p.relationship_status] || "#9ca3af";
                      const levelLabel = p.traction_level >= 4 ? "Major Outcome" : p.traction_level === 3 ? "Direct Action" : "Verified Contact";
                      return (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 100px 80px 80px", gap: 8, padding: "11px 0", borderBottom: i < tractionPairs.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{p.athlete_name}</div>
                            {p.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted }}>Class of {p.athlete_grad_year}</div>}
                          </div>
                          <div style={{ fontSize: 13, color: "#d1d5db" }}>{p.school_name}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{RELATIONSHIP_LABEL[p.relationship_status] || p.relationship_status}</div>
                          <div style={{ fontSize: 11, color: T.textSecondary }}>{levelLabel}</div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{p.last_activity_date ? new Date(p.last_activity_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              {/* ── TILE 3: Visits / Offers ── */}
              {openSheet === "tile_visits_offers" && (() => {
                const voRows = tractionPairs.filter(p => p.traction_level === 4);
                const outcomeLabel = (rs) => {
                  if (rs === "committed") return "Commitment";
                  if (rs === "offer")     return "Offer";
                  if (rs === "visit")     return "Visit";
                  return RELATIONSHIP_LABEL[rs] || rs;
                };
                const outcomeColor = (rs) => {
                  if (rs === "committed") return "#e8a020";
                  if (rs === "offer")     return "#f59e0b";
                  if (rs === "visit")     return "#34d399";
                  return "#9ca3af";
                };
                return voRows.length === 0 ? (
                  <p style={{ fontSize: 14, color: T.textMuted }}>No visits or offers logged yet.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>All athletes with a visit request, completed visit, offer, or commitment on record.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 100px 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>School</span><span>Outcome</span><span>Last Activity</span>
                    </div>
                    {voRows.map((p, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 100px 80px", gap: 8, padding: "11px 0", borderBottom: i < voRows.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{p.athlete_name}</div>
                          {p.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted }}>Class of {p.athlete_grad_year}</div>}
                        </div>
                        <div style={{ fontSize: 13, color: "#d1d5db" }}>{p.school_name}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: outcomeColor(p.relationship_status) }}>{outcomeLabel(p.relationship_status)}</div>
                        <div style={{ fontSize: 12, color: T.textMuted }}>{p.last_activity_date ? new Date(p.last_activity_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* ── TILE 4: Colleges Engaging Program ── */}
              {openSheet === "tile_colleges" && (() => {
                return collegesEngagingRows.length === 0 ? (
                  <p style={{ fontSize: 14, color: T.textMuted }}>No colleges with recruiting activity logged yet.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>All colleges with at least one recruiting signal logged across the program. Sorted by highest traction level.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 60px 100px 1fr 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>College</span><span>Athletes</span><span>Stage</span><span>Athletes</span><span>Last Activity</span>
                    </div>
                    {collegesEngagingRows.map((c, i) => {
                      const stageColor = c.highestLevel >= 4 ? "#f59e0b" : c.highestLevel >= 2 ? "#60a5fa" : "#9ca3af";
                      return (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 60px 100px 1fr 80px", gap: 8, padding: "11px 0", borderBottom: i < collegesEngagingRows.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                          <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{c.college}</div>
                          <div style={{ fontSize: 13, color: "#d1d5db", textAlign: "center" }}>{c.athletesEngaged}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: stageColor }}>{c.highestStage}</div>
                          <div style={{ fontSize: 12, color: T.textSecondary }}>{c.athleteNames.slice(0, 3).join(", ")}{c.athleteNames.length > 3 ? ` +${c.athleteNames.length - 3}` : ""}</div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{c.lastActivityDate ? new Date(c.lastActivityDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              {/* ── TILE 5: Players Heating Up ── */}
              {openSheet === "tile_heating_up" && (() => {
                return playersHeatingUpRows.length === 0 ? (
                  <p style={{ fontSize: 14, color: T.textMuted }}>No athletes with activity in the last 30 days.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>Athletes with recruiting activity in the last 30 days, ranked by stage and momentum.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 50px 1fr 90px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>Athlete</span><span>Stage</span><span>Schools</span><span>Top College</span><span>Coach Action</span>
                    </div>
                    {playersHeatingUpRows.map((r, i) => {
                      const stageColor = r.currentStage === "Visit / Offer" ? "#f59e0b" : r.currentStage === "True Traction" ? "#60a5fa" : r.currentStage === "Personal Signal" ? "#a78bfa" : "#9ca3af";
                      const actionColor = r.coachAttention === "High Priority" ? "#f87171" : r.coachAttention === "Heating Up" ? "#fb923c" : "#6b7280";
                      return (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 50px 1fr 90px", gap: 8, padding: "11px 0", borderBottom: i < playersHeatingUpRows.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{r.athlete_name}</div>
                            {r.athlete_grad_year && <div style={{ fontSize: 11, color: T.textMuted }}>Class of {r.athlete_grad_year}</div>}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: stageColor }}>{r.currentStage}</div>
                          <div style={{ fontSize: 13, color: "#d1d5db", textAlign: "center" }}>{r.schoolsEngaging}</div>
                          <div style={{ fontSize: 13, color: T.textSecondary }}>{r.topCollege}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: actionColor }}>{r.coachAttention}</div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              {/* ── TILE 6: Repeat-Interest Colleges ── */}
              {openSheet === "tile_repeat_colleges" && (() => {
                const repeatRows = collegesEngagingRows.filter(r => r.repeatInterest);
                return repeatRows.length === 0 ? (
                  <p style={{ fontSize: 14, color: T.textMuted }}>No colleges engaging multiple athletes yet.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px" }}>Colleges showing interest in 2 or more athletes on the roster, or with repeated contact. Sorted by highest traction level.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 60px 100px 1fr 80px", gap: 8, padding: "0 0 8px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      <span>College</span><span>Athletes</span><span>Stage</span><span>Athletes</span><span>Last Activity</span>
                    </div>
                    {repeatRows.map((c, i) => {
                      const stageColor = c.highestLevel >= 4 ? "#f59e0b" : c.highestLevel >= 2 ? "#60a5fa" : "#9ca3af";
                      return (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 60px 100px 1fr 80px", gap: 8, padding: "11px 0", borderBottom: i < repeatRows.length - 1 ? "1px solid #1f2937" : "none", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14 }}>{c.college}</div>
                            {c.repeatLabel && <div style={{ fontSize: 11, color: "#e8a020" }}>{c.repeatLabel}</div>}
                          </div>
                          <div style={{ fontSize: 13, color: "#d1d5db", textAlign: "center" }}>{c.athletesEngaged}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: stageColor }}>{c.highestStage}</div>
                          <div style={{ fontSize: 12, color: T.textSecondary }}>{c.athleteNames.slice(0, 3).join(", ")}{c.athleteNames.length > 3 ? ` +${c.athleteNames.length - 3}` : ""}</div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{c.lastActivityDate ? new Date(c.lastActivityDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              {/* ── Coach contact popup ── */}
              {openSheet === "coach_contact" && selectedCoachContact && (() => {
                const c = selectedCoachContact;
                const twitterHandle = c.twitter ? c.twitter.replace(/^@/, "") : null;
                const lastDateFmt = c.lastDate ? new Date(c.lastDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
                const lastActLabel = c.lastActivityType ? (ACTIVITY_LABEL[c.lastActivityType] || c.lastActivityType) : null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {/* Identity */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: T.textPrimary, letterSpacing: 1, lineHeight: 1 }}>{c.name}</div>
                      {c.title && <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>{c.title}</div>}
                      <div style={{ fontSize: 13, color: "#a78bfa", marginTop: 4, fontWeight: 600 }}>{c.collegeName}</div>
                    </div>

                    {/* Contact fields */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, borderTop: "1px solid #1f2937", marginBottom: 20 }}>
                      {/* Twitter */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #1f2937" }}>
                        <div style={{ width: 68, fontSize: 11, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>X / Twitter</div>
                        {twitterHandle
                          ? <a href={`https://twitter.com/${twitterHandle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}>@{twitterHandle}</a>
                          : <span style={{ fontSize: 13, color: "#374151" }}>Not on record</span>
                        }
                      </div>
                      {/* Email */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #1f2937" }}>
                        <div style={{ width: 68, fontSize: 11, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Email</div>
                        <span style={{ fontSize: 13, color: "#374151" }}>Not on record</span>
                      </div>
                      {/* Cell */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
                        <div style={{ width: 68, fontSize: 11, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Cell</div>
                        <span style={{ fontSize: 13, color: "#374151" }}>Not on record</span>
                      </div>
                    </div>

                    {/* Associated athletes */}
                    {c.athleteNames.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Athletes</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {c.athleteNames.map((name, ni) => (
                            <span key={ni} style={{ background: "#1f2937", color: "#d1d5db", fontSize: 13, fontWeight: 600, padding: "5px 12px", borderRadius: 20 }}>{name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Last interaction */}
                    {(lastDateFmt || lastActLabel) && (
                      <div style={{ borderTop: "1px solid #1f2937", paddingTop: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Most Recent Interaction</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          {lastActLabel && <span style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, background: "#1f2937", borderRadius: 20, padding: "3px 10px" }}>{lastActLabel}</span>}
                          {lastDateFmt && <span style={{ fontSize: 12, color: T.textMuted }}>{lastDateFmt}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Invite code sheet ── */}
              {openSheet === "code" && (
                <>
                  <p style={{ fontSize: 14, color: T.textMuted, marginTop: 0, marginBottom: 24 }}>
                    Share this code with athletes and parents. They enter it during signup at <span style={{ color: T.textSecondary }}>urecruithq.com</span> to connect with you automatically.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 700, color: "#e8a020", letterSpacing: 3, background: T.pageBg, border: "1px solid #374151", borderRadius: 10, padding: "16px 24px" }}>
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

              {/* ── Invite Parents sheet ── */}
              {openSheet === "invite_parents" && (() => {
                const coachName   = [coach.first_name, coach.last_name].filter(Boolean).join(" ") || null;
                const schoolName  = coach.school_or_org || null;
                const inviteCode  = coach.invite_code || null;
                const codeDisplay = inviteCode || "—";

                // Signature lines — only include lines that have values
                const sigLines = [coachName, schoolName].filter(Boolean);
                const signature = sigLines.length > 0 ? sigLines.join("\n") : null;

                const emailSubject = "Optional Resource for Families Interested in College Football Recruiting";

                const emailBody = [
                  "Dear Parents,",
                  "",
                  "I want to share an optional resource that may be valuable for families with athletes who are interested in playing at the next level.",
                  "",
                  "Many families begin this journey knowing their athlete has the dream to play college football, but not yet knowing how to navigate the process. As things begin to move, it can quickly become a mix of camp choices, registrations, dates, travel plans, costs, communication, and uncertainty about what matters most. URecruitHQ was created by parents who went through that process themselves and wanted a better way to stay organized and make smarter decisions along the way.",
                  "",
                  "This is not something required by our program, and I am not asking every family to use it. I am simply making you aware of it because some families may find it helpful to have more structure, visibility, and clarity as they support their athlete's recruiting journey.",
                  "",
                  "Please note that this is a paid resource, so participation is entirely your choice. There is a free demo available if you would like to evaluate it first.",
                  "",
                  inviteCode
                    ? `If you choose to subscribe and are prompted for an invite code, please use: ${inviteCode}. Using that code allows me to have visibility into my players' recruiting journey inside the coach view, which can help me stay informed on college interest, better understand momentum, and support families and athletes more effectively.`
                    : "If you choose to subscribe, using my invite code allows me to have visibility into my players' recruiting journey inside the coach view, which can help me stay informed on college interest, better understand momentum, and support families and athletes more effectively.",
                  "",
                  "I am sharing it as a resource only, with the hope that it may help some families feel better prepared and less overwhelmed as the process develops.",
                  "",
                  "Thank you,",
                  "",
                  ...(signature ? [signature] : []),
                ].join("\n");

                const textTemplate = inviteCode
                  ? `Hi parents — I wanted to share an optional resource that may be helpful for families with athletes interested in playing college football. URecruitHQ was created by parents who went through the process themselves and wanted a better way to stay organized around camps, dates, registrations, and recruiting movement. This is not required by our program — I'm simply sharing it as a resource some families may find helpful. There is a free demo available, and if you choose to subscribe, please use my invite code: ${inviteCode}. Using that code allows me to stay informed on my players' recruiting journey and better support families throughout the process.`
                  : `Hi parents — I wanted to share an optional resource that may be helpful for families with athletes interested in playing college football. URecruitHQ was created by parents who went through the process themselves and wanted a better way to stay organized around camps, dates, registrations, and recruiting movement. This is not required by our program — I'm simply sharing it as a resource some families may find helpful. There is a free demo available at urecruithq.com.`;

                const SectionLabel = ({ children }) => (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                    {children}
                  </div>
                );

                const CopyBtn = ({ onClick, active, children }) => (
                  <button
                    onClick={onClick}
                    style={{ background: "#111827", border: "1px solid #374151", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: active ? "#34d399" : T.textSecondary, cursor: "pointer", flexShrink: 0 }}
                  >
                    {children}
                  </button>
                );

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

                    {/* ── Invite Code ── */}
                    <div style={{ marginBottom: 24 }}>
                      <SectionLabel>Your Invite Code</SectionLabel>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 30, fontWeight: 700, color: "#e8a020", letterSpacing: 4, background: T.pageBg, border: "1px solid #374151", borderRadius: 10, padding: "14px 22px" }}>
                          {codeDisplay}
                        </div>
                        <button
                          onClick={copyCode}
                          style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                        >
                          {copied ? "✓ Copied!" : "Copy Code"}
                        </button>
                      </div>
                      <p style={{ fontSize: 12, color: "#4b5563", marginTop: 10, marginBottom: 0 }}>
                        Parents enter this code during signup at urecruithq.com to connect to your program.
                      </p>
                    </div>

                    <div style={{ borderTop: "1px solid #1f2937", marginBottom: 24 }} />

                    {/* ── Email Template ── */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                        <SectionLabel>Parent Email Template</SectionLabel>
                        <CopyBtn
                          onClick={() => {
                            const full = `Subject: ${emailSubject}\n\n${emailBody}`;
                            navigator.clipboard.writeText(full).then(() => {
                              setCopiedTemplate(true);
                              setTimeout(() => setCopiedTemplate(false), 2500);
                            });
                          }}
                          active={copiedTemplate}
                        >
                          {copiedTemplate ? "✓ Copied!" : "Copy Email"}
                        </CopyBtn>
                      </div>
                      {/* Subject line display */}
                      <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderBottom: "none", borderRadius: "10px 10px 0 0", padding: "10px 16px" }}>
                        <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600, marginRight: 8 }}>SUBJECT</span>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>{emailSubject}</span>
                      </div>
                      {/* Body */}
                      <div style={{ background: T.pageBg, border: "1px solid #1f2937", borderRadius: "0 0 10px 10px", padding: "14px 16px", fontSize: 13, color: "#9ca3af", lineHeight: 1.75, whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: 320, overflowY: "auto" }}>
                        {emailBody}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid #1f2937", marginBottom: 24 }} />

                    {/* ── Text Template ── */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                        <SectionLabel>Parent Text / Message Template</SectionLabel>
                        <CopyBtn
                          onClick={() => {
                            navigator.clipboard.writeText(textTemplate).then(() => {
                              setCopiedText(true);
                              setTimeout(() => setCopiedText(false), 2500);
                            });
                          }}
                          active={copiedText}
                        >
                          {copiedText ? "✓ Copied!" : "Copy Text"}
                        </CopyBtn>
                      </div>
                      <div style={{ background: T.pageBg, border: "1px solid #1f2937", borderRadius: 10, padding: "14px 16px", fontSize: 13, color: "#9ca3af", lineHeight: 1.75 }}>
                        {textTemplate}
                      </div>
                      <p style={{ fontSize: 11, color: "#374151", marginTop: 8, marginBottom: 0 }}>
                        Suitable for team apps, group texts, or direct message platforms.
                      </p>
                    </div>

                  </div>
                );
              })()}

              {/* ── Coach Tools sheet ── */}
              {openSheet === "coach_tools" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    {
                      icon: "💬",
                      label: "Message Roster",
                      sub: `${messages.length} message${messages.length !== 1 ? "s" : ""} sent`,
                      action: () => setOpenSheet("message"),
                    },
                    {
                      icon: "🏕️",
                      label: "Recommend Camps",
                      sub: "Browse by school, state, and date",
                      action: () => { setOpenSheet(null); nav("/Discover"); },
                    },
                    {
                      icon: "👤",
                      label: "My Account",
                      sub: "Profile, linked athletes, email preferences",
                      action: () => setOpenSheet("my_account"),
                    },
                  ].map(({ icon, label, sub, action }) => (
                    <div
                      key={label}
                      onClick={action}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid #1a2535", borderRadius: 11, cursor: "pointer", transition: "border-color 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a2535"; }}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#d1d5db" }}>{label}</div>
                        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}>{sub}</div>
                      </div>
                    </div>
                  ))}

                  <div style={{ borderTop: "1px solid #1f2937", marginTop: 8, paddingTop: 12 }}>
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      style={{ background: "transparent", border: "1px solid #374151", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <LogOut style={{ width: 14, height: 14 }} />
                      {loggingOut ? "Logging out…" : "Log out"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── My Account sheet ── */}
              {openSheet === "my_account" && (() => {
                function saveEmailPrefs(next) {
                  setEmailPrefs(next);
                  try { localStorage.setItem("urecruit_email_prefs", JSON.stringify(next)); } catch {}
                }

                const SectionLabel = ({ children }) => (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                    {children}
                  </div>
                );

                const InfoRow = ({ label, value }) => value ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1a2535", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#6b7280", flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#d1d5db", textAlign: "right" }}>{value}</span>
                  </div>
                ) : null;

                const ToggleRow = ({ label, sub, checked, onChange }) => (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #1a2535", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#d1d5db" }}>{label}</div>
                      {sub && <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{sub}</div>}
                    </div>
                    <button
                      onClick={() => onChange(!checked)}
                      style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: checked ? "#34d399" : "#374151", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
                      aria-pressed={checked}
                    >
                      <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
                    </button>
                  </div>
                );

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                    {/* Section A — Account Information */}
                    <div>
                      <SectionLabel>Account Information</SectionLabel>
                      <InfoRow label="Name"         value={[coach.first_name, coach.last_name].filter(Boolean).join(" ") || null} />
                      <InfoRow label="Email"        value={coach.email || null} />
                      <InfoRow label="School / Org" value={coach.school_or_org || null} />
                      <InfoRow label="Sport"        value={coach.sport || null} />
                      <InfoRow label="Title"        value={coach.title || null} />
                      <InfoRow label="Role"         value={coach.account_type || coach.role || null} />
                      <InfoRow label="Invite Code"  value={coach.invite_code || null} />
                    </div>

                    {/* Section B — Linked Athletes */}
                    <div>
                      <SectionLabel>Linked Athletes ({roster.length})</SectionLabel>
                      {roster.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#4b5563", fontStyle: "italic", margin: 0 }}>No athletes linked yet.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {roster.map((r, i) => (
                            <div key={r.account_id || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #1a2535", gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: "#d1d5db" }}>{r.athlete_name || "Athlete"}</span>
                              {r.athlete_grad_year && (
                                <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>Class of {r.athlete_grad_year}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Section C — Email Preferences */}
                    <div>
                      <SectionLabel>Email Preferences</SectionLabel>
                      <ToggleRow
                        label="Weekly recruiting digest"
                        sub="Summary of new activity across your roster each week"
                        checked={emailPrefs.weekly}
                        onChange={v => saveEmailPrefs({ ...emailPrefs, weekly: v })}
                      />
                      <ToggleRow
                        label="Monthly program report"
                        sub="High-level recruiting performance snapshot each month"
                        checked={emailPrefs.monthly}
                        onChange={v => saveEmailPrefs({ ...emailPrefs, monthly: v })}
                      />
                      <p style={{ fontSize: 11, color: "#374151", marginTop: 10, marginBottom: 0 }}>
                        Email delivery is managed by the uRecruitHQ team. Preference changes take effect with the next send cycle.
                      </p>
                    </div>

                    {/* Section D — Log Out */}
                    <div style={{ paddingTop: 4 }}>
                      <SectionLabel>Account Actions</SectionLabel>
                      <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        style={{ background: "transparent", border: "1px solid #374151", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <LogOut style={{ width: 14, height: 14 }} />
                        {loggingOut ? "Logging out…" : "Log out"}
                      </button>
                    </div>

                  </div>
                );
              })()}

            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
