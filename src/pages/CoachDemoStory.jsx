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
  metrics: { anyInterest: 7, trueTraction: 4, visitsOffers: 6, colleges: 12, heatingUp: 3, repeatColleges: 5, recentActivity: 14, needsAttention: 2 },
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

// ── Shared: explainer card (WhyPanel visual style — light card on dark page) ──
function ExplainerCard({ label, title, children }) {
  return (
    <div style={{
      background: "#f1f5f9",
      border: "1.5px solid #e2e8f0",
      borderRadius: 16,
      padding: "16px 18px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.15)",
    }}>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
          {label}
        </div>
      )}
      {title && (
        <div style={{ fontSize: "clamp(14px, 2.4vw, 17px)", fontWeight: 700, color: "#0f172a", lineHeight: 1.3, marginBottom: 10 }}>
          {title}
        </div>
      )}
      {children}
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
  // Mirrors the real Coach HQ section: intro narrative, athlete blocks (limited to 3),
  // and the period recap with stat chips and most-active programs.
  const narrative = "Since your last visit, 4 athletes had recruiting activity across the program, including a scholarship offer and an unofficial visit.";
  const athleteBlocks = [
    { name: "Jaylen Carter",   text: "Florida extended a scholarship offer after his spring camp visit. Ohio State and Georgia also remain in contact with direct follow activity logged." },
    { name: "Marcus Okafor",   text: "Unofficial visit completed at Auburn. Tennessee has also been active with direct contact logged in the period." },
    { name: "DeShawn Williams",text: "Campus tour at Michigan added him to their prospect list. The defensive coordinator made direct contact." },
  ];
  const statChips = [
    { value: 4, label: "Athletes active",   qualifier: null,           accent: "#34d399", active: true },
    { value: 3, label: "With new traction", qualifier: "3 schools",    accent: "#60a5fa", active: true },
    { value: 4, label: "Major outcomes",    qualifier: "1 offer · 1 visit", accent: "#f59e0b", active: true },
    { value: 2, label: "Camp registrations",qualifier: "2 athletes",   accent: "#a78bfa", active: true },
  ];
  const topColleges = ["Florida", "Auburn", "Georgia"];

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ width: 3, height: 20, background: "#34d399", borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: "#f1f5f9" }}>COACH UPDATE</span>
        <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600 }}>recent recruiting changes in the selected period</span>
        {/* Period toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {["Since Last Visit", "30D", "60D", "90D"].map((label, i) => (
            <div key={label} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid", fontSize: 10, fontWeight: 700, background: i === 0 ? "#34d399" : "transparent", color: i === 0 ? "#111827" : "#4b5563", borderColor: i === 0 ? "#34d399" : "#374151" }}>{label}</div>
          ))}
        </div>
      </div>
      {/* Card */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 22px", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
        {/* Intro narrative */}
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#d1d5db", lineHeight: 1.7 }}>{narrative}</p>
        {/* Athlete blocks — limited to 3 */}
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 7 }}>
          {athleteBlocks.map((block, i) => (
            <div key={i} style={{ background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 9, padding: "9px 13px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", marginBottom: 3 }}>{block.name}</div>
              <div style={{ fontSize: 12.5, color: "#d1d5db", lineHeight: 1.6 }}>{block.text}</div>
            </div>
          ))}
        </div>
        {/* Period recap */}
        <div style={{ borderTop: "1px solid #1f2937", paddingTop: 14 }}>
          {/* Stat chips 2x2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 10 }}>
            {statChips.map(({ value, label, qualifier, accent, active }) => (
              <div key={label} style={{ background: active ? `${accent}0d` : "rgba(255,255,255,0.02)", border: `1px solid ${active ? accent + "28" : "#1a2535"}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: active ? accent : "#2d3748", lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? "#6b7280" : "#2d3748", lineHeight: 1.3 }}>{label}</span>
                {qualifier && <span style={{ fontSize: 9.5, color: "#4b5563", marginTop: 2 }}>{qualifier}</span>}
              </div>
            ))}
          </div>
          {/* Most active programs */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1a2535", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Most active programs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {topColleges.map((col, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, color: i === 0 ? "#e8a020" : "#374151", minWidth: 11, textAlign: "right" }}>{i + 1}</span>
                  <div style={{ height: 2, borderRadius: 1, width: i === 0 ? 20 : i === 1 ? 12 : 6, background: i === 0 ? "rgba(232,160,32,0.4)" : i === 1 ? "rgba(148,163,184,0.18)" : "rgba(255,255,255,0.05)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? "#e8a020" : i === 1 ? "#9ca3af" : "#6b7280" }}>{col}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 9, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>SAMPLE DATA</div>
      </div>
    </div>
  );
}

function MetricTilesPreview() {
  const m = PD.metrics;
  const tiles = [
    { label: "Any Interest",     value: m.anyInterest,     color: "#34d399", sub: "players w/ a signal" },
    { label: "True Traction",    value: m.trueTraction,    color: "#60a5fa", sub: "verified contact" },
    { label: "Visits / Offers",  value: m.visitsOffers,    color: "#f59e0b", sub: "confirmed outcomes" },
    { label: "Engaged Colleges", value: m.colleges,        color: "#a78bfa", sub: "schools in pipeline" },
    { label: "Heating Up",       value: m.heatingUp,       color: "#fb923c", sub: "rising momentum" },
    { label: "Repeat Colleges",  value: m.repeatColleges,  color: "#e8a020", sub: "2+ athletes each" },
    { label: "Recent Activity",  value: m.recentActivity,  color: "#94a3b8", sub: "actions this period" },
    { label: "Needs Attention",  value: m.needsAttention,  color: "#f87171", sub: "coach review" },
  ];
  return (
    <PreviewFrame accent="#e8a020" label="HEADLINE PROGRAM METRICS">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {tiles.map(t => <MiniTile key={t.label} {...t} />)}
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
        <SummaryPreview />
        <ExplainerCard label="Section 1 of 8" title="Program Recruiting Summary">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            The Program Recruiting Summary on Coach HQ is designed to give a coach a single, fast
            read on what is happening across the program's recruiting activity.
          </p>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 12px" }}>
            In plain terms, the summary is built by taking all of the recruiting signals tied to the
            athletes in that coach's program and combining them into one structured snapshot. That
            typically includes:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { icon: "👤", text: "which athletes have activity on record" },
              { icon: "🏫", text: "which schools are engaging" },
              { icon: "📋", text: "what kinds of activity are happening" },
              { icon: "🗓️", text: "when that activity occurred" },
              { icon: "📊", text: "whether traction is spread across the roster or concentrated on a few players" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.55 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 3: Coach Update ──────────────────────────────────────────────────
  {
    nextLabel: "Headline Metrics",
    render: () => (
      <>
        <UpdatePreview />
        <ExplainerCard label="Section 2 of 8" title="Coach Update">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            The Coach Update is designed to give the coach a clear narrative of what has actually
            happened across the program during a selected time period.
          </p>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 12px" }}>
            Where the Program Recruiting Summary is the higher-level snapshot, the Coach Update is
            meant to answer:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
            {[
              { icon: "🎯", text: "What specifically happened recently?" },
              { icon: "👤", text: "Which athlete had activity?" },
              { icon: "🏫", text: "Which college was involved?" },
              { icon: "📞", text: "Who made contact, and how did they engage?" },
              { icon: "💡", text: "What should I understand from this activity as a coach?" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.55 }}>{item.text}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
            It is created by pulling recent recruiting actions across the roster and turning them into
            a readable update rather than making the coach sort through raw activity logs.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 4: Headline Metric Tiles ─────────────────────────────────────────
  {
    nextLabel: "Players Heating Up",
    render: () => {
      const groups = [
        {
          label: "Interest, Traction and Outcomes",
          tiles: [
            {
              color: "#34d399",
              name: "Any Interest",
              definition: "Players with at least one recorded recruiting signal. This includes any logged activity that indicates possible college interest, even if it is still early-stage.",
              detail: "Athlete · school · signal type · latest activity",
            },
            {
              color: "#60a5fa",
              name: "True Traction",
              definition: "Players with verified recruiting momentum. This includes higher-confidence activity such as direct outreach, verified contact, or other stronger interaction that moves beyond general signal or noise.",
              detail: "Athlete · school · verified contact or action · date",
            },
            {
              color: "#f59e0b",
              name: "Visits / Offers",
              definition: "Confirmed recruiting outcomes such as unofficial visits, official visits, and scholarship offers that are on record for athletes in the program.",
              detail: "Athlete · school · visit or offer type · status · date",
            },
          ],
        },
        {
          label: "College Engagement",
          tiles: [
            {
              color: "#a78bfa",
              name: "Engaged Colleges",
              definition: "Unique colleges that have recorded recruiting activity tied to athletes in the program.",
              detail: "College · linked athletes · activity type · latest date",
            },
            {
              color: "#e8a020",
              name: "Repeat Colleges",
              definition: "Colleges engaging more than one athlete in the program, showing broader interest across the roster rather than interest limited to a single player.",
              detail: "College · linked athletes · connection count · recent activity",
            },
          ],
        },
        {
          label: "Momentum and Attention",
          tiles: [
            {
              color: "#fb923c",
              name: "Heating Up",
              definition: "Players showing rising recent momentum based on recent activity volume, stronger signals, or an increase in college engagement.",
              detail: "Athlete · driving schools · activity trend · latest date",
            },
            {
              color: "#94a3b8",
              name: "Recent Activity",
              definition: "The total number of recruiting actions logged during the selected time period across the roster.",
              detail: "Athlete · school · action · contact method · date",
            },
            {
              color: "#f87171",
              name: "Needs Attention",
              definition: "Players who may require coach review because of notable activity, missing follow-up, emerging momentum, or another condition that suggests a coach should take a closer look.",
              detail: "Athlete · issue flagged · related activity · follow-up need",
            },
          ],
        },
      ];
      return (
        <>
          <MetricTilesPreview />
          <ExplainerCard label="Section 3 of 8" title="Headline Metrics">
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 18px" }}>
              The tile dashboard is the coach's at-a-glance recruiting command center. It pulls key
              signals from across the roster and turns them into a simple visual summary, helping the
              coach see where interest exists, where traction is becoming real, which colleges are
              active, and which players may require closer attention.
            </p>

            {groups.map((group, gi) => (
              <div key={group.label} style={{ marginBottom: gi < groups.length - 1 ? 16 : 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  {group.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {group.tiles.map((tile, ti) => {
                    const spanFull = group.tiles.length % 2 !== 0 && ti === group.tiles.length - 1;
                    return (
                      <div
                        key={tile.name}
                        style={{
                          background: "rgba(255,255,255,0.72)",
                          border: "1px solid #e2e8f0",
                          borderTop: `3px solid ${tile.color}`,
                          borderRadius: 10,
                          padding: "10px 11px",
                          display: "flex",
                          flexDirection: "column",
                          gridColumn: spanFull ? "1 / -1" : "auto",
                        }}
                      >
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a", marginBottom: 5 }}>
                          {tile.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55, flex: 1 }}>
                          {tile.definition}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 7, paddingTop: 6, borderTop: "1px solid #e8edf3", lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 600, color: "#64748b" }}>Detail: </span>
                          {tile.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "16px 0 0", paddingLeft: 10, borderLeft: "2px solid rgba(232,160,32,0.5)" }}>
              Every tile is an entry point. The numbers are the summary. The detail is behind the click.
            </p>
          </ExplainerCard>
        </>
      );
    },
  },
  // ── STEP 5: Players Heating Up ────────────────────────────────────────────
  {
    nextLabel: "True Traction Board",
    render: () => (
      <>
        <HeatingUpPreview />
        <ExplainerCard label="Section 4 of 8" title="Players Heating Up">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            This section surfaces athletes who are showing increasing momentum right now. These are
            not necessarily the most recruited players on the roster. They are the ones whose activity
            curve is trending upward most noticeably in the recent period.
          </p>
          <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: 0, paddingLeft: 10, borderLeft: "2px solid rgba(232,160,32,0.5)" }}>
            Spot momentum shifts early so you can follow up or encourage athletes before the window shifts.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 6: True Traction Board ───────────────────────────────────────────
  {
    nextLabel: "Colleges Engaging",
    render: () => (
      <>
        <TractionBoardPreview />
        <ExplainerCard label="Section 5 of 8" title="True Traction Board">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            Where Players Heating Up signals momentum, this section signals substance. These athletes
            have consistent, documented contact from one or more college programs. This is the board
            coaches want to see grow over the course of the season.
          </p>
          <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: 0, paddingLeft: 10, borderLeft: "2px solid rgba(232,160,32,0.5)" }}>
            See which athletes have moved from early noise into real, verified recruiting traction.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 7: Colleges Engaging ─────────────────────────────────────────────
  {
    nextLabel: "Recent Activity",
    render: () => (
      <>
        <CollegesPreview />
        <ExplainerCard label="Section 6 of 8" title="Colleges Engaging the Program">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            This view shows which college programs are actively engaging your roster and how many
            athletes each school is connected to. It helps you understand the breadth of college
            engagement across the program, not just for individual athletes.
          </p>
          <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: 0, paddingLeft: 10, borderLeft: "2px solid rgba(232,160,32,0.5)" }}>
            See which schools are most active across the roster and identify where program-wide interest is growing.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 8: Recent Recruiting Activity ────────────────────────────────────
  {
    nextLabel: "Invite Families",
    render: () => (
      <>
        <ActivityPreview />
        <ExplainerCard label="Section 7 of 8" title="Recent Recruiting Activity">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            This is the supporting evidence layer behind the broader program story. Every event
            athletes and families log across the roster appears here, giving you a running view of
            what is happening and where the activity is coming from.
          </p>
          <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: 0, paddingLeft: 10, borderLeft: "2px solid rgba(232,160,32,0.5)" }}>
            Connect the summary-level view to the ground-level activity that drives it.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 9: Invite Parents / Tools ────────────────────────────────────────
  {
    nextLabel: "One More Thing",
    render: () => (
      <>
        <ToolsPreview />
        <ExplainerCard label="Section 8 of 8" title="Invite Families and Manage Your Account">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            These tools help you share the platform with families, manage account settings, and
            support communication across the roster. Inviting families is the most important action a
            coach can take to get real data flowing into Coach HQ.
          </p>
          <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: 0, paddingLeft: 10, borderLeft: "2px solid rgba(232,160,32,0.5)" }}>
            Bring families in, connect them to your program, and activate the recruiting data layer that makes Coach HQ useful.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 10: Giveback ─────────────────────────────────────────────────────
  {
    nextLabel: "Explore Coach HQ",
    render: () => (
      <>
        <GivebackPreview />
        <ExplainerCard
          label="Added Benefit"
          title="URecruitHQ gives coaches a simple way to support families with a better recruiting resource while creating a built-in giveback opportunity for the program."
        >
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
            As families subscribe through your team, your program becomes eligible for quarterly
            donations based on subscription activity. Giveback levels are tiered to reward stronger
            participation and broader family engagement across the program.
          </p>
        </ExplainerCard>
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
