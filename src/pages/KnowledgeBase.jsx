// src/pages/KnowledgeBase.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";
import {
  KbSidebarDesktop, KbTopicBarMobile, KB_TOPICS_FLAT,
} from "../components/guides/KbSidebar.jsx";
import {
  SectionAnchor, SectionTitle, SectionIntro, StageCard,
  InfoBox, TipBox, WarningBox, ErrorBox, BodyText,
  ContactCard, GridCards, SmallCard, DMTemplate,
} from "../components/guides/GuideCards.jsx";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

// ─────────────────────────────────────────────
// Topic content definitions
// ─────────────────────────────────────────────
function TopicTimeline() {
  return (
    <>
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
    </>
  );
}

function TopicCommunication() {
  return (
    <>
      <SectionTitle icon="💬" title="HOW TO CONTACT COACHES" />
      <SectionIntro>
        The most important rule: YOU can reach out anytime. Coaches have restrictions. Here's how to navigate both sides.
      </SectionIntro>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <ContactCard
          header="Athlete → Coach"
          headerColor="#22c55e"
          intro="Allowed anytime via email, DM, phone, or letter."
          bullets={["Keep it short and specific", "Always include one link (film + profile)", "You're not breaking rules by reaching out first"]}
        />
        <ContactCard
          header="Parent → Coach"
          headerColor="#3b82f6"
          intro="Allowed anytime — but stay in your lane."
          bullets={["Focus on logistics: camp attendance, travel, academics", "Let the athlete lead the relationship", "Never push for offers or negotiate on their behalf"]}
        />
        <ContactCard
          header="Coach → Athlete"
          headerColor="#e8a020"
          intro="Coaches have real restrictions on when they can proactively reach out."
          bullets={["They can ANSWER if you call — anytime", "They cannot proactively call or text until permissible dates", "Don't confuse 'they can answer' with 'they can initiate'"]}
        />
      </div>
    </>
  );
}

function TopicOffers() {
  return (
    <>
      <SectionTitle icon="🤝" title="UNDERSTANDING OFFERS" />
      <SectionIntro>
        The word "offer" gets used loosely in recruiting. Here's what it actually means — and what it doesn't.
      </SectionIntro>
      <GridCards columns={2}>
        <div style={{ background: "#1f2937", borderRadius: 12, padding: "20px 24px" }}>
          <span style={{ display: "inline-block", background: "#e8a020", color: "#0a0e1a", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6, marginBottom: 12 }}>Verbal Offer</span>
          <BodyText>A coach tells you there may be a spot for your athlete.</BodyText>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            <div style={{ color: "#86efac" }}>✓ It means: genuine interest</div>
            <div style={{ color: "#fca5a5" }}>✗ It doesn't mean: binding commitment</div>
            <div style={{ color: "#fca5a5" }}>✗ It doesn't mean: scholarship money</div>
          </div>
          <BodyText style={{ marginTop: 10 }}>Either side can walk away from a verbal offer at any time.</BodyText>
        </div>
        <div style={{ background: "#1f2937", borderRadius: 12, padding: "20px 24px" }}>
          <span style={{ display: "inline-block", background: "#22c55e", color: "#0a0e1a", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6, marginBottom: 12 }}>Written Offer of Aid</span>
          <BodyText>The real thing — a formal offer of athletic scholarship aid.</BodyText>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            <div style={{ color: "#86efac" }}>✓ Has a defined timeline</div>
            <div style={{ color: "#86efac" }}>✓ Is the actual scholarship paperwork</div>
          </div>
          <BodyText style={{ marginTop: 10 }}><strong>NCAA Rule:</strong> Cannot be provided before August 1 of a prospect's senior year.</BodyText>
        </div>
      </GridCards>
      <WarningBox>Many offers come with conditions: academics, position board movement, senior film, or how the roster fills. Always ask: "What are the conditions on this offer?"</WarningBox>
      <WarningBox>If a program pressures you to commit by Sunday, ask two questions: "What changes if we wait 7 days?" and "What would you need to see to feel certain?" A real offer survives a week.</WarningBox>
      <WarningBox>A new coaching staff can reset everything — even if your athlete did everything right. Keep 3–5 realistic schools warm until National Signing Day.</WarningBox>
      <TipBox>When any offer is made, ask one clean question: "Is this an offer for athletic aid, a roster spot, or both?" It clarifies everything instantly.</TipBox>
    </>
  );
}

function TopicPlaybook() {
  return (
    <>
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
        <TipBox>After every camp: follow up within 72 hours. Thank the coach, mention one specific thing from the day, and include your film link again.</TipBox>
      </StageCard>
    </>
  );
}

function TopicCosts() {
  return (
    <>
      <SectionTitle icon="💰" title="WHAT CAMPS ACTUALLY COST" />
      <SectionIntro>
        The camp fee is usually the smallest part of what you'll spend. Here's how to budget like a family that's done this before.
      </SectionIntro>
      <div style={{ background: "#1f2937", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ background: "#e8a020", padding: "10px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#0a0e1a", fontWeight: 700, fontSize: 14 }}>Camp Type</span>
            <span style={{ color: "#0a0e1a", fontWeight: 700, fontSize: 14 }}>Typical Fee</span>
          </div>
        </div>
        {[["One-day prospect camp", "$40 – $150"], ["Multi-day commuter", "$150 – $250"], ["Overnight camp", "$250 – $400+"], ["Specialist camp", "$50 – $300+"]].map(([type, fee], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #374151" }}>
            <span style={{ color: "#d1d5db", fontSize: 14 }}>{type}</span>
            <span style={{ color: "#f9fafb", fontSize: 14, fontWeight: 600 }}>{fee}</span>
          </div>
        ))}
        <p style={{ color: "#9ca3af", fontSize: 13, padding: "10px 20px", margin: 0 }}>Many camps raise prices close to the date. Early registration typically saves $25–$50.</p>
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
      <TipBox>Cluster camps geographically. One trip to a region with 2–3 camps costs the same as one trip — and gives 3x the exposure. Always build in a recovery day between camps.</TipBox>
    </>
  );
}

function TopicStrategy() {
  return (
    <>
      <SectionTitle icon="🎯" title="BUILDING YOUR CAMP STRATEGY" />
      <SectionIntro>Not all camps are equal. Here's how to pick the right ones and stop wasting money on the wrong ones.</SectionIntro>
      <BodyText style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb", marginBottom: 12 }}>The 60 / 20 / 20 Framework</BodyText>
      {[
        { pct: "60%", label: "Target Schools", color: "#e8a020", desc: "Programs that fit your level and where you have genuine interest. These are your priority camps." },
        { pct: "20%", label: "Reach Schools", color: "#3b82f6", desc: "Programs above your current level. Worth attending if you have a realistic shot and a follow-up plan." },
        { pct: "20%", label: "Development Camps", color: "#22c55e", desc: "Camps focused on skill-building, not evaluation. These make you a better player and prospect." },
      ].map(({ pct, label, color, desc }) => (
        <div key={label} style={{ display: "flex", gap: 14, marginBottom: 12, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0, width: 56, textAlign: "center", background: color, color: "#0a0e1a", fontWeight: 800, fontSize: 16, borderRadius: 8, padding: "6px 0" }}>{pct}</span>
          <div>
            <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: 15 }}>{label}</span>
            <p style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6, margin: "4px 0 0" }}>{desc}</p>
          </div>
        </div>
      ))}
      <WarningBox>Only make a long-distance trip for a true target school AND when you have a specific follow-up plan after the camp. One targeted trip beats three random ones.</WarningBox>
    </>
  );
}

function TopicFilm() {
  return (
    <>
      <SectionTitle icon="🎬" title="FILM THAT COACHES ACTUALLY WATCH" />
      <SectionIntro>Your highlight reel opens doors. Your full game film closes them. Here's what coaches actually want.</SectionIntro>
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
      <BodyText style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb", marginTop: 24, marginBottom: 12 }}>What Coaches Want by Position</BodyText>
      <GridCards columns={2}>
        <SmallCard title="QB" titleColor="#e8a020">Footwork, release consistency, accuracy under pressure, decision-making on time</SmallCard>
        <SmallCard title="WR / DB" titleColor="#3b82f6">Burst off the line, separation, hands, ball tracking, tackling (DB)</SmallCard>
        <SmallCard title="OL / DL" titleColor="#22c55e">First step quickness, hand placement, leverage, finish blocks, motor</SmallCard>
        <SmallCard title="RB / LB" titleColor="#a855f7">Vision, acceleration, contact balance, pursuit angles</SmallCard>
      </GridCards>
      <TipBox>10–25 seconds per clip. Start 1–2 seconds before the snap. End right after the outcome. Add context: opponent quality, down and distance.</TipBox>
      <WarningBox>Beyond your highlight reel, have 1–2 full games vs quality opponents ready to share. Coaches will ask.</WarningBox>
    </>
  );
}

function TopicSocial() {
  return (
    <>
      <SectionTitle icon="📱" title="SOCIAL MEDIA STRATEGY (X)" />
      <SectionIntro>X (Twitter) is where coaches discover prospects and track interest. Here's how to use it without making the mistakes that hurt your recruiting.</SectionIntro>
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
      <BodyText style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb", marginTop: 24, marginBottom: 12 }}>DM Templates — Copy & Paste Ready</BodyText>
      <DMTemplate
        title="BEFORE A CAMP:"
        lines={`Coach [Last Name] — I'm [Name], [Grad Year] [Position] from [School, State]. I'm attending your camp on [Date] and would love the chance to compete and be evaluated.\n\n[Ht/Wt] | [Measurable] | GPA [X]\nFilm: [link]\nThank you — [Name]`}
      />
      <DMTemplate
        title="AFTER A CAMP:"
        lines={`Coach [Last Name] — thank you for the camp today. I appreciated the coaching on [specific detail]. I'm very interested in [School].\n\nFilm: [link]\nWhat would you like to see next from me?`}
      />
      <ErrorBox>
        <strong>DM Mistakes to Avoid:</strong><br />
        ✗ Copy/paste without the school name<br />
        ✗ Long paragraphs<br />
        ✗ Asking for an offer in a DM<br />
        ✗ Sending multiple DMs with no response
      </ErrorBox>
    </>
  );
}

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

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function KnowledgeBase() {
  const { isLoading, hasAccess, mode, isAuthenticated } = useSeasonAccess();
  const nav = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  // Read ?topic= from URL, default to first topic
  const params = new URLSearchParams(location.search);
  const initialTopic = params.get("topic") || KB_TOPICS_FLAT[0].id;
  const [activeTopicId, setActiveTopicId] = useState(
    KB_TOPICS_FLAT.find((t) => t.id === initialTopic) ? initialTopic : KB_TOPICS_FLAT[0].id
  );

  const activeTopic = KB_TOPICS_FLAT.find((t) => t.id === activeTopicId);
  const activeIndex = KB_TOPICS_FLAT.indexOf(activeTopic);
  const prevTopic = activeIndex > 0 ? KB_TOPICS_FLAT[activeIndex - 1] : null;
  const nextTopic = activeIndex < KB_TOPICS_FLAT.length - 1 ? KB_TOPICS_FLAT[activeIndex + 1] : null;

  // Update URL when topic changes (no full navigation, just search param)
  function selectTopic(id) {
    setActiveTopicId(id);
    const newParams = new URLSearchParams(location.search);
    newParams.set("topic", id);
    window.history.replaceState(null, "", `${location.pathname}?${newParams.toString()}`);
    if (contentRef.current) contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (isLoading) return null;
  if (!hasAccess || mode === "demo") return <GuidePaywall isAuthenticated={isAuthenticated} />;

  const TopicContent = TOPIC_COMPONENTS[activeTopicId] || (() => null);

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* ── Desktop sidebar ── */}
        {!isMobile && (
          <KbSidebarDesktop activeId={activeTopicId} onSelect={selectTopic} />
        )}

        {/* ── Main content column ── */}
        <div ref={contentRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* Top bar */}
          <div style={{
            position: "sticky", top: 0, zIndex: 30,
            background: "rgba(10,14,26,0.95)", backdropFilter: "blur(12px)",
            borderBottom: "1px solid #1f2937",
          }}>
            {/* Back + breadcrumb row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px" }}>
              <button
                onClick={() => nav("/Workspace")}
                style={{ background: "none", border: "none", color: "#e8a020", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} /> HQ
              </button>
              <span style={{ color: "#374151", fontSize: 13 }}>/</span>
              <span style={{ color: "#6b7280", fontSize: 13 }}>{activeTopic?.categoryLabel}</span>
              <span style={{ color: "#374151", fontSize: 13 }}>/</span>
              <span style={{ color: "#9ca3af", fontSize: 13, fontWeight: 600 }}>{activeTopic?.label}</span>
            </div>

            {/* Mobile topic pills */}
            {isMobile && (
              <div style={{ borderTop: "1px solid #1f2937" }}>
                <KbTopicBarMobile activeId={activeTopicId} onSelect={selectTopic} />
              </div>
            )}
          </div>

          {/* Article content */}
          <div style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "36px 24px 20px" }}>
            <TopicContent />

            {/* Prev / Next navigation */}
            <div style={{
              display: "flex", justifyContent: "space-between", gap: 12,
              marginTop: 56, paddingTop: 24, borderTop: "1px solid #1f2937",
            }}>
              {prevTopic ? (
                <button
                  onClick={() => selectTopic(prevTopic.id)}
                  style={{
                    flex: 1, background: "#111827", border: "1px solid #1f2937", borderRadius: 10,
                    padding: "14px 18px", cursor: "pointer", textAlign: "left",
                    color: "#f9fafb", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8a020"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1f2937"}
                >
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <ArrowLeft style={{ width: 11, height: 11 }} /> Previous
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{prevTopic.icon} {prevTopic.label}</div>
                </button>
              ) : <div style={{ flex: 1 }} />}

              {nextTopic ? (
                <button
                  onClick={() => selectTopic(nextTopic.id)}
                  style={{
                    flex: 1, background: "#111827", border: "1px solid #1f2937", borderRadius: 10,
                    padding: "14px 18px", cursor: "pointer", textAlign: "right",
                    color: "#f9fafb", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "#e8a020"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1f2937"}
                >
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                    Next <ArrowRight style={{ width: 11, height: 11 }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{nextTopic.icon} {nextTopic.label}</div>
                </button>
              ) : <div style={{ flex: 1 }} />}
            </div>

            <div style={{ height: 60 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
