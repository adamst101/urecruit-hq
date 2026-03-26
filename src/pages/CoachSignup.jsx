// src/pages/CoachSignup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { getDataEnv } from "../lib/envUtils";

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
  const [title, setTitle] = useState("");
  const [schoolOrOrg, setSchoolOrOrg] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [sport, setSport] = useState("Football");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  // OTP verification state — set after register() when email confirmation is required
  const [needsVerification, setNeedsVerification] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(false);

  async function handleVerify() {
    if (!otpCode.trim()) { setError("Please enter the verification code."); return; }
    setWorking(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const result = await base44.auth.verifyOtp({ email: normalizedEmail, otpCode: otpCode.trim() });
      const verifyErr = result?.error;
      if (verifyErr) throw new Error(String(verifyErr));
    } catch (err) {
      setWorking(false);
      const msg = String(err?.message || err || "");
      setError(msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")
        ? "That code is invalid or expired. Please check it and try again, or request a new code."
        : (msg || "Verification failed. Please try again."));
      return;
    }

    let access_token;
    try {
      const loginResult = await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      access_token = loginResult?.access_token;
      if (!access_token) throw new Error("No access token returned.");
    } catch (err) {
      setWorking(false);
      setError("Email verified! Sign-in failed — please try signing in manually.");
      return;
    }

    // Set the display name on the auth account so base44 admin shows the real name
    try {
      await base44.auth.updateMe({ full_name: `${firstName.trim()} ${lastName.trim()}` });
    } catch {}

    try {
      sessionStorage.setItem("pendingCoachRegistration", JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        title: title.trim(),
        school_or_org: schoolOrOrg.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        website: website.trim(),
        sport: sport || "Football",
        env: getDataEnv(),
      }));
    } catch {}

    window.location.assign(
      `/AuthRedirect?access_token=${encodeURIComponent(access_token)}&source=coach_signup`
    );
  }

  async function handleResend() {
    if (resendCooldown) return;
    setError(null);
    try {
      await base44.auth.resendOtp(email.trim().toLowerCase());
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 30000);
    } catch {
      setError("Could not resend code. Please try again.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !title.trim() || !schoolOrOrg.trim() || !email.trim() || !phone.trim() || !password) {
      setError("Please fill out all required fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter your password.");
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
      // Email verification required — show OTP entry (same flow as Signup.jsx)
      setWorking(false);
      setNeedsVerification(true);
      return;
    }

    // Set display name on auth account
    try {
      await base44.auth.updateMe({ full_name: `${firstName.trim()} ${lastName.trim()}` });
    } catch {}

    // Step 3 — store pending coach data so AuthRedirect can call registerCoach
    // after the session is fully established (same pattern as pendingPromoCode)
    try {
      sessionStorage.setItem("pendingCoachRegistration", JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        title: title.trim(),
        school_or_org: schoolOrOrg.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        website: website.trim(),
        sport: sport || "Football",
        env: getDataEnv(),
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
          <span style={S.label}>For Coaches &amp; Trainers</span>
          <h1 style={S.heading}>CHECK YOUR<br />EMAIL</h1>
          <p style={S.sub}>
            We sent a verification code to <strong style={{ color: "#f9fafb" }}>{email}</strong>.
            Enter it below to activate your coach account.
          </p>

          {error && <div style={S.error}>{error}</div>}

          <label style={S.fieldLabel}>Verification Code</label>
          <input
            style={{ ...S.input, fontSize: 22, letterSpacing: "0.15em", textAlign: "center" }}
            value={otpCode}
            onChange={e => setOtpCode(e.target.value)}
            placeholder="000000"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={8}
          />

          <button
            onClick={handleVerify}
            style={{ ...S.btn, ...(working ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
            disabled={working}
          >
            {working ? "Verifying…" : "Verify & Create Coach Account →"}
          </button>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={handleResend}
              disabled={resendCooldown}
              style={{ ...S.backLink, color: resendCooldown ? "#374151" : "#e8a020" }}
            >
              {resendCooldown ? "Code sent — check your inbox" : "Resend code"}
            </button>
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
          {/* Full Name */}
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

          <label style={S.fieldLabel}>Official Title</label>
          <input
            style={S.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Head Coach, Trainer, Coordinator…"
            autoComplete="organization-title"
          />

          <label style={S.fieldLabel}>School or Organization</label>
          <input
            style={S.input}
            value={schoolOrOrg}
            onChange={e => setSchoolOrOrg(e.target.value)}
            placeholder="Washington High School"
            autoComplete="organization"
          />

          <label style={S.fieldLabel}>Official School or Club Email</label>
          <input
            style={S.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@school.edu"
            autoComplete="email"
          />

          <label style={S.fieldLabel}>Phone Number</label>
          <input
            style={S.input}
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(555) 000-0000"
            autoComplete="tel"
          />

          <label style={S.fieldLabel}>
            Team Website or Profile Link
            <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>(optional)</span>
          </label>
          <input
            style={S.input}
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="https://…"
            autoComplete="url"
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

          <label style={S.fieldLabel}>Password</label>
          <input
            style={S.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            autoComplete="new-password"
          />

          <label style={S.fieldLabel}>Confirm Password</label>
          <input
            style={{
              ...S.input,
              marginBottom: confirmPassword && confirmPassword !== password ? 6 : 28,
              borderColor: confirmPassword && confirmPassword !== password ? "rgba(239,68,68,0.6)" : "#374151",
            }}
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            autoComplete="new-password"
          />
          {confirmPassword && confirmPassword !== password && (
            <div style={{ fontSize: 13, color: "#fca5a5", marginBottom: 28 }}>
              Passwords do not match.
            </div>
          )}

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
