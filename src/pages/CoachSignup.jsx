// src/pages/CoachSignup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

function friendlyError(err) {
  const msg = String(err?.message || err?.error_description || err || "").toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("already in use")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (msg.includes("invalid email") || msg.includes("valid email")) {
    return "Please enter a valid email address.";
  }
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("length"))) {
    return "Password is too weak. Please use at least 8 characters.";
  }
  if (msg.includes("rate") || msg.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("timeout")) {
    return "Network error. Please check your connection and try again.";
  }
  return String(err?.message || err?.error_description || err || "Something went wrong. Please try again.");
}

const S = {
  root: {
    minHeight: "100vh",
    background: "#0a0e1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 16,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 480,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#e8a020",
    display: "block",
    marginBottom: 14,
  },
  heading: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 36,
    color: "#f9fafb",
    letterSpacing: 1,
    margin: "0 0 8px",
    lineHeight: 1.05,
  },
  sub: {
    fontSize: 15,
    color: "#6b7280",
    margin: "0 0 32px",
    lineHeight: 1.6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#d1d5db",
    display: "block",
    marginBottom: 6,
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
    marginBottom: 20,
  },
  btn: {
    width: "100%",
    background: "#e8a020",
    color: "#0a0e1a",
    border: "none",
    borderRadius: 10,
    padding: "16px 0",
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    color: "#fca5a5",
    marginBottom: 20,
    lineHeight: 1.5,
  },
  success: {
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: 8,
    padding: "20px",
    fontSize: 15,
    color: "#6ee7b7",
    lineHeight: 1.6,
    textAlign: "center",
  },
  backLink: {
    display: "block",
    textAlign: "center",
    fontSize: 13,
    color: "#6b7280",
    marginTop: 20,
    cursor: "pointer",
    background: "none",
    border: "none",
    textDecoration: "underline",
  },
};

export default function CoachSignup() {
  const nav = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolOrOrg, setSchoolOrOrg] = useState("");
  const [sport, setSport] = useState("Football");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  // Shown when email verification is required before login
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !schoolOrOrg.trim() || !email.trim() || !password) {
      setError("Please fill out all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setWorking(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    // Step 1 — create the account
    try {
      const registerResult = await base44.auth.register({ email: normalizedEmail, password });
      const registerErr = registerResult?.error;
      if (registerErr) throw new Error(String(registerErr));
    } catch (err) {
      setWorking(false);
      setError(friendlyError(err));
      return;
    }

    // Step 2 — log in immediately to get the session token
    let access_token = null;
    try {
      const loginResult = await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      access_token = loginResult?.access_token || null;
    } catch {
      // Login failed — email verification is likely required first
    }

    if (!access_token) {
      // Email verification required — tell the user and stop here
      setWorking(false);
      setNeedsVerification(true);
      return;
    }

    // Step 3 — store pending coach data so AuthRedirect can call registerCoach
    // after the session is fully established (same pattern as pendingPromoCode)
    try {
      sessionStorage.setItem("pendingCoachRegistration", JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        school_or_org: schoolOrOrg.trim(),
        sport: sport || "Football",
        email: normalizedEmail,
      }));
    } catch {}

    // Step 4 — hand off to AuthRedirect which establishes the session and
    // calls registerCoach, then routes to /CoachDashboard
    window.location.assign(
      `/AuthRedirect?access_token=${encodeURIComponent(access_token)}&source=coach_signup`
    );
  }

  if (needsVerification) {
    return (
      <div style={S.root}>
        <style>{FONTS}</style>
        <div style={S.card}>
          <div style={S.success}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <strong>Check your email</strong>
            <p style={{ marginTop: 8, marginBottom: 0 }}>
              We sent a verification link to <strong>{email}</strong>.
              Click the link to activate your coach account.
            </p>
          </div>
          <button style={S.backLink} onClick={() => nav("/Home")}>← Back to home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <style>{FONTS}</style>
      <div style={S.card}>
        <span style={S.label}>For Coaches &amp; Trainers</span>
        <h1 style={S.heading}>CREATE YOUR<br />COACH ACCOUNT</h1>
        <p style={S.sub}>Free to join. Share your invite link and see which athletes are attending your camps.</p>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={S.fieldLabel}>First Name</label>
              <input
                style={S.input}
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="John"
                autoComplete="given-name"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.fieldLabel}>Last Name</label>
              <input
                style={S.input}
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                autoComplete="family-name"
              />
            </div>
          </div>

          <label style={S.fieldLabel}>School or Organization</label>
          <input
            style={S.input}
            value={schoolOrOrg}
            onChange={e => setSchoolOrOrg(e.target.value)}
            placeholder="Washington High School"
          />

          <label style={S.fieldLabel}>Sport</label>
          <select
            style={{ ...S.input, appearance: "none" }}
            value={sport}
            onChange={e => setSport(e.target.value)}
          >
            <option value="Football">Football</option>
            <option value="Basketball">Basketball</option>
            <option value="Baseball">Baseball</option>
            <option value="Soccer">Soccer</option>
            <option value="Lacrosse">Lacrosse</option>
            <option value="Other">Other</option>
          </select>

          <label style={S.fieldLabel}>Email</label>
          <input
            style={S.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@school.edu"
            autoComplete="email"
          />

          <label style={S.fieldLabel}>Password</label>
          <input
            style={{ ...S.input, marginBottom: 28 }}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            autoComplete="new-password"
          />

          <button
            type="submit"
            style={{ ...S.btn, ...(working ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
            disabled={working}
          >
            {working ? "Creating account…" : "Create Coach Account →"}
          </button>
        </form>

        <button style={S.backLink} onClick={() => nav("/Home")}>
          ← Back to home
        </button>
      </div>
    </div>
  );
}
