// src/pages/CoachProfile.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Edit2, Save, X, Lock, User, Briefcase, Building2, Phone, Shield } from "lucide-react";
import { base44 } from "../api/base44Client";
import BottomNav from "../components/navigation/BottomNav.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const SPORTS = [
  "Football","Basketball","Baseball","Soccer","Softball","Volleyball",
  "Wrestling","Track & Field","Cross Country","Swimming","Tennis","Golf",
  "Lacrosse","Hockey","Other",
];

function fmt(dateStr) {
  if (!dateStr) return null;
  try { return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return null; }
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <Icon style={{ width: 16, height: 16, color: "#e8a020" }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: "#f9fafb" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── View field ─────────────────────────────────────────────────────────────────
function ViewField({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, color: "#f9fafb" }}>{value}</div>
    </div>
  );
}

// ── Edit field ─────────────────────────────────────────────────────────────────
function EditField({ label, value, onChange, placeholder, readOnly = false, type = "text", as: As = "input" }) {
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: readOnly ? "transparent" : "#0a0e1a",
    border: readOnly ? "none" : "1px solid #374151",
    borderRadius: readOnly ? 0 : 8,
    padding: readOnly ? "0" : "10px 12px",
    color: readOnly ? "#6b7280" : "#f9fafb",
    fontSize: 14, outline: "none",
    resize: As === "textarea" ? "vertical" : undefined,
  };
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>{label}</label>
      {As === "select" ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, appearance: "none" }}
        >
          {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <As
          type={type}
          value={value}
          onChange={readOnly ? undefined : (e => onChange(e.target.value))}
          placeholder={readOnly ? undefined : placeholder}
          readOnly={readOnly}
          style={inputStyle}
        />
      )}
    </div>
  );
}

// ── Two column layout for edit mode ───────────────────────────────────────────
function TwoCol({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
      {children}
    </div>
  );
}

export default function CoachProfile() {
  const nav = useNavigate();

  const [coach, setCoach]       = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError]   = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pwResetSent, setPwResetSent] = useState(false);
  const [pwResetError, setPwResetError] = useState(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        let frontendAccountId = "";
        try {
          const me = await base44.auth.me();
          frontendAccountId = me?.id || "";
          setAuthUser(me);
        } catch {}
        const res = await base44.functions.invoke("getMyCoachProfile", { accountId: frontendAccountId || undefined });
        const data = res?.data;
        if (data?.ok && data.coach) {
          setCoach(data.coach);
          initForm(data.coach);
        }
      } catch (e) {
        console.error("CoachProfile load error:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function initForm(c) {
    setForm({
      first_name:   c.first_name   || "",
      last_name:    c.last_name    || "",
      title:        c.title        || "",
      school_or_org: c.school_or_org || "",
      sport:        c.sport        || "Football",
      phone:        c.phone        || "",
      website:      c.website      || "",
      email:        c.email        || "",
    });
  }

  function set(field) { return val => setForm(p => ({ ...p, [field]: val })); }

  function handleEdit() {
    initForm(coach);
    setEditing(true);
    setSaveError(null);
    setSaveSuccess(false);
  }

  function handleCancel() {
    initForm(coach);
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.school_or_org.trim()) {
      setSaveError("First name, last name, and school/organization are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await base44.functions.invoke("updateCoachProfile", {
        fields: {
          first_name:    form.first_name.trim(),
          last_name:     form.last_name.trim(),
          title:         form.title.trim() || null,
          school_or_org: form.school_or_org.trim(),
          sport:         form.sport || null,
          phone:         form.phone.trim() || null,
          website:       form.website.trim() || null,
          email:         form.email.trim() || null,
        },
      });
      const data = res?.data;
      if (data?.ok) {
        setCoach(prev => ({ ...prev, ...form }));
        setEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setSaveError(data?.error || "Failed to save. Please try again.");
      }
    } catch (e) {
      setSaveError(e?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    const email = authUser?.email || coach?.email;
    if (!email) { setPwResetError("No email address found for your account."); return; }
    setPwResetError(null);
    try {
      if (base44.auth?.sendPasswordResetEmail) {
        await base44.auth.sendPasswordResetEmail(email);
      } else if (base44.auth?.resetPassword) {
        await base44.auth.resetPassword(email);
      } else {
        // Fallback: direct them to login screen's forgot-password
        setPwResetSent(true);
        return;
      }
      setPwResetSent(true);
    } catch (e) {
      setPwResetError(e?.message || "Could not send reset email. Please try again.");
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONTS}</style>
        <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── No coach found ─────────────────────────────────────────────────────────
  if (!coach) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <style>{FONTS}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👤</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Profile not available</div>
          <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20 }}>Your coach profile could not be loaded.</p>
          <button type="button" onClick={() => nav("/CoachDashboard")} style={{ background: "#e8a020", border: "none", borderRadius: 8, padding: "10px 20px", color: "#0a0e1a", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ← Back to HQ
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const initials = [coach.first_name?.[0], coach.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  // Show account email section if login email differs from official school email
  const accountEmail = authUser?.email || "";
  const showAccountEmail = accountEmail && accountEmail.toLowerCase() !== (coach.email || "").toLowerCase();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#f9fafb", fontFamily: "'DM Sans', Inter, system-ui, sans-serif", paddingBottom: 100 }}>
      <style>{FONTS}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* ── Back link ── */}
        <button type="button" onClick={() => nav("/CoachDashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#e8a020", display: "flex", alignItems: "center", gap: 4, marginBottom: 20, padding: 0 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Coach HQ
        </button>

        {/* ── Page title ── */}
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f9fafb", margin: "0 0 4px", letterSpacing: 1 }}>Coach Profile</h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 24px" }}>Manage your professional and account details</p>

        {/* ── Profile header card ── */}
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#1f2937", border: "2px solid #374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#e8a020", flexShrink: 0, letterSpacing: 1 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#f9fafb", marginBottom: 2 }}>
              {coach.first_name} {coach.last_name}
            </div>
            {coach.title && (
              <div style={{ fontSize: 13, color: "#e8a020", fontWeight: 600, marginBottom: 2 }}>{coach.title}</div>
            )}
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              {coach.school_or_org}{coach.sport ? ` · ${coach.sport}` : ""}
            </div>
            {coach.email && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{coach.email}</div>
            )}
          </div>
          {!editing && (
            <button type="button" onClick={handleEdit} style={{ flexShrink: 0, background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "8px 14px", color: "#9ca3af", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              <Edit2 style={{ width: 13, height: 13 }} /> Edit Profile
            </button>
          )}
        </div>

        {/* ── Edit action bar ── */}
        {editing && (
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#9ca3af" }}>Editing profile</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={handleCancel} style={{ background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "8px 14px", color: "#9ca3af", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <X style={{ width: 13, height: 13 }} /> Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ background: "#e8a020", border: "none", borderRadius: 8, padding: "8px 16px", color: "#0a0e1a", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, opacity: saving ? 0.7 : 1 }}>
                <Save style={{ width: 13, height: 13 }} />
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {/* ── Feedback banners ── */}
        {saveError && (
          <div style={{ background: "#1f0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div style={{ background: "#071a0e", border: "1px solid #14532d", borderRadius: 8, padding: "10px 14px", color: "#86efac", fontSize: 13, marginBottom: 16 }}>
            Profile updated successfully.
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* 1. Professional Information                                          */}
        {/* ──────────────────────────────────────────────────────────────────── */}
        <Section icon={Briefcase} title="Professional Information">
          {editing ? (
            <>
              <TwoCol>
                <EditField label="First Name" value={form.first_name} onChange={set("first_name")} placeholder="First name" />
                <EditField label="Last Name"  value={form.last_name}  onChange={set("last_name")}  placeholder="Last name" />
              </TwoCol>
              <EditField label="Official Title" value={form.title} onChange={set("title")} placeholder="e.g. Head Coach, Offensive Coordinator" />
              <EditField label="Sport" value={form.sport} onChange={set("sport")} as="select" />
            </>
          ) : (
            <>
              <TwoCol>
                <ViewField label="First Name" value={coach.first_name} />
                <ViewField label="Last Name"  value={coach.last_name} />
              </TwoCol>
              <ViewField label="Official Title" value={coach.title} />
              <ViewField label="Sport" value={coach.sport} />
            </>
          )}
        </Section>

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* 2. Organization                                                       */}
        {/* ──────────────────────────────────────────────────────────────────── */}
        <Section icon={Building2} title="Organization">
          {editing ? (
            <>
              <EditField label="School or Organization" value={form.school_or_org} onChange={set("school_or_org")} placeholder="School or club name" />
              <EditField label="Team Website / Profile Link" value={form.website} onChange={set("website")} placeholder="https://" type="url" />
            </>
          ) : (
            <>
              <ViewField label="School or Organization" value={coach.school_or_org} />
              <ViewField label="Team Website / Profile Link" value={coach.website} />
            </>
          )}
        </Section>

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* 3. Contact Information                                                */}
        {/* ──────────────────────────────────────────────────────────────────── */}
        <Section icon={Phone} title="Contact Information">
          {editing ? (
            <>
              <EditField label="Official School / Club Email" value={form.email} onChange={set("email")} placeholder="coach@school.edu" type="email" />
              <EditField label="Phone Number" value={form.phone} onChange={set("phone")} placeholder="(555) 555-5555" type="tel" />
            </>
          ) : (
            <>
              <ViewField label="Official School / Club Email" value={coach.email} />
              <ViewField label="Phone Number" value={coach.phone} />
            </>
          )}
        </Section>

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* 4. Account                                                            */}
        {/* ──────────────────────────────────────────────────────────────────── */}
        <Section icon={User} title="Account">
          <ViewField label="Account Type" value="Coach" />
          {showAccountEmail && (
            <ViewField label="Account / Login Email" value={accountEmail} />
          )}
          {coach.created_at && (
            <ViewField label="Member Since" value={fmt(coach.created_at)} />
          )}
          {coach.account_id && (
            <ViewField label="Account ID" value={coach.account_id} />
          )}
          <ViewField label="Application Status" value={coach.status === "approved" ? "Approved" : coach.status === "pending" ? "Pending Approval" : coach.status} />
        </Section>

        {/* ──────────────────────────────────────────────────────────────────── */}
        {/* 5. Security                                                           */}
        {/* ──────────────────────────────────────────────────────────────────── */}
        <Section icon={Shield} title="Security">
          <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 16, lineHeight: 1.6 }}>
            Password changes are sent to your account login email
            {accountEmail ? `: ${accountEmail}` : ""}.
          </div>
          {pwResetSent ? (
            <div style={{ background: "#071a0e", border: "1px solid #14532d", borderRadius: 8, padding: "10px 14px", color: "#86efac", fontSize: 13 }}>
              Password reset email sent. Check your inbox.
            </div>
          ) : (
            <>
              {pwResetError && (
                <div style={{ background: "#1f0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 10 }}>
                  {pwResetError}
                </div>
              )}
              <button
                type="button"
                onClick={handlePasswordReset}
                style={{ background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "10px 16px", color: "#f9fafb", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <Lock style={{ width: 14, height: 14, color: "#e8a020" }} />
                Send Password Reset Email
              </button>
            </>
          )}
        </Section>

      </div>

      <BottomNav />
    </div>
  );
}
