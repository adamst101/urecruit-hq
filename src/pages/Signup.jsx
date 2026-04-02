// src/pages/Signup.jsx
// Custom branded account creation screen.
// Uses base44.auth.register() + base44.auth.loginViaEmailPassword() —
// no backend function or Supabase credentials required.

import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { base44 } from "../api/base44Client";
import { startMemberLogin } from "../components/utils/memberLogin.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

function isDuplicate(msg) {
  const m = msg.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("already in use") ||
    m.includes("user already")
  );
}

function friendlyAuthError(msg, step) {
  const m = msg.toLowerCase();
  if (isDuplicate(m)) return "An account with this email already exists.";
  if (m.includes("invalid email") || m.includes("incorrect email") || m.includes("valid email")) {
    return "Please check your email address and try again.";
  }
  if (m.includes("password") && (m.includes("weak") || m.includes("short") || m.includes("length"))) {
    return "Password is too weak. Please use at least 8 characters.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("timeout")) {
    return "Network error. Please check your connection and try again.";
  }
  if (step === "login" && (m.includes("invalid") || m.includes("incorrect") || m.includes("credentials"))) {
    return "Sign-in failed after account creation. Please use Sign In below.";
  }
  // Fall back to the raw SDK message so it's at least visible
  return msg || "Something went wrong. Please try again.";
}

function validate(firstName, lastName, email, password, confirm) {
  if (!firstName.trim()) return "Please enter your first name.";
  if (!lastName.trim()) return "Please enter your last name.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password !== confirm) {
    return "Passwords do not match.";
  }
  return null;
}

