// src/pages/CoachDashboard.jsx
import React, { useEffect, useState } from "react";
import { base44 } from "../api/base44Client";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const S = {
  root: {
    minHeight: "100vh",
    background: "#0a0e1a",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: "#f9fafb",
    padding: "48px 24px",
  },
  inner: {
    maxWidth: 720,
    margin: "0 auto",
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#e8a020",
    marginBottom: 8,
  },
  heading: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 40,
    color: "#f9fafb",
    letterSpacing: 1,
    margin: "0 0 8px",
    lineHeight: 1.05,
  },
  sub: {
    fontSize: 15,
    color: "#6b7280",
    margin: "0 0 40px",
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 12,
    padding: "28px 32px",
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#9ca3af",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  inviteBox: {
    background: "#0a0e1a",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "14px 16px",
    fontFamily: "monospace",
    fontSize: 15,
    color: "#e8a020",
    letterSpacing: 1,
    marginBottom: 12,
    wordBreak: "break-all",
  },
  copyBtn: {
    background: "#e8a020",
    color: "#0a0e1a",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  stat: {
    fontSize: 32,
    fontWeight: 700,
    color: "#f9fafb",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#6b7280",
  },
  row: {
    display: "flex",
    gap: 20,
  },
  rosterRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #1f2937",
    fontSize: 14,
    color: "#d1d5db",
  },
  input: {
    width: "100%",
    background: "#0a0e1a",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 15,
    color: "#f9fafb",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
  },
  textarea: {
    width: "100%",
    background: "#0a0e1a",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 15,
    color: "#f9fafb",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
    resize: "vertical",
    minHeight: 100,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  sendBtn: {
    background: "#e8a020",
    color: "#0a0e1a",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  msgRow: {
    padding: "14px 0",
    borderBottom: "1px solid #1f2937",
  },
  msgSubject: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f9fafb",
    marginBottom: 4,
  },
  msgBody: {
    fontSize: 14,
    color: "#9ca3af",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  msgDate: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6,
  },
};

export default function CoachDashboard() {
  const [coach, setCoach] = useState(null);
  const [roster, setRoster] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Compose state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me?.id) return;
        const coaches = await base44.entities.Coach.filter({ account_id: me.id });
        if (coaches?.length) {
          const c = coaches[0];
          setCoach(c);
          const [members, msgs] = await Promise.all([
            base44.entities.CoachRoster.filter({ coach_id: c.id }).catch(() => []),
            base44.entities.CoachMessage.filter({ coach_id: c.id }).catch(() => []),
          ]);
          setRoster(Array.isArray(members) ? members : []);
          setMessages(Array.isArray(msgs) ? msgs.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)) : []);
        }
      } catch (e) {
        console.error("CoachDashboard load error:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function copyLink() {
    if (!coach?.invite_code) return;
    const link = `${window.location.origin}/CoachInviteLanding?coach=${coach.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      const res = await base44.functions.invoke("sendCoachMessage", { subject: subject.trim(), message: message.trim() });
      if (res?.data?.ok || res?.ok) {
        setSendSuccess(true);
        setSubject("");
        setMessage("");
        // Reload messages
        const msgs = await base44.entities.CoachMessage.filter({ coach_id: coach.id }).catch(() => []);
        setMessages(Array.isArray(msgs) ? msgs.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)) : []);
        setTimeout(() => setSendSuccess(false), 3000);
      } else {
        setSendError(res?.data?.error || res?.error || "Failed to send message.");
      }
    } catch (err) {
      setSendError(err?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONTS}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div style={S.root}>
        <style>{FONTS}</style>
        <div style={S.inner}>
          <p style={{ color: "#6b7280", fontSize: 15 }}>Coach profile not found. Please contact support.</p>
        </div>
      </div>
    );
  }

  const isRejected = coach.status === "rejected";
  const isPending = !isRejected && coach.status !== "approved";
  const inviteLink = `${window.location.origin}/CoachInviteLanding?coach=${coach.invite_code}`;

  if (isRejected) {
    return (
      <div style={S.root}>
        <style>{FONTS}</style>
        <div style={S.inner}>
          <div style={S.label}>Coach Dashboard</div>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "32px", textAlign: "center", marginTop: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Application Not Approved</div>
            <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
              Your coach account application was not approved. If you believe this is an error,
              please contact us at{" "}
              <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020" }}>support@urecruithq.com</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div style={S.root}>
        <style>{FONTS}</style>
        <div style={S.inner}>
          <div style={S.label}>Coach Dashboard</div>
          <h1 style={S.heading}>Application Received</h1>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "32px", textAlign: "center", marginTop: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🕐</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>Pending Approval</div>
            <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px" }}>
              Your coach account is under review. We verify all coaches before granting access.
              You'll have full access once approved — usually within 1 business day.
            </p>
            <div style={{ background: "#0a0e1a", border: "1px solid #374151", borderRadius: 8, padding: "14px 20px", display: "inline-block" }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Submitted as</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f9fafb" }}>{coach.first_name} {coach.last_name}</div>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>{coach.school_or_org} · {coach.sport}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <style>{FONTS}</style>
      <div style={S.inner}>
        <div style={S.label}>Coach Dashboard</div>
        <h1 style={S.heading}>Welcome, {coach.first_name || "Coach"}</h1>
        <p style={S.sub}>{coach.school_or_org} · {coach.sport}</p>

        {/* Stats */}
        <div style={{ ...S.card, ...S.row }}>
          <div style={{ flex: 1 }}>
            <div style={S.stat}>{roster.length}</div>
            <div style={S.statLabel}>Athletes on roster</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.stat}>{messages.length}</div>
            <div style={S.statLabel}>Messages sent</div>
          </div>
        </div>

        {/* Invite link */}
        <div style={S.card}>
          <div style={S.cardTitle}>Your Invite Link</div>
          <div style={S.inviteBox}>{inviteLink}</div>
          <button style={S.copyBtn} onClick={copyLink}>
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12, marginBottom: 0 }}>
            Share this link with your athletes. When they subscribe, they'll appear on your roster below.
          </p>
        </div>

        {/* Roster */}
        <div style={S.card}>
          <div style={S.cardTitle}>Roster ({roster.length})</div>
          {roster.length === 0 ? (
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              No athletes yet. Share your invite link to get started.
            </p>
          ) : (
            roster.map((r, i) => (
              <div key={r.id || i} style={{ ...S.rosterRow, ...(i === roster.length - 1 ? { borderBottom: "none" } : {}) }}>
                <span>{r.athlete_name || r.athlete_id || "Athlete"}</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{r.joined_at ? new Date(r.joined_at).toLocaleDateString() : ""}</span>
              </div>
            ))
          )}
        </div>

        {/* Send Message */}
        <div style={S.card}>
          <div style={S.cardTitle}>Message Your Roster</div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, marginTop: 0 }}>
            Messages appear in the Recruiting HQ of every athlete on your roster.
          </p>
          <form onSubmit={handleSendMessage}>
            <input
              style={S.input}
              placeholder="Subject (optional)"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
            <textarea
              style={S.textarea}
              placeholder="Write your message…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
            />
            {sendError && (
              <p style={{ fontSize: 13, color: "#fca5a5", marginBottom: 12 }}>{sendError}</p>
            )}
            {sendSuccess && (
              <p style={{ fontSize: 13, color: "#6ee7b7", marginBottom: 12 }}>Message sent to your roster.</p>
            )}
            <button
              type="submit"
              style={{ ...S.sendBtn, ...(sending ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
              disabled={sending}
            >
              {sending ? "Sending…" : `Send to ${roster.length} athlete${roster.length !== 1 ? "s" : ""} →`}
            </button>
          </form>
        </div>

        {/* Sent messages */}
        {messages.length > 0 && (
          <div style={S.card}>
            <div style={S.cardTitle}>Sent Messages ({messages.length})</div>
            {messages.map((m, i) => (
              <div key={m.id || i} style={{ ...S.msgRow, ...(i === messages.length - 1 ? { borderBottom: "none" } : {}) }}>
                {m.subject && <div style={S.msgSubject}>{m.subject}</div>}
                <div style={S.msgBody}>{m.message}</div>
                <div style={S.msgDate}>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
