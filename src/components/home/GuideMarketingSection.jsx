import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { ArrowRight, Lock } from "lucide-react";

const BULLETS = [
  {
    icon: "✓",
    title: "NCAA Rules & Timelines",
    desc: "Permissible dates, offer rules, and what each grade year should focus on."
  },
  {
    icon: "✓",
    title: "The Contact Playbook",
    desc: "DM templates, email scripts, and exactly what to say after a camp."
  },
  {
    icon: "✓",
    title: "Camp Budgeting & Strategy",
    desc: "Real cost breakdowns and the 60/20/20 camp selection framework."
  },
  {
    icon: "✓",
    title: "Film & Social Media Strategy",
    desc: "What coaches actually watch for — by position — and how to get on their radar on X."
  }
];

const TOC_ROWS = [
  { emoji: "📅", title: "The Recruiting Timeline", preview: "What to expect from middle school through senior year...", locked: false },
  { emoji: "💬", title: "How to Contact Coaches", preview: "Best practices for reaching out to college coaching staff...", locked: true, blur: 3 },
  { emoji: "🤝", title: "Understanding Offers", preview: "What verbal offers mean, official visit rules, and next steps...", locked: true, blur: 4 },
  { emoji: "📋", title: "The Contact Playbook", preview: "DM templates, email scripts, and phone call frameworks...", locked: true, blur: 5 }
];

const PLAYBOOK_ROWS = [
  { emoji: "💰", title: "Camp Budgeting Guide", preview: "Build a realistic camp budget with the 60/20/20 framework...", locked: true, blur: 4 },
  { emoji: "📹", title: "Film & Highlight Strategy", preview: "What coaches look for by position and how to stand out...", locked: true, blur: 5 }
];

function GuidePreviewCard({ title, emoji, rows }) {
  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      border: "1px solid rgba(232,160,32,0.3)",
      overflow: "hidden",
      boxShadow: "0 0 40px rgba(232,160,32,0.06)"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "16px 20px",
        borderBottom: "1px solid #1f2937",
        borderLeft: "4px solid #e8a020"
      }}>
        <span style={{ fontSize: 20 }}>{emoji}</span>
        <div>
          <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: 16 }}>{title}</div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Members only</div>
        </div>
      </div>
      <div style={{ padding: "4px 0" }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            borderBottom: i < rows.length - 1 ? "1px solid #1f2937" : "none",
            position: "relative"
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{row.emoji}</span>
            <div style={{
              flex: 1,
              filter: row.locked ? `blur(${row.blur}px)` : "none",
              pointerEvents: row.locked ? "none" : "auto",
              userSelect: row.locked ? "none" : "auto"
            }}>
              <div style={{ color: "#f9fafb", fontWeight: 600, fontSize: 14 }}>{row.title}</div>
              <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{row.preview}</div>
            </div>
            {row.locked && (
              <Lock style={{ width: 14, height: 14, color: "#4b5563", flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuideMarketingSection({ onSubscribe }) {
  const nav = useNavigate();

  function handleCTA() {
    if (onSubscribe) {
      onSubscribe();
    } else {
      nav(createPageUrl("Subscribe") + "?source=home_guide");
    }
  }

  return (
    <>
      {/* Diagonal divider */}
      <div style={{
        width: "100%",
        height: 60,
        background: "linear-gradient(to bottom right, transparent 49%, #0d1117 50%)"
      }} />

      <section style={{
        background: "linear-gradient(135deg, #0d1117 0%, #0a0e1a 50%, #0d1117 100%)",
        padding: "80px 24px",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif"
      }}>
        <div style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          gap: 60,
          alignItems: "flex-start",
          flexWrap: "wrap"
        }}>

          {/* LEFT COLUMN */}
          <div style={{ flex: "1 1 500px", minWidth: 0 }}>
            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 3, height: 24, background: "#e8a020", borderRadius: 2 }} />
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 14,
                letterSpacing: 3,
                color: "#e8a020",
                textTransform: "uppercase"
              }}>
                Included with your Season Pass
              </span>
            </div>

            {/* Headline */}
            <h2 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(40px, 5vw, 56px)",
              color: "#f9fafb",
              lineHeight: 0.95,
              margin: "0 0 16px"
            }}>
              MORE THAN JUST<br />A CAMP FINDER.
            </h2>

            {/* Subhead */}
            <p style={{
              color: "#f9fafb",
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 16,
              lineHeight: 1.5
            }}>
              Most families show up to camps not knowing the rules. We fix that.
            </p>

            {/* Body */}
            <p style={{
              color: "#9ca3af",
              fontSize: 15,
              lineHeight: 1.7,
              maxWidth: 540,
              marginBottom: 32
            }}>
              Your Season Pass includes the complete Recruiting Guide and Camp Playbook —
              built from NCAA rules, real recruiting timelines, and the strategies that
              actually work.
              <br /><br />
              Know exactly when coaches can contact you. Know what an offer really means.
              Know how to build your film, your social presence, and your camp schedule —
              before every other family figures it out.
            </p>

            {/* Bullets */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 36 }}>
              {BULLETS.map((b) => (
                <div key={b.title} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ color: "#e8a020", fontSize: 18, lineHeight: "24px", flexShrink: 0 }}>✓</span>
                  <div>
                    <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: 15 }}>{b.title}</div>
                    <div style={{ color: "#9ca3af", fontSize: 14, marginTop: 2, lineHeight: 1.5 }}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pull quote */}
            <div style={{
              borderLeft: "4px solid #e8a020",
              paddingLeft: 20,
              marginBottom: 32
            }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 28,
                color: "#f9fafb",
                lineHeight: 1.2
              }}>
                Other sites show you camps.<br />
                We teach you how to get recruited.
              </span>
            </div>

            {/* CTA */}
            <button
              onClick={handleCTA}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 10,
                padding: "16px 32px",
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}
            >
              Get Season Pass — $49 <ArrowRight style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ flex: "1 1 380px", minWidth: 0, position: "relative" }}>
            {/* Badge */}
            <div style={{
              position: "absolute",
              top: -12,
              right: 12,
              background: "#e8a020",
              color: "#0a0e1a",
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 14px",
              borderRadius: 20,
              zIndex: 2,
              letterSpacing: 0.5,
              textTransform: "uppercase"
            }}>
              Included in Season Pass
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <GuidePreviewCard title="Recruiting Guide" emoji="📚" rows={TOC_ROWS} />
              <GuidePreviewCard title="Camp Playbook" emoji="🏕️" rows={PLAYBOOK_ROWS} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}