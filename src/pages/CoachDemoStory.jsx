// src/pages/CoachDemoStory.jsx
// Coach demo journey: 2-step intro + 8 controlled section explainer screens + giveback.
// No live Coach HQ is shown during the explanation phase.
// After the final step, routes to /CoachDashboard?demo=coach for free exploration.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

const TOTAL_STEPS = 11; // 2 intro + 8 section explainers + 1 giveback

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  eyebrow: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    margin: "0 0 10px",
  },
  headline: {
    fontSize: "clamp(22px, 3.8vw, 30px)",
    fontWeight: 700,
    color: "#f1f5f9",
    lineHeight: 1.25,
    margin: "0 0 12px",
  },
  support: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 1.6,
    margin: 0,
    maxWidth: 480,
  },
  sectionTitle: {
    fontSize: "clamp(17px, 2.8vw, 22px)",
    fontWeight: 700,
    color: "#f1f5f9",
    lineHeight: 1.3,
    margin: "0 0 10px",
  },
  sectionBody: {
    fontSize: 14,
    color: "#9ca3af",
    lineHeight: 1.65,
    margin: 0,
  },
  callout: {
    fontSize: 12.5,
    color: "#6b7280",
    lineHeight: 1.6,
    margin: "10px 0 0",
    paddingLeft: 10,
    borderLeft: "2px solid rgba(232,160,32,0.4)",
  },
};

// ── Representative preview data (matches demoCoachData naming) ─────────────────
const PD = {
  metrics: { anyInterest: 7, trueTraction: 4, visitsOffers: 6, colleges: 12, heatingUp: 3, repeatColleges: 5 },
  summary: { commits: 1, offers: 3, officialVisits: 1, unofficialVisits: 2, trueTraction: 4, anyInterest: 7, engagedColleges: 12, topAthlete: "Jaylen Carter", topCollege: "Florida" },
  update: [
    { initials: "JC", name: "Jaylen Carter",    body: "Offer received from Florida after spring camp visit",                    daysAgo: 2 },
    { initials: "MO", name: "Marcus Okafor",    body: "Unofficial visit completed at Auburn, follow-up conversation logged",    daysAgo: 5 },
    { initials: "DW", name: "DeShawn Williams", body: "Campus tour at Michigan, added to prospect list by defensive coordinator", daysAgo: 7 },
    { initials: "CH", name: "Caleb Harrison",   body: "First direct coach contact from Penn State area recruiter",               daysAgo: 9 },
  ],
  heatingUp: [
    { initials: "JC", name: "Jaylen Carter",  grad: 2026, detail: "3 coach contacts in the past 14 days", schools: ["Florida", "Georgia"] },
    { initials: "MO", name: "Marcus Okafor",  grad: 2026, detail: "2 contacts and a camp invite in 21 days", schools: ["Auburn", "Tennessee"] },
    { initials: "CH", name: "Caleb Harrison", grad: 2027, detail: "First direct coach contact from Penn State", schools: ["Penn State"] },
  ],
  traction: [
    { name: "Jaylen Carter",    level: "High",   schoolList: "Florida, Georgia, Ohio State", latest: "Offer Received" },
    { name: "Marcus Okafor",    level: "High",   schoolList: "Auburn, Tennessee",             latest: "Unofficial Visit" },
    { name: "DeShawn Williams", level: "Medium", schoolList: "Michigan, LSU",                 latest: "Campus Tour" },
    { name: "Caleb Harrison",   level: "Medium", schoolList: "Penn State",                    latest: "Direct Follow" },
  ],
  colleges: [
    { name: "Florida",    athletes: 3 }, { name: "Auburn",     athletes: 3 },
    { name: "Georgia",    athletes: 2 }, { name: "Tennessee",  athletes: 2 },
    { name: "Penn State", athletes: 2 }, { name: "Michigan",   athletes: 2 },
    { name: "Ohio State", athletes: 1 }, { name: "LSU",        athletes: 1 },
  ],
  activity: [
    { name: "Jaylen Carter",   type: "Offer Received",        college: "Florida",    daysAgo: 2,  color: "#f59e0b" },
    { name: "Marcus Okafor",   type: "Unofficial Visit",      college: "Auburn",     daysAgo: 5,  color: "#60a5fa" },
    { name: "DeShawn Williams",type: "Campus Tour",           college: "Michigan",   daysAgo: 7,  color: "#34d399" },
    { name: "Caleb Harrison",  type: "Direct Coach Contact",  college: "Penn State", daysAgo: 9,  color: "#34d399" },
    { name: "Malik Thompson",  type: "Camp Invite",           college: "Georgia",    daysAgo: 12, color: "#94a3b8" },
  ],
};

// ── Shared: intro point row ────────────────────────────────────────────────────
function PointRow({ points }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "24px 0 0" }}>
      {points.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "rgba(14,22,40,0.65)", border: "1px solid #1a2740", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, marginTop: 1 }}>
            {p.icon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e8edf3", lineHeight: 1.35, marginBottom: 4 }}>{p.lead}</div>
            <div style={{ fontSize: 12.5, color: "#5d6f84", lineHeight: 1.55 }}>{p.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared: section preview frame ─────────────────────────────────────────────
function PreviewFrame({ accent, label, children }) {
  return (
    <div style={{ background: "#0b1221", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden", boxShadow: "0 6px 32px rgba(0,0,0,0.55)", marginBottom: 22 }}>
      <div style={{ borderTop: `3px solid ${accent}`, padding: "9px 16px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid #1a2535", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 3, height: 14, background: accent, borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "#cbd5e1", letterSpacing: 1 }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em" }}>SAMPLE DATA</span>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

// ── Mini metric tile (used in metric tiles preview) ────────────────────────────
function MiniTile({ label, value, color, sub }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", boxShadow: `inset 0 3px 0 0 ${color}`, borderRadius: 10, padding: "11px 8px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
      <div style={{ fontSize: 8.5, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", lineHeight: 1.2, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 8.5, color: "#4b5563", textAlign: "center", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

// ── Traction level badge ───────────────────────────────────────────────────────
function TBadge({ level }) {
  const c = level === "High" ? "#f59e0b" : level === "Medium" ? "#60a5fa" : "#34d399";
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: c, background: `${c}18`, border: `1px solid ${c}40`, borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{level}</span>
  );
}

// ── Section preview components ─────────────────────────────────────────────────

function SummaryPreview() {
  // Mirrors the real Coach HQ section: narrative sentences, not stat boxes.
  // Lead sentence + divider + supporting context, matching the actual section layout.
  const s1 = "Jaylen Carter holds a scholarship offer from Florida, the program's top confirmed outcome this cycle.";
  const s2 = "Beyond that, 11 other schools have been active across 6 athletes on the roster, including some stronger direct contact signals, with 8 active in the last 30 days.";
  const s3 = "The recruiting picture shows a scholarship offer as the headline outcome, with mixed broader engagement including stronger contact signals distributed across multiple athletes.";
  return (
    <div style={{ marginBottom: 22 }}>
      {/* Section header — matches real Coach HQ header style */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 3, height: 20, background: "#e8a020", borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: "#f1f5f9" }}>PROGRAM RECRUITING SUMMARY</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em" }}>SAMPLE DATA</span>
      </div>
      {/* Summary card — matches real section card */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 22px", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
        {/* Lead takeaway */}
        <p style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)", lineHeight: 1.55 }}>{s1}</p>
        {/* Supporting context */}
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, fontSize: 13, color: "#94a3b8", lineHeight: 1.72 }}>
          <p style={{ margin: "0 0 9px" }}>{s2}</p>
          <p style={{ margin: 0 }}>{s3}</p>
        </div>
      </div>
    </div>
  );
}

function UpdatePreview() {
  return (
    <PreviewFrame accent="#34d399" label="COACH UPDATE">
      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
        {["Since Last Visit", "30D", "60D", "90D"].map((label, i) => (
          <div key={label} style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid", fontSize: 10, fontWeight: 700, background: i === 0 ? "#34d399" : "transparent", color: i === 0 ? "#111827" : "#4b5563", borderColor: i === 0 ? "#34d399" : "#374151" }}>{label}</div>
        ))}
      </div>
      {PD.update.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: i < PD.update.length - 1 ? "1px solid #1a2535" : "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1e2d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#34d399", flexShrink: 0 }}>{item.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e8edf3" }}>{item.name}</div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.45, marginTop: 2 }}>{item.body}</div>
          </div>
          <div style={{ fontSize: 9.5, color: "#374151", flexShrink: 0 }}>{item.daysAgo}d ago</div>
        </div>
      ))}
    </PreviewFrame>
  );
}

function MetricTilesPreview() {
  const m = PD.metrics;
  const tiles = [
    { label: "Any Interest",    value: m.anyInterest,    color: "#34d399", sub: "players w/ a signal" },
    { label: "True Traction",   value: m.trueTraction,   color: "#60a5fa", sub: "verified contact" },
    { label: "Visits / Offers", value: m.visitsOffers,   color: "#f59e0b", sub: "confirmed outcomes" },
    { label: "Colleges",        value: m.colleges,       color: "#a78bfa", sub: "schools in pipeline" },
    { label: "Heating Up",      value: m.heatingUp,      color: "#fb923c", sub: "last 30 days" },
    { label: "Repeat Colleges", value: m.repeatColleges, color: "#e8a020", sub: "2+ athletes each" },
  ];
  return (
    <PreviewFrame accent="#e8a020" label="HEADLINE PROGRAM METRICS">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7, marginBottom: 12 }}>
        {tiles.map(t => <MiniTile key={t.label} {...t} />)}
      </div>
      {/* Expanded True Traction panel beneath the tile row */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 8.5, color: "#4b5563", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>TRUE TRACTION BOARD (tile expanded)</div>
        {PD.traction.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < PD.traction.length - 1 ? "1px solid #1a2535" : "none" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e8edf3", flex: 1 }}>{a.name}</div>
            <TBadge level={a.level} />
            <div style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>{a.latest}</div>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function HeatingUpPreview() {
  return (
    <PreviewFrame accent="#fb923c" label="PLAYERS HEATING UP">
      {PD.heatingUp.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: i < PD.heatingUp.length - 1 ? "1px solid #1a2535" : "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fb923c", flexShrink: 0 }}>{a.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e8edf3" }}>{a.name}</span>
              <span style={{ fontSize: 9.5, color: "#6b7280" }}>Class of {a.grad}</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 5 }}>{a.detail}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {a.schools.map(s => (
                <span key={s} style={{ fontSize: 9, fontWeight: 700, color: "#fb923c", background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", borderRadius: 4, padding: "2px 6px" }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </PreviewFrame>
  );
}

function TractionBoardPreview() {
  return (
    <PreviewFrame accent="#60a5fa" label="TRUE TRACTION BOARD">
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "5px 12px", alignItems: "center" }}>
        {["Athlete", "Level", "Latest"].map(h => (
          <div key={h} style={{ fontSize: 8.5, color: "#374151", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: 6, borderBottom: "1px solid #1a2535" }}>{h}</div>
        ))}
        {PD.traction.map((a, i) => (
          <React.Fragment key={i}>
            <div style={{ paddingBottom: i < PD.traction.length - 1 ? 8 : 0, borderBottom: i < PD.traction.length - 1 ? "1px solid #1a2535" : "none" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e8edf3" }}>{a.name}</div>
              <div style={{ fontSize: 10, color: "#4b5563" }}>{a.schoolList}</div>
            </div>
            <div style={{ paddingBottom: i < PD.traction.length - 1 ? 8 : 0, borderBottom: i < PD.traction.length - 1 ? "1px solid #1a2535" : "none" }}><TBadge level={a.level} /></div>
            <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap", paddingBottom: i < PD.traction.length - 1 ? 8 : 0, borderBottom: i < PD.traction.length - 1 ? "1px solid #1a2535" : "none" }}>{a.latest}</div>
          </React.Fragment>
        ))}
      </div>
    </PreviewFrame>
  );
}

function CollegesPreview() {
  return (
    <PreviewFrame accent="#a78bfa" label="COLLEGES ENGAGING THE PROGRAM">
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 14px", alignItems: "center" }}>
        {["College", "Athletes"].map(h => (
          <div key={h} style={{ fontSize: 8.5, color: "#374151", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: 6, borderBottom: "1px solid #1a2535" }}>{h}</div>
        ))}
        {PD.colleges.map((c, i) => (
          <React.Fragment key={i}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e8edf3", paddingBottom: i < PD.colleges.length - 1 ? 6 : 0, borderBottom: i < PD.colleges.length - 1 ? "1px solid #1a2535" : "none" }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700, textAlign: "right", paddingBottom: i < PD.colleges.length - 1 ? 6 : 0, borderBottom: i < PD.colleges.length - 1 ? "1px solid #1a2535" : "none" }}>{c.athletes}</div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: "#374151" }}>+ 4 more schools across the roster</div>
    </PreviewFrame>
  );
}

function ActivityPreview() {
  return (
    <PreviewFrame accent="#4b5563" label="RECENT RECRUITING ACTIVITY">
      {PD.activity.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderBottom: i < PD.activity.length - 1 ? "1px solid #1a2535" : "none" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#e8edf3" }}>{item.name}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: item.color, background: `${item.color}18`, border: `1px solid ${item.color}40`, borderRadius: 4, padding: "1px 5px" }}>{item.type}</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#4b5563", marginTop: 2 }}>{item.college} · {item.daysAgo} days ago</div>
          </div>
        </div>
      ))}
    </PreviewFrame>
  );
}

function ToolsPreview() {
  return (
    <PreviewFrame accent="#34d399" label="COACH TOOLS">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {[
          { label: "+ Invite Parents", color: "#34d399", desc: "Share your program link with families" },
          { label: "☰ Tools",          color: "#94a3b8", desc: "Message roster, manage settings" },
          { label: "My Account",        color: "#94a3b8", desc: "Profile, email preferences" },
        ].map((b) => (
          <div key={b.label} style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 12px 10px", minWidth: 120, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: b.color, marginBottom: 3 }}>{b.label}</div>
            <div style={{ fontSize: 10, color: "#4b5563" }}>{b.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 8.5, color: "#374151", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>YOUR PROGRAM LINK</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, background: "#0b1221", border: "1px solid #1e293b", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#374151", fontFamily: "monospace" }}>urecruithq.com/join/your-program</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", padding: "6px 10px", background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.2)", borderRadius: 6, flexShrink: 0 }}>Copy</div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function GivebackPreview() {
  return (
    <div style={{ background: "linear-gradient(135deg, #0f1624 0%, #0b1221 100%)", border: "1px solid rgba(232,160,32,0.2)", borderRadius: 12, padding: "18px 18px 14px", marginBottom: 22, boxShadow: "0 4px 28px rgba(232,160,32,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(232,160,32,0.1)", border: "1px solid rgba(232,160,32,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🏆</div>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.1em" }}>Giveback Opportunity</span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-around", flexWrap: "wrap" }}>
        {[
          { tier: "Starter",  families: "5+ families",  note: "Eligible for quarterly donation" },
          { tier: "Builder",  families: "15+ families", note: "Increased donation tier" },
          { tier: "Champion", families: "30+ families", note: "Maximum giveback level" },
        ].map(t => (
          <div key={t.tier} style={{ flex: 1, minWidth: 90, textAlign: "center", padding: "6px 4px" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color: "#e8a020", letterSpacing: 1 }}>{t.tier}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginTop: 2 }}>{t.families}</div>
            <div style={{ fontSize: 9.5, color: "#374151", marginTop: 3, lineHeight: 1.4 }}>{t.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Intro content data ─────────────────────────────────────────────────────────
const PROBLEM_POINTS = [
  { icon: "📡", lead: "Recruiting updates are fragmented and incomplete", detail: "texts, screenshots, parent check-ins, and one-off conversations scattered across the season" },
  { icon: "📊", lead: "Hard to see what is really happening across the roster", detail: "which players are gaining real traction and where that traction is actually coming from" },
  { icon: "🤝", lead: "Difficult to know when to step in and support", detail: "athletes and families navigating a process that moves fast and punishes gaps in awareness" },
];

const PILLARS = [
  { icon: "👁️", lead: "See which athletes are getting attention", detail: "a live read on who has real college interest and how that interest is developing across the program" },
  { icon: "📈", lead: "Understand where interest is becoming real traction", detail: "distinguish surface-level contact from the consistent engagement that signals genuine momentum" },
  { icon: "🔗", lead: "Stay aligned with families without chasing scattered updates", detail: "one place where family-logged activity feeds directly into the program view coaches see" },
];

// ── Step definitions: each step is a render function ──────────────────────────
// nextLabel: the label for the primary CTA button on that step
const STEPS = [
  // ── STEP 0: Coach Problem ──────────────────────────────────────────────────
  {
    nextLabel: "What Coach HQ Helps With",
    render: () => (
      <>
        <p style={T.eyebrow}>The Challenge</p>
        <h1 style={T.headline}>
          Coaches want to help athletes earn opportunities, but recruiting updates are often
          fragmented and incomplete.
        </h1>
        <p style={{ ...T.support, marginBottom: 28 }}>
          Recruiting information is often scattered across texts, conversations, screenshots, and
          parent or athlete updates, making it hard to see real traction across the roster and where
          a coach needs to step in.
        </p>
        <PointRow points={PROBLEM_POINTS} />
      </>
    ),
  },
  // ── STEP 1: What Coach HQ Helps With ──────────────────────────────────────
  {
    nextLabel: "Start Coach HQ Tour",
    render: () => (
      <>
        <p style={T.eyebrow}>The Solution</p>
        <h1 style={T.headline}>
          Coach HQ helps coaches see recruiting momentum, support families, and track progress
          across the program.
        </h1>
        <p style={{ ...T.support, marginBottom: 28 }}>
          One dashboard. Real family-logged data. Clear signals on who is getting traction and where.
        </p>
        <PointRow points={PILLARS} />
      </>
    ),
  },
  // ── STEP 2: Program Recruiting Summary ────────────────────────────────────
  {
    nextLabel: "Coach Update",
    render: () => (
      <>
        <p style={{ ...T.eyebrow, marginBottom: 10 }}>Section 1 of 8</p>
        <h2 style={{ ...T.sectionTitle, marginBottom: 18 }}>Program Recruiting Summary</h2>
        <SummaryPreview />
        <p style={T.sectionBody}>
          The Program Recruiting Summary on Coach HQ is designed to give a coach a single, fast
          read on what is happening across the program's recruiting activity. It is created by
          rolling up athlete-level recruiting activity into a coach-level program view.
        </p>
        <p style={{ ...T.sectionBody, marginTop: 12 }}>
          In plain terms, the summary is built by taking all of the recruiting signals tied to the
          athletes in that coach's program and combining them into one structured snapshot. That
          typically includes:
        </p>
        <ul style={{ margin: "10px 0 0", padding: "0 0 0 18px", color: "#9ca3af", fontSize: 13.5, lineHeight: 1.85 }}>
          <li>which athletes have activity on record</li>
          <li>which schools are engaging</li>
          <li>what kinds of activity are happening</li>
          <li>when that activity occurred</li>
          <li>whether traction is spread across the roster or concentrated on a few players</li>
        </ul>
        <p style={{ ...T.sectionBody, marginTop: 12 }}>
          So instead of reviewing one athlete at a time, Coach HQ aggregates that underlying data
          and turns it into a program-wide summary.
        </p>
      </>
    ),
  },
  // ── STEP 3: Coach Update ──────────────────────────────────────────────────
  {
    nextLabel: "Headline Metrics",
    render: () => (
      <>
        <UpdatePreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 2 of 8</p>
        <h2 style={T.sectionTitle}>Coach Update</h2>
        <p style={T.sectionBody}>
          This is your period-based recruiting narrative and change summary. It shows what has
          changed recently across the roster and where activity has picked up. Use the time period
          toggles to see exactly the window that is most relevant to you right now.
        </p>
        <p style={T.callout}>
          Stay current on program-wide recruiting changes without chasing individual athlete updates.
        </p>
      </>
    ),
  },
  // ── STEP 4: Headline Metric Tiles ─────────────────────────────────────────
  {
    nextLabel: "Players Heating Up",
    render: () => (
      <>
        <MetricTilesPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 3 of 8</p>
        <h2 style={T.sectionTitle}>Headline Program Metrics</h2>
        <p style={T.sectionBody}>
          These tiles give you the fastest read on overall program momentum, traction, outcomes, and
          engagement. Each tile opens a detailed view of the underlying data. The True Traction tile,
          shown expanded above, surfaces which athletes have consistent, verified two-way contact
          with college programs.
        </p>
        <p style={T.callout}>
          Assess where the program stands and drill into any section that needs a closer look.
        </p>
      </>
    ),
  },
  // ── STEP 5: Players Heating Up ────────────────────────────────────────────
  {
    nextLabel: "True Traction Board",
    render: () => (
      <>
        <HeatingUpPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 4 of 8</p>
        <h2 style={T.sectionTitle}>Players Heating Up</h2>
        <p style={T.sectionBody}>
          This section surfaces athletes who are showing increasing momentum right now. These are
          not necessarily the most recruited players on the roster. They are the ones whose activity
          curve is trending upward most noticeably in the recent period.
        </p>
        <p style={T.callout}>
          Spot momentum shifts early so you can follow up or encourage athletes before the window shifts.
        </p>
      </>
    ),
  },
  // ── STEP 6: True Traction Board ───────────────────────────────────────────
  {
    nextLabel: "Colleges Engaging",
    render: () => (
      <>
        <TractionBoardPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 5 of 8</p>
        <h2 style={T.sectionTitle}>True Traction Board</h2>
        <p style={T.sectionBody}>
          Where Players Heating Up signals momentum, this section signals substance. These athletes
          have consistent, documented contact from one or more college programs. This is the board
          coaches want to see grow over the course of the season.
        </p>
        <p style={T.callout}>
          See which athletes have moved from early noise into real, verified recruiting traction.
        </p>
      </>
    ),
  },
  // ── STEP 7: Colleges Engaging ─────────────────────────────────────────────
  {
    nextLabel: "Recent Activity",
    render: () => (
      <>
        <CollegesPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 6 of 8</p>
        <h2 style={T.sectionTitle}>Colleges Engaging the Program</h2>
        <p style={T.sectionBody}>
          This view shows which college programs are actively engaging your roster and how many
          athletes each school is connected to. It helps you understand the breadth of college
          engagement across the program, not just for individual athletes.
        </p>
        <p style={T.callout}>
          See which schools are most active across the roster and identify where program-wide interest is growing.
        </p>
      </>
    ),
  },
  // ── STEP 8: Recent Recruiting Activity ────────────────────────────────────
  {
    nextLabel: "Invite Families",
    render: () => (
      <>
        <ActivityPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 7 of 8</p>
        <h2 style={T.sectionTitle}>Recent Recruiting Activity</h2>
        <p style={T.sectionBody}>
          This is the supporting evidence layer behind the broader program story. Every event
          athletes and families log across the roster appears here, giving you a running view of
          what is happening and where the activity is coming from.
        </p>
        <p style={T.callout}>
          Connect the summary-level view to the ground-level activity that drives it.
        </p>
      </>
    ),
  },
  // ── STEP 9: Invite Parents / Tools ────────────────────────────────────────
  {
    nextLabel: "One More Thing",
    render: () => (
      <>
        <ToolsPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Section 8 of 8</p>
        <h2 style={T.sectionTitle}>Invite Families and Manage Your Account</h2>
        <p style={T.sectionBody}>
          These tools help you share the platform with families, manage account settings, and
          support communication across the roster. Inviting families is the most important action a
          coach can take to get real data flowing into Coach HQ.
        </p>
        <p style={T.callout}>
          Bring families in, connect them to your program, and activate the recruiting data layer that makes Coach HQ useful.
        </p>
      </>
    ),
  },
  // ── STEP 10: Giveback ─────────────────────────────────────────────────────
  {
    nextLabel: "Explore Coach HQ",
    render: () => (
      <>
        <GivebackPreview />
        <p style={{ ...T.eyebrow, marginBottom: 6 }}>Added Benefit</p>
        <h2 style={T.sectionTitle}>
          URecruitHQ gives coaches a simple way to support families with a better recruiting
          resource while creating a built-in giveback opportunity for the program.
        </h2>
        <p style={T.sectionBody}>
          As families subscribe through your team, your program becomes eligible for quarterly
          donations based on subscription activity. Giveback levels are tiered to reward stronger
          participation and broader family engagement across the program.
        </p>
      </>
    ),
  },
];

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const pct = Math.round(((step + 1) / TOTAL_STEPS) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
      <div style={{ flex: 1, height: 3, background: "#1a2535", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#e8a020", borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>
      <span style={{ fontSize: 11, color: "#4b5563", flexShrink: 0 }}>
        {step + 1} of {TOTAL_STEPS}
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CoachDemoStory() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  function goTo(s) {
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, s)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish() {
    nav("/CoachDashboard?demo=coach");
  }

  function skip() {
    nav("/CoachDashboard?demo=coach");
  }

  const current = STEPS[step];
  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070c18",
        color: "#f1f5f9",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>

      {/* ── Top bar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(7,12,24,0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #0f1a2b",
        }}
      >
        <div
          style={{
            maxWidth: 740,
            margin: "0 auto",
            padding: "11px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img
            src={LOGO_URL}
            alt="URecruit HQ"
            style={{ height: 30, width: "auto", objectFit: "contain" }}
          />
          <button
            onClick={skip}
            style={{
              background: "none",
              border: "none",
              color: "#4b5563",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Skip to Coach HQ
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          maxWidth: 680,
          width: "100%",
          margin: "0 auto",
          padding: "32px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        <ProgressBar step={step} />

        {/* Step content */}
        <div key={step} style={{ marginBottom: 36 }}>
          {current.render()}
        </div>

        {/* ── Navigation ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 20,
            borderTop: "1px solid #0f1a2b",
            gap: 12,
          }}
        >
          {step > 0 ? (
            <button
              onClick={() => goTo(step - 1)}
              style={{
                background: "none",
                border: "1px solid #1e2d45",
                borderRadius: 9,
                padding: "10px 18px",
                color: "#6b7280",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back
            </button>
          ) : (
            <div />
          )}

          {isLastStep ? (
            <button
              onClick={finish}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "12px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              Explore Coach HQ
              <ArrowRight style={{ width: 15, height: 15 }} />
            </button>
          ) : (
            <button
              onClick={() => goTo(step + 1)}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              {current.nextLabel}
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
