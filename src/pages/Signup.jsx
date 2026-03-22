// src/pages/Signup.jsx
// Custom account creation screen — collects email + password, calls the
// createAccount serverless function, and exchanges the returned token for
// a session via AuthRedirect (same path as base44's hosted login).

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { base44 } from "../api/base44Client";
import { startMemberLogin } from "../components/utils/memberLogin.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');";

function validate(email, password, confirm) {
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

export default function Signup() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [existingAccount, setExistingAccount] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setExistingAccount(false);

    const validationError = validate(email.trim(), password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setWorking(true);
    try {
      const res = await base44.functions.invoke("createAccount", {
        email: email.trim().toLowerCase(),
        password,
      });
      const data = res?.data;
      if (data?.ok && data?.accessToken) {
        // Pass the token through the URL — appParams picks it up, stores it
        // in localStorage, removes it from the URL, then AuthRedirect routes the user.
        window.location.assign(
          `/AuthRedirect?access_token=${encodeURIComponent(data.accessToken)}&source=custom_signup`
        );
        return;
      }
      setError("Account creation failed. Please try again.");
    } catch (err) {
      const status = err?.response?.status ?? err?.status;
      const msg =
        err?.response?.data?.error ?? err?.message ?? "Something went wrong.";

      if (status === 409) {
        setExistingAccount(true);
        setError("An account with this email already exists.");
      } else if (status === 503) {
        // Server not yet configured with Supabase credentials — fall back to
        // the base44 hosted login page which has its own signup flow.
        window.location.assign(
          `/login?from_url=${encodeURIComponent(
            `${window.location.origin}/AuthRedirect?source=signup_fallback`
          )}`
        );
        return;
      } else {
        setError(msg);
      }
    } finally {
      setWorking(false);
    }
  }

  function goToLogin() {
    startMemberLogin({ nextPath: "/Workspace", source: "signup_to_login" });
  }

  return (
    <div
      style={{
        background: "#0a0e1a",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
      }}
    >
      <style>{FONTS}</style>

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
      <div
        style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 16,
          padding: "36px 32px",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 32,
            letterSpacing: 1,
            color: "#f9fafb",
            margin: "0 0 4px",
          }}
        >
          CREATE YOUR ACCOUNT
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 14, margin: "0 0 28px" }}>
          Join uRecruitHQ to track camps, save favorites, and build your recruiting timeline.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <label style={LABEL}>Email address</label>
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
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={EYE_BTN}
              tabIndex={-1}
            >
              {showPw ? (
                <EyeOff style={{ width: 16, height: 16 }} />
              ) : (
                <Eye style={{ width: 16, height: 16 }} />
              )}
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
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              style={EYE_BTN}
              tabIndex={-1}
            >
              {showConfirm ? (
                <EyeOff style={{ width: 16, height: 16 }} />
              ) : (
                <Eye style={{ width: 16, height: 16 }} />
              )}
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
          <button
            type="submit"
            disabled={working}
            style={{
              marginTop: 24,
              width: "100%",
              background: working ? "#92400e" : "#e8a020",
              color: "#0a0e1a",
              border: "none",
              borderRadius: 8,
              padding: "13px 0",
              fontSize: 16,
              fontWeight: 700,
              cursor: working ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {working && <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />}
            {working ? "Creating account…" : "Create Account"}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign: "center", marginTop: 20, color: "#6b7280", fontSize: 14 }}>
          Already have an account?{" "}
          <button
            onClick={goToLogin}
            style={{ background: "none", border: "none", color: "#e8a020", fontWeight: 700, cursor: "pointer", fontSize: 14, padding: 0 }}
          >
            Sign in
          </button>
        </p>
      </div>

      <p style={{ color: "#4b5563", fontSize: 12, marginTop: 20, textAlign: "center" }}>
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

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
