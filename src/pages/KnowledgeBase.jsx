// src/pages/KnowledgeBase.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Clock,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Info,
  Lightbulb,
  List,
} from "lucide-react";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { trackEvent, trackEventOnce } from "../utils/trackEvent.js";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";
import {
  KbSidebarDesktop,
  KbMobileDrawer,
  KB_TOPICS_FLAT,
  DEMO_UNLOCKED_ARTICLE_IDS,
} from "../components/guides/KbSidebar.jsx";

// ─── Responsive CSS ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');

  /* Comparison grids collapse to 1-col on narrow screens */
  .kb-grid { display: grid; gap: 14px; }
  @media (max-width: 600px) {
    .kb-grid { grid-template-columns: 1fr !important; }
  }

  /* Smooth hover on nav buttons */
  .kb-nav-btn:hover { border-color: #2563eb !important; }
`;

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  // Shell
  appBg:        "#0f172a",
  shellSurface: "rgba(15,23,42,0.95)",
  shellBorder:  "rgba(255,255,255,0.07)",

  // Layout
  pageMax:    1200,
  articleMax: 728,

  // Article surface — warm off-white
  articleBg:      "#fafaf9",
  articleBorder:  "#e5e7eb",
  articleText:    "#0f172a",
  articleMuted:   "#374151",
  articleSoft:    "#6b7280",
  articleDivider: "#e5e7eb",

  // Card
  cardBg:     "#ffffff",
  cardBorder: "#e5e7eb",

  // Blue — primary accent, used sparingly
  blue:       "#2563eb",
  blueSoft:   "rgba(37,99,235,0.07)",
  blueText:   "#1d4ed8",
  blueStrong: "#1e3a8a",

  // Green
  green:     "#15803d",
  greenSoft: "rgba(21,128,61,0.07)",
  greenText: "#166534",

  // Slate — neutral/secondary
  slate:     "#64748b",
  slateSoft: "rgba(100,116,139,0.07)",
  slateText: "#334155",

  // Red
  red:     "#b91c1c",
  redSoft: "rgba(185,28,28,0.06)",
  redText: "#991b1b",

  ink: "#0f172a",
};

// ─── Primitives ────────────────────────────────────────────────────────────────

function MetaPill({ icon, children }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 11px", borderRadius: 999,
      border: `1px solid ${C.articleDivider}`,
      background: C.cardBg,
      color: C.articleSoft, fontSize: 12, fontWeight: 600,
    }}>
      {icon && <span style={{ display: "flex" }}>{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

function Body({ children, style }) {
  return (
    <p style={{
      margin: 0, color: C.articleMuted,
      fontSize: 16, lineHeight: 1.82,
      ...style,
    }}>
      {children}
    </p>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function TopicHero({ topic }) {
  const meta = getTopicMeta(topic?.id);

  return (
    <div>
      {/* Eyebrow */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        color: C.blue, fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.07em",
        marginBottom: 16,
      }}>
        <BookOpen style={{ width: 13, height: 13 }} />
        Recruiting guide
      </div>

      {/* Title + CTA */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 20, flexWrap: "wrap",
        marginBottom: 14,
      }}>
        <h1 style={{
          margin: 0, color: C.articleText,
          fontSize: "clamp(26px, 5vw, 38px)",
          lineHeight: 1.1, fontWeight: 800,
          letterSpacing: "-0.03em",
          flex: 1, minWidth: 0,
        }}>
          {topic?.label}
        </h1>
        <button
          onClick={() => {
            const el = document.getElementById("kb-article-body");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          style={{
            border: "none", background: C.ink, color: "#ffffff",
            borderRadius: 10, padding: "10px 16px",
            fontWeight: 600, fontSize: 13, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit",
          }}
        >
          Read guide →
        </button>
      </div>

      <p style={{
        margin: "0 0 18px", color: C.articleMuted,
        fontSize: 17, lineHeight: 1.65, maxWidth: 580,
      }}>
        {meta.summary}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <MetaPill icon={<Clock style={{ width: 12, height: 12 }} />}>
          {meta.readTime}
        </MetaPill>
        <MetaPill icon={<GraduationCap style={{ width: 12, height: 12 }} />}>
          {meta.audience}
        </MetaPill>
        <MetaPill>Updated for 2026</MetaPill>
      </div>
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, intro, icon, children }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <div style={{
        paddingBottom: 14,
        borderBottom: `1px solid ${C.articleDivider}`,
        marginBottom: 24,
      }}>
        <h2 style={{
          margin: 0, color: C.articleText,
          fontSize: 20, lineHeight: 1.25, fontWeight: 700,
          letterSpacing: "-0.015em",
        }}>
          <span style={{ marginRight: 8 }}>{icon}</span>
          {title}
        </h2>
        {intro && (
          <p style={{
            margin: "10px 0 0", color: C.articleMuted,
            fontSize: 16, lineHeight: 1.75, maxWidth: 660,
          }}>
            {intro}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Timeline stage block ──────────────────────────────────────────────────────

function StageBlock({ badge, children, isLast = false }) {
  return (
    <div style={{
      position: "relative",
      paddingLeft: 28,
      paddingBottom: isLast ? 4 : 28,
    }}>
      {/* Connecting line */}
      {!isLast && (
        <div style={{
          position: "absolute", left: 6, top: 18, bottom: 0,
          width: 1, background: C.articleDivider,
        }} />
      )}
      {/* Dot */}
      <div style={{
        position: "absolute", left: 0, top: 2,
        width: 14, height: 14, borderRadius: "50%",
        background: C.cardBg, border: `2px solid ${C.blue}`,
      }} />
      {/* Stage label */}
      <div style={{
        fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.07em",
        color: C.blue, marginBottom: 10,
      }}>
        {badge}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Callout ───────────────────────────────────────────────────────────────────

function Callout({ tone = "info", children }) {
  const map = {
    info: {
      bg: C.blueSoft, border: "rgba(37,99,235,0.22)",
      color: C.blueStrong, icon: <Info style={{ width: 14, height: 14 }} />,
    },
    success: {
      bg: C.greenSoft, border: "rgba(21,128,61,0.22)",
      color: C.greenText, icon: <CheckCircle2 style={{ width: 14, height: 14 }} />,
    },
    warn: {
      bg: C.slateSoft, border: "rgba(100,116,139,0.20)",
      color: C.slateText, icon: <Lightbulb style={{ width: 14, height: 14 }} />,
    },
    danger: {
      bg: C.redSoft, border: "rgba(185,28,28,0.22)",
      color: C.redText, icon: <AlertTriangle style={{ width: 14, height: 14 }} />,
    },
  };
  const cfg = map[tone] || map.info;

  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        color: cfg.color, fontSize: 14, lineHeight: 1.7, fontWeight: 500,
      }}>
        <div style={{ marginTop: 2, flexShrink: 0 }}>{cfg.icon}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

// ─── Comparison grid + card ────────────────────────────────────────────────────

function CompareGrid({ children, columns = 2 }) {
  return (
    <div
      className="kb-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function CompareCard({ badge, badgeTone = "slate", title, intro, bullets, footer }) {
  const badgeMap = {
    slate: { bg: C.slateSoft, color: C.slateText },
    green: { bg: C.greenSoft, color: C.greenText },
    blue:  { bg: C.blueSoft,  color: C.blueText  },
  };
  const tone = badgeMap[badgeTone] || badgeMap.slate;

  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${C.cardBorder}`,
      borderRadius: 14, padding: "20px",
    }}>
      <div style={{
        display: "inline-block", borderRadius: 999,
        background: tone.bg, color: tone.color,
        fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.05em",
        padding: "5px 10px", marginBottom: 12,
      }}>
        {badge}
      </div>
      <div style={{ color: C.articleText, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      <p style={{ margin: "0 0 14px", color: C.articleMuted, fontSize: 15, lineHeight: 1.75 }}>
        {intro}
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {bullets.map((item) => (
          <div key={item.label} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            color: item.color, fontSize: 14, lineHeight: 1.6, fontWeight: 600,
          }}>
            <span style={{ flexShrink: 0 }}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {footer && (
        <p style={{
          margin: "14px 0 0", color: C.articleSoft, fontSize: 13, lineHeight: 1.65,
          borderTop: `1px solid ${C.articleDivider}`, paddingTop: 12,
        }}>
          {footer}
        </p>
      )}
    </div>
  );
}

// ─── Cost table ────────────────────────────────────────────────────────────────

function SimpleTable({ rows }) {
  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${C.cardBorder}`,
      borderRadius: 12, overflow: "hidden", marginBottom: 16,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1.7fr 1fr",
        padding: "10px 16px", background: "#f8fafc",
        borderBottom: `1px solid ${C.articleDivider}`,
      }}>
        <div style={{ color: C.articleText, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Camp type</div>
        <div style={{ color: C.articleText, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Typical fee</div>
      </div>
      {rows.map(([label, value], idx) => (
        <div key={label} style={{
          display: "grid", gridTemplateColumns: "1.7fr 1fr",
          padding: "12px 16px",
          background: idx % 2 === 1 ? "#fafafa" : C.cardBg,
          borderBottom: idx === rows.length - 1 ? "none" : `1px solid ${C.articleDivider}`,
        }}>
          <div style={{ color: C.articleMuted, fontSize: 15 }}>{label}</div>
          <div style={{ color: C.articleText, fontWeight: 700, fontSize: 15, textAlign: "right" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Mini card ─────────────────────────────────────────────────────────────────

function MiniCard({ title, tone = "blue", children }) {
  const toneColor = {
    gold:   C.slate,   // remapped — no gold
    blue:   C.blue,
    green:  C.green,
    purple: "#7c3aed",
  };
  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${C.cardBorder}`,
      borderRadius: 12, padding: "16px",
      borderLeft: `3px solid ${toneColor[tone] || C.blue}`,
    }}>
      <div style={{ color: C.articleText, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ color: C.articleMuted, fontSize: 14, lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Strategy row ──────────────────────────────────────────────────────────────

function StrategyRow({ percent, title, desc, tone = "blue" }) {
  const map = {
    gold:  { color: C.slate, },
    blue:  { color: C.blue,  },
    green: { color: C.green, },
  };
  const cfg = map[tone] || map.blue;

  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${C.cardBorder}`,
      borderRadius: 12, padding: "16px 20px",
      display: "flex", gap: 16, alignItems: "flex-start",
    }}>
      <div style={{
        flexShrink: 0, width: 52, paddingTop: 2,
        fontSize: 22, fontWeight: 800,
        color: cfg.color, letterSpacing: "-0.02em",
      }}>
        {percent}
      </div>
      <div>
        <div style={{ color: C.articleText, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {title}
        </div>
        <p style={{ margin: 0, color: C.articleMuted, fontSize: 15, lineHeight: 1.75 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

// ─── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({ title, tone = "green", intro, bullets }) {
  const map = {
    green: { accent: C.green, text: C.greenText },
    blue:  { accent: C.blue,  text: C.blueText  },
    gold:  { accent: C.slate, text: C.slateText }, // remapped
  };
  const cfg = map[tone] || map.green;

  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${C.cardBorder}`,
      borderRadius: 12, padding: "18px 20px",
      borderTop: `3px solid ${cfg.accent}`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: cfg.text, marginBottom: 10,
      }}>
        {title}
      </div>
      <p style={{
        margin: "0 0 12px", color: C.articleMuted,
        fontSize: 14, lineHeight: 1.7, fontWeight: 500,
      }}>
        {intro}
      </p>
      <ul style={{ margin: 0, paddingLeft: 16, color: C.articleMuted, fontSize: 14, lineHeight: 1.85 }}>
        {bullets.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

// ─── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ title, lines }) {
  return (
    <div style={{
      background: "#f8fafc", border: `1px solid ${C.cardBorder}`,
      borderRadius: 12, padding: "18px 20px", marginBottom: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.07em",
        color: C.articleSoft, marginBottom: 12,
      }}>
        {title}
      </div>
      <pre style={{
        margin: 0, whiteSpace: "pre-wrap",
        color: C.articleMuted, fontSize: 14, lineHeight: 1.75,
        fontFamily: "inherit",
      }}>
        {lines}
      </pre>
    </div>
  );
}

// ─── Topic content ─────────────────────────────────────────────────────────────

function TopicTimeline() {
  return (
    <Section
      icon="📅"
      title="Recruiting timeline"
      intro="Recruiting rules are strict about when coaches can reach out, but there are no rules about when your athlete can. Here is what matters most at each stage."
    >
      <StageBlock badge="Grades 6–8">
        <Body>
          Focus on development and fundamentals. Camps at this age are for learning reps,
          not recruiting. If a coach shows early interest, treat it as a relationship
          signal, not a locked offer.
        </Body>
        <Callout tone="info">
          Early offers in middle school are not binding and are not written athletic aid.
          They are attention, which matters, but not security.
        </Callout>
      </StageBlock>

      <StageBlock badge="9th–10th grade">
        <Body>
          Build your baseline with measurables, film, and academics. You can contact
          coaches anytime. Expect limited responses until permissible dates.
        </Body>
        <Callout tone="info">
          <strong>NCAA rule:</strong> For Division I football, June 15 after sophomore year
          is the first permissible date for coaches to send texts, emails, and DMs.
        </Callout>
      </StageBlock>

      <StageBlock badge="11th grade">
        <Body>
          This is the most important year. Official visit windows open, direct
          communication increases, and your summer camp strategy should be targeted and
          intentional.
        </Body>
        <Callout tone="info">
          <strong>Key dates:</strong>
          <br />• Official visits open: April 1, junior year
          <br />• Off-campus contact: January 1, junior year
          <br />• Unofficial visits: anytime, paid by the family
        </Callout>
        <Callout tone="success">
          Camp strategy: 60 percent target schools you genuinely fit, 20 percent reach
          schools, 20 percent development camps.
        </Callout>
      </StageBlock>

      <StageBlock badge="12th grade" isLast>
        <Body>
          Stay eligible, healthy, and responsive. Written offers of athletic aid become
          possible. The job now is to finish strong and close.
        </Body>
        <Callout tone="info">
          <strong>NCAA rule:</strong> Schools cannot provide a written offer of athletic
          aid before August 1 of a prospect&apos;s senior year. Most early offers are verbal
          only.
        </Callout>
      </StageBlock>
    </Section>
  );
}

function TopicCommunication() {
  return (
    <Section
      icon="💬"
      title="Contacting coaches"
      intro="The most important rule is simple. Your athlete can reach out anytime. Coaches have restrictions. Here is how to handle both sides cleanly."
    >
      <CompareGrid columns={3}>
        <ContactRow
          title="Athlete → Coach"
          tone="green"
          intro="Allowed anytime by email, DM, phone, or letter."
          bullets={[
            "Keep it short and specific",
            "Always include one link to film and profile",
            "You are not breaking rules by reaching out first",
          ]}
        />
        <ContactRow
          title="Parent → Coach"
          tone="blue"
          intro="Allowed anytime, but stay in your lane."
          bullets={[
            "Focus on logistics like camp attendance, travel, and academics",
            "Let the athlete lead the relationship",
            "Do not push for offers or negotiate on their behalf",
          ]}
        />
        <ContactRow
          title="Coach → Athlete"
          tone="gold"
          intro="Coaches have real restrictions on when they can proactively reach out."
          bullets={[
            "They can answer if you call, anytime",
            "They cannot proactively call or text until permissible dates",
            "Do not confuse answer with initiate",
          ]}
        />
      </CompareGrid>
    </Section>
  );
}

function TopicOffers() {
  return (
    <Section
      icon="🤝"
      title="Understanding offers"
      intro="The word offer gets used loosely in recruiting. Here is what it actually means, and what it does not."
    >
      <CompareGrid columns={2}>
        <CompareCard
          badge="Verbal offer"
          badgeTone="slate"
          title="Interest with upside"
          intro="A coach tells you there may be a spot for your athlete."
          bullets={[
            { icon: "✓", label: "It means genuine interest", color: C.green },
            { icon: "✗", label: "It does not mean a binding commitment", color: C.red },
            { icon: "✗", label: "It does not mean scholarship money", color: C.red },
          ]}
          footer="Either side can walk away from a verbal offer at any time."
        />
        <CompareCard
          badge="Written offer of aid"
          badgeTone="green"
          title="Actual scholarship paperwork"
          intro="This is the formal offer of athletic scholarship aid."
          bullets={[
            { icon: "✓", label: "Has a defined timeline", color: C.green },
            { icon: "✓", label: "Is the real scholarship paperwork", color: C.green },
          ]}
          footer="NCAA rule: cannot be provided before August 1 of a prospect's senior year."
        />
      </CompareGrid>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <Callout tone="warn">
          Many offers come with conditions like academics, position board movement, senior
          film, or how the roster fills. Always ask, "What are the conditions on this offer?"
        </Callout>
        <Callout tone="warn">
          If a program pressures you to commit by Sunday, ask two questions: "What changes
          if we wait 7 days?" and "What would you need to see to feel certain?" A real
          offer survives a week.
        </Callout>
        <Callout tone="warn">
          A new coaching staff can reset everything, even if your athlete did everything
          right. Keep 3 to 5 realistic schools warm until National Signing Day.
        </Callout>
        <Callout tone="success">
          When any offer is made, ask one clean question: "Is this an offer for athletic
          aid, a roster spot, or both?"
        </Callout>
      </div>
    </Section>
  );
}

function TopicPlaybook() {
  return (
    <Section
      icon="📋"
      title="The contact playbook"
      intro="Simple, safe, and effective. Follow this sequence and your family will operate more clearly than most."
    >
      <StageBlock badge="Before permissible dates">
        <Body style={{ color: C.articleSoft, fontSize: 13, fontWeight: 600 }}>
          Before June 15 after sophomore year
        </Body>
        <Body>
          Send updates and show interest. Do not expect recruiting conversations back.
          Keep sending clean film, measurables, and camp plans. You are building
          awareness, not closing a deal.
        </Body>
      </StageBlock>

      <StageBlock badge="After permissible dates" isLast>
        <Body style={{ color: C.articleSoft, fontSize: 13, fontWeight: 600 }}>
          After June 15 after sophomore year
        </Body>
        <ol style={{
          margin: 0, paddingLeft: 18,
          color: C.articleMuted, fontSize: 16, lineHeight: 1.9,
        }}>
          <li>Send a DM or email with interest and film link</li>
          <li>Confirm camp attendance or ask for the next evaluation step</li>
          <li>Follow up within 24 to 72 hours after every camp</li>
          <li>End each follow-up with: "What would you like to see next from me?"</li>
        </ol>
        <Callout tone="success">
          After every camp, follow up within 72 hours. Thank the coach, mention one
          specific thing from the day, and include your film link again.
        </Callout>
      </StageBlock>
    </Section>
  );
}

function TopicCosts() {
  return (
    <Section
      icon="💰"
      title="Camp costs"
      intro="The camp fee is usually the smallest part of what you spend. Budget like a family that has done this before."
    >
      <SimpleTable
        rows={[
          ["One-day prospect camp", "$40 – $150"],
          ["Multi-day commuter", "$150 – $250"],
          ["Overnight camp", "$250 – $400+"],
          ["Specialist camp", "$50 – $300+"],
        ]}
      />

      <p style={{ margin: "0 0 16px", color: C.articleSoft, fontSize: 13 }}>
        Many camps raise prices close to the date. Early registration often saves $25 to $50.
      </p>

      <CompareGrid columns={3}>
        <MiniCard title="Local day camp" tone="green">
          <div>Camp fee + gas + food</div>
          <div style={{ marginTop: 8, color: C.articleText, fontWeight: 700 }}>
            $75–$200 all-in
          </div>
        </MiniCard>
        <MiniCard title="Regional, one night" tone="blue">
          <div>Camp fee + hotel + meals + mileage</div>
          <div style={{ marginTop: 8, color: C.articleText, fontWeight: 700 }}>
            $250–$600 all-in
          </div>
        </MiniCard>
        <MiniCard title="Flight camp, 2–3 days" tone="gold">
          <div>Camp fee + flight + hotel + ground + meals</div>
          <div style={{ marginTop: 8, color: C.articleText, fontWeight: 700 }}>
            $700–$1,500+ all-in
          </div>
        </MiniCard>
      </CompareGrid>

      <div style={{ marginTop: 14 }}>
        <Callout tone="success">
          Cluster camps geographically. One trip to a region with 2 to 3 camps often
          costs about the same as one trip and gives much more exposure.
        </Callout>
      </div>
    </Section>
  );
}

function TopicStrategy() {
  return (
    <Section
      icon="🎯"
      title="Building your camp strategy"
      intro="Not all camps are equal. Pick the right ones and stop spending on the wrong ones."
    >
      <div style={{ color: C.articleText, fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
        The 60 / 20 / 20 framework
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <StrategyRow
          percent="60%"
          title="Target schools"
          desc="Programs that fit your level and where you have genuine interest. These are your priority camps."
          tone="blue"
        />
        <StrategyRow
          percent="20%"
          title="Reach schools"
          desc="Programs above your current level. Worth attending when you have a realistic shot and a clear follow-up plan."
          tone="gold"
        />
        <StrategyRow
          percent="20%"
          title="Development camps"
          desc="Camps focused on skill-building more than evaluation. These make you a better player and prospect."
          tone="green"
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <Callout tone="warn">
          Only make a long-distance trip for a true target school and when you have a
          specific follow-up plan after the camp. One targeted trip beats three random ones.
        </Callout>
      </div>
    </Section>
  );
}

function TopicFilm() {
  return (
    <Section
      icon="🎬"
      title="Film that coaches actually watch"
      intro="Your highlight reel opens doors. Your full game film closes them. Here is what coaches actually want."
    >
      <StageBlock badge="Highlight reel rules" isLast>
        <ol style={{
          margin: 0, paddingLeft: 18,
          color: C.articleMuted, fontSize: 16, lineHeight: 1.95,
        }}>
          <li>Total length: 3 to 5 minutes</li>
          <li>Best plays in the first 30 to 60 seconds</li>
          <li>Aim for 20 to 30 top plays</li>
          <li>Start with a title card: name, grad year, position, height and weight, school, contact</li>
          <li>Identify yourself in every clip with an arrow or spotlight</li>
          <li>No heavy music, no transitions, no gimmicks</li>
        </ol>
      </StageBlock>

      <div style={{ color: C.articleText, fontWeight: 700, fontSize: 15, margin: "24px 0 14px" }}>
        What coaches want by position
      </div>

      <CompareGrid columns={2}>
        <MiniCard title="QB" tone="blue">
          Footwork, release consistency, accuracy under pressure, and decision-making on time
        </MiniCard>
        <MiniCard title="WR / DB" tone="blue">
          Burst off the line, separation, hands, ball tracking, and tackling for DBs
        </MiniCard>
        <MiniCard title="OL / DL" tone="green">
          First-step quickness, hand placement, leverage, finish blocks, and motor
        </MiniCard>
        <MiniCard title="RB / LB" tone="purple">
          Vision, acceleration, contact balance, and pursuit angles
        </MiniCard>
      </CompareGrid>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <Callout tone="success">
          Keep clips to 10 to 25 seconds. Start 1 to 2 seconds before the snap and end
          right after the outcome.
        </Callout>
        <Callout tone="warn">
          Beyond the highlight reel, have 1 to 2 full games against quality opponents
          ready to share. Coaches will ask.
        </Callout>
      </div>
    </Section>
  );
}

function TopicSocial() {
  return (
    <Section
      icon="📱"
      title="Social media strategy on X"
      intro="X is where many coaches discover prospects and track interest. Use it in a way that helps recruiting instead of hurting it."
    >
      <StageBlock badge="Profile setup checklist" isLast>
        <Body style={{ color: C.articleSoft, fontSize: 13, fontWeight: 600 }}>
          This takes about 20 minutes and only needs to be done once.
        </Body>
        <ul style={{
          margin: 0, paddingLeft: 18,
          color: C.articleMuted, fontSize: 16, lineHeight: 1.95,
        }}>
          <li>Name: First Last | Grad Year | Position</li>
          <li>Bio: Height/Weight | School | City, State | GPA | key measurable</li>
          <li>Link: one hub such as Hudl or Linktree</li>
          <li>Pinned post: best highlight plus contact info</li>
        </ul>
      </StageBlock>

      <CompareGrid columns={2}>
        <MiniCard title="In-season posting" tone="green">
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
            <li>1 highlight clip, 10 to 25 seconds, labeled</li>
            <li>1 recruiting update with stats or schedule</li>
            <li>1 camp recap or thank-you if attended</li>
          </ul>
        </MiniCard>
        <MiniCard title="Pre-summer posting" tone="blue">
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
            <li>1 post per camp attending with schools and dates</li>
            <li>1 post after camp with clips, thanks, and learnings</li>
          </ul>
        </MiniCard>
      </CompareGrid>

      <div style={{ color: C.articleText, fontWeight: 700, fontSize: 15, margin: "24px 0 14px" }}>
        DM templates
      </div>

      <TemplateCard
        title="Before a camp"
        lines={`Coach [Last Name] — I'm [Name], [Grad Year] [Position] from [School, State]. I'm attending your camp on [Date] and would love the chance to compete and be evaluated.

[Ht/Wt] | [Measurable] | GPA [X]
Film: [link]
Thank you — [Name]`}
      />

      <TemplateCard
        title="After a camp"
        lines={`Coach [Last Name] — thank you for the camp today. I appreciated the coaching on [specific detail]. I'm very interested in [School].

Film: [link]
What would you like to see next from me?`}
      />

      <div style={{ marginTop: 12 }}>
        <Callout tone="danger">
          <strong>DM mistakes to avoid:</strong>
          <br />Copy and paste without the school name
          <br />Long paragraphs
          <br />Asking for an offer in a DM
          <br />Sending multiple DMs with no response
        </Callout>
      </div>
    </Section>
  );
}

// ─── Registry + meta ───────────────────────────────────────────────────────────

const TOPIC_COMPONENTS = {
  timeline:      TopicTimeline,
  communication: TopicCommunication,
  offers:        TopicOffers,
  playbook:      TopicPlaybook,
  costs:         TopicCosts,
  strategy:      TopicStrategy,
  film:          TopicFilm,
  social:        TopicSocial,
};

function getTopicMeta(topicId) {
  const map = {
    timeline: {
      readTime: "5 min read",
      audience: "Parents and 9th–12th graders",
      summary: "A clear view of what matters at each stage, so families focus on the right actions at the right time.",
    },
    communication: {
      readTime: "4 min read",
      audience: "Athletes and parents",
      summary: "Who can contact whom, when it is allowed, and how to communicate without creating friction or confusion.",
    },
    offers: {
      readTime: "4 min read",
      audience: "Families evaluating interest",
      summary: "The clearest way to separate real scholarship movement from casual recruiting language.",
    },
    playbook: {
      readTime: "4 min read",
      audience: "Families building a plan",
      summary: "A simple step-by-step approach for outreach before and after permissible contact dates.",
    },
    costs: {
      readTime: "3 min read",
      audience: "Budget-conscious parents",
      summary: "What camps really cost once travel, lodging, meals, and timing are factored in.",
    },
    strategy: {
      readTime: "4 min read",
      audience: "Families planning summer camps",
      summary: "A practical framework to choose better camps, spend smarter, and avoid low-return trips.",
    },
    film: {
      readTime: "5 min read",
      audience: "Athletes preparing film",
      summary: "What belongs in a reel, what coaches actually look for, and how to keep film sharp and useful.",
    },
    social: {
      readTime: "5 min read",
      audience: "Athletes using X",
      summary: "How to present the athlete cleanly online, post with purpose, and message coaches the right way.",
    },
  };
  return map[topicId] || {
    readTime: "4 min read",
    audience: "Parents and athletes",
    summary: "A practical guide built to help families move with more clarity and less guesswork.",
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const { isLoading, hasAccess, mode, isAuthenticated } = useSeasonAccess();
  const nav = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  const params = new URLSearchParams(location.search);
  const initialTopic = params.get("topic") || KB_TOPICS_FLAT[0].id;

  const [activeTopicId, setActiveTopicId] = useState(
    KB_TOPICS_FLAT.find((t) => t.id === initialTopic) ? initialTopic : KB_TOPICS_FLAT[0].id
  );

  const activeTopic = useMemo(
    () => KB_TOPICS_FLAT.find((t) => t.id === activeTopicId),
    [activeTopicId]
  );

  const activeIndex = KB_TOPICS_FLAT.indexOf(activeTopic);
  const prevTopic = activeIndex > 0 ? KB_TOPICS_FLAT[activeIndex - 1] : null;
  const nextTopic = activeIndex < KB_TOPICS_FLAT.length - 1 ? KB_TOPICS_FLAT[activeIndex + 1] : null;

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    trackEventOnce("playbook_viewed", "evt_playbook_viewed_v1");
  }, []);

  useEffect(() => {
    trackEvent("playbook_topic_viewed", { topic: activeTopicId });
  }, [activeTopicId]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function selectTopic(id) {
    setActiveTopicId(id);
    const newParams = new URLSearchParams(location.search);
    newParams.set("topic", id);
    window.history.replaceState(null, "", `${location.pathname}?${newParams.toString()}`);
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (isLoading) return null;

  const isDemoMode = mode === "demo";
  const isDemoUnlocked = isDemoMode && DEMO_UNLOCKED_ARTICLE_IDS.includes(activeTopicId);

  // Non-demo users without access: full paywall
  if (!hasAccess && !isDemoMode) {
    return <GuidePaywall isAuthenticated={isAuthenticated} />;
  }

  const TopicContent = TOPIC_COMPONENTS[activeTopicId] || (() => null);

  return (
    <div style={{
      minHeight: "100vh",
      background: C.appBg,
      fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
    }}>
      <style>{GLOBAL_CSS}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>

        {/* Desktop sidebar — table of contents */}
        {!isMobile && (
          <KbSidebarDesktop
            activeId={activeTopicId}
            onSelect={selectTopic}
            demoUnlockedIds={isDemoMode ? DEMO_UNLOCKED_ARTICLE_IDS : null}
          />
        )}

        {/* Main reading column */}
        <div
          ref={contentRef}
          style={{
            flex: 1, minHeight: "100vh",
            overflowY: "auto",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Sticky top nav bar */}
          <div style={{
            position: "sticky", top: 0, zIndex: 30,
            background: C.shellSurface,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: `1px solid ${C.shellBorder}`,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 16px",
            }}>
              <button
                onClick={() => nav(isDemoMode ? "/Workspace?demo=user&src=home_demo" : "/Workspace")}
                style={{
                  background: "none", border: "none",
                  color: "#cbd5e1", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 4,
                  padding: 0, fontFamily: "inherit",
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
                HQ
              </button>

              {/* Breadcrumb — truncates gracefully on mobile */}
              {!isMobile && (
                <>
                  <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 13, flexShrink: 0 }}>/</span>
                  <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, flexShrink: 0 }}>
                    {activeTopic?.categoryLabel}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 13, flexShrink: 0 }}>/</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeTopic?.label}
                  </span>
                </>
              )}

              {/* On mobile: show current topic name, truncated */}
              {isMobile && (
                <span style={{
                  color: "#e2e8f0", fontSize: 13, fontWeight: 600,
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {activeTopic?.icon} {activeTopic?.label}
                </span>
              )}

              {/* Mobile topics button */}
              {isMobile && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  style={{
                    flexShrink: 0,
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    color: "#e2e8f0", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <List style={{ width: 13, height: 13 }} />
                  All guides
                </button>
              )}
            </div>
          </div>

          {/* Article area */}
          <div style={{
            width: "100%", maxWidth: C.pageMax,
            margin: "0 auto",
            padding: isMobile ? "20px 14px 48px" : "32px 28px 64px",
          }}>
            <div style={{ maxWidth: C.articleMax, margin: "0 auto" }}>

              {/* Unified light editorial card */}
              <div style={{
                background: C.articleBg,
                border: `1px solid ${C.articleBorder}`,
                borderRadius: 20,
                boxShadow: "0 2px 24px rgba(15,23,42,0.10)",
                overflow: "hidden",
              }}>

                {/* Demo sample guide banner */}
                {isDemoUnlocked && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 20px",
                    background: "rgba(234,179,8,0.08)",
                    borderBottom: "1px solid rgba(234,179,8,0.18)",
                  }}>
                    <span style={{ fontSize: 12 }}>👁️</span>
                    <span style={{ fontSize: 12, color: "#ca8a04", fontWeight: 600 }}>
                      SAMPLE GUIDE
                    </span>
                    <span style={{ fontSize: 12, color: "#92400e" }}>
                      · This article is unlocked in the demo. Full access requires a Season Pass.
                    </span>
                  </div>
                )}

                {/* Hero section */}
                <div style={{
                  padding: isMobile ? "24px 20px 22px" : "36px 36px 28px",
                  borderBottom: `1px solid ${C.articleDivider}`,
                }}>
                  <TopicHero topic={activeTopic} />
                </div>

                {/* Article body */}
                <article
                  id="kb-article-body"
                  style={{
                    padding: isMobile ? "24px 20px 32px" : "32px 36px 40px",
                  }}
                >
                  {isDemoMode && !isDemoUnlocked ? (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.articleText, marginBottom: 8 }}>
                        This guide requires a Season Pass
                      </div>
                      <div style={{ fontSize: 14, color: C.articleSoft, marginBottom: 24, lineHeight: 1.6 }}>
                        Two sample guides are available in the demo.<br />
                        Unlock all 8 guides with a Season Pass.
                      </div>
                      <a
                        href="/Subscribe?source=playbook_demo_lock"
                        style={{
                          display: "inline-block",
                          background: "#2563eb", color: "#ffffff",
                          borderRadius: 10, padding: "11px 24px",
                          fontSize: 14, fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Get Season Pass →
                      </a>
                    </div>
                  ) : (
                    <TopicContent />
                  )}

                  {/* Previous / next navigation */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "stretch",
                    gap: 12,
                    marginTop: 44,
                    paddingTop: 24,
                    borderTop: `1px solid ${C.articleDivider}`,
                    flexWrap: "wrap",
                  }}>
                    {prevTopic ? (
                      <button
                        className="kb-nav-btn"
                        onClick={() => selectTopic(prevTopic.id)}
                        style={{
                          flex: "1 1 200px",
                          background: C.cardBg,
                          border: `1px solid ${C.cardBorder}`,
                          borderRadius: 12, padding: "14px 16px",
                          cursor: "pointer", textAlign: "left",
                          color: C.articleText, fontFamily: "inherit",
                          transition: "border-color 0.12s",
                        }}
                      >
                        <div style={{
                          display: "flex", alignItems: "center", gap: 4,
                          color: C.articleSoft, fontSize: 11, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          marginBottom: 5,
                        }}>
                          <ArrowLeft style={{ width: 11, height: 11 }} />
                          Previous
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {prevTopic.icon} {prevTopic.label}
                        </div>
                      </button>
                    ) : <div style={{ flex: "1 1 200px" }} />}

                    {nextTopic ? (
                      <button
                        className="kb-nav-btn"
                        onClick={() => selectTopic(nextTopic.id)}
                        style={{
                          flex: "1 1 200px",
                          background: C.cardBg,
                          border: `1px solid ${C.cardBorder}`,
                          borderRadius: 12, padding: "14px 16px",
                          cursor: "pointer", textAlign: "right",
                          color: C.articleText, fontFamily: "inherit",
                          transition: "border-color 0.12s",
                        }}
                      >
                        <div style={{
                          display: "flex", justifyContent: "flex-end",
                          alignItems: "center", gap: 4,
                          color: C.articleSoft, fontSize: 11, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          marginBottom: 5,
                        }}>
                          Next
                          <ArrowRight style={{ width: 11, height: 11 }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {nextTopic.icon} {nextTopic.label}
                        </div>
                      </button>
                    ) : <div style={{ flex: "1 1 200px" }} />}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile topic drawer — overlays everything */}
      {isMobile && (
        <KbMobileDrawer
          activeId={activeTopicId}
          onSelect={(id) => { selectTopic(id); setDrawerOpen(false); }}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          demoUnlockedIds={isDemoMode ? DEMO_UNLOCKED_ARTICLE_IDS : null}
        />
      )}
    </div>
  );
}
