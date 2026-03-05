// src/components/home/DifferentiatorsSection.jsx
import React from "react";

const PROOF_STYLE = {
  display: "flex", alignItems: "center", gap: 10,
  fontSize: 15, color: "#f9fafb",
};
const CHECK = { color: "#e8a020", fontSize: 17, flexShrink: 0 };
const NUM_STYLE = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 80, color: "rgba(232,160,32,0.15)", lineHeight: 1,
};
const LABEL_STYLE = {
  color: "#e8a020", fontSize: 13, fontWeight: 700,
  letterSpacing: 2, textTransform: "uppercase",
  marginTop: 8,
};
const HEADLINE_STYLE = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: "clamp(32px, 5vw, 42px)",
  color: "#f9fafb", lineHeight: 1.05,
  margin: "12px 0 0",
  letterSpacing: 1,
};
const BODY_STYLE = {
  fontSize: 16, color: "#9ca3af",
  lineHeight: 1.7, marginTop: 16,
  maxWidth: 480,
};

export default function DifferentiatorsSection({ campDisplay, schoolDisplay }) {
  return (
    <div>
      {/* ── Section header ── */}
      <section style={{ background: "#0d1117", padding: "80px 24px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 20,
            letterSpacing: 3, color: "#e8a020", textTransform: "uppercase",
          }}>
            WHY URECRUIT HQ
          </div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(36px, 5vw, 52px)",
            color: "#f9fafb", lineHeight: 1.05,
            margin: "16px 0 0", letterSpacing: 1,
          }}>
            BUILT FOR FAMILIES WHO TAKE<br />RECRUITING SERIOUSLY.
          </h2>
          <p style={{
            fontSize: 16, color: "#9ca3af", lineHeight: 1.6,
            maxWidth: 600, margin: "16px auto 0",
          }}>
            Three things no other camp site does.
          </p>
        </div>
      </section>

      {/* ── BLOCK 1 — Conflict Detection ── */}
      <section style={{ background: "#0d1117", padding: "56px 24px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="diff-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "start" }}>
            {/* Text left */}
            <div>
              <div style={NUM_STYLE}>01</div>
              <div style={LABEL_STYLE}>SMART SCHEDULING</div>
              <h3 style={HEADLINE_STYLE}>
                NEVER DOUBLE-BOOK<br />A CAMP AGAIN.
              </h3>
              <p style={BODY_STYLE}>
                We automatically detect when two favorited camps overlap dates — and warn you when back-to-back camps require overnight travel. Plan your entire summer without a spreadsheet.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
                {["Date conflict alerts", "Travel distance warnings", "Side-by-side camp comparison"].map(t => (
                  <div key={t} style={PROOF_STYLE}>
                    <span style={CHECK}>✓</span> {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Visual right — mock conflict card */}
            <div className="diff-visual" style={{ paddingTop: 24 }}>
              <div style={{
                background: "#111827", border: "1px solid #374151",
                borderRadius: 16, padding: 24,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #1f2937" }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <span style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb" }}>Schedule Conflict</span>
                  <span style={{
                    background: "#ef4444", color: "#fff",
                    fontSize: 11, fontWeight: 700, padding: "3px 10px",
                    borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5,
                    marginLeft: "auto",
                  }}>CONFLICT</span>
                </div>

                {/* Camp rows */}
                {[
                  { school: "Ohio State Elite Camp", date: "June 14", loc: "Columbus, OH" },
                  { school: "Michigan Prospect Day", date: "June 14", loc: "Ann Arbor, MI" },
                ].map((c, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 0",
                    borderBottom: i === 0 ? "1px solid #1f2937" : "none",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg, #e8a020, #c4841d)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 15, color: "#fff", flexShrink: 0,
                    }}>{c.school[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#f9fafb" }}>{c.school}</div>
                      <div style={{ fontSize: 13, color: "#9ca3af" }}>📅 {c.date} · 📍 {c.loc}</div>
                    </div>
                  </div>
                ))}

                <div style={{
                  marginTop: 14, padding: "10px 14px",
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, fontSize: 13, color: "#fca5a5", lineHeight: 1.5,
                }}>
                  These camps are on the same date. Consider choosing one.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLOCK 2 — Recruiting Guide ── */}
      <section style={{ background: "#0a0e1a", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="diff-grid diff-grid-reverse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "start" }}>
            {/* Visual left — guide preview cards */}
            <div className="diff-visual" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { emoji: "📚", title: "Recruiting Guide", rows: ["Timeline", "Communication", "Offers", "Playbook"] },
                { emoji: "🏕️", title: "Camp Playbook", rows: ["Costs", "Strategy", "Film", "Social Media"] },
              ].map(card => (
                <div key={card.title} style={{
                  background: "#111827", borderRadius: 14,
                  borderTop: "3px solid #e8a020",
                  padding: "20px 24px", position: "relative",
                  overflow: "hidden",
                }}>
                  {/* Members Only badge */}
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    background: "#e8a020", color: "#0a0e1a",
                    fontSize: 10, fontWeight: 700, padding: "3px 10px",
                    borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5,
                  }}>Members Only</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 22 }}>{card.emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: 17, color: "#f9fafb" }}>{card.title}</span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {card.rows.map(r => (
                      <span key={r} style={{
                        background: "#1f2937", borderRadius: 6,
                        padding: "6px 14px", fontSize: 13, color: "#9ca3af",
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Text right */}
            <div>
              <div style={NUM_STYLE}>02</div>
              <div style={LABEL_STYLE}>INCLUDED WITH YOUR SEASON PASS</div>
              <h3 style={HEADLINE_STYLE}>
                MORE THAN JUST<br />A CAMP FINDER.
              </h3>
              <p style={BODY_STYLE}>
                Your Season Pass includes the complete Recruiting Guide and Camp Playbook — NCAA timelines, offer rules, DM templates, film strategy, and camp budgeting. The stuff that separates prepared families from everyone else.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
                {[
                  "NCAA rules & permissible dates",
                  "DM and email templates",
                  "Camp budgeting & 60/20/20 strategy",
                  "Film and social media playbook",
                ].map(t => (
                  <div key={t} style={PROOF_STYLE}>
                    <span style={CHECK}>✓</span> {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLOCK 3 — Data Quality ── */}
      <section style={{ background: "#0d1117", padding: "80px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ ...NUM_STYLE, textAlign: "center" }}>03</div>
          <div style={{ ...LABEL_STYLE, textAlign: "center" }}>THE DATA</div>
          <h3 style={{ ...HEADLINE_STYLE, textAlign: "center" }}>
            EVERY CAMP. VERIFIED.<br />COLLEGE STAFFS ONLY.
          </h3>
          <p style={{ ...BODY_STYLE, maxWidth: 600, margin: "16px auto 0", textAlign: "center" }}>
            Every camp in URecruit HQ is run by a real college coaching staff. We verify each listing against official school sources — no club teams, no private trainer camps, no noise. Just the recruiting events that actually move the needle.
          </p>

          {/* 2x2 stats grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 24, marginTop: 48, maxWidth: 400, margin: "48px auto 0",
          }}>
            {[
              { num: campDisplay, label: "Verified Camps" },
              { num: schoolDisplay, label: "College Programs" },
              { num: "All", label: "NCAA Divisions" },
              { num: "Weekly", label: "Data Updates" },
            ].map(s => (
              <div key={s.label}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 40, color: "#e8a020", lineHeight: 1,
                }}>{s.num}</div>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: "#9ca3af",
                  marginTop: 6, textTransform: "uppercase", letterSpacing: 1,
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Responsive */}
      <style>{`
        @media (max-width: 768px) {
          .diff-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .diff-grid-reverse .diff-visual { order: -1; }
        }
      `}</style>
    </div>
  );
}