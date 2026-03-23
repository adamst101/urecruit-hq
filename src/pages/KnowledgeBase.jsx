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
} from "lucide-react";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { trackEvent, trackEventOnce } from "../utils/trackEvent.js";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";
import {
  KbSidebarDesktop,
  KbTopicBarMobile,
  KB_TOPICS_FLAT,
} from "../components/guides/KbSidebar.jsx";
import {
  SectionTitle,
  SectionIntro,
  StageCard,
  InfoBox,
  TipBox,
  WarningBox,
  ErrorBox,
  BodyText,
  ContactCard,
  GridCards,
  SmallCard,
  DMTemplate,
} from "../components/guides/GuideCards.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`;

const BRAND = {
  bg: "#09111f",
  bgGlow: "radial-gradient(circle at top right, rgba(212,175,55,0.14), transparent 28%)",
  shellBorder: "rgba(255,255,255,0.08)",
  shellSurface: "rgba(10, 18, 32, 0.84)",
  articleBg: "#f8fafc",
  articleBorder: "rgba(15,23,42,0.08)",
  articleText: "#0f172a",
  articleMuted: "#475569",
  articleSoft: "#64748b",
  divider: "#e2e8f0",
  cardBg: "#ffffff",
  cardBorder: "#e5e7eb",
  gold: "#D4AF37",
  goldDeep: "#8a6a12",
  success: "#15803d",
  blue: "#1d4ed8",
  danger: "#b91c1c",
  ink: "#0f172a",
};

const baseCardStyle = {
  background: BRAND.cardBg,
  border: `1px solid ${BRAND.cardBorder}`,
  borderRadius: 18,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
};

const articleH2Style = {
  color: BRAND.articleText,
  fontSize: 18,
  fontWeight: 800,
  margin: "28px 0 12px",
};

const articleBodyStyle = {
  color: BRAND.articleMuted,
  fontSize: 15,
  lineHeight: 1.75,
  margin: 0,
};

function TopicHero({ topic }) {
  const meta = getTopicMeta(topic?.id);

  return (
    <div
      style={{
        ...baseCardStyle,
        marginBottom: 26,
        overflow: "hidden",
        borderColor: "rgba(212,175,55,0.18)",
      }}
    >
      <div
        style={{
          padding: "28px 28px 22px",
          background:
            "linear-gradient(180deg, rgba(212,175,55,0.08), rgba(255,255,255,0.92) 55%)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            padding: "7px 12px",
            background: "rgba(212,175,55,0.12)",
            color: BRAND.goldDeep,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          <Sparkles style={{ width: 14, height: 14 }} />
          Recruiting guide
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                margin: 0,
                color: BRAND.articleText,
                fontSize: 34,
                lineHeight: 1.1,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              {topic?.icon} {topic?.label}
            </h1>
            <p
              style={{
                margin: "12px 0 0",
                color: BRAND.articleMuted,
                fontSize: 16,
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
              borderRadius: 12,
              padding: "12px 16px",
              background: BRAND.ink,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.15)",
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
        borderRadius: 999,
        padding: "8px 12px",
        background: "#ffffff",
        border: `1px solid ${BRAND.cardBorder}`,
        color: BRAND.articleMuted,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {icon || null}
      <span>{children}</span>
    </div>
  );
}

function SectionWrap({ children, style }) {
  return (
    <section
      style={{
        marginBottom: 30,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function CleanCompareCard({ badge, badgeBg, badgeText, title, intro, bullets, footer }) {
  return (
    <div
      style={{
        ...baseCardStyle,
        padding: 22,
        height: "100%",
      }}
    >
      <span
        style={{
          display: "inline-block",
          background: badgeBg,
          color: badgeText || "#ffffff",
          fontSize: 12,
          fontWeight: 800,
          padding: "5px 10px",
          borderRadius: 999,
          marginBottom: 12,
        }}
      >
        {badge}
      </span>
      <div
        style={{
          color: BRAND.articleText,
          fontSize: 18,
          fontWeight: 800,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <p style={{ ...articleBodyStyle, marginBottom: 14 }}>{intro}</p>
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
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1.3 }}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {footer ? (
        <p
          style={{
            margin: "14px 0 0",
            color: BRAND.articleMuted,
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

function CleanTable({ rows }) {
  return (
    <div
      style={{
        ...baseCardStyle,
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: 16,
          padding: "14px 20px",
          background: "rgba(212,175,55,0.08)",
          borderBottom: `1px solid ${BRAND.cardBorder}`,
        }}
      >
        <div
          style={{
            color: BRAND.articleText,
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          Camp type
        </div>
        <div
          style={{
            color: BRAND.articleText,
            fontWeight: 800,
            fontSize: 14,
            textAlign: "right",
          }}
        >
          Typical fee
        </div>
      </div>

      {rows.map(([label, value], index) => (
        <div
          key={label}
          style={{
            display: "grid",
            gridTemplateColumns: "1.7fr 1fr",
            gap: 16,
            padding: "14px 20px",
            borderBottom:
              index === rows.length - 1 ? "none" : `1px solid ${BRAND.cardBorder}`,
          }}
        >
          <div style={{ color: BRAND.articleMuted, fontSize: 14 }}>{label}</div>
          <div
            style={{
              color: BRAND.articleText,
              fontSize: 14,
              fontWeight: 700,
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

function StrategyBar({ pct, label, desc, fill }) {
  return (
    <div
      style={{
        ...baseCardStyle,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "72px 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div
          style={{
            width: 72,
            borderRadius: 14,
            background: fill,
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 18,
            minHeight: 56,
          }}
        >
          {pct}
        </div>
        <div>
          <div
            style={{
              color: BRAND.articleText,
              fontWeight: 800,
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <p style={articleBodyStyle}>{desc}</p>
        </div>
      </div>
    </div>
  );
}

function TopicTimeline() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="📅" title="Recruiting timeline" />
        <SectionIntro>
          Recruiting rules are strict about when coaches can reach out, but there
          are no rules about when your athlete can. Here is what matters most at
          each stage.
        </SectionIntro>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="Grades 6–8">
          <BodyText>
            Focus on development and fundamentals. Camps at this age are for
            learning reps, not recruiting. If a coach shows early interest, treat
            it as a relationship signal, not a locked offer.
          </BodyText>
          <InfoBox>
            Early offers in middle school are not binding and are not written
            athletic aid. They are attention, which is valuable, but not security.
          </InfoBox>
        </StageCard>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="9th–10th grade">
          <BodyText>
            Build your baseline: measurables, film, and academics. You can contact
            coaches anytime. Expect limited responses until permissible dates.
          </BodyText>
          <InfoBox>
            <strong>NCAA rule:</strong> For Division I football, June 15 after
            sophomore year is the first permissible date for coaches to send texts,
            emails, and DMs.
          </InfoBox>
        </StageCard>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="11th grade — when recruiting gets real">
          <BodyText>
            This is the most important year. Official visit windows open, direct
            communication increases, and your summer camp strategy should be
            targeted and intentional.
          </BodyText>
          <InfoBox>
            <strong>Key dates:</strong>
            <br />• Official visits open: April 1, junior year
            <br />• Off-campus contact: January 1, junior year
            <br />• Unofficial visits: anytime, paid by the family
          </InfoBox>
          <TipBox>
            Camp strategy: 60 percent target schools you genuinely fit, 20 percent
            reach schools, 20 percent development camps.
          </TipBox>
        </StageCard>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="12th grade — execution">
          <BodyText>
            Stay eligible, healthy, and responsive. Written offers of athletic aid
            become possible. The job now is to finish strong and close.
          </BodyText>
          <InfoBox>
            <strong>NCAA rule:</strong> Schools cannot provide a written offer of
            athletic aid before August 1 of a prospect&apos;s senior year. Most
            early offers are verbal only.
          </InfoBox>
        </StageCard>
      </SectionWrap>
    </>
  );
}

function TopicCommunication() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="💬" title="Contacting coaches" />
        <SectionIntro>
          The most important rule: your athlete can reach out anytime. Coaches have
          restrictions. Here is how to handle both sides cleanly.
        </SectionIntro>
      </SectionWrap>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 10,
        }}
      >
        <ContactCard
          header="Athlete → Coach"
          headerColor="#15803d"
          intro="Allowed anytime via email, DM, phone, or letter."
          bullets={[
            "Keep it short and specific",
            "Always include one link to film and profile",
            "You are not breaking rules by reaching out first",
          ]}
        />
        <ContactCard
          header="Parent → Coach"
          headerColor="#1d4ed8"
          intro="Allowed anytime, but stay in your lane."
          bullets={[
            "Focus on logistics: camp attendance, travel, academics",
            "Let the athlete lead the relationship",
            "Never push for offers or negotiate on their behalf",
          ]}
        />
        <ContactCard
          header="Coach → Athlete"
          headerColor="#8a6a12"
          intro="Coaches have real restrictions on when they can proactively reach out."
          bullets={[
            "They can answer if you call, anytime",
            "They cannot proactively call or text until permissible dates",
            "Do not confuse answer with initiate",
          ]}
        />
      </div>
    </>
  );
}

function TopicOffers() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="🤝" title="Understanding offers" />
        <SectionIntro>
          The word offer gets used loosely in recruiting. Here is what it actually
          means, and what it does not.
        </SectionIntro>
      </SectionWrap>

      <GridCards columns={2}>
        <CleanCompareCard
          badge="Verbal offer"
          badgeBg="rgba(212,175,55,0.14)"
          badgeText={BRAND.goldDeep}
          title="Interest with upside"
          intro="A coach tells you there may be a spot for your athlete."
          bullets={[
            { icon: "✓", label: "It means genuine interest", color: BRAND.success },
            { icon: "✗", label: "It does not mean a binding commitment", color: BRAND.danger },
            { icon: "✗", label: "It does not mean scholarship money", color: BRAND.danger },
          ]}
          footer="Either side can walk away from a verbal offer at any time."
        />
        <CleanCompareCard
          badge="Written offer of aid"
          badgeBg="rgba(21,128,61,0.12)"
          badgeText={BRAND.success}
          title="Actual scholarship paperwork"
          intro="This is the formal offer of athletic scholarship aid."
          bullets={[
            { icon: "✓", label: "Has a defined timeline", color: BRAND.success },
            { icon: "✓", label: "Is the real scholarship paperwork", color: BRAND.success },
          ]}
          footer="NCAA rule: cannot be provided before August 1 of a prospect's senior year."
        />
      </GridCards>

      <WarningBox>
        Many offers come with conditions: academics, position board movement,
        senior film, or how the roster fills. Always ask, “What are the
        conditions on this offer?”
      </WarningBox>
      <WarningBox>
        If a program pressures you to commit by Sunday, ask two questions: “What
        changes if we wait 7 days?” and “What would you need to see to feel
        certain?” A real offer survives a week.
      </WarningBox>
      <WarningBox>
        A new coaching staff can reset everything, even if your athlete did
        everything right. Keep 3 to 5 realistic schools warm until National
        Signing Day.
      </WarningBox>
      <TipBox>
        When any offer is made, ask one clean question: “Is this an offer for
        athletic aid, a roster spot, or both?” It clarifies everything instantly.
      </TipBox>
    </>
  );
}

function TopicPlaybook() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="📋" title="The contact playbook" />
        <SectionIntro>
          Simple, safe, and effective. Follow this sequence and your family will
          operate more clearly than most.
        </SectionIntro>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="Before permissible dates" badgeColor="#1d4ed8">
          <BodyText
            style={{ color: BRAND.articleSoft, fontSize: 13, marginBottom: 6 }}
          >
            Before June 15 after sophomore year
          </BodyText>
          <BodyText>
            Send updates and show interest. Do not expect recruiting conversations
            back. Keep sending clean film, measurables, and camp plans. You are
            building awareness, not closing a deal.
          </BodyText>
        </StageCard>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="After permissible dates" badgeColor="#15803d">
          <BodyText
            style={{ color: BRAND.articleSoft, fontSize: 13, marginBottom: 6 }}
          >
            After June 15 after sophomore year
          </BodyText>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              color: BRAND.articleMuted,
              fontSize: 15,
              lineHeight: 1.8,
            }}
          >
            <li>Send a DM or email with interest and film link</li>
            <li>Confirm camp attendance or ask for the next evaluation step</li>
            <li>Follow up within 24 to 72 hours after every camp</li>
            <li>End each follow-up with: “What would you like to see next from me?”</li>
          </ol>
          <TipBox>
            After every camp, follow up within 72 hours. Thank the coach, mention
            one specific thing from the day, and include your film link again.
          </TipBox>
        </StageCard>
      </SectionWrap>
    </>
  );
}

function TopicCosts() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="💰" title="Camp costs" />
        <SectionIntro>
          The camp fee is usually the smallest part of what you spend. Budget like
          a family that has done this before.
        </SectionIntro>
      </SectionWrap>

      <CleanTable
        rows={[
          ["One-day prospect camp", "$40 – $150"],
          ["Multi-day commuter", "$150 – $250"],
          ["Overnight camp", "$250 – $400+"],
          ["Specialist camp", "$50 – $300+"],
        ]}
      />

      <p
        style={{
          color: BRAND.articleSoft,
          fontSize: 13,
          margin: "0 0 18px",
        }}
      >
        Many camps raise prices close to the date. Early registration often saves
        $25 to $50.
      </p>

      <GridCards columns={3}>
        <SmallCard title="Local day camp" titleColor="#15803d">
          <p style={{ margin: "0 0 4px", color: BRAND.articleMuted }}>
            Camp fee + gas + food
          </p>
          <p style={{ margin: 0, fontWeight: 800, color: BRAND.articleText }}>
            $75–$200 all-in
          </p>
        </SmallCard>
        <SmallCard title="Regional, one night" titleColor="#1d4ed8">
          <p style={{ margin: "0 0 4px", color: BRAND.articleMuted }}>
            Camp fee + hotel + meals + mileage
          </p>
          <p style={{ margin: 0, fontWeight: 800, color: BRAND.articleText }}>
            $250–$600 all-in
          </p>
        </SmallCard>
        <SmallCard title="Flight camp, 2–3 days" titleColor="#8a6a12">
          <p style={{ margin: "0 0 4px", color: BRAND.articleMuted }}>
            Camp fee + flight + hotel + ground + meals
          </p>
          <p style={{ margin: 0, fontWeight: 800, color: BRAND.articleText }}>
            $700–$1,500+ all-in
          </p>
        </SmallCard>
      </GridCards>

      <TipBox>
        Cluster camps geographically. One trip to a region with 2 to 3 camps often
        costs about the same as one trip and gives much more exposure. Build in a
        recovery day between camps when possible.
      </TipBox>
    </>
  );
}

function TopicStrategy() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="🎯" title="Building your camp strategy" />
        <SectionIntro>
          Not all camps are equal. Pick the right ones and stop spending on the
          wrong ones.
        </SectionIntro>
      </SectionWrap>

      <div
        style={{
          color: BRAND.articleText,
          fontWeight: 800,
          fontSize: 17,
          marginBottom: 14,
        }}
      >
        The 60 / 20 / 20 framework
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <StrategyBar
          pct="60%"
          label="Target schools"
          fill={BRAND.gold}
          desc="Programs that fit your level and where you have genuine interest. These are your priority camps."
        />
        <StrategyBar
          pct="20%"
          label="Reach schools"
          fill={BRAND.blue}
          desc="Programs above your current level. Worth attending when you have a realistic shot and a clear follow-up plan."
        />
        <StrategyBar
          pct="20%"
          label="Development camps"
          fill={BRAND.success}
          desc="Camps focused on skill-building more than evaluation. These make you a better player and prospect."
        />
      </div>

      <WarningBox>
        Only make a long-distance trip for a true target school and when you have
        a specific follow-up plan after the camp. One targeted trip beats three
        random ones.
      </WarningBox>
    </>
  );
}

function TopicFilm() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="🎬" title="Film that coaches actually watch" />
        <SectionIntro>
          Your highlight reel opens doors. Your full game film closes them. Here is
          what coaches actually want.
        </SectionIntro>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="Highlight reel rules">
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              color: BRAND.articleMuted,
              fontSize: 15,
              lineHeight: 1.9,
            }}
          >
            <li>Total length: 3 to 5 minutes</li>
            <li>Best plays in the first 30 to 60 seconds</li>
            <li>Aim for 20 to 30 top plays</li>
            <li>
              Start with a title card: name, grad year, position, height and
              weight, school, contact
            </li>
            <li>Identify yourself in every clip with an arrow or spotlight</li>
            <li>No heavy music, no transitions, no gimmicks</li>
          </ol>
        </StageCard>
      </SectionWrap>

      <div style={articleH2Style}>What coaches want by position</div>

      <GridCards columns={2}>
        <SmallCard title="QB" titleColor="#8a6a12">
          Footwork, release consistency, accuracy under pressure, and decision-making on time
        </SmallCard>
        <SmallCard title="WR / DB" titleColor="#1d4ed8">
          Burst off the line, separation, hands, ball tracking, and tackling for DBs
        </SmallCard>
        <SmallCard title="OL / DL" titleColor="#15803d">
          First-step quickness, hand placement, leverage, finish blocks, and motor
        </SmallCard>
        <SmallCard title="RB / LB" titleColor="#7c3aed">
          Vision, acceleration, contact balance, and pursuit angles
        </SmallCard>
      </GridCards>

      <TipBox>
        Keep clips to 10 to 25 seconds. Start 1 to 2 seconds before the snap and
        end right after the outcome. Add context like opponent quality, down, and
        distance.
      </TipBox>
      <WarningBox>
        Beyond the highlight reel, have 1 to 2 full games against quality
        opponents ready to share. Coaches will ask.
      </WarningBox>
    </>
  );
}

function TopicSocial() {
  return (
    <>
      <SectionWrap>
        <SectionTitle icon="📱" title="Social media strategy on X" />
        <SectionIntro>
          X is where many coaches discover prospects and track interest. Use it in
          a way that helps recruiting instead of hurting it.
        </SectionIntro>
      </SectionWrap>

      <SectionWrap>
        <StageCard badge="Profile setup checklist">
          <BodyText
            style={{ color: BRAND.articleSoft, fontSize: 13, marginBottom: 8 }}
          >
            This takes about 20 minutes and only needs to be done once.
          </BodyText>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              color: BRAND.articleMuted,
              fontSize: 14,
              lineHeight: 2,
            }}
          >
            <li>☐ Name: First Last | Grad Year | Position</li>
            <li>☐ Bio: Height/Weight | School | City, State | GPA | key measurable</li>
            <li>☐ Link: one hub such as Hudl or Linktree</li>
            <li>☐ Pinned post: best highlight plus contact info</li>
          </ul>
        </StageCard>
      </SectionWrap>

      <GridCards columns={2}>
        <SmallCard title="In-season posting" titleColor="#15803d">
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8, color: BRAND.articleMuted }}>
            <li>1 highlight clip, 10 to 25 seconds, labeled</li>
            <li>1 recruiting update with stats or schedule</li>
            <li>1 camp recap or thank-you if attended</li>
          </ul>
        </SmallCard>
        <SmallCard title="Pre-summer posting" titleColor="#1d4ed8">
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8, color: BRAND.articleMuted }}>
            <li>1 post per camp attending with schools and dates</li>
            <li>1 post after camp with clips, thanks, and learnings</li>
          </ul>
        </SmallCard>
      </GridCards>

      <div style={articleH2Style}>DM templates</div>

      <DMTemplate
        title="Before a camp"
        lines={`Coach [Last Name] — I'm [Name], [Grad Year] [Position] from [School, State]. I'm attending your camp on [Date] and would love the chance to compete and be evaluated.\n\n[Ht/Wt] | [Measurable] | GPA [X]\nFilm: [link]\nThank you — [Name]`}
      />
      <DMTemplate
        title="After a camp"
        lines={`Coach [Last Name] — thank you for the camp today. I appreciated the coaching on [specific detail]. I'm very interested in [School].\n\nFilm: [link]\nWhat would you like to see next from me?`}
      />

      <ErrorBox>
        <strong>DM mistakes to avoid:</strong>
        <br />
        ✗ Copy and paste without the school name
        <br />
        ✗ Long paragraphs
        <br />
        ✗ Asking for an offer in a DM
        <br />
        ✗ Sending multiple DMs with no response
      </ErrorBox>
    </>
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
        "A clean view of what matters at each stage, so families focus on the right actions at the right time.",
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
        "A step-by-step approach for outreach before and after permissible contact dates.",
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
      summary: "A practical guide built to help families move with more clarity and less guesswork.",
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
    KB_TOPICS_FLAT.find((t) => t.id === initialTopic) ? initialTopic : KB_TOPICS_FLAT[0].id
  );

  const activeTopic = useMemo(
    () => KB_TOPICS_FLAT.find((t) => t.id === activeTopicId),
    [activeTopicId]
  );
  const activeIndex = KB_TOPICS_FLAT.indexOf(activeTopic);
  const prevTopic = activeIndex > 0 ? KB_TOPICS_FLAT[activeIndex - 1] : null;
  const nextTopic = activeIndex < KB_TOPICS_FLAT.length - 1 ? KB_TOPICS_FLAT[activeIndex + 1] : null;

  useEffect(() => {
    trackEventOnce("playbook_viewed", "evt_playbook_viewed_v1");
  }, []);

  useEffect(() => {
    trackEvent("playbook_topic_viewed", { topic: activeTopicId });
  }, [activeTopicId]);

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

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (isLoading) return null;
  if (!hasAccess || mode === "demo") {
    return <GuidePaywall isAuthenticated={isAuthenticated} />;
  }

  const TopicContent = TOPIC_COMPONENTS[activeTopicId] || (() => null);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BRAND.bg,
        backgroundImage: BRAND.bgGlow,
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
        {!isMobile && <KbSidebarDesktop activeId={activeTopicId} onSelect={selectTopic} />}

        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 30,
              background: BRAND.shellSurface,
              backdropFilter: "blur(18px)",
              borderBottom: `1px solid ${BRAND.shellBorder}`,
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
                  color: "#f8d576",
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
              <div style={{ borderTop: `1px solid ${BRAND.shellBorder}` }}>
                <KbTopicBarMobile activeId={activeTopicId} onSelect={selectTopic} />
              </div>
            )}
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: 1080,
              margin: "0 auto",
              padding: isMobile ? "20px 16px 36px" : "28px 24px 44px",
            }}
          >
            <div
              style={{
                maxWidth: 860,
                margin: "0 auto",
              }}
            >
              <TopicHero topic={activeTopic} />

              <article
                id="kb-main-content"
                style={{
                  ...baseCardStyle,
                  background: BRAND.articleBg,
                  border: `1px solid ${BRAND.articleBorder}`,
                  borderRadius: 24,
                  padding: isMobile ? "22px 16px 28px" : "34px 32px 34px",
                  boxShadow: "0 18px 50px rgba(2, 6, 23, 0.18)",
                }}
              >
                <TopicContent />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 14,
                    marginTop: 40,
                    paddingTop: 24,
                    borderTop: `1px solid ${BRAND.divider}`,
                    flexWrap: "wrap",
                  }}
                >
                  {prevTopic ? (
                    <button
                      onClick={() => selectTopic(prevTopic.id)}
                      style={{
                        flex: "1 1 260px",
                        minWidth: 220,
                        background: "#ffffff",
                        border: `1px solid ${BRAND.cardBorder}`,
                        borderRadius: 16,
                        padding: "16px 18px",
                        cursor: "pointer",
                        textAlign: "left",
                        color: BRAND.articleText,
                        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: BRAND.articleSoft,
                          marginBottom: 6,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
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
                    <div style={{ flex: "1 1 260px" }} />
                  )}

                  {nextTopic ? (
                    <button
                      onClick={() => selectTopic(nextTopic.id)}
                      style={{
                        flex: "1 1 260px",
                        minWidth: 220,
                        background: "#ffffff",
                        border: `1px solid ${BRAND.cardBorder}`,
                        borderRadius: 16,
                        padding: "16px 18px",
                        cursor: "pointer",
                        textAlign: "right",
                        color: BRAND.articleText,
                        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: BRAND.articleSoft,
                          marginBottom: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 4,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
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
                    <div style={{ flex: "1 1 260px" }} />
                  )}
                </div>
              </article>

              <div style={{ height: 32 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}