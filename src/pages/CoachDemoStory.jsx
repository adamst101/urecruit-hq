// src/pages/CoachDemoStory.jsx
// Coach demo journey: 2-step intro + 5 section explainers + 1 giveback.
// No live Coach HQ is shown during the explanation phase.
// After the final step, routes to /CoachDashboard?demo=coach for free exploration.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ensureSchoolMap, schoolMapFind } from "../components/hooks/useSchoolIdentity.jsx";
import { base44 } from "../api/base44Client";

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
    <div style={{ background: "#0b1221", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.35)", marginBottom: 22 }}>
      <div style={{ borderTop: `3px solid ${accent}`, padding: "9px 16px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid #1a2535", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 3, height: 14, background: accent, borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "#cbd5e1", letterSpacing: 1 }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, color: "#2d3f55", background: "#0f1a28", border: "1px solid #1a2d40", borderRadius: 20, padding: "2px 9px", letterSpacing: "0.06em" }}>sample data</span>
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
  // Determination-first structure: takeaway → evidence chips → readout → interpretation.
  // Three clearly differentiated layers inside a single hero card.
  return (
    <div style={{ marginBottom: 22 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 3, height: 20, background: "#e8a020", borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: "#f1f5f9" }}>PROGRAM RECRUITING SUMMARY</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 600, color: "#2d3f55", background: "#0f1a28", border: "1px solid #1a2d40", borderRadius: 20, padding: "2px 9px", letterSpacing: "0.06em" }}>sample data</span>
      </div>

      {/* Hero card — 3-part determination hierarchy */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "20px 22px", boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.35)" }}>

        {/* A. Top takeaway — strongest read */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 7 }}>
            Top takeaway
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", lineHeight: 1.4 }}>
            Jaylen Carter holds a scholarship offer from Florida.
          </div>
        </div>

        {/* Compact supporting metric chips */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
          {[
            { value: "6",  label: "Active athletes" },
            { value: "11", label: "Engaged colleges" },
            { value: "8",  label: "Active last 30 days" },
          ].map(({ value, label }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1e293b", borderRadius: 8, padding: "7px 12px", display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#e8a020", lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#4b5563" }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>

          {/* B. Program readout — factual evidence */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
              Program readout
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
              11 schools have been active across 6 athletes, with 8 active in the last 30 days.
            </div>
          </div>

          {/* C. Coach interpretation — final judgment */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
              Coach interpretation
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, fontStyle: "italic" }}>
              One headline outcome is on record, with broader recruiting engagement distributed across the roster.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function UpdatePreview() {
  // Determination-first: 3-part takeaway at top, then athlete evidence, then softened metrics.
  const athleteBlocks = [
    { name: "Jaylen Carter",    text: "Florida extended a scholarship offer. Ohio State and Georgia also remain in direct contact." },
    { name: "Marcus Okafor",    text: "Unofficial visit completed at Auburn. Tennessee active with direct contact in the period." },
    { name: "DeShawn Williams", text: "Campus tour at Michigan. Defensive coordinator made direct contact and added him to their list." },
  ];
  const statChips = [
    { value: 4, label: "Athletes active",    qualifier: null,                accent: "#34d399" },
    { value: 3, label: "With new traction",  qualifier: "3 schools",         accent: "#60a5fa" },
    { value: 4, label: "Major outcomes",     qualifier: "1 offer · 1 visit", accent: "#f59e0b" },
    { value: 2, label: "Camp registrations", qualifier: "2 athletes",        accent: "#a78bfa" },
  ];
  const topColleges = ["Florida", "Auburn", "Georgia"];

  const LabelSm = ({ children, amber }) => (
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, color: amber ? "#e8a020" : "#4b5563" }}>
      {children}
    </div>
  );

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ width: 3, height: 20, background: "#34d399", borderRadius: 2 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: "#f1f5f9" }}>COACH UPDATE</span>
        <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600 }}>recent recruiting changes in the selected period</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {["Since Last Visit", "30D", "60D", "90D"].map((label, i) => (
            <div key={label} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid", fontSize: 10, fontWeight: 700, background: i === 0 ? "#34d399" : "transparent", color: i === 0 ? "#111827" : "#4b5563", borderColor: i === 0 ? "#34d399" : "#374151" }}>{label}</div>
          ))}
        </div>
      </div>

      {/* Hero card */}
      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "20px 22px", boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.35)" }}>

        {/* ── A. Top takeaway — strongest read ── */}
        <div style={{ marginBottom: 14 }}>
          <LabelSm amber>Top takeaway</LabelSm>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", lineHeight: 1.4 }}>
            4 athletes had recruiting movement in the period, including a scholarship offer and an unofficial visit.
          </div>
        </div>

        {/* ── B. Period readout — factual scope ── */}
        <div style={{ marginBottom: 14 }}>
          <LabelSm>Period readout</LabelSm>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
            Recent movement includes 3 athletes with new traction, 4 major outcomes, and activity across multiple schools.
          </div>
        </div>

        {/* ── C. Coach interpretation — final judgment ── */}
        <div style={{ marginBottom: 18 }}>
          <LabelSm>Coach interpretation</LabelSm>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, fontStyle: "italic" }}>
            The period shows real momentum across several athletes, led by stronger outcomes and direct contact activity.
          </div>
        </div>

        {/* Divider before athlete evidence */}
        <div style={{ borderTop: "1px solid #1e293b", marginBottom: 14 }} />

        {/* ── Athlete blocks — supporting evidence ── */}
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          {athleteBlocks.map((block, i) => (
            <div key={i} style={{ background: "rgba(148,163,184,0.04)", border: "1px solid rgba(148,163,184,0.10)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>{block.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.55 }}>{block.text}</div>
            </div>
          ))}
        </div>

        {/* Divider before metrics */}
        <div style={{ borderTop: "1px solid #1f2937", paddingTop: 12 }}>
          {/* Softened stat chips — reduced intensity so they read as supporting context */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            {statChips.map(({ value, label, qualifier, accent }) => (
              <div key={label} style={{ background: `${accent}07`, border: `1px solid ${accent}1a`, borderRadius: 9, padding: "8px 11px", display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: `${accent}cc`, lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#4b5563", lineHeight: 1.3 }}>{label}</span>
                {qualifier && <span style={{ fontSize: 9, color: "#374151", marginTop: 1 }}>{qualifier}</span>}
              </div>
            ))}
          </div>

          {/* Most active programs — tertiary */}
          <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid #1a2535", borderRadius: 9, padding: "9px 12px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Most active programs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {topColleges.map((col, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, color: i === 0 ? "#e8a020" : "#2d3748", minWidth: 11, textAlign: "right" }}>{i + 1}</span>
                  <div style={{ height: 2, borderRadius: 1, width: i === 0 ? 18 : i === 1 ? 10 : 5, background: i === 0 ? "rgba(232,160,32,0.35)" : i === 1 ? "rgba(148,163,184,0.12)" : "rgba(255,255,255,0.04)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? "#9ca3af" : "#4b5563" }}>{col}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: "#2d3f55", background: "#0f1a28", border: "1px solid #1a2d40", borderRadius: 20, padding: "2px 9px", letterSpacing: "0.06em" }}>sample data</span>
        </div>
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
      {/* Top takeaway — interpretation before tiles */}
      <div style={{ marginBottom: 14, paddingBottom: 13, borderBottom: "1px solid #1a2535" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
          Top takeaway
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", lineHeight: 1.5 }}>
          The roster shows active recruiting movement, with verified traction, confirmed outcomes, and a smaller group that may need closer coach review.
        </div>
      </div>
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
// Camp names and metadata are aligned with the real demoCampData.js records.
// School logos are loaded at mount from the live School entity via schoolMapFind.
// No navigation, no backend writes, no production Discover behavior.
function DiscoverPreview() {
  const [ufLogoUrl, setUfLogoUrl] = useState(null);
  const [ugaLogoUrl, setUgaLogoUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const School = base44?.entities?.School;
        if (!School) return;
        await ensureSchoolMap(School);
        if (cancelled) return;
        const pick = (s) =>
          s?.athletic_logo_url ||
          s?.athletics_logo_url ||
          s?.team_logo_url ||
          s?.logo_url ||
          s?.school_logo_url ||
          s?.primary_logo_url ||
          s?.logo ||
          null;
        setUfLogoUrl(pick(schoolMapFind("University of Florida")));
        setUgaLogoUrl(pick(schoolMapFind("University of Georgia")));
      } catch {}
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const UF = {
    abbr: "UF",
    logoUrl: ufLogoUrl,
    accentColor: "#e8a020",
    name: "University of Florida",
    divisionLabel: "D1 · FBS · SEC",
    metaCity: "Gainesville, FL",
    metaPrice: "$275 – $300",
    metaGrades: "Grades 9–12",
    dates: ["Jun 21", "Aug 2"],
    camps: [
      {
        name: "Gator Offensive Skills Camp",
        date: "Jun 21, 2025",
        city: "Gainesville, FL",
        price: "$300",
        grades: "Grades 9–12",
        type: "Skills / 7-on-7",
        recommendOpen: true,
      },
      {
        name: "Florida Prospect Showcase",
        date: "Aug 2, 2025",
        city: "Gainesville, FL",
        price: "$275",
        grades: "Grades 10–12",
        type: "Prospect Day",
        recommendOpen: false,
      },
    ],
  };
  const UGA = {
    abbr: "UGA",
    logoUrl: ugaLogoUrl,
    accentColor: "#60a5fa",
    name: "University of Georgia",
    divisionLabel: "D1 · FBS · SEC",
    metaCity: "Athens, GA",
    metaPrice: "$300 – $375",
    metaGrades: "Grades 9–12",
    dates: ["Jun 21", "Jul 26"],
    camps: [
      { name: "Bulldog Quarterback Academy", date: "Jun 21, 2025", city: "Athens, GA", price: "$375", grades: "Grades 9–12", type: "Quarterback / Skills" },
      { name: "Georgia Skills Showcase", date: "Jul 26, 2025", city: "Athens, GA", price: "$300", grades: "Grades 9–12", type: "All Skill Positions" },
    ],
  };

  const recommendMsg =
    "I recommend checking out this camp: Gator Offensive Skills Camp at University of Florida\n📅 Jun 21, 2025 · 📍 Gainesville, FL · $300\n\nGreat opportunity for skill players to get in front of the UF staff.";

  // ── sub-components ────────────────────────────────────────────────────────────

  function SchoolAvatar({ abbr, color, logoUrl: url }) {
    const [imgErr, setImgErr] = useState(false);
    const showImg = !!url && !imgErr;
    return (
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        background: "#1e293b", border: `1.5px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
      }}>
        {showImg ? (
          <img
            src={url}
            alt={`${abbr} logo`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            onError={() => setImgErr(true)}
          />
        ) : (
          <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: "0.04em" }}>{abbr}</span>
        )}
      </div>
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
          <SchoolAvatar abbr={school.abbr} color={school.accentColor} logoUrl={school.logoUrl} />
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
  const tiers = [
    { tier: "Starter",  families: "5+",  note: "Eligible for quarterly giveback" },
    { tier: "Builder",  families: "15+", note: "Increased giveback tier" },
    { tier: "Champion", families: "30+", note: "Maximum giveback level" },
  ];
  return (
    <div style={{
      background: "linear-gradient(135deg, #0f1624 0%, #0b1221 100%)",
      border: "1px solid rgba(232,160,32,0.2)",
      borderRadius: 12, padding: "20px 18px 18px", marginBottom: 22,
      boxShadow: "0 4px 28px rgba(232,160,32,0.06)",
    }}>
      {/* Panel label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <div style={{ width: 3, height: 14, background: "#e8a020", borderRadius: 2 }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          How Giveback Works
        </span>
      </div>

      {/* Tier progression */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {tiers.map((t, i) => (
          <React.Fragment key={t.tier}>
            {i > 0 && (
              <div style={{ color: "#2d3f55", fontSize: 14, padding: "0 6px", flexShrink: 0, lineHeight: 1 }}>›</div>
            )}
            <div style={{
              flex: 1, minWidth: 0, textAlign: "center",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(232,160,32,0.1)",
              borderRadius: 8, padding: "12px 8px",
            }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color: "#e8a020", letterSpacing: 1, marginBottom: 7 }}>
                {t.tier}
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#f9fafb", lineHeight: 1 }}>
                {t.families}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", margin: "3px 0 6px" }}>
                families
              </div>
              <div style={{ fontSize: 9.5, color: "#64748b", lineHeight: 1.4 }}>{t.note}</div>
            </div>
          </React.Fragment>
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
            What this tells the coach
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              "Where the strongest outcome exists",
              "How broad activity is across the roster",
              "How recent the momentum is",
              "Whether traction is concentrated or distributed",
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
        {/* ── Step header ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            Section 2 of 4
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3.8vw, 28px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2, margin: "0 0 10px" }}>
            Coach Update
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            Shows what actually happened across the program during the selected period.
          </p>
        </div>

        {/* ── Hero panel ── */}
        <UpdatePreview />

        {/* ── Slim dark support panel ── */}
        <div style={{
          background: "#0a0f1e", border: "1px solid #1a2535",
          borderLeft: "3px solid #34d399",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            What this tells the coach
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              "Which athletes had real movement",
              "Where direct contact or stronger traction occurred",
              "What outcomes stand out in the period",
              "Where attention may be needed next",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: "#34d399", fontSize: 11, lineHeight: 1, marginTop: 3, flexShrink: 0 }}>—</span>
                <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  // ── STEP 4: Headline Metric Tiles ─────────────────────────────────────────
  {
    nextLabel: "Invite Families",
    render: () => (
      <>
        {/* ── Step header ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            Section 3 of 4
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3.8vw, 28px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2, margin: "0 0 10px" }}>
            Headline Metrics
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            At-a-glance view of recruiting activity across the roster.
          </p>
        </div>

        {/* ── Hero dashboard panel ── */}
        <MetricTilesPreview />

        {/* ── Slim dark support panel ── */}
        <div style={{
          background: "#0a0f1e", border: "1px solid #1a2535",
          borderLeft: "3px solid #e8a020",
          borderRadius: 10, padding: "14px 16px",
        }}>
          {/* Interpretation bullets — primary read */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            What this tells the coach
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
            {[
              "Where general interest exists across the roster",
              "Which signals reflect verified momentum",
              "Which athletes are heating up",
              "Where coach review may be needed",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: "#e8a020", fontSize: 11, lineHeight: 1, marginTop: 3, flexShrink: 0 }}>—</span>
                <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Compact definitions — subordinate context */}
          <div style={{ borderTop: "1px solid #1a2535", paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#2d3f55", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Key terms
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { term: "Recruiting Signal", def: "possible college interest on record" },
                { term: "True Traction",     def: "verified momentum or direct contact" },
                { term: "Heating Up",        def: "rising recent activity or stronger engagement" },
                { term: "Needs Attention",   def: "activity that may warrant coach review" },
              ].map((item, i) => (
                <div key={i} style={{ fontSize: 11.5, color: "#374151", lineHeight: 1.5 }}>
                  <span style={{ color: "#4b5563", fontWeight: 600 }}>{item.term}</span>
                  {" — "}{item.def}
                </div>
              ))}
            </div>
          </div>
        </div>
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
        {/* ── Step header: eyebrow + title + determination-first read ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            Coach Tool
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3.8vw, 28px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2, margin: "0 0 12px" }}>
            Discover Camps
          </h2>
          <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
            Review real camp opportunities, open the details that matter, and recommend a camp directly to your roster from one place.
          </p>
        </div>

        {/* ── Hero: expanded real camp snippet ── */}
        <DiscoverPreview />

        {/* ── Dark support panel — stays within the dark visual system ── */}
        <div style={{
          background: "#0a0f1e", border: "1px solid #1a2535",
          borderLeft: "3px solid #4ade80",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            What this lets coaches do
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              "review real camp opportunities",
              "open the details behind each camp",
              "recommend camps directly to athletes",
              "support planning across the roster",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: "#4ade80", fontSize: 11, lineHeight: 1, marginTop: 3, flexShrink: 0 }}>—</span>
                <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  // ── STEP 7: Giveback ──────────────────────────────────────────────────────
  {
    nextLabel: "Explore Coach HQ",
    render: () => (
      <>
        {/* ── Step header: eyebrow + title + determination-first read ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
            Built-In Giveback
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3.8vw, 28px)", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2, margin: "0 0 12px" }}>
            Program Giveback
          </h2>
          <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
            As more families subscribe through your team, your program becomes eligible for greater quarterly giveback.
          </p>
        </div>

        {/* ── Hero: giveback tier panel ── */}
        <GivebackPreview />

        {/* ── Dark support panel — stays within the dark visual system ── */}
        <div style={{
          background: "#0a0f1e", border: "1px solid #1a2535",
          borderLeft: "3px solid #e8a020",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            What this means
          </div>
          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            Families get a better recruiting resource, and your program gains a built-in giveback opportunity tied to participation.
          </p>
        </div>
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
          <button
            onClick={skip}
            style={{
              marginLeft: "auto",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid #1e2d45",
              borderRadius: 8,
              padding: "7px 14px",
              color: "#94a3b8",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            Skip to Coach HQ
            <ArrowRight style={{ width: 11, height: 11 }} />
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