function getCheckoutForm() {
  try {
    const raw = sessionStorage.getItem("checkoutForm");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function Signup() {
  const loc = useLocation();
  // Detect demo-tour entry so we can bridge the journey context
  const fromTour = new URLSearchParams(loc.search).get("src") === "demo_tour_end";

  const [firstName, setFirstName] = useState(() => getCheckoutForm()?.parentFirstName || "");
  const [lastName, setLastName] = useState(() => getCheckoutForm()?.parentLastName || "");
  const [email, setEmail] = useState(() => getCheckoutForm()?.parentEmail || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [existingAccount, setExistingAccount] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(false);

  async function handleVerify() {
    if (!otpCode.trim()) { setError("Please enter the verification code."); return; }
    setWorking(true);
    setError("");

    // Step 1: verify the OTP
    try {
      const result = await base44.auth.verifyOtp({ email: registeredEmail, otpCode: otpCode.trim() });
      const verifyErr = result?.error;
      if (verifyErr) throw new Error(String(verifyErr));
    } catch (err) {
      setWorking(false);
      const msg = String(err?.message || err?.error_description || err || "");
      setError(msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")
        ? "That code is invalid or expired. Please check it and try again, or request a new code."
        : (msg || "Verification failed. Please try again."));
      return;
    }

    // Step 2: log in now that email is verified
    let access_token;
    try {
      const loginResult = await base44.auth.loginViaEmailPassword(registeredEmail, password);
      access_token = loginResult?.access_token;
      if (!access_token) throw new Error("No access token returned.");
    } catch (err) {
      setWorking(false);
      const msg = String(err?.message || err?.error_description || err || "");
      setError("Email verified! Sign-in failed: " + friendlyAuthError(msg, "login"));
      return;
    }

    // Set full_name on the auth user before redirecting
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (fullName) {
      try { await base44.auth.updateMe({ full_name: fullName }); } catch {}
    }
    window.location.assign(
      `/AuthRedirect?access_token=${encodeURIComponent(access_token)}&source=custom_signup`
    );
  }

  async function handleResend() {
    if (resendCooldown) return;
    setError("");
    try {
      await base44.auth.resendOtp(registeredEmail);
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 30000);
    } catch {
      setError("Could not resend code. Please try again.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setExistingAccount(false);

    const validationError = validate(firstName, lastName, email.trim(), password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setWorking(true);
    const normalizedEmail = email.trim().toLowerCase();

    // Step 1: create the account
    try {
      const registerResult = await base44.auth.register({
        email: normalizedEmail,
        password,
      });
      // Only treat an explicit error field as failure — not a success message
      const registerErr = registerResult?.error;
      if (registerErr) throw new Error(String(registerErr));
    } catch (err) {
      setWorking(false);
      const msg = String(err?.message || err?.error_description || err || "");
      setError(friendlyAuthError(msg, "register"));
      if (isDuplicate(msg)) setExistingAccount(true);
      return;
    }

    // Step 2: try immediate login (works if verification isn't required)
    let access_token;
    try {
      const loginResult = await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      access_token = loginResult?.access_token;
    } catch {
      // Login failed — email verification is likely required first
    }

    if (access_token) {
      // Set full_name on the auth user before redirecting
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (fullName) {
        try { await base44.auth.updateMe({ full_name: fullName }); } catch {}
      }
      // Verification not required — go straight in
      window.location.assign(
        `/AuthRedirect?access_token=${encodeURIComponent(access_token)}&source=custom_signup`
      );
    } else {
      // Show the "check your email" state
      setWorking(false);
      setRegisteredEmail(normalizedEmail);
      setRegistered(true);
    }
  }

  function goToLogin() {
    startMemberLogin({ nextPath: "/Workspace", source: "signup_to_login" });
  }

  return (
    <div style={OUTER}>
      <style>{FONTS}</style>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <style>{`@media (max-width: 520px) { .signup-card { padding: 24px 18px !important; } }`}</style>

      {/* Logo */}
      <div style={{ marginBottom: 32 }}>
        {logoOk ? (
          <img
            src={LOGO_URL}
            alt="URecruit HQ"
            onError={() => setLogoOk(false)}
            style={{ height: 44, width: "auto", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 22, fontWeight: 800, color: "#f9fafb" }}>
            URecruit<span style={{ color: "#e8a020" }}>HQ</span>
          </span>
        )}
      </div>

      {/* Card */}
      <div className="signup-card" style={CARD}>
        {registered ? (
          /* ── OTP verification state ── */
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
              <h1 style={{ ...HEADING, fontSize: 28, marginBottom: 8 }}>CHECK YOUR EMAIL</h1>
              <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.6, margin: "0 0 6px" }}>
                We sent a verification code to:
              </p>
              <p style={{ color: "#f9fafb", fontWeight: 700, fontSize: 15, margin: "0 0 16px" }}>
                {registeredEmail}
              </p>
            </div>

            <label style={LABEL}>Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => { setOtpCode(e.target.value); setError(""); }}
              placeholder="Enter code from email"
              autoComplete="one-time-code"
              style={{ ...INPUT, textAlign: "center", letterSpacing: 6, fontSize: 20 }}
              autoFocus
            />

            {error && <div style={ERROR_BOX}>{error}</div>}

            <button
              onClick={handleVerify}
              disabled={working}
              style={{ ...SUBMIT_BTN, background: working ? "#92400e" : "#e8a020", marginTop: 20 }}
            >
              {working && <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />}
              {working ? "Verifying…" : "Verify & Sign In"}
            </button>

            <p style={{ textAlign: "center", marginTop: 16, color: "#6b7280", fontSize: 13 }}>
              Didn&apos;t get the email? Check your spam folder, or{" "}
              <button
                onClick={handleResend}
                disabled={resendCooldown}
                style={{ background: "none", border: "none", color: resendCooldown ? "#4b5563" : "#e8a020", fontWeight: 700, cursor: resendCooldown ? "default" : "pointer", fontSize: 13, padding: 0 }}
              >
                {resendCooldown ? "Code sent" : "resend code"}
              </button>.
            </p>
          </>
        ) : (
          /* ── Registration form ── */
          <>
            {fromTour && (
              <div style={{
                background: "rgba(232,160,32,0.07)",
                border: "1px solid rgba(232,160,32,0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 20,
                fontSize: 11,
                fontWeight: 700,
                color: "#e8a020",
                textAlign: "center",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                ✦ Continuing from Marcus's demo
              </div>
            )}
            <h1 style={HEADING}>
              {fromTour ? "START YOUR WORKSPACE" : "CREATE YOUR ACCOUNT"}
            </h1>
            <p style={{ color: "#9ca3af", fontSize: 14, margin: "0 0 28px" }}>
              {fromTour
                ? "Your free account is where your family's recruiting journey actually begins."
                : "Join uRecruitHQ to track camps, save favorites, and build your recruiting timeline."
              }
            </p>

            <form onSubmit={handleSubmit} noValidate>
              {/* First / Last name */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={LABEL}>First name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setError(""); }}
                    placeholder="Jane"
                    autoComplete="given-name"
                    style={INPUT}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={LABEL}>Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setError(""); }}
                    placeholder="Smith"
                    autoComplete="family-name"
                    style={INPUT}
                  />
                </div>
              </div>

              {/* Email */}
              <label style={{ ...LABEL, marginTop: 16 }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); setExistingAccount(false); }}
                placeholder="you@example.com"
                autoComplete="email"
                style={INPUT}
              />

              {/* Password */}
              <label style={{ ...LABEL, marginTop: 16 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  style={{ ...INPUT, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={EYE_BTN} tabIndex={-1}>
                  {showPw ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>

              {/* Confirm Password */}
              <label style={{ ...LABEL, marginTop: 16 }}>Confirm password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  style={{ ...INPUT, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} style={EYE_BTN} tabIndex={-1}>
                  {showConfirm ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>

              {/* Error */}
              {error && (
                <div style={ERROR_BOX}>
                  {error}
                  {existingAccount && (
                    <button
                      type="button"
                      onClick={goToLogin}
                      style={{ display: "block", marginTop: 6, color: "#e8a020", fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}
                    >
                      Sign in instead →
                    </button>
                  )}
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={working} style={{ ...SUBMIT_BTN, background: working ? "#92400e" : "#e8a020" }}>
                {working && <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />}
                {working ? "Creating account…" : "Create Account"}
              </button>
            </form>

            <p style={{ textAlign: "center", marginTop: 20, color: "#6b7280", fontSize: 14 }}>
              Already have an account?{" "}
              <button onClick={goToLogin} style={LINK_BTN}>Sign in</button>
            </p>
          </>
        )}
      </div>

      <p style={{ color: "#4b5563", fontSize: 12, marginTop: 20, textAlign: "center" }}>
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

const FONTS = "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');";

const OUTER = {
  background: "#0a0e1a",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
  fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
};

const CARD = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: 16,
  padding: "36px 32px",
  width: "100%",
  maxWidth: 420,
};

const HEADING = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 32,
  letterSpacing: 1,
  color: "#f9fafb",
  margin: "0 0 4px",
};

const LABEL = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#d1d5db",
  marginBottom: 6,
};

const INPUT = {
  width: "100%",
  background: "#0a0e1a",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "11px 14px",
  fontSize: 15,
  color: "#f9fafb",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "'DM Sans', sans-serif",
};

const EYE_BTN = {
  position: "absolute",
  right: 12,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: "#6b7280",
  cursor: "pointer",
  padding: 0,
  display: "flex",
  alignItems: "center",
};

const ERROR_BOX = {
  marginTop: 14,
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
  color: "#fca5a5",
};

const SUBMIT_BTN = {
  marginTop: 24,
  width: "100%",
  color: "#0a0e1a",
  border: "none",
  borderRadius: 8,
  padding: "13px 0",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: "'DM Sans', sans-serif",
};

const LINK_BTN = {
  background: "none",
  border: "none",
  color: "#e8a020",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
  padding: 0,
};
