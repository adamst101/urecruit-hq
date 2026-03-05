import React from "react";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";
import GuideShell from "../components/guides/GuideShell.jsx";
import {
  SectionAnchor, SectionTitle, SectionIntro, StageCard,
  InfoBox, TipBox, WarningBox, BodyText, ContactCard, GridCards
} from "../components/guides/GuideCards.jsx";

const SECTIONS = [
  { id: "timeline", icon: "📅", label: "Timeline" },
  { id: "communication", icon: "💬", label: "Communication" },
  { id: "offers", icon: "🤝", label: "Offers" },
  { id: "playbook", icon: "📋", label: "Playbook" },
];

export default function RecruitingGuide() {
  const { isLoading, hasAccess, mode, isAuthenticated } = useSeasonAccess();

  if (isLoading) return null;
  if (!hasAccess || mode === "demo") return <GuidePaywall isAuthenticated={isAuthenticated} />;

  return (
    <GuideShell
      title="RECRUITING GUIDE"
      subtitle="Everything your family needs to navigate college football recruiting"
      sections={SECTIONS}
    >
      {/* ═══ SECTION 1 — TIMELINE ═══ */}
      <SectionAnchor id="timeline" />
      <SectionTitle icon="📅" title="THE RECRUITING TIMELINE" />
      <SectionIntro>
        Recruiting rules are strict about WHEN coaches can reach out — but there are no rules about when YOUR athlete can. Here's what to focus on at each stage.
      </SectionIntro>

      <StageCard badge="Grades 6–8">
        <BodyText>
          Focus on development and fundamentals. Camps at this age are for learning reps — not recruiting.
          If a coach shows early interest, treat it as a relationship signal, not a locked offer.
        </BodyText>
        <InfoBox>
          Early "offers" in middle school are not binding and are not written athletic aid.
          They are attention — valuable, but not security.
        </InfoBox>
      </StageCard>

      <StageCard badge="9th–10th Grade">
        <BodyText>
          Build your baseline: measurables, film, and academics. You can contact coaches anytime.
          Expect limited responses until permissible dates.
        </BodyText>
        <InfoBox>
          <strong>NCAA Rule:</strong> For Division I football, June 15 after sophomore year is the first
          permissible date for coaches to send texts, emails, and DMs.
        </InfoBox>
      </StageCard>

      <StageCard badge="11th Grade — This Is When Recruiting Gets Real">
        <BodyText>
          The most important year. Official visit windows open, direct communication increases,
          and your summer camp strategy should be targeted and intentional.
        </BodyText>
        <InfoBox>
          <strong>Key Dates:</strong><br />
          • Official Visits open: April 1, junior year<br />
          • Off-campus contact: January 1, junior year<br />
          • Unofficial visits: Anytime (you pay)
        </InfoBox>
        <TipBox>
          Camp strategy: 60% target schools you genuinely fit, 20% reach schools, 20% development camps.
        </TipBox>
      </StageCard>

      <StageCard badge="12th Grade — Execution">
        <BodyText>
          Stay eligible, healthy, and responsive. Written offers of athletic aid become possible.
          Your job is to finish strong and close.
        </BodyText>
        <InfoBox>
          <strong>NCAA Rule:</strong> Schools cannot provide a written offer of athletic aid before
          August 1 of a prospect's senior year. Most early "offers" are verbal only.
        </InfoBox>
      </StageCard>

      <div style={{ height: 48 }} />

      {/* ═══ SECTION 2 — COMMUNICATION ═══ */}
      <SectionAnchor id="communication" />
      <SectionTitle icon="💬" title="HOW TO CONTACT COACHES" />
      <SectionIntro>
        The most important rule: YOU can reach out anytime. Coaches have restrictions.
        Here's how to navigate both sides.
      </SectionIntro>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <ContactCard
          header="Athlete → Coach"
          headerColor="#22c55e"
          intro="Allowed anytime via email, DM, phone, or letter."
          bullets={[
            "Keep it short and specific",
            "Always include one link (film + profile)",
            "You're not breaking rules by reaching out first"
          ]}
        />
        <ContactCard
          header="Parent → Coach"
          headerColor="#3b82f6"
          intro="Allowed anytime — but stay in your lane."
          bullets={[
            "Focus on logistics: camp attendance, travel, academics",
            "Let the athlete lead the relationship",
            "Never push for offers or negotiate on their behalf"
          ]}
        />
        <ContactCard
          header="Coach → Athlete"
          headerColor="#e8a020"
          intro="Coaches have real restrictions on when they can proactively reach out."
          bullets={[
            "They can ANSWER if you call — anytime",
            "They cannot proactively call or text until permissible dates",
            "Don't confuse 'they can answer' with 'they can initiate'"
          ]}
        />
      </div>

      <div style={{ height: 48 }} />

      {/* ═══ SECTION 3 — OFFERS ═══ */}
      <SectionAnchor id="offers" />
      <SectionTitle icon="🤝" title="UNDERSTANDING OFFERS" />
      <SectionIntro>
        The word "offer" gets used loosely in recruiting. Here's what it actually means — and what it doesn't.
      </SectionIntro>

      <GridCards columns={2}>
        <div style={{ background: "#1f2937", borderRadius: 12, padding: "20px 24px" }}>
          <span style={{ display: "inline-block", background: "#e8a020", color: "#0a0e1a", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6, marginBottom: 12 }}>
            Verbal Offer
          </span>
          <BodyText>A coach tells you there may be a spot for your athlete.</BodyText>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            <div style={{ color: "#86efac" }}>✓ It means: genuine interest</div>
            <div style={{ color: "#fca5a5" }}>✗ It doesn't mean: binding commitment</div>
            <div style={{ color: "#fca5a5" }}>✗ It doesn't mean: scholarship money</div>
          </div>
          <BodyText style={{ marginTop: 10 }}>Either side can walk away from a verbal offer at any time.</BodyText>
        </div>

        <div style={{ background: "#1f2937", borderRadius: 12, padding: "20px 24px" }}>
          <span style={{ display: "inline-block", background: "#22c55e", color: "#0a0e1a", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6, marginBottom: 12 }}>
            Written Offer of Aid
          </span>
          <BodyText>The real thing — a formal offer of athletic scholarship aid.</BodyText>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            <div style={{ color: "#86efac" }}>✓ Has a defined timeline</div>
            <div style={{ color: "#86efac" }}>✓ Is the actual scholarship paperwork</div>
          </div>
          <BodyText style={{ marginTop: 10 }}>
            <strong>NCAA Rule:</strong> Cannot be provided before August 1 of a prospect's senior year.
          </BodyText>
        </div>
      </GridCards>

      <WarningBox>
        Many offers come with conditions: academics, position board movement, senior film, or how the roster fills.
        Always ask: "What are the conditions on this offer?"
      </WarningBox>

      <WarningBox>
        If a program pressures you to commit by Sunday, ask two questions:
        "What changes if we wait 7 days?" and "What would you need to see to feel certain?"
        A real offer survives a week.
      </WarningBox>

      <WarningBox>
        A new coaching staff can reset everything — even if your athlete did everything right.
        Keep 3–5 realistic schools warm until National Signing Day.
      </WarningBox>

      <TipBox>
        When any offer is made, ask one clean question:
        "Is this an offer for athletic aid, a roster spot, or both?"
        It clarifies everything instantly.
      </TipBox>

      <div style={{ height: 48 }} />

      {/* ═══ SECTION 4 — PLAYBOOK ═══ */}
      <SectionAnchor id="playbook" />
      <SectionTitle icon="📋" title="THE CONTACT PLAYBOOK" />
      <SectionIntro>
        Simple, safe, and effective. Follow this sequence and you'll stand out from 90% of families.
      </SectionIntro>

      <StageCard badge="Before Permissible Dates" badgeColor="#3b82f6">
        <BodyText style={{ color: "#9ca3af", fontSize: 13, marginBottom: 6 }}>(Before June 15, Sophomore Year)</BodyText>
        <BodyText>
          Send updates and show interest. Don't expect recruiting conversations back.
          Keep sending clean film, measurables, and camp plans.
          You are building awareness — not closing a deal.
        </BodyText>
      </StageCard>

      <StageCard badge="After Permissible Dates" badgeColor="#22c55e">
        <BodyText style={{ color: "#9ca3af", fontSize: 13, marginBottom: 6 }}>(After June 15, Sophomore Year)</BodyText>
        <ol style={{ margin: 0, paddingLeft: 20, color: "#d1d5db", fontSize: 15, lineHeight: 1.8 }}>
          <li>Send DM/email: interest + film link</li>
          <li>Confirm camp attendance or request next evaluation step</li>
          <li>Follow up within 24–72 hours after every camp</li>
          <li>End every follow-up with: "What would you like to see next from me?"</li>
        </ol>
        <TipBox>
          After every camp: follow up within 72 hours. Thank the coach, mention one specific thing from the day, and include your film link again.
        </TipBox>
      </StageCard>
    </GuideShell>
  );
}