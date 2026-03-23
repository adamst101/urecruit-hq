// src/pages/KnowledgeBase.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Clock3,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  MessageSquareText,
} from "lucide-react";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { trackEvent, trackEventOnce } from "../utils/trackEvent.js";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";
import {
  KbSidebarDesktop,
  KbTopicBarMobile,
  KB_TOPICS_FLAT,
} from "../components/guides/KbSidebar.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`;

const C = {
  appBg: "#06111f",
  appGlow:
    "radial-gradient(circle at top right, rgba(212,175,55,0.12), transparent 28%), radial-gradient(circle at top left, rgba(29,78,216,0.10), transparent 20%)",
  shellBorder: "rgba(255,255,255,0.08)",
  shellSurface: "rgba(6, 17, 31, 0.84)",

  pageMax: 1120,
  articleMax: 860,

  articleBg: "#fcfcfb",
  articleBorder: "#e7e5e4",
  articleText: "#0f172a",
  articleMuted: "#475569",
  articleSoft: "#64748b",
  articleDivider: "#e2e8f0",

  cardBg: "#ffffff",
  cardBorder: "#e7e5e4",
  cardShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",

  gold: "#D4AF37",
  goldDeep: "#87630f",
  goldSoft: "rgba(212,175,55,0.12)",

  blue: "#2563eb",
  blueSoft: "rgba(37,99,235,0.10)",

  green: "#15803d",
  greenSoft: "rgba(21,128,61,0.10)",

  amber: "#b45309",
  amberSoft: "rgba(180,83,9,0.10)",

  red: "#b91c1c",
  redSoft: "rgba(185,28,28,0.08)",

  ink: "#0b1530",
};

const shellCard = {
  background: C.cardBg,
  border: `1px solid ${C.cardBorder}`,
  borderRadius: 20,
  boxShadow: C.cardShadow,
};

function TopicHero({ topic }) {
  const meta = getTopicMeta(topic?.id);

  return (
    <div
      style={{
        ...shellCard,
        overflow: "hidden",
        marginBottom: 20,
        borderColor: "#e5dcc1",
      }}
    >
      <div
        style={{
          padding: "30px 30px 24px",
          background:
            "linear-gradient(180deg, rgba(212,175,55,0.10), rgba(255,255,255,0.96) 58%)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            padding: "7px 11px",
            background: C.goldSoft,
            color: C.goldDeep,
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 14,
          }}
        >
          <Sparkles style={{ width: 13, height: 13 }} />
          Recruiting guide
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                margin: 0,
                color: C.articleText,
                fontSize: 40,
                lineHeight: 1.06,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              <span style={{ marginRight: 10 }}>{topic?.icon}</span>
              {topic?.label}
            </h1>

            <p
              style={{
                margin: "14px 0 0",
                color: C.articleMuted,
                fontSize: 17,
                lineHeight: 1.7,
                maxWidth: 720,
              }}
            >
              {meta.summary}
            </p>
          </div>

          <button
            onClick={() => {
              const el = document.getElementById("kb-main-content");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{
              border: "none",
              background: C.ink,
              color: "#ffffff",
              borderRadius: 14,
              padding: "14px 18px",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(11, 21, 48, 0.18)",
            }}
          >
            Jump into guide
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          <MetaPill icon={<Clock3 style={{ width: 14, height: 14 }} />}>
            {meta.readTime}
          </MetaPill>
          <MetaPill icon={<GraduationCap style={{ width: 14, height: 14 }} />}>
            {meta.audience}
          </MetaPill>
          <MetaPill>Updated for 2026</MetaPill>
        </div>
      </div>
    </div>
  );
}

function MetaPill({ icon, children }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 12px",
        borderRadius: 999,
        border: `1px solid ${C.articleDivider}`,
        background: "#ffffff",
        color: C.articleMuted,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

function Section({ title, intro, icon, children }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ marginBottom: 16 }}>
        <h2
          style={{
            margin: 0,
            color: C.articleText,
            fontSize: 23,
            lineHeight: 1.2,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ marginRight: 8 }}>{icon}</span>
          {title}
        </h2>
        {intro ? (
          <p
            style={{
              margin: "10px 0 0",
              color: C.articleMuted,
              fontSize: 15,
              lineHeight: 1.8,
              maxWidth: 760,
            }}
          >
            {intro}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StageBlock({ badge, children }) {
  return (
    <div
      style={{
        ...shellCard,
        padding: 22,
        marginBottom: 14,
        borderLeft: `4px solid ${C.gold}`,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: 999,
          background: C.goldSoft,
          color: C.goldDeep,
          fontSize: 12,
          fontWeight: 800,
          padding: "6px 10px",
          marginBottom: 12,
        }}
      >
        {badge}
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function Body({ children, style }) {
  return (
    <p
      style={{
        margin: 0,
        color: C.articleMuted,
        fontSize: 15,
        lineHeight: 1.82,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function Callout({ tone = "info", children }) {
  const map = {
    info: {
      bg: C.blueSoft,
      border: C.blue,
      color: "#1e3a8a",
      icon: <MessageSquareText style={{ width: 15, height: 15 }} />,
    },
    success: {
      bg: C.greenSoft,
      border: C.green,
      color: "#166534",
      icon: <CheckCircle2 style={{ width: 15, height: 15 }} />,
    },
    warn: {
      bg: C.amberSoft,
      border: C.amber,
      color: "#92400e",
      icon: <AlertTriangle style={{ width: 15, height: 15 }} />,
    },
    danger: {
      bg: C.redSoft,
      border: C.red,
      color: "#991b1b",
      icon: <AlertTriangle style={{ width: 15, height: 15 }} />,
    },
  };

  const cfg = map[tone];

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 14,
        padding: "13px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          color: cfg.color,
          fontSize: 14,
          lineHeight: 1.7,
          fontWeight: 600,
        }}
      >
        <div style={{ marginTop: 2 }}>{cfg.icon}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function CompareGrid({ children, columns = 2 }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function CompareCard({ badge, badgeTone = "gold", title, intro, bullets, footer }) {
  const badgeMap = {
    gold: { bg: C.goldSoft, color: C.goldDeep },
    green: { bg: C.greenSoft, color: "#166534" },
    blue: { bg: C.blueSoft, color: "#1e3a8a" },
  };

  const tone = badgeMap[badgeTone];

  return (
    <div
      style={{
        ...shellCard,
        padding: 22,
        height: "100%",
      }}
    >
      <div
        style={{
          display: "inline-block",
          borderRadius: 999,
          background: tone.bg,
          color: tone.color,
          fontSize: 12,
          fontWeight: 800,
          padding: "6px 10px",
          marginBottom: 12,
        }}
      >
        {badge}
      </div>

      <div
        style={{
          color: C.articleText,
          fontSize: 18,
          fontWeight: 800,
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <p
        style={{
          margin: "0 0 14px",
          color: C.articleMuted,
          fontSize: 15,
          lineHeight: 1.75,
        }}
      >
        {intro}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {bullets.map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              color: item.color,
              fontSize: 14,
              lineHeight: 1.65,
              fontWeight: 700,
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {footer ? (
        <p
          style={{
            margin: "14px 0 0",
            color: C.articleSoft,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          {footer}
        </p>
      ) : null}
    </div>
  );
}

function SimpleTable({ rows }) {
  return (
    <div
      style={{
        ...shellCard,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: 16,
          padding: "14px 18px",
          background: "#faf7ef",
          borderBottom: `1px solid ${C.articleDivider}`,
        }}
      >
        <div style={{ color: C.articleText, fontSize: 14, fontWeight: 800 }}>
          Camp type
        </div>
        <div
          style={{
            color: C.articleText,
            fontSize: 14,
            fontWeight: 800,
            textAlign: "right",
          }}
        >
          Typical fee
        </div>
      </div>

      {rows.map(([label, value], idx) => (
        <div
          key={label}
          style={{
            display: "grid",
            gridTemplateColumns: "1.7fr 1fr",
            gap: 16,
            padding: "14px 18px",
            borderBottom: idx === rows.length - 1 ? "none" : `1px solid ${C.articleDivider}`,
          }}
        >
          <div style={{ color: C.articleMuted, fontSize: 14 }}>{label}</div>
          <div
            style={{
              color: C.articleText,
              fontWeight: 700,
              fontSize: 14,
              textAlign: "right",
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniCard({ title, tone = "gold", children }) {
  const topMap = {
    gold: C.gold,
    blue: C.blue,
    green: C.green,
    purple: "#7c3aed",
  };

  return (
    <div
      style={{
        ...shellCard,
        padding: 18,
        borderTop: `3px solid ${topMap[tone]}`,
      }}
    >
      <div
        style={{
          color: C.articleText,
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: C.articleMuted,
          fontSize: 14,
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StrategyRow({ percent, title, desc, tone = "gold" }) {
  const map = {
    gold: { bg: C.gold, soft: C.goldSoft, text: C.goldDeep },
    blue: { bg: C.blue, soft: C.blueSoft, text: "#1e3a8a" },
    green: { bg: C.green, soft: C.greenSoft, text: "#166534" },
  };

  const cfg = map[tone];

  return (
    <div
      style={{
        ...shellCard,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "82px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div
          style={{
            minHeight: 58,
            borderRadius: 14,
            background: cfg.soft,
            color: cfg.text,
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          {percent}
        </div>

        <div>
          <div
            style={{
              color: C.articleText,
              fontWeight: 800,
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            {title}
          </div>
          <p
            style={{
              margin: 0,
              color: C.articleMuted,
              fontSize: 15,
              lineHeight: 1.75,
            }}
          >
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ title, tone = "green", intro, bullets }) {
  const map = {
    green: { border: C.green, bg: C.greenSoft, text: "#166534" },
    blue: { border: C.blue, bg: C.blueSoft, text: "#1e3a8a" },
    gold: { border: C.gold, bg: C.goldSoft, text: C.goldDeep },
  };

  const cfg = map[tone];

  return (
    <div
      style={{
        ...shellCard,
        padding: 18,
        borderLeft: `4px solid ${cfg.border}`,
      }}
    >
      <div
        style={{
          display: "inline-block",
          borderRadius: 999,
          background: cfg.bg,
          color: cfg.text,
          fontSize: 12,
          fontWeight: 800,
          padding: "6px 10px",
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      <p
        style={{
          margin: "0 0 10px",
          color: C.articleMuted,
          fontSize: 14,
          lineHeight: 1.75,
          fontWeight: 600,
        }}
      >
        {intro}
      </p>

      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          color: C.articleMuted,
          fontSize: 14,
          lineHeight: 1.85,
        }}
      >
        {bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TemplateCard({ title, lines }) {
  return (
    <div
      style={{
        ...shellCard,
        padding: 18,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          color: C.articleText,
          fontSize: 14,
          fontWeight: 800,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          color: C.articleMuted,
          fontSize: 14,
          lineHeight: 1.75,
          fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
        }}
      >
        {lines}
      </pre>
    </div>
  );
}

function TopicTimeline() {
  return (
    <>
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

        <StageBlock badge="12th grade">
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
    </>
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
          badgeTone="gold"
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

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <Callout tone="warn">
          Many offers come with conditions like academics, position board movement, senior
          film, or how the roster fills. Always ask, “What are the conditions on this
          offer?”
        </Callout>
        <Callout tone="warn">
          If a program pressures you to commit by Sunday, ask two questions. “What changes
          if we wait 7 days?” and “What would you need to see to feel certain?” A real
          offer survives a week.
        </Callout>
        <Callout tone="warn">
          A new coaching staff can reset everything, even if your athlete did everything
          right. Keep 3 to 5 realistic schools warm until National Signing Day.
        </Callout>
        <Callout tone="success">
          When any offer is made, ask one clean question: “Is this an offer for athletic
          aid, a roster spot, or both?”
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
        <Body style={{ color: C.articleSoft, fontSize: 13, fontWeight: 700 }}>
          Before June 15 after sophomore year
        </Body>
        <Body>
          Send updates and show interest. Do not expect recruiting conversations back.
          Keep sending clean film, measurables, and camp plans. You are building
          awareness, not closing a deal.
        </Body>
      </StageBlock>

      <StageBlock badge="After permissible dates">
        <Body style={{ color: C.articleSoft, fontSize: 13, fontWeight: 700 }}>
          After June 15 after sophomore year
        </Body>
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            color: C.articleMuted,
            fontSize: 15,
            lineHeight: 1.9,
          }}
        >
          <li>Send a DM or email with interest and film link</li>
          <li>Confirm camp attendance or ask for the next evaluation step</li>
          <li>Follow up within 24 to 72 hours after every camp</li>
          <li>End each follow-up with: “What would you like to see next from me?”</li>
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

      <p
        style={{
          margin: "10px 0 16px",
          color: C.articleSoft,
          fontSize: 13,
        }}
      >
        Many camps raise prices close to the date. Early registration often saves $25 to
        $50.
      </p>

      <CompareGrid columns={3}>
        <MiniCard title="Local day camp" tone="green">
          <div>Camp fee + gas + food</div>
          <div style={{ marginTop: 8, color: C.articleText, fontWeight: 800 }}>
            $75–$200 all-in
          </div>
        </MiniCard>
        <MiniCard title="Regional, one night" tone="blue">
          <div>Camp fee + hotel + meals + mileage</div>
          <div style={{ marginTop: 8, color: C.articleText, fontWeight: 800 }}>
            $250–$600 all-in
          </div>
        </MiniCard>
        <MiniCard title="Flight camp, 2–3 days" tone="gold">
          <div>Camp fee + flight + hotel + ground + meals</div>
          <div style={{ marginTop: 8, color: C.articleText, fontWeight: 800 }}>
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
      <div
        style={{
          color: C.articleText,
          fontWeight: 800,
          fontSize: 16,
          marginBottom: 12,
        }}
      >
        The 60 / 20 / 20 framework
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <StrategyRow
          percent="60%"
          title="Target schools"
          desc="Programs that fit your level and where you have genuine interest. These are your priority camps."
          tone="gold"
        />
        <StrategyRow
          percent="20%"
          title="Reach schools"
          desc="Programs above your current level. Worth attending when you have a realistic shot and a clear follow-up plan."
          tone="blue"
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
          specific follow-up plan after the camp. One targeted trip beats three random
          ones.
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
      <StageBlock badge="Highlight reel rules">
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            color: C.articleMuted,
            fontSize: 15,
            lineHeight: 1.95,
          }}
        >
          <li>Total length: 3 to 5 minutes</li>
          <li>Best plays in the first 30 to 60 seconds</li>
          <li>Aim for 20 to 30 top plays</li>
          <li>
            Start with a title card: name, grad year, position, height and weight, school,
            contact
          </li>
          <li>Identify yourself in every clip with an arrow or spotlight</li>
          <li>No heavy music, no transitions, no gimmicks</li>
        </ol>
      </StageBlock>

      <div
        style={{
          color: C.articleText,
          fontWeight: 800,
          fontSize: 16,
          margin: "20px 0 12px",
        }}
      >
        What coaches want by position
      </div>

      <CompareGrid columns={2}>
        <MiniCard title="QB" tone="gold">
          Footwork, release consistency, accuracy under pressure, and decision-making on
          time
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
      <StageBlock badge="Profile setup checklist">
        <Body style={{ color: C.articleSoft, fontSize: 13, fontWeight: 700 }}>
          This takes about 20 minutes and only needs to be done once.
        </Body>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: C.articleMuted,
            fontSize: 15,
            lineHeight: 1.95,
          }}
        >
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

      <div
        style={{
          color: C.articleText,
          fontWeight: 800,
          fontSize: 16,
          margin: "20px 0 12px",
        }}
      >
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
          <br />
          Copy and paste without the school name
          <br />
          Long paragraphs
          <br />
          Asking for an offer in a DM
          <br />
          Sending multiple DMs with no response
        </Callout>
      </div>
    </Section>
  );
}

const TOPIC_COMPONENTS = {
  timeline: TopicTimeline,
  communication: TopicCommunication,
  offers: TopicOffers,
  playbook: TopicPlaybook,
  costs: TopicCosts,
  strategy: TopicStrategy,
  film: TopicFilm,
  social: TopicSocial,
};

function getTopicMeta(topicId) {
  const map = {
    timeline: {
      readTime: "5 min read",
      audience: "Parents and 9th–12th graders",
      summary:
        "A clear view of what matters at each stage, so families focus on the right actions at the right time.",
    },
    communication: {
      readTime: "4 min read",
      audience: "Athletes and parents",
      summary:
        "Who can contact whom, when it is allowed, and how to communicate without creating friction or confusion.",
    },
    offers: {
      readTime: "4 min read",
      audience: "Families evaluating interest",
      summary:
        "The clearest way to separate real scholarship movement from casual recruiting language.",
    },
    playbook: {
      readTime: "4 min read",
      audience: "Families building a plan",
      summary:
        "A simple step-by-step approach for outreach before and after permissible contact dates.",
    },
    costs: {
      readTime: "3 min read",
      audience: "Budget-conscious parents",
      summary:
        "What camps really cost once travel, lodging, meals, and timing are factored in.",
    },
    strategy: {
      readTime: "4 min read",
      audience: "Families planning summer camps",
      summary:
        "A practical framework to choose better camps, spend smarter, and avoid low-return trips.",
    },
    film: {
      readTime: "5 min read",
      audience: "Athletes preparing film",
      summary:
        "What belongs in a reel, what coaches actually look for, and how to keep film sharp and useful.",
    },
    social: {
      readTime: "5 min read",
      audience: "Athletes using X",
      summary:
        "How to present the athlete cleanly online, post with purpose, and message coaches the right way.",
    },
  };

  return (
    map[topicId] || {
      readTime: "4 min read",
      audience: "Parents and athletes",
      summary:
        "A practical guide built to help families move with more clarity and less guesswork.",
    }
  );
}

export default function KnowledgeBase() {
  const { isLoading, hasAccess, mode, isAuthenticated } = useSeasonAccess();
  const nav = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  const params = new URLSearchParams(location.search);
  const initialTopic = params.get("topic") || KB_TOPICS_FLAT[0].id;

  const [activeTopicId, setActiveTopicId] = useState(
    KB_TOPICS_FLAT.find((t) => t.id === initialTopic)
      ? initialTopic
      : KB_TOPICS_FLAT[0].id
  );

  const activeTopic = useMemo(
    () => KB_TOPICS_FLAT.find((t) => t.id === activeTopicId),
    [activeTopicId]
  );

  const activeIndex = KB_TOPICS_FLAT.indexOf(activeTopic);
  const prevTopic = activeIndex > 0 ? KB_TOPICS_FLAT[activeIndex - 1] : null;
  const nextTopic =
    activeIndex < KB_TOPICS_FLAT.length - 1 ? KB_TOPICS_FLAT[activeIndex + 1] : null;

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

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
  if (!hasAccess || mode === "demo") {
    return <GuidePaywall isAuthenticated={isAuthenticated} />;
  }

  const TopicContent = TOPIC_COMPONENTS[activeTopicId] || (() => null);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.appBg,
        backgroundImage: C.appGlow,
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
      }}
    >
      <style>{FONTS}</style>

      <div
        style={{
          display: "flex",
          minHeight: "100vh",
        }}
      >
        {!isMobile && (
          <KbSidebarDesktop activeId={activeTopicId} onSelect={selectTopic} />
        )}

        <div
          ref={contentRef}
          style={{
            flex: 1,
            minHeight: "100vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 30,
              background: C.shellSurface,
              backdropFilter: "blur(16px)",
              borderBottom: `1px solid ${C.shellBorder}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 20px",
              }}
            >
              <button
                onClick={() => nav("/Workspace")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f2d372",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 0,
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
                HQ
              </button>

              <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 13 }}>/</span>
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 13 }}>
                {activeTopic?.categoryLabel}
              </span>
              <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 13 }}>/</span>
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {activeTopic?.label}
              </span>
            </div>

            {isMobile && (
              <div style={{ borderTop: `1px solid ${C.shellBorder}` }}>
                <KbTopicBarMobile activeId={activeTopicId} onSelect={selectTopic} />
              </div>
            )}
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: C.pageMax,
              margin: "0 auto",
              padding: isMobile ? "20px 16px 38px" : "30px 24px 44px",
            }}
          >
            <div
              style={{
                maxWidth: C.articleMax,
                margin: "0 auto",
              }}
            >
              <TopicHero topic={activeTopic} />

              <article
                id="kb-main-content"
                style={{
                  background: C.articleBg,
                  border: `1px solid ${C.articleBorder}`,
                  borderRadius: 24,
                  boxShadow: "0 16px 40px rgba(2, 6, 23, 0.16)",
                  padding: isMobile ? "22px 16px 26px" : "30px 26px 34px",
                }}
              >
                <TopicContent />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                    marginTop: 34,
                    paddingTop: 22,
                    borderTop: `1px solid ${C.articleDivider}`,
                  }}
                >
                  {prevTopic ? (
                    <button
                      onClick={() => selectTopic(prevTopic.id)}
                      style={{
                        flex: "1 1 240px",
                        minWidth: 220,
                        background: "#ffffff",
                        border: `1px solid ${C.cardBorder}`,
                        borderRadius: 16,
                        padding: "16px 18px",
                        cursor: "pointer",
                        textAlign: "left",
                        color: C.articleText,
                        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          color: C.articleSoft,
                          fontSize: 11,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 6,
                        }}
                      >
                        <ArrowLeft style={{ width: 11, height: 11 }} />
                        Previous
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>
                        {prevTopic.icon} {prevTopic.label}
                      </div>
                    </button>
                  ) : (
                    <div style={{ flex: "1 1 240px" }} />
                  )}

                  {nextTopic ? (
                    <button
                      onClick={() => selectTopic(nextTopic.id)}
                      style={{
                        flex: "1 1 240px",
                        minWidth: 220,
                        background: "#ffffff",
                        border: `1px solid ${C.cardBorder}`,
                        borderRadius: 16,
                        padding: "16px 18px",
                        cursor: "pointer",
                        textAlign: "right",
                        color: C.articleText,
                        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          gap: 4,
                          color: C.articleSoft,
                          fontSize: 11,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 6,
                        }}
                      >
                        Next
                        <ArrowRight style={{ width: 11, height: 11 }} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>
                        {nextTopic.icon} {nextTopic.label}
                      </div>
                    </button>
                  ) : (
                    <div style={{ flex: "1 1 240px" }} />
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}