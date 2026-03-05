import React from "react";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";
import GuideShell from "../components/guides/GuideShell.jsx";
import {
  SectionAnchor, SectionTitle, SectionIntro, StageCard,
  InfoBox, TipBox, WarningBox, ErrorBox, BodyText,
  GridCards, SmallCard, DMTemplate
} from "../components/guides/GuideCards.jsx";

const SECTIONS = [
  { id: "costs", icon: "💰", label: "Costs" },
  { id: "strategy", icon: "🎯", label: "Strategy" },
  { id: "film", icon: "🎬", label: "Film" },
  { id: "social", icon: "📱", label: "Social Media" },
];

export default function CampPlaybook() {
  const { isLoading, hasAccess, mode, isAuthenticated } = useSeasonAccess();

  if (isLoading) return null;
  if (!hasAccess || mode === "demo") return <GuidePaywall isAuthenticated={isAuthenticated} />;

  return (
    <GuideShell
      title="CAMP PLAYBOOK"
      subtitle="How to plan, budget, and get the most out of every camp you attend"
      sections={SECTIONS}
    >
      {/* ═══ SECTION 1 — COSTS ═══ */}
      <SectionAnchor id="costs" />
      <SectionTitle icon="💰" title="WHAT CAMPS ACTUALLY COST" />
      <SectionIntro>
        The camp fee is usually the smallest part of what you'll spend. Here's how to budget like a family that's done this before.
      </SectionIntro>

      {/* Fee range table */}
      <div style={{ background: "#1f2937", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ background: "#e8a020", padding: "10px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#0a0e1a", fontWeight: 700, fontSize: 14 }}>Camp Type</span>
            <span style={{ color: "#0a0e1a", fontWeight: 700, fontSize: 14 }}>Typical Fee</span>
          </div>
        </div>
        {[
          ["One-day prospect camp", "$40 – $150"],
          ["Multi-day commuter", "$150 – $250"],
          ["Overnight camp", "$250 – $400+"],
          ["Specialist camp", "$50 – $300+"],
        ].map(([type, fee], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #374151" }}>
            <span style={{ color: "#d1d5db", fontSize: 14 }}>{type}</span>
            <span style={{ color: "#f9fafb", fontSize: 14, fontWeight: 600 }}>{fee}</span>
          </div>
        ))}
        <p style={{ color: "#9ca3af", fontSize: 13, padding: "10px 20px", margin: 0 }}>
          Many camps raise prices close to the date. Early registration typically saves $25–$50.
        </p>
      </div>

      <GridCards columns={3}>
        <SmallCard title="🚗 Local Day Camp" titleColor="#22c55e">
          <p style={{ margin: "0 0 4px" }}>Camp fee + gas + food</p>
          <p style={{ margin: 0, fontWeight: 700, color: "#f9fafb" }}>$75–$200 all-in</p>
        </SmallCard>
        <SmallCard title="🏨 Regional (1 night)" titleColor="#3b82f6">
          <p style={{ margin: "0 0 4px" }}>Camp fee + hotel + meals + mileage</p>
          <p style={{ margin: 0, fontWeight: 700, color: "#f9fafb" }}>$250–$600 all-in</p>
        </SmallCard>
        <SmallCard title="✈️ Flight Camp (2–3 days)" titleColor="#e8a020">
          <p style={{ margin: "0 0 4px" }}>Camp fee + flight + hotel + ground + meals</p>
          <p style={{ margin: 0, fontWeight: 700, color: "#f9fafb" }}>$700–$1,500+ all-in</p>
        </SmallCard>
      </GridCards>

      <TipBox>
        Cluster camps geographically. One trip to a region with 2–3 camps costs the same as one trip — and gives 3x the exposure. Always build in a recovery day between camps.
      </TipBox>

      <div style={{ height: 48 }} />

      {/* ═══ SECTION 2 — STRATEGY ═══ */}
      <SectionAnchor id="strategy" />
      <SectionTitle icon="🎯" title="BUILDING YOUR CAMP STRATEGY" />
      <SectionIntro>
        Not all camps are equal. Here's how to pick the right ones and stop wasting money on the wrong ones.
      </SectionIntro>

      <BodyText style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb", marginBottom: 12 }}>
        The 60 / 20 / 20 Framework
      </BodyText>

      {[
        { pct: "60%", label: "Target Schools", color: "#e8a020", desc: "Programs that fit your level and where you have genuine interest. These are your priority camps." },
        { pct: "20%", label: "Reach Schools", color: "#3b82f6", desc: "Programs above your current level. Worth attending if you have a realistic shot and a follow-up plan." },
        { pct: "20%", label: "Development Camps", color: "#22c55e", desc: "Camps focused on skill-building, not evaluation. These make you a better player and prospect." },
      ].map(({ pct, label, color, desc }) => (
        <div key={label} style={{ display: "flex", gap: 14, marginBottom: 12, alignItems: "flex-start" }}>
          <span style={{
            flexShrink: 0, width: 56, textAlign: "center",
            background: color, color: "#0a0e1a",
            fontWeight: 800, fontSize: 16,
            borderRadius: 8, padding: "6px 0"
          }}>
            {pct}
          </span>
          <div>
            <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: 15 }}>{label}</span>
            <p style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6, margin: "4px 0 0" }}>{desc}</p>
          </div>
        </div>
      ))}

      <WarningBox>
        Only make a long-distance trip for a true target school AND when you have a specific follow-up plan after the camp. One targeted trip beats three random ones.
      </WarningBox>

      <div style={{ height: 48 }} />

      {/* ═══ SECTION 3 — FILM ═══ */}
      <SectionAnchor id="film" />
      <SectionTitle icon="🎬" title="FILM THAT COACHES ACTUALLY WATCH" />
      <SectionIntro>
        Your highlight reel opens doors. Your full game film closes them. Here's what coaches actually want.
      </SectionIntro>

      <StageCard badge="Highlight Reel Rules">
        <ol style={{ margin: 0, paddingLeft: 20, color: "#d1d5db", fontSize: 15, lineHeight: 1.9 }}>
          <li>Total length: 3–5 minutes</li>
          <li>Best plays in the first 30–60 seconds</li>
          <li>Aim for 20–30 top plays</li>
          <li>Start with a title card: Name, grad year, position, height/weight, school, contact</li>
          <li>Identify yourself in every clip (arrow or spotlight)</li>
          <li>No heavy music, no transitions, no gimmicks</li>
        </ol>
      </StageCard>

      <BodyText style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb", marginTop: 24, marginBottom: 12 }}>
        What Coaches Want by Position
      </BodyText>

      <GridCards columns={2}>
        <SmallCard title="QB" titleColor="#e8a020">
          Footwork, release consistency, accuracy under pressure, decision-making on time
        </SmallCard>
        <SmallCard title="WR / DB" titleColor="#3b82f6">
          Burst off the line, separation, hands, ball tracking, tackling (DB)
        </SmallCard>
        <SmallCard title="OL / DL" titleColor="#22c55e">
          First step quickness, hand placement, leverage, finish blocks, motor
        </SmallCard>
        <SmallCard title="RB / LB" titleColor="#a855f7">
          Vision, acceleration, contact balance, pursuit angles
        </SmallCard>
      </GridCards>

      <TipBox>
        10–25 seconds per clip. Start 1–2 seconds before the snap. End right after the outcome. Add context: opponent quality, down and distance.
      </TipBox>

      <WarningBox>
        Beyond your highlight reel, have 1–2 full games vs quality opponents ready to share. Coaches will ask.
      </WarningBox>

      <div style={{ height: 48 }} />

      {/* ═══ SECTION 4 — SOCIAL MEDIA ═══ */}
      <SectionAnchor id="social" />
      <SectionTitle icon="📱" title="SOCIAL MEDIA STRATEGY (X)" />
      <SectionIntro>
        X (Twitter) is where coaches discover prospects and track interest. Here's how to use it without making the mistakes that hurt your recruiting.
      </SectionIntro>

      <StageCard badge="Profile Setup Checklist">
        <BodyText style={{ color: "#9ca3af", fontSize: 13, marginBottom: 8 }}>Do this once — takes 20 minutes:</BodyText>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#d1d5db", fontSize: 14, lineHeight: 2 }}>
          <li>☐ Name: First Last | Grad Year | Position</li>
          <li>☐ Bio: Height/Weight | School | City, State | GPA | Key measurable</li>
          <li>☐ Link: One hub (Hudl or Linktree)</li>
          <li>☐ Pinned post: Best highlight + contact info</li>
        </ul>
      </StageCard>

      <GridCards columns={2}>
        <SmallCard title="In-Season Posting" titleColor="#22c55e">
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>1 highlight clip (10–25 sec, labeled)</li>
            <li>1 recruiting update (stats, schedule)</li>
            <li>1 camp recap / thank-you (if attended)</li>
          </ul>
        </SmallCard>
        <SmallCard title="Pre-Summer Posting" titleColor="#3b82f6">
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>1 post per camp attending (schools + dates)</li>
            <li>1 post after camp (clips + thanks + learnings)</li>
          </ul>
        </SmallCard>
      </GridCards>

      <BodyText style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb", marginTop: 24, marginBottom: 12 }}>
        DM Templates — Copy & Paste Ready
      </BodyText>

      <DMTemplate
        title="BEFORE A CAMP:"
        lines={`Coach [Last Name] — I'm [Name], [Grad Year] [Position] from [School, State]. I'm attending your camp on [Date] and would love the chance to compete and be evaluated.

[Ht/Wt] | [Measurable] | GPA [X]
Film: [link]
Thank you — [Name]`}
      />

      <DMTemplate
        title="AFTER A CAMP:"
        lines={`Coach [Last Name] — thank you for the camp today. I appreciated the coaching on [specific detail]. I'm very interested in [School].

Film: [link]
What would you like to see next from me?`}
      />

      <ErrorBox>
        <strong>DM Mistakes to Avoid:</strong><br />
        ✗ Copy/paste without the school name<br />
        ✗ Long paragraphs<br />
        ✗ Asking for an offer in a DM<br />
        ✗ Sending multiple DMs with no response
      </ErrorBox>
    </GuideShell>
  );
}