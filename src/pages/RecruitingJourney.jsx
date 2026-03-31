// src/pages/RecruitingJourney.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import GuidedTourOverlay from "../components/demo/GuidedTourOverlay.jsx";
import { ArrowLeft } from "lucide-react";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useActiveAthlete } from "../components/hooks/useActiveAthlete.jsx";
import { T } from "../lib/theme.js";
import {
  DEMO_JOURNEY_ACTIVITIES,
  DEMO_JOURNEY_METRICS,
  DEMO_JOURNEY_PREFS,
} from "../lib/demoUserData.js";

// ── Activity type config ──────────────────────────────────────────────────────
// Legacy types (social_like, dm_received, camp_invite, camp_meeting, offer) are kept
// for backward compatibility with existing records and display correctly.
const ACTIVITY_TYPES = {
  // Social
  social_like:                 { label: "Like / Follow",                  icon: "🔔", color: "#60a5fa", group: "Social"    },
  social_follow:               { label: "Follow",                         icon: "👤", color: "#60a5fa", group: "Social"    },
  // Messaging
  dm_received:                 { label: "DM Received",                    icon: "💬", color: "#34d399", group: "Messaging" },
  dm_sent:                     { label: "DM Sent",                        icon: "📤", color: "#34d399", group: "Messaging" },
  text_received:               { label: "Text Received",                  icon: "📱", color: "#34d399", group: "Messaging" },
  text_sent:                   { label: "Text Sent",                      icon: "📱", color: "#34d399", group: "Messaging" },
  phone_call:                  { label: "Phone Call",                     icon: "📞", color: "#fbbf24", group: "Messaging" },
  generic_email:               { label: "Generic Email",                  icon: "📧", color: "#9ca3af", group: "Messaging" },
  personal_email:              { label: "Personal Email",                 icon: "✉️",  color: "#34d399", group: "Messaging" },
  // Camp
  camp_invite:                 { label: "Camp Invite",                    icon: "📨", color: "#a78bfa", group: "Camp"      }, // legacy
  generic_camp_invite:         { label: "Generic Camp Invite",            icon: "📨", color: "#9ca3af", group: "Camp"      },
  personal_camp_invite:        { label: "Personal Camp Invite",           icon: "📨", color: "#a78bfa", group: "Camp"      },
  camp_registered:             { label: "Camp Registered",                icon: "✅", color: "#a78bfa", group: "Camp"      },
  camp_attended:               { label: "Camp Attended",                  icon: "🏟️", color: "#fbbf24", group: "Camp"      },
  camp_meeting:                { label: "Camp Meeting",                   icon: "🤝", color: "#fbbf24", group: "Camp"      }, // legacy
  post_camp_followup_sent:     { label: "Post-Camp Followup",             icon: "📤", color: "#9ca3af", group: "Camp"      },
  post_camp_personal_response: { label: "Post-Camp Response",             icon: "🤝", color: "#34d399", group: "Camp"      },
  // Visit
  unofficial_visit_requested:  { label: "Unofficial Visit — Requested",   icon: "🗺️", color: "#f59e0b", group: "Visit"     },
  unofficial_visit_completed:  { label: "Unofficial Visit — Completed",   icon: "🏫", color: "#f59e0b", group: "Visit"     },
  official_visit_requested:    { label: "Official Visit — Requested",     icon: "🎯", color: "#e8a020", group: "Visit"     },
  official_visit_completed:    { label: "Official Visit — Completed",     icon: "🏛️", color: "#e8a020", group: "Visit"     },
  // Milestone
  offer:                       { label: "Offer",                          icon: "🏆", color: "#e8a020", group: "Milestone" }, // legacy
  offer_received:              { label: "Offer Received",                 icon: "🏆", color: "#e8a020", group: "Milestone" },
  offer_updated:               { label: "Offer Updated",                  icon: "📝", color: "#e8a020", group: "Milestone" },
  commitment:                  { label: "Commitment",                     icon: "🎓", color: "#10b981", group: "Milestone" },
  signed:                      { label: "Signed",                         icon: "✍️",  color: "#10b981", group: "Milestone" },
};

const TYPE_GROUPS = ["Social", "Messaging", "Camp", "Visit", "Milestone"];

const QUICK_ADDS = [
  { type: "social_like",              label: "Add Like"         },
  { type: "dm_received",              label: "Add DM"           },
  { type: "phone_call",               label: "Add Phone Call"   },
  { type: "personal_camp_invite",     label: "Add Camp Invite"  },
  { type: "camp_meeting",             label: "Add Camp Meeting" },
  { type: "unofficial_visit_requested", label: "Add Visit"     },
  { type: "offer_received",           label: "Add Offer"        },
];

// Fields shown per activity type. "signal_quality" and "offer_fields" are virtual
// keys that trigger dedicated UI sections in the form.
const FIELDS_FOR = {
  social_like:                 ["school_name", "activity_date", "coach_name", "coach_twitter", "notes"],
  social_follow:               ["school_name", "activity_date", "coach_name", "coach_twitter", "notes"],
  dm_received:                 ["school_name", "activity_date", "coach_name", "coach_twitter", "notes", "signal_quality"],
  dm_sent:                     ["school_name", "activity_date", "coach_name", "coach_twitter", "notes", "signal_quality"],
  text_received:               ["school_name", "activity_date", "coach_name", "notes", "signal_quality"],
  text_sent:                   ["school_name", "activity_date", "coach_name", "notes", "signal_quality"],
  phone_call:                  ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  generic_email:               ["school_name", "activity_date", "coach_name", "notes"],
  personal_email:              ["school_name", "activity_date", "coach_name", "notes"],
  camp_invite:                 ["school_name", "activity_date", "coach_name", "notes"],
  generic_camp_invite:         ["school_name", "activity_date", "coach_name", "notes"],
  personal_camp_invite:        ["school_name", "activity_date", "coach_name", "notes"],
  camp_registered:             ["school_name", "activity_date", "notes"],
  camp_attended:               ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  camp_meeting:                ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  post_camp_followup_sent:     ["school_name", "activity_date", "coach_name", "notes", "signal_quality"],
  post_camp_personal_response: ["school_name", "activity_date", "coach_name", "notes"],
  unofficial_visit_requested:  ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  unofficial_visit_completed:  ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  official_visit_requested:    ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  official_visit_completed:    ["school_name", "activity_date", "coach_name", "coach_title", "notes"],
  offer:                       ["school_name", "activity_date", "coach_name", "coach_title", "notes", "offer_fields"],
  offer_received:              ["school_name", "activity_date", "coach_name", "coach_title", "notes", "offer_fields"],
  offer_updated:               ["school_name", "activity_date", "coach_name", "notes", "offer_fields"],
  commitment:                  ["school_name", "activity_date", "coach_name", "notes"],
  signed:                      ["school_name", "activity_date", "notes"],
};

const DIVISIONS = [
  { key: "fbs", label: "FBS" },
  { key: "fcs", label: "FCS" },
  { key: "d2",  label: "D-II" },
  { key: "d3",  label: "D-III" },
];

const DIVISION_DB_VALUE = {
  fbs: "NCAA Division I FBS",
  fcs: "NCAA Division I FCS",
  d2:  "NCAA Division II",
  d3:  "NCAA Division III",
};

const BLANK_FORM = {
  activity_type: "social_like",
  school_name: "",
  school_id: "",
  coach_name: "",
  coach_title: "",
  coach_twitter: "",
  activity_date: "",
  notes: "",
  // Signal quality fields — null means "not set" (distinct from false)
  is_athlete_specific: null,
  is_two_way_engagement: null,
  evidence_reference: "",
  // Offer fields
  offer_type: "",
  offer_status: "",
};

// Client-side traction level — mirrors server logic for immediate badge display
// (server-enriched records use _traction_level; new records use this fallback)
function clientTractionLevel(act) {
  if (act._traction_level !== undefined) return act._traction_level;
  const t = act.activity_type || "";
  if (["offer","offer_received","offer_updated","commitment","signed",
       "unofficial_visit_requested","unofficial_visit_completed",
       "official_visit_requested","official_visit_completed"].includes(t)) return 4;
  if (["personal_camp_invite","post_camp_personal_response","phone_call"].includes(t)) return 3;
  if (t === "camp_meeting" || t === "personal_email") return 2;
  if (act.is_two_way_engagement === true && act.is_athlete_specific === true &&
      ["dm_received","dm_sent","text_received","text_sent","post_camp_followup_sent"].includes(t)) return 2;
  if (["social_like","social_follow","generic_email","generic_camp_invite","camp_invite",
       "camp_registered","camp_attended","post_camp_followup_sent",
       "dm_received","dm_sent","text_received","text_sent"].includes(t)) return 1;
  return 0;
}

const TRACTION_BADGE = {
  4: { label: "★ Major",         bg: "rgba(232,160,32,0.15)", color: "#e8a020" },
  3: { label: "True Traction",   bg: "rgba(52,211,153,0.12)", color: "#34d399" },
  2: { label: "True Traction",   bg: "rgba(52,211,153,0.12)", color: "#34d399" },
  1: { label: "Signal",          bg: "rgba(96,165,250,0.1)",  color: "#60a5fa" },
};

const BLANK_PREFS = {
  fbs_1: "", fbs_2: "", fbs_3: "",
  fcs_1: "", fcs_2: "", fcs_3: "",
  d2_1: "",  d2_2: "",  d2_3: "",
  d3_1: "",  d3_2: "",  d3_3: "",
};

// Activity types where the signal quality section starts expanded by default.
// For these types, is_two_way_engagement directly gates traction classification
// (level 1 vs level 2), so the question should be visible without requiring
// the user to discover a collapsed toggle.
const AUTO_EXPAND_SIGNAL_TYPES = new Set([
  "dm_received", "dm_sent", "text_received", "text_sent", "post_camp_followup_sent",
]);

// Activity types where school identity matters for coach-visible reporting.
// A warning is shown when school_name is typed free-text (no school_id set).
const COACH_VISIBLE_TYPES = new Set([
  "dm_received", "dm_sent", "text_received", "text_sent", "personal_email",
  "phone_call", "personal_camp_invite", "post_camp_followup_sent",
  "unofficial_visit_requested", "unofficial_visit_completed",
  "official_visit_requested",   "official_visit_completed",
  "offer_received", "offer_updated", "commitment", "signed",
]);

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || null;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RecruitingJourney() {
  const nav = useNavigate();
  const loc = useLocation();
  const isUserDemo = new URLSearchParams(loc.search).get("demo") === "user";
  const isTourMode = new URLSearchParams(loc.search).get("tour") !== null;
  const { accountId, isLoading: seasonLoading } = useSeasonAccess();
  const { activeAthlete: athleteProfile } = useActiveAthlete();
  const athleteId = normId(athleteProfile);

  const [activities, setActivities]     = useState([]);
  const [preferences, setPreferences]   = useState(BLANK_PREFS);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState("");

  // Add activity modal
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState(BLANK_FORM);
  const [saving, setSaving]     = useState(false);
  const [addError, setAddError] = useState("");

  // School preferences (always-on comboboxes)
  const [prefsForm, setPrefsForm]     = useState(BLANK_PREFS);
  const [prefsDirty, setPrefsDirty]   = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError]   = useState("");
  const [prefsSaved, setPrefsSaved]   = useState(false);

  // Traction / metrics from server-enriched response
  const [athleteMetrics, setAthleteMetrics]   = useState(null);
  const [schoolTraction, setSchoolTraction]   = useState({});

  // Advanced signal quality section in modal
  const [showAdvanced, setShowAdvanced]       = useState(false);

  // Demo upgrade prompt
  const [showDemoUpgrade, setShowDemoUpgrade] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState(null);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deletingId, setDeletingId]           = useState(null);

  // Single school list used for both activity-logging and target-school comboboxes.
  // Division filtering is done client-side from this one fetch.
  const [allSchools, setAllSchools]               = useState([]);
  const [allSchoolsLoading, setAllSchoolsLoading] = useState(false);

  async function loadAllSchools() {
    if (allSchools.length > 0) return;
    setAllSchoolsLoading(true);
    try {
      const rows = await base44.entities.School.filter({}, "school_name", 9999).catch(() => []);
      setAllSchools(Array.isArray(rows) ? rows : []);
    } finally {
      setAllSchoolsLoading(false);
    }
  }

  // Per-division slices derived from the single list.
  // FBS/FCS schools may be stored two ways: division="NCAA Division I FBS" (audit path)
  // OR division="NCAA Division I" + subdivision="FBS" (Wikipedia seed path).
  const divisionSchools = {
    fbs: allSchools.filter(s => s.division === DIVISION_DB_VALUE.fbs || (s.division === "NCAA Division I" && s.subdivision === "FBS")),
    fcs: allSchools.filter(s => s.division === DIVISION_DB_VALUE.fcs || (s.division === "NCAA Division I" && s.subdivision === "FCS")),
    d2:  allSchools.filter(s => s.division === DIVISION_DB_VALUE.d2),
    d3:  allSchools.filter(s => s.division === DIVISION_DB_VALUE.d3),
  };

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadJourney = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await base44.functions.invoke("getRecruitingJourney", { accountId });
      if (res?.data?.ok) {
        setActivities(Array.isArray(res.data.activities) ? res.data.activities : []);
        const p = res.data.preferences;
        if (p) {
          setPreferences({ ...BLANK_PREFS, ...p });
          setPrefsForm({ ...BLANK_PREFS, ...p });
        }
        if (res.data.athlete_metrics) setAthleteMetrics(res.data.athlete_metrics);
        if (res.data.school_traction)  setSchoolTraction(res.data.school_traction || {});
      } else {
        setLoadError(res?.data?.error || "Failed to load recruiting journey");
      }
    } catch (err) {
      setLoadError(err?.message || "Failed to load recruiting journey");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (seasonLoading || !accountId) return;
    loadJourney();
    loadAllSchools();
  }, [loadJourney, seasonLoading, accountId]);

  // Demo / unauthenticated: clear loading once season check is done.
  // For demo users, seed synthetic journey data before revealing the tracker.
  useEffect(() => {
    if (seasonLoading) return;
    if (!accountId) {
      if (isUserDemo) {
        setActivities(DEMO_JOURNEY_ACTIVITIES);
        setAthleteMetrics(DEMO_JOURNEY_METRICS);
        setPreferences(DEMO_JOURNEY_PREFS);
        setPrefsForm(DEMO_JOURNEY_PREFS);
      }
      setLoading(false);
    }
  }, [seasonLoading, accountId, isUserDemo]);

  // ── Add activity ─────────────────────────────────────────────────────────
  function openAdd(type) {
    if (isTourMode) return;
    if (isUserDemo) { setShowDemoUpgrade(true); return; }
    setAddForm({ ...BLANK_FORM, activity_type: type });
    setEditingId(null);
    setAddError("");
    setShowAdvanced(false);
    setShowAdd(true);
    loadAllSchools();
  }

  // ── Edit activity ─────────────────────────────────────────────────────────
  function openEdit(act) {
    setAddForm({
      activity_type:         act.activity_type         || "social_like",
      school_name:           act.school_name           || "",
      school_id:             act.school_id             || "",
      coach_name:            act.coach_name            || "",
      coach_title:           act.coach_title           || "",
      coach_twitter:         act.coach_twitter         || "",
      activity_date:         act.activity_date         || "",
      notes:                 act.notes                 || "",
      is_athlete_specific:   act.is_athlete_specific   ?? null,
      is_two_way_engagement: act.is_two_way_engagement ?? null,
      evidence_reference:    act.evidence_reference    || "",
      offer_type:            act.offer_type            || "",
      offer_status:          act.offer_status          || "",
    });
    setEditingId(act.id);
    setAddError("");
    setShowAdvanced(false);
    setShowAdd(true);
    loadAllSchools();
  }

  async function submitAdd() {
    if (saving) return;
    setSaving(true);
    setAddError("");
    try {
      const payload = { ...addForm, accountId, athlete_id: athleteId || null };
      // Convert empty strings to null for cleaner storage
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null;
      }
      const res = await base44.functions.invoke("createRecruitingActivity", payload);
      if (res?.data?.ok) {
        // base44 SDK .create() may not echo back boolean fields in its response.
        // Merge them from the known form state so the immediate badge is correct.
        const act = res.data.activity || {};
        const enriched = {
          ...act,
          is_two_way_engagement: act.is_two_way_engagement ?? addForm.is_two_way_engagement,
          is_verified_personal:  act.is_verified_personal  ?? addForm.is_verified_personal,
          is_athlete_specific:   act.is_athlete_specific   ?? addForm.is_athlete_specific,
        };
        enriched._traction_level = clientTractionLevel(enriched);
        setActivities(prev => [enriched, ...prev]);
        setShowAdd(false);
        setAddForm(BLANK_FORM);
      } else {
        setAddError(res?.data?.error || "Failed to save activity");
      }
    } catch (err) {
      setAddError(err?.message || "Failed to save activity");
    } finally {
      setSaving(false);
    }
  }

  // ── Update (edit) activity ────────────────────────────────────────────────
  async function submitEdit() {
    if (saving) return;
    setSaving(true);
    setAddError("");
    try {
      const payload = { ...addForm, activityId: editingId, accountId };
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null;
      }
      const res = await base44.functions.invoke("updateRecruitingActivity", payload);
      if (res?.data?.ok) {
        // Same boolean-merge guard as submitAdd — SDK may not echo back booleans
        const act = res.data.activity || { id: editingId };
        const enriched = {
          ...act,
          is_two_way_engagement: act.is_two_way_engagement ?? addForm.is_two_way_engagement,
          is_verified_personal:  act.is_verified_personal  ?? addForm.is_verified_personal,
          is_athlete_specific:   act.is_athlete_specific   ?? addForm.is_athlete_specific,
        };
        enriched._traction_level = clientTractionLevel(enriched);
        setActivities(prev => prev.map(a => a.id === editingId ? enriched : a));
        setShowAdd(false);
        setEditingId(null);
        setAddForm(BLANK_FORM);
      } else {
        setAddError(res?.data?.error || "Failed to save changes");
      }
    } catch (err) {
      setAddError(err?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  // ── School preferences ───────────────────────────────────────────────────
  async function submitPrefs() {
    if (savingPrefs) return;
    setSavingPrefs(true);
    setPrefsError("");
    try {
      const payload = { ...prefsForm, accountId, athlete_id: athleteId || null };
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null;
      }
      const res = await base44.functions.invoke("saveSchoolPreferences", payload);
      if (res?.data?.ok) {
        setPreferences({ ...BLANK_PREFS, ...res.data.preferences });
        setPrefsDirty(false);
        setPrefsSaved(true);
        setTimeout(() => setPrefsSaved(false), 3000);
      } else {
        setPrefsError(res?.data?.error || "Failed to save preferences");
      }
    } catch (err) {
      setPrefsError(err?.message || "Failed to save preferences");
    } finally {
      setSavingPrefs(false);
    }
  }

  // ── Delete activity ──────────────────────────────────────────────────────
  async function deleteActivity(actId) {
    if (deletingId) return;
    setDeletingId(actId);
    try {
      const res = await base44.functions.invoke("deleteRecruitingActivity", { activityId: actId, accountId });
      if (res?.data?.ok) {
        setActivities(prev => prev.filter(a => a.id !== actId));
      }
      setDeleteConfirmId(null);
    } catch {
      setDeleteConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Form helpers ─────────────────────────────────────────────────────────
  const setField      = field => val => setAddForm(p => ({ ...p, [field]: val }));
  const setPrefsField = field => val => setPrefsForm(p => ({ ...p, [field]: val }));

  const currentFields = FIELDS_FOR[addForm.activity_type] || [];
  const typeInfo      = ACTIVITY_TYPES[addForm.activity_type] || {};

  const sortedActivities = [...activities].sort((a, b) => {
    const da = a.activity_date || a.created_at || "";
    const db = b.activity_date || b.created_at || "";
    return db.localeCompare(da);
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: T.pageBg, color: T.textPrimary, minHeight: "100vh",
      fontFamily: T.fontBody,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Header ── */}
      <section style={{ padding: "24px 24px 0", maxWidth: 900, margin: "0 auto" }}>
        {!isTourMode && (
          <button
            onClick={() => nav(isUserDemo ? "/Workspace?demo=user&src=home_demo" : "/Workspace")}
            style={{
              background: "none", border: "none", color: T.textSecondary, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 14, padding: 0, marginBottom: 20,
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Back to HQ
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 3, height: 36, background: "#e8a020", borderRadius: 2 }} />
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(34px, 5vw, 52px)",
            lineHeight: 1, margin: 0, letterSpacing: 1,
          }}>
            RECRUITING JOURNEY
          </h1>
          {isUserDemo && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
              color: "#e8a020", background: "rgba(232,160,32,0.1)",
              border: "1px solid rgba(232,160,32,0.25)",
              borderRadius: 5, padding: "3px 8px",
              textTransform: "uppercase", alignSelf: "center",
            }}>
              Demo
            </span>
          )}
        </div>
        <p style={{ color: "#9ca3af", fontSize: 15, margin: "0 0 32px 13px", lineHeight: 1.5 }}>
          Track college interest, DMs, camp conversations, and offers
        </p>
      </section>

      {/* ── Loading / error ── */}
      {loading && (
        <section style={{ padding: "0 24px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ color: "#6b7280", fontSize: 14, padding: "20px 0" }}>Loading...</div>
        </section>
      )}

      {loadError && !loading && (
        <section style={{ padding: "0 24px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10, padding: "12px 16px", color: "#f87171", fontSize: 14,
          }}>
            {loadError}
          </div>
        </section>
      )}

      {/* No-auth gate — real unauthenticated users only; demo bypasses this */}
      {!loading && !accountId && !isUserDemo && (
        <section style={{ padding: "0 24px 40px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{
            background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.2)",
            borderRadius: 14, padding: "28px 32px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
              Season Pass Required
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#f9fafb", letterSpacing: 1, marginBottom: 10 }}>
              Track Every Signal. Build the Full Picture.
            </div>
            <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, margin: "0 0 20px", maxWidth: 560 }}>
              The Recruiting Tracker lets you log every coach interaction — DMs, texts, camp conversations, visit requests, and offers — so you can see which programs are actually interested and measure momentum over time.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, maxWidth: 440 }}>
              {[
                "Log DMs, texts, phone calls, and emails from coaches",
                "Track camp invites, meetings, and post-camp follow-ups",
                "Record unofficial visits, official visits, and offers",
                "See which schools are generating real traction",
              ].map((line) => (
                <div key={line} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ color: "#e8a020", marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: "#d1d5db" }}>{line}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => nav("/Subscribe?source=tracker_demo")}
                style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Get Season Pass →
              </button>
              <button
                onClick={() => nav(-1)}
                style={{ background: "transparent", color: "#9ca3af", border: "1px solid #374151", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}
              >
                Go Back
              </button>
            </div>
          </div>
        </section>
      )}

      {!loading && (!!accountId || isUserDemo) && (
        <>
          {/* ── Quick Add — hidden in tour mode ── */}
          {!isTourMode && <section style={{ padding: "0 24px 32px", maxWidth: 900, margin: "0 auto" }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#9ca3af",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
            }}>
              Quick Add
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {QUICK_ADDS.map(qa => (
                <button
                  key={qa.type}
                  onClick={() => openAdd(qa.type)}
                  style={{
                    background: T.shellBg, border: T.shellBorderFull, borderRadius: 10,
                    padding: "10px 18px", color: isUserDemo ? T.textMuted : T.textPrimary,
                    fontSize: 14, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                    transition: `border-color ${T.transitionBase}`,
                    opacity: isUserDemo ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.amber; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.shellBorder; }}
                >
                  <span style={{ fontSize: 16 }}>{ACTIVITY_TYPES[qa.type].icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>
            {isUserDemo && showDemoUpgrade && (
              <div style={{
                marginTop: 14,
                background: "rgba(232,160,32,0.07)", border: "1px solid rgba(232,160,32,0.2)",
                borderRadius: 10, padding: "14px 18px",
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 4 }}>
                    Log your athlete's real recruiting activity
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
                    This is a demo. A Season Pass gives your family a private tracker tied to your real athlete.
                  </div>
                </div>
                <button
                  onClick={() => nav("/Subscribe?source=tracker_demo_quickadd")}
                  style={{
                    background: "#e8a020", color: "#0a0e1a", border: "none",
                    borderRadius: 8, padding: "9px 18px",
                    fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Get Season Pass →
                </button>
                <button
                  onClick={() => setShowDemoUpgrade(false)}
                  style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}
                >×</button>
              </div>
            )}
          </section>}

          {/* ── Traction Snapshot ── */}
          {athleteMetrics && (
            <section style={{ padding: "0 24px 20px", maxWidth: 900, margin: "0 auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                {[
                  {
                    label: "Stage",
                    value: athleteMetrics.traction_stage_label || "No Activity",
                    accent: athleteMetrics.highest_traction_level >= 4 ? "#e8a020"
                           : athleteMetrics.highest_traction_level >= 2 ? "#34d399"
                           : "#9ca3af",
                    big: true,
                  },
                  { label: "Schools w/ Traction", value: athleteMetrics.true_traction_school_count, sub: "verified interest" },
                  { label: "Activity (30d)",       value: athleteMetrics.activity_count_30d,          sub: "events logged" },
                  { label: "Top School",           value: athleteMetrics.top_school_with_highest_traction || "—", small: true },
                ].map(item => (
                  <div key={item.label} style={{ ...T.cardStyle, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ ...T.microLabel, marginBottom: 4 }}>{item.label}</div>
                    <div style={{
                      fontFamily: item.big ? T.fontDisplay : "inherit",
                      fontSize: item.small ? 13 : item.big ? 20 : 24,
                      color: item.accent || T.textPrimary,
                      fontWeight: item.small ? 600 : 700,
                      lineHeight: 1.2,
                    }}>{item.value}</div>
                    {item.sub && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{item.sub}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Recent Activity ── */}
          <section style={{ padding: "0 24px 32px", maxWidth: 900, margin: "0 auto" }}>
            <div style={{ ...T.shellStyle, padding: "24px 20px" }}>
              <div style={{ ...T.microLabel, fontSize: 13, marginBottom: 16 }}>
                Recent Activity
              </div>

              {sortedActivities.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.7 }}>
                    No recruiting activity logged yet.<br />
                    Use the Quick Add buttons above to get started.
                  </div>
                </div>
              ) : (
                sortedActivities.map((act, i) => {
                  const tInfo = ACTIVITY_TYPES[act.activity_type] || { icon: "•", label: act.activity_type, color: "#9ca3af" };
                  const dateStr = act.activity_date
                    ? new Date(act.activity_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : act.created_at
                      ? new Date(act.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : null;

                  return (
                    <div
                      key={act.id || i}
                      style={{ borderBottom: i < sortedActivities.length - 1 ? T.dividerFull : "none" }}
                    >
                    <div style={{ padding: "16px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: "rgba(232,160,32,0.07)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 19,
                      }}>
                        {tInfo.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: tInfo.color,
                            textTransform: "uppercase", letterSpacing: "0.06em",
                          }}>
                            {tInfo.label}
                          </span>
                          {act.school_name && (
                            <span style={{ fontSize: 15, fontWeight: 600, color: "#f9fafb" }}>
                              {act.school_name}
                            </span>
                          )}
                          {(() => {
                            const lvl = clientTractionLevel(act);
                            const badge = TRACTION_BADGE[lvl];
                            if (!badge) return null;
                            return (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: badge.bg, color: badge.color }}>
                                {badge.label}
                              </span>
                            );
                          })()}
                        </div>
                        {(act.coach_name || act.coach_title) && (
                          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 2 }}>
                            {[act.coach_name, act.coach_title].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {act.coach_twitter && (
                          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>{act.coach_twitter}</div>
                        )}
                        {(act.offer_type || act.offer_status) && (
                          <div style={{ fontSize: 12, color: "#e8a020", marginBottom: 2 }}>
                            {[
                              act.offer_type === "scholarship" ? "Scholarship" : act.offer_type === "preferred_walk_on" ? "Preferred Walk-on" : act.offer_type === "walk_on" ? "Walk-on" : null,
                              act.offer_status ? act.offer_status.charAt(0).toUpperCase() + act.offer_status.slice(1) : null,
                            ].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {act.notes && (
                          <div style={{
                            fontSize: 13, color: "#d1d5db", marginTop: 5,
                            lineHeight: 1.55, whiteSpace: "pre-wrap",
                          }}>
                            {act.notes}
                          </div>
                        )}
                        {dateStr && (
                          <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6 }}>{dateStr}</div>
                        )}
                      </div>
                      {act.id && deleteConfirmId !== act.id && (
                        <div style={{ display: "flex", gap: 1, flexShrink: 0, marginTop: 1 }}>
                          <button
                            onClick={() => openEdit(act)}
                            style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: "4px 6px", fontSize: 14, lineHeight: 1 }}
                            title="Edit entry"
                          >✎</button>
                          <button
                            onClick={() => setDeleteConfirmId(act.id)}
                            style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: "4px 6px", fontSize: 18, lineHeight: 1 }}
                            title="Remove entry"
                          >×</button>
                        </div>
                      )}
                    </div>
                    {deleteConfirmId === act.id && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 12px" }}>
                        <span style={{ fontSize: 12, color: "#6b7280", flex: 1 }}>Remove this entry?</span>
                        <button
                          onClick={() => deleteActivity(act.id)}
                          disabled={deletingId === act.id}
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "4px 12px", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          {deletingId === act.id ? "Removing…" : "Remove"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          style={{ background: "none", border: "1px solid #374151", borderRadius: 6, padding: "4px 12px", color: "#9ca3af", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ── Target Schools ── */}
          <section style={{ padding: "0 24px 80px", maxWidth: 900, margin: "0 auto" }}>
            <div style={{ ...T.shellStyle, padding: "24px 20px" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: isUserDemo ? 10 : 16, flexWrap: "wrap", gap: 8,
              }}>
                <div style={{ ...T.microLabel, fontSize: 13 }}>
                  Target Schools
                </div>
                {isUserDemo ? (
                  <button
                    onClick={() => nav("/Subscribe?source=tracker_demo_prefs")}
                    style={{
                      background: "#e8a020", border: "none", borderRadius: 8,
                      padding: "6px 14px", color: "#0a0e1a",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    Set your schools →
                  </button>
                ) : (
                  <button
                    onClick={submitPrefs}
                    disabled={savingPrefs || !prefsDirty}
                    style={{
                      background: prefsDirty ? T.amber : "transparent",
                      border: prefsDirty ? "none" : `1px solid ${T.borderInput}`,
                      borderRadius: 8, padding: "6px 16px", color: prefsDirty ? T.pageBg : T.textMuted,
                      fontSize: 13, fontWeight: 700,
                      cursor: (savingPrefs || !prefsDirty) ? "not-allowed" : "pointer",
                      opacity: savingPrefs ? 0.7 : 1,
                      transition: `all ${T.transitionBase}`,
                    }}
                  >
                    {savingPrefs ? "Saving…" : "Save"}
                  </button>
                )}
              </div>
              {isUserDemo && (
                <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 14, lineHeight: 1.5 }}>
                  Sample target schools for Marcus Johnson. With a Season Pass, you set your own.
                </div>
              )}

              {prefsSaved && (
                <div style={{
                  background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)",
                  borderRadius: 8, padding: "10px 14px", color: "#34d399",
                  fontSize: 13, marginBottom: 16,
                }}>
                  Target schools saved!
                </div>
              )}
              {prefsError && (
                <div style={{
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "10px 14px", color: "#f87171",
                  fontSize: 13, marginBottom: 16,
                }}>
                  {prefsError}
                </div>
              )}

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 20,
                pointerEvents: isUserDemo ? "none" : undefined,
                opacity: isUserDemo ? 0.75 : 1,
              }}>
                {DIVISIONS.map(div => (
                  <div key={div.key}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: "#e8a020",
                      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
                    }}>
                      {div.label} — Top 3
                    </div>
                    {[1, 2, 3].map(n => {
                      const fk = `${div.key}_${n}`;
                      return (
                        <SchoolCombobox
                          key={fk}
                          value={prefsForm[fk] || ""}
                          onChange={val => {
                            setPrefsField(fk)(val);
                            setPrefsDirty(true);
                          }}
                          schools={divisionSchools[div.key]}
                          loading={allSchoolsLoading}
                          placeholder={`#${n} ${div.label} school`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── Add Activity Modal ── */}
      {showAdd && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}>
          {/* Backdrop */}
          <div
            onClick={() => { if (!saving) { setShowAdd(false); setEditingId(null); setAddForm(BLANK_FORM); } }}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)" }}
          />
          {/* Sheet */}
          <div style={{
            position: "relative",
            background: "#111827",
            borderRadius: "20px 20px 0 0",
            padding: "28px 24px 48px",
            width: "100%", maxWidth: 580,
            maxHeight: "90vh", overflowY: "auto",
            boxSizing: "border-box",
          }}>
            {/* Handle */}
            <div style={{
              width: 40, height: 4, background: "#374151", borderRadius: 2,
              margin: "-12px auto 20px",
            }} />

            {/* Modal title */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <span style={{ fontSize: 22 }}>{typeInfo.icon}</span>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 24, letterSpacing: 1,
              }}>
                {editingId ? "Edit" : "Log"} {typeInfo.label}
              </div>
              <button
                onClick={() => { if (!saving) { setShowAdd(false); setEditingId(null); setAddForm(BLANK_FORM); } }}
                style={{
                  marginLeft: "auto", background: "none", border: "none",
                  color: "#6b7280", fontSize: 22, cursor: "pointer", lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>

            {/* Activity type selector — grouped */}
            <div style={{ marginBottom: 22 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: "#6b7280",
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
              }}>
                Activity Type
              </div>
              {TYPE_GROUPS.map(grp => {
                const groupTypes = Object.entries(ACTIVITY_TYPES).filter(([, info]) => info.group === grp);
                return (
                  <div key={grp} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#4b5563", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{grp}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {groupTypes.map(([key, info]) => {
                        const active = addForm.activity_type === key;
                        return (
                          <button
                            key={key}
                            onClick={() => { setAddForm(p => ({ ...p, activity_type: key })); setShowAdvanced(false); }}
                            style={{
                              background: active ? "rgba(232,160,32,0.12)" : "#0a0e1a",
                              border: active ? "1px solid #e8a020" : "1px solid #374151",
                              borderRadius: 8, padding: "5px 10px",
                              color: active ? "#e8a020" : "#9ca3af",
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 4,
                            }}
                          >
                            {info.icon} {info.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dynamic fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {currentFields.includes("school_name") && (
                <div>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: "#6b7280",
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
                  }}>
                    School Name
                  </div>
                  <SchoolCombobox
                    value={addForm.school_name || ""}
                    onChange={setField("school_name")}
                    onSchoolSelect={s => setAddForm(p => ({ ...p, school_name: s.school_name, school_id: s.id || "" }))}
                    onFreeText={() => setAddForm(p => ({ ...p, school_id: "" }))}
                    schools={allSchools}
                    loading={allSchoolsLoading}
                    placeholder="Search schools…"
                  />
                  {COACH_VISIBLE_TYPES.has(addForm.activity_type) && addForm.school_name && !addForm.school_id && (
                    <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 5, lineHeight: 1.5 }}>
                      ⚠ Select a school from the list so Coach HQ can group interest correctly.
                    </div>
                  )}
                </div>
              )}
              {currentFields.includes("activity_date") && (
                <FormField
                  label="Date"
                  type="date"
                  value={addForm.activity_date}
                  onChange={setField("activity_date")}
                />
              )}
              {currentFields.includes("coach_name") && (
                <FormField
                  label="College Coach Name"
                  value={addForm.coach_name}
                  onChange={setField("coach_name")}
                  placeholder="e.g. Coach Smith"
                />
              )}
              {currentFields.includes("coach_title") && (
                <FormField
                  label="Coach Title"
                  value={addForm.coach_title}
                  onChange={setField("coach_title")}
                  placeholder="e.g. Offensive Coordinator"
                />
              )}
              {currentFields.includes("coach_twitter") && (
                <FormField
                  label="Coach Twitter / X"
                  value={addForm.coach_twitter}
                  onChange={setField("coach_twitter")}
                  placeholder="@handle"
                />
              )}
              {currentFields.includes("notes") && (
                <FormField
                  label={addForm.activity_type === "camp_meeting" ? "Conversation Summary" : "Notes"}
                  value={addForm.notes}
                  onChange={setField("notes")}
                  placeholder="Optional notes..."
                  multiline
                />
              )}
            </div>

            {/* ── Signal Quality ── always visible for all signal_quality types */}
            {currentFields.includes("signal_quality") && (
              <div style={{ marginTop: 16, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, padding: "14px 16px" }}>

                {/* Q1: Two-way exchange */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399", marginBottom: 3 }}>
                  Was this a real back-and-forth exchange?
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                  This helps confirm there was real two-way communication.
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                  {[{ val: true, label: "Yes — both responded" }, { val: false, label: "No reply yet" }, { val: null, label: "Not sure" }].map(opt => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => setAddForm(p => ({ ...p, is_two_way_engagement: opt.val }))}
                      style={{
                        padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                        background: addForm.is_two_way_engagement === opt.val ? "rgba(52,211,153,0.15)" : "#0a0e1a",
                        border: addForm.is_two_way_engagement === opt.val ? "1px solid #34d399" : "1px solid #374151",
                        color: addForm.is_two_way_engagement === opt.val ? "#34d399" : "#9ca3af",
                      }}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ borderTop: "1px solid rgba(52,211,153,0.15)", marginBottom: 14 }} />

                {/* Q2: Athlete-specific */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399", marginBottom: 3 }}>
                  Was this specifically directed at your athlete?
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                  Coach HQ only counts this as true traction when the contact was personal to your athlete.
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {[{ val: true, label: "Yes — athlete-specific" }, { val: false, label: "No — generic/template" }].map(opt => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => setAddForm(p => ({ ...p, is_athlete_specific: opt.val }))}
                      style={{
                        padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                        background: addForm.is_athlete_specific === opt.val ? "rgba(52,211,153,0.15)" : "#0a0e1a",
                        border: addForm.is_athlete_specific === opt.val
                          ? "1px solid #34d399"
                          : addForm.is_athlete_specific === null && addForm.is_two_way_engagement === true
                            ? "1px solid rgba(245,158,11,0.6)"
                            : "1px solid #374151",
                        color: addForm.is_athlete_specific === opt.val ? "#34d399" : "#9ca3af",
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
                {/* Nudge — only relevant for dm/text types where both flags gate traction */}
                {AUTO_EXPAND_SIGNAL_TYPES.has(addForm.activity_type) && addForm.is_two_way_engagement === true && addForm.is_athlete_specific === null && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, lineHeight: 1.5 }}>
                    ↑ Choose whether this was personal to your athlete to complete the traction check.
                  </div>
                )}
                {/* Combined note — only for types where both flags gate classification */}
                {AUTO_EXPAND_SIGNAL_TYPES.has(addForm.activity_type) && (
                  <div style={{ fontSize: 11, color: "#4b5563", marginTop: 12, lineHeight: 1.5 }}>
                    True traction requires both answers to be Yes.
                  </div>
                )}

                {/* Evidence reference — always visible, no collapse */}
                <div style={{ borderTop: "1px solid rgba(52,211,153,0.15)", marginTop: 14, paddingTop: 14 }}>
                  <FormField
                    label="Evidence Reference (optional)"
                    value={addForm.evidence_reference}
                    onChange={setField("evidence_reference")}
                    placeholder="Screenshot filename, DM link, etc."
                  />
                </div>
              </div>
            )}

            {/* ── Offer fields ── */}
            {currentFields.includes("offer_fields") && (
              <div style={{ marginTop: 16, borderTop: "1px solid #1f2937", paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>Offer Type</div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {[{ val: "scholarship", label: "Scholarship" }, { val: "preferred_walk_on", label: "Preferred Walk-on" }, { val: "walk_on", label: "Walk-on" }].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setAddForm(p => ({ ...p, offer_type: p.offer_type === opt.val ? "" : opt.val }))}
                        style={{
                          padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                          background: addForm.offer_type === opt.val ? "rgba(232,160,32,0.12)" : "#0a0e1a",
                          border: addForm.offer_type === opt.val ? "1px solid #e8a020" : "1px solid #374151",
                          color: addForm.offer_type === opt.val ? "#e8a020" : "#9ca3af",
                        }}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>Offer Status</div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {[{ val: "active", label: "Active" }, { val: "accepted", label: "Accepted" }, { val: "declined", label: "Declined" }, { val: "expired", label: "Expired" }, { val: "withdrawn", label: "Withdrawn" }].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setAddForm(p => ({ ...p, offer_status: p.offer_status === opt.val ? "" : opt.val }))}
                        style={{
                          padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                          background: addForm.offer_status === opt.val ? "rgba(232,160,32,0.12)" : "#0a0e1a",
                          border: addForm.offer_status === opt.val ? "1px solid #e8a020" : "1px solid #374151",
                          color: addForm.offer_status === opt.val ? "#e8a020" : "#9ca3af",
                        }}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {addError && (
              <div style={{
                marginTop: 16,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13,
              }}>
                {addError}
              </div>
            )}

            <button
              onClick={editingId ? submitEdit : submitAdd}
              disabled={saving}
              style={{
                marginTop: 24, width: "100%",
                background: "#e8a020", border: "none", borderRadius: 10,
                padding: "14px 20px", color: "#0a0e1a",
                fontSize: 15, fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : `Save ${typeInfo.label}`}
            </button>
          </div>
        </div>
      )}
      <GuidedTourOverlay tourKey="tracker" />
    </div>
  );
}

// ── School combobox ───────────────────────────────────────────────────────────
function SchoolCombobox({ value, onChange, onSchoolSelect, onFreeText, schools, loading, placeholder }) {
  const [query, setQuery]   = useState(value || "");
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef(null);

  // Sync query when parent resets the form
  useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = loading ? [] : (() => {
    const q = query.trim().toLowerCase();
    if (!q) return schools.slice(0, 10);
    return schools
      .filter(s => (s.school_name || "").toLowerCase().includes(q))
      .slice(0, 12);
  })();

  function select(school) {
    setQuery(school.school_name);
    onChange(school.school_name);
    if (onSchoolSelect) onSchoolSelect(school); // pass full school object (includes id)
    setOpen(false);
  }

  function clear(e) {
    e.preventDefault();
    e.stopPropagation();
    setQuery("");
    onChange("");
    if (onFreeText) onFreeText(); // clear any stored school_id
  }

  useEffect(() => {
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: 8 }}>
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); if (onFreeText) onFreeText(); setOpen(true); }}
          onFocus={e => { setOpen(true); e.currentTarget.style.borderColor = "#e8a020"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#374151"; }}
          onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
          placeholder={loading ? "Loading schools…" : placeholder}
          disabled={loading}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#0a0e1a", border: "1px solid #374151",
            borderRadius: 8, padding: query ? "9px 32px 9px 12px" : "9px 12px",
            color: "#f9fafb", fontSize: 14, fontFamily: "inherit", outline: "none",
            opacity: loading ? 0.5 : 1,
          }}
        />
        {query && (
          <button
            onMouseDown={clear}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "#6b7280",
              cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "#1f2937", border: "1px solid #374151", borderRadius: 8,
          maxHeight: 220, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {filtered.map((s, i) => (
            <div
              key={s.id || s.school_name}
              onMouseDown={() => select(s)}
              style={{
                padding: "9px 12px", cursor: "pointer", fontSize: 13, color: "#f9fafb",
                borderBottom: i < filtered.length - 1 ? "1px solid #111827" : "none",
                userSelect: "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,160,32,0.1)"; e.currentTarget.style.color = "#e8a020"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#f9fafb"; }}
            >
              {s.school_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared form field component ───────────────────────────────────────────────
function FormField({ label, value, onChange, placeholder, type = "text", multiline }) {
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "#0a0e1a", border: "1px solid #374151",
    borderRadius: 10, padding: "10px 14px",
    color: "#f9fafb", fontSize: 14, fontFamily: "inherit",
    outline: "none",
    ...(type === "date" ? { colorScheme: "dark" } : {}),
  };

  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: "#6b7280",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
      }}>
        {label}
      </div>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, resize: "vertical" }}
          onFocus={e => { e.target.style.borderColor = "#e8a020"; }}
          onBlur={e => { e.target.style.borderColor = "#374151"; }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          onFocus={e => { e.target.style.borderColor = "#e8a020"; }}
          onBlur={e => { e.target.style.borderColor = "#374151"; }}
        />
      )}
    </div>
  );
}
