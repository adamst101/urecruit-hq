// src/pages/CoachSignup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { clearSeasonAccessCache } from "../components/hooks/useSeasonAccess.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

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
  btnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    color: "#fca5a5",
    marginBottom: 20,
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

  const [name, setName] = useState("");
  const [schoolOrOrg, setSchoolOrOrg] = useState("");
  const [sport, setSport] = useState("Football");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !schoolOrOrg.trim() || !email.trim() || !password) {
      setError("Please fill out all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setWorking(true);
    setError(null);

    try {
      // Step 1 — register the account
      await base44.auth.register(email.trim(), password);

      // Step 2 — create Coach entity + set role="coach" on account
      const res = await base44.functions.invoke("registerCoach", {
        name: name.trim(),
        school_or_org: schoolOrOrg.trim(),
        sport: sport || "Football",
      });

      if (!res?.data?.ok) {
        throw new Error(res?.data?.error || "Failed to complete coach registration.");
      }

      // Bust the session cache so the new role is picked up immediately
      clearSeasonAccessCache();

      nav("/CoachDashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setWorking(false);
    }
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
          <label style={S.fieldLabel}>Your Name</label>
          <input
            style={S.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John Smith"
            autoComplete="name"
          />

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
            style={{ ...S.btn, ...(working ? S.btnDisabled : {}) }}
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
