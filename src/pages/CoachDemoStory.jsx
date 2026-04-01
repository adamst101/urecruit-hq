// src/pages/CoachDemoStory.jsx
// Coach demo journey: 2-step intro + 5 section explainers + 1 giveback.
// No live Coach HQ is shown during the explanation phase.
// After the final step, routes to /CoachDashboard?demo=coach for free exploration.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

const TOTAL_STEPS = 8; // 2 intro + 5 section explainers + 1 giveback

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
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, color: "#2d3f55", background: "#0f1a28", border: "1px solid #1a2d40", borderRadius: 20, padding: "2px 9px", letterSpacing: "0.06em" }}>sample data</span>
      </div>
      {/* Summary card — matches real section card */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 22px", boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.35)" }}>
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

// ── InviteParentsPreview ─────────────────────────────────────────────────────────
// Story-only curated product spotlight of the real Invite Parents sheet.
// Shows the invite code block, a fade-truncated email template preview, and a
// fade-truncated text template preview. No clipboard or backend calls.
// "Sample data" is a quiet inline pill — not a dominant banner.
function InviteParentsPreview() {
  const INVITE_CODE = "RWEBB25";
  const EMAIL_SUBJECT = "Optional Resource for Families Interested in College Football Recruiting";
  const EMAIL_BODY = `Dear Parents,

I want to share an optional resource that may be valuable for families with athletes who are interested in playing at the next level.

Many families begin this journey knowing their athlete has the dream to play college football, but not yet knowing how to navigate the process. As things begin to move, it can quickly become a mix of camp choices, registrations, dates, travel plans, costs, communication, and uncertainty about what matters most. URecruitHQ was created by parents who went through that process themselves and wanted a better way to stay organized and make smarter decisions along the way.`;

  const TEXT_BODY = `Hi parents. I wanted to share an optional resource that may be helpful for families with athletes interested in playing college football. URecruitHQ was created by parents who went through the process themselves and wanted a better way to stay organized around camps, dates, registrations, and recruiting movement. This is not required by our program.`;

  const SL = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
      {children}
    </div>
  );

  const CopyBtn = ({ children }) => (
    <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 7, padding: "6px 13px", fontSize: 11.5, fontWeight: 600, color: "#9ca3af", flexShrink: 0, cursor: "default" }}>
      {children}
    </div>
  );

  // Faded text block: visible content with gradient fade at the bottom
  function FadeBlock({ children, height = 90, style = {} }) {
    return (
      <div style={{ position: "relative" }}>
        <div style={{
          background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 10,
          padding: "13px 16px", fontSize: 12.5, color: "#9ca3af",
          lineHeight: 1.75, whiteSpace: "pre-wrap",
          maxHeight: height, overflow: "hidden",
          ...style,
        }}>
          {children}
        </div>
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 44,
          background: "linear-gradient(to bottom, rgba(10,14,26,0) 0%, #0a0e1a 100%)",
          borderRadius: "0 0 10px 10px", pointerEvents: "none",
        }} />
      </div>
    );
  }

  return (
    <div style={{
      background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 14,
      overflow: "hidden", marginBottom: 20,
      boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.4)",
    }}>
      {/* ── Panel header ── */}
      <div style={{
        background: "rgba(0,0,0,0.3)", borderBottom: "1px solid #1a2535",
        padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ width: 3, height: 15, background: "#34d399", borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: "#f1f5f9", letterSpacing: "0.06em" }}>
          INVITE PARENTS
        </span>
        {/* Sample-data pill — quiet, not dominant */}
        <span style={{
          marginLeft: "auto", fontSize: 9, fontWeight: 600,
          color: "#2d3f55", background: "#0f1a28",
          border: "1px solid #1a2d40", borderRadius: 20,
          padding: "2px 9px", letterSpacing: "0.06em",
        }}>
          sample data
        </span>
      </div>

      <div style={{ padding: "20px 20px 22px" }}>

        {/* ── Invite Code ── */}
        <div style={{ marginBottom: 22 }}>
          <SL>Your Invite Code</SL>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{
              fontFamily: "monospace", fontSize: 30, fontWeight: 700,
              color: "#e8a020", letterSpacing: 4,
              background: "#060a14", border: "1px solid #2d3f55",
              borderRadius: 10, padding: "14px 22px",
            }}>
              {INVITE_CODE}
            </div>
            <div style={{
              background: "#e8a020", color: "#0a0e1a",
              borderRadius: 8, padding: "12px 20px",
              fontSize: 13, fontWeight: 700, cursor: "default",
            }}>
              Copy Code
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1a2535", marginBottom: 20 }} />

        {/* ── Email Template (fade-truncated) ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <SL>Parent Email Template</SL>
            <CopyBtn>Copy Email</CopyBtn>
          </div>
          {/* Subject line */}
          <div style={{
            background: "#060a14", border: "1px solid #1f2937", borderBottom: "none",
            borderRadius: "9px 9px 0 0", padding: "9px 14px",
          }}>
            <span style={{ fontSize: 10, color: "#374151", fontWeight: 700, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Subject</span>
            <span style={{ fontSize: 11.5, color: "#6b7280" }}>{EMAIL_SUBJECT}</span>
          </div>
          {/* Body — faded */}
          <FadeBlock height={100} style={{ borderRadius: "0 0 9px 9px", border: "1px solid #1f2937" }}>
            {EMAIL_BODY}
          </FadeBlock>
        </div>

        <div style={{ borderTop: "1px solid #1a2535", marginBottom: 18 }} />

        {/* ── Text Template (fade-truncated) ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <SL>Parent Text / Message Template</SL>
            <CopyBtn>Copy Text</CopyBtn>
          </div>
          <FadeBlock height={70}>{TEXT_BODY}</FadeBlock>
        </div>

      </div>
    </div>
  );
}

// ── DiscoverPreview ─────────────────────────────────────────────────────────────
// Story-only static replica of the real Discover page SchoolGroupCard pattern.
// Mirrors real UI tokens: dark bg, amber accents, division/camp-count badges,
// city+price+grades meta row, date pills, left accent bar per camp row,
// and the Recommend coach share panel open on the first camp.
// No live data, no backend calls, no navigation.
function DiscoverPreview() {
  const UF = {
    abbr: "UF",
    accentColor: "#e8a020",
    name: "University of Florida",
    divisionLabel: "D1 · FBS · SEC",
    metaCity: "Gainesville, FL",
    metaPrice: "$175 – $300",
    metaGrades: "Grades 8–12",
    dates: ["Jun 14", "Jul 8"],
    camps: [
      {
        name: "Elite Skills Camp",
        date: "Jun 14, 2025",
        city: "Gainesville, FL",
        price: "$300",
        grades: "Grades 9–12",
        type: "Skills / 7-on-7",
        recommendOpen: true,
      },
      {
        name: "Team Camp",
        date: "Jul 8, 2025",
        city: "Gainesville, FL",
        price: "$175",
        grades: "Grades 8–12",
        type: "Full Team",
        recommendOpen: false,
      },
    ],
  };
  const UGA = {
    abbr: "UGA",
    accentColor: "#60a5fa",
    name: "University of Georgia",
    divisionLabel: "D1 · FBS · SEC",
    metaCity: "Athens, GA",
    metaPrice: "$225",
    metaGrades: "Grades 9–12",
    dates: ["Jun 21"],
    camps: [{ name: "Elite Skills Camp", date: "Jun 21, 2025", city: "Athens, GA", price: "$225", grades: "Grades 9–12", type: "All Skill Positions" }],
  };

  const recommendMsg =
    "I recommend checking out this camp: Elite Skills Camp at University of Florida\n📅 Jun 14, 2025 · 📍 Gainesville, FL · $300\n\nGreat opportunity for skill players to get in front of the UF staff.";

  // ── sub-components ────────────────────────────────────────────────────────────

  function SchoolAvatar({ abbr, color }) {
    return (
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        background: "#1e293b", border: `1.5px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color, flexShrink: 0,
        letterSpacing: "0.04em",
      }}>{abbr}</div>
    );
  }

  function Badge({ children, color }) {
    return (
      <span style={{
        fontSize: 9, fontWeight: 700, color,
        background: `${color}18`, border: `1px solid ${color}30`,
        borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
      }}>{children}</span>
    );
  }

  function DatePill({ label }) {
    return (
      <span style={{
        fontSize: 9.5, color: "#94a3b8",
        background: "#1a2535", border: "1px solid #1e293b",
        borderRadius: 20, padding: "2px 8px",
      }}>{label}</span>
    );
  }

  function CoachBtn({ label, active }) {
    return (
      <div style={{
        fontSize: 11, fontWeight: active ? 700 : 600,
        color: active ? "#86efac" : "#9ca3af",
        background: active ? "#1a2e1a" : "transparent",
        border: `1px solid ${active ? "#4ade80" : "#374151"}`,
        borderRadius: 7, padding: "5px 12px",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>{label}</div>
    );
  }

  function SchoolGroup({ school, expanded }) {
    return (
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
        {/* ── School header ── */}
        <div style={{ padding: "13px 16px", display: "flex", alignItems: "flex-start", gap: 11 }}>
          {/* Amber accent bar */}
          <div style={{ width: 3, alignSelf: "stretch", background: school.accentColor, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
          <SchoolAvatar abbr={school.abbr} color={school.accentColor} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Row 1: name + badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#f9fafb" }}>{school.name}</span>
              <Badge color={school.accentColor}>{school.divisionLabel}</Badge>
              <Badge color="#94a3b8">{school.camps.length} camp{school.camps.length !== 1 ? "s" : ""}</Badge>
            </div>
            {/* Row 2: city · price · grades */}
            <div style={{ fontSize: 10.5, color: "#6b7280", marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>📍 {school.metaCity}</span>
              <span>💰 {school.metaPrice}</span>
              <span>🎓 {school.metaGrades}</span>
            </div>
            {/* Row 3: date pills */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10.5 }}>📅</span>
              {school.dates.map(d => <DatePill key={d} label={d} />)}
            </div>
          </div>
          {/* Chevron */}
          <span style={{ fontSize: 13, color: "#4b5563", marginTop: 2, transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>›</span>
        </div>

        {/* ── Camp rows (only when expanded) ── */}
        {expanded && school.camps.map((camp, ci) => (
          <div key={ci} style={{ borderTop: "1px solid #1f2937" }}>
            <div style={{ display: "flex", gap: 0 }}>
              {/* Left accent bar: green when recommend open, muted otherwise */}
              <div style={{ width: 3, flexShrink: 0, background: camp.recommendOpen ? "#4ade80" : "#1f2937" }} />
              <div style={{ flex: 1, padding: "11px 14px 11px 12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  {/* Camp info */}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f9fafb", marginBottom: 4 }}>{camp.name}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10.5, color: "#6b7280" }}>{camp.date}</span>
                      <span style={{ fontSize: 10.5, color: "#6b7280" }}>{camp.city}</span>
                      <span style={{ fontSize: 10.5, color: "#e8a020" }}>{camp.price}</span>
                      <span style={{ fontSize: 10.5, color: "#6b7280" }}>{camp.grades}</span>
                      <span style={{ fontSize: 10.5, color: "#4b5563" }}>{camp.type}</span>
                    </div>
                  </div>
                  {/* Coach buttons */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <CoachBtn label="Recommend" active={camp.recommendOpen} />
                    <CoachBtn label="Message Roster" active={false} />
                  </div>
                </div>

                {/* ── Recommend panel (open for first camp) ── */}
                {camp.recommendOpen && (
                  <div style={{
                    marginTop: 10,
                    background: "#0d1a0d",
                    border: "1px solid #1a3a1a",
                    borderRadius: 9,
                    padding: "11px 13px",
                  }}>
                    {/* Panel header */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#86efac", marginBottom: 9 }}>
                      Recommend to Roster
                    </div>
                    {/* To: selector */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>To</div>
                      <div style={{
                        background: "#111827", border: "1px solid #1e293b",
                        borderRadius: 6, padding: "6px 10px",
                        fontSize: 11, color: "#94a3b8",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <span>All Athletes (5)</span>
                        <span style={{ color: "#374151", fontSize: 10 }}>▾</span>
                      </div>
                    </div>
                    {/* Message textarea */}
                    <div style={{ marginBottom: 9 }}>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>Message</div>
                      <div style={{
                        background: "#111827", border: "1px solid #1e293b",
                        borderRadius: 6, padding: "8px 10px",
                        fontSize: 10.5, color: "#6b7280",
                        lineHeight: 1.65, whiteSpace: "pre-wrap",
                      }}>{recommendMsg}</div>
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#4b5563", cursor: "default" }}>Cancel</span>
                      <div style={{
                        fontSize: 11, fontWeight: 700,
                        color: "#0a1a0a", background: "#4ade80",
                        borderRadius: 6, padding: "6px 14px",
                      }}>Send</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* ── Collapsed hint (when not expanded) ── */}
        {!expanded && (
          <div style={{ borderTop: "1px solid #1f2937", padding: "8px 16px 8px 19px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10.5, color: "#374151" }}>{school.camps.length} camp{school.camps.length !== 1 ? "s" : ""} · Tap to view</span>
            <span style={{ fontSize: 15, color: "#374151" }}>›</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden", marginBottom: 22, boxShadow: "0 6px 32px rgba(0,0,0,0.55)" }}>
      {/* ── Page chrome header ── */}
      <div style={{
        background: "rgba(0,0,0,0.35)", borderBottom: "1px solid #1a2535",
        padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ width: 3, height: 16, background: "#e8a020", borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: "#f1f5f9", letterSpacing: "0.06em" }}>
          DISCOVER CAMPS
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            COACH VIEW · SAMPLE DATA
          </span>
        </div>
      </div>

      {/* ── School list ── */}
      <div style={{ padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <SchoolGroup school={UF} expanded={true} />
        <SchoolGroup school={UGA} expanded={false} />
      </div>
    </div>
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
        {/* ── Step header ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            Section 1 of 4
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3.8vw, 28px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2, margin: "0 0 10px" }}>
            Program Recruiting Summary
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            Gives coaches a fast, program-level read on recruiting activity across the roster.
          </p>
        </div>

        {/* ── Hero insight card ── */}
        <SummaryPreview />

        {/* ── Slim dark support panel ── */}
        <div style={{
          background: "#0a0f1e", border: "1px solid #1a2535",
          borderLeft: "3px solid #e8a020",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            What it highlights
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              "Active athletes",
              "Engaged colleges",
              "Recent activity",
              "Whether traction is concentrated or distributed across the roster",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: "#e8a020", fontSize: 11, lineHeight: 1, marginTop: 3, flexShrink: 0 }}>—</span>
                <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  // ── STEP 3: Coach Update ──────────────────────────────────────────────────
  {
    nextLabel: "Headline Metrics",
    render: () => (
      <>
        <UpdatePreview />
        <ExplainerCard label="Section 2 of 4" title="Coach Update">
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
    nextLabel: "Invite Families",
    render: () => (
        <>
          <MetricTilesPreview />
          <ExplainerCard label="Section 3 of 4" title="Headline Metrics">
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 14px" }}>
              The tile dashboard gives coaches an at-a-glance view of recruiting activity across the
              roster. It surfaces key signals to show where interest exists, where traction is
              strengthening, which colleges are active, and which players may need attention. Each
              tile is a drill-down point, with the number serving as the summary and the click
              revealing the supporting detail.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                { icon: "📡", term: "Recruiting Signal", def: "Any recorded activity that suggests possible college interest, even at an early stage." },
                { icon: "📈", term: "True Traction",     def: "Verified recruiting momentum, such as direct outreach, confirmed contact, or stronger interaction beyond general interest." },
                { icon: "🔥", term: "Heating Up",        def: "A player showing increased recent momentum through higher activity, stronger signals, or growing college engagement." },
                { icon: "🔔", term: "Needs Attention",   def: "A player flagged for coach review due to notable activity, emerging momentum, missing follow-up, or another reason that may warrant a closer look." },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.55 }}>
                    <strong style={{ color: "#0f172a", fontWeight: 700 }}>{item.term}</strong>
                    {" — "}{item.def}
                  </span>
                </div>
              ))}
            </div>
          </ExplainerCard>
      </>
    ),
  },
  // ── STEP 5: Invite Parents ────────────────────────────────────────────────
  {
    nextLabel: "Discover Camps",
    render: () => (
      <>
        {/* ── Step header: eyebrow + title + one-liner ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            Section 4 of 4
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3.8vw, 28px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2, margin: "0 0 10px" }}>
            Invite Parents
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            Give families a simple way to join URecruit HQ using your program code and ready-to-send outreach templates.
          </p>
        </div>

        {/* ── Curated product spotlight ── */}
        <InviteParentsPreview />

        {/* ── Slim dark callout — integrated into dark system ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          background: "#0a0f1e", border: "1px solid #1a2535",
          borderLeft: "3px solid #e8a020",
          borderRadius: 10, padding: "13px 16px",
        }}>
          <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            Families who join through your code stay connected back to your program.
          </span>
        </div>
      </>
    ),
  },
  // ── STEP 6: Discover and Recommend Camps ──────────────────────────────────
  {
    nextLabel: "One More Thing",
    render: () => (
      <>
        <DiscoverPreview />
        <ExplainerCard label="Coach Tool" title="Discover Camps">
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 10px" }}>
            Discover gives coaches a single place to review camp opportunities across the season.
            In the coach view, they can quickly scan options, open a camp for more detail, and
            better support athlete planning across the roster.
          </p>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
            The expanded view helps coaches move beyond a simple list and see the specific details
            behind each camp opportunity — then recommend it directly to athletes with one action.
          </p>
        </ExplainerCard>
      </>
    ),
  },
  // ── STEP 7: Giveback ──────────────────────────────────────────────────────
  {
    nextLabel: "Explore Coach HQ",
    render: () => (
      <>
        <GivebackPreview />
        <ExplainerCard
          label="Added Benefit"
          title="Support Families. Strengthen Your Program."
        >
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
            URecruit HQ gives coaches a better way to support families while creating a built-in
            giveback opportunity for the program. As families subscribe through your team, your
            program becomes eligible for quarterly donations, with tiered giveback levels tied to
            participation across the roster.
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
