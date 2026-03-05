// src/pages/Subscribe.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, Lock, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10);
    const eventName =
      payload?.event_name || payload?.event_type || payload?.title || payload?.name || "event";
    const sourcePlatform = payload?.source_platform || payload?.source || "web";
    const title = payload?.title || String(eventName);
    const sourceKey =
      payload?.source_key || payload?.sourceKey || `${String(sourcePlatform)}:${String(eventName)}`;
    const startDate = payload?.start_date || day;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: String(startDate),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {}
}

function safeDecode(x) {
  try {
    return decodeURIComponent(String(x || ""));
  } catch {
    return String(x || "");
  }
}

function safeNext(n) {
  const s = safeDecode(n || "");
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return null;
  if (!s.startsWith("/")) return null;
  return s;
}

export default function Subscribe() {
  const navigate = useNavigate();
  const location = useLocation();

  const { isLoading, mode, hasAccess, seasonYear, currentYear, demoYear, accountId, soldSeason: hookSoldSeason, activeSeason: hookActiveSeason } =
    useSeasonAccess();

  const [seasonConfig, setSeasonConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("getActiveSeason", {});
        if (!cancelled && res.data?.ok && res.data?.season) {
          setSeasonConfig(res.data.season);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const soldSeason = seasonConfig?.season_year || hookSoldSeason || currentYear;
  const activeSeason = hookActiveSeason || currentYear;
  const earlyBird = soldSeason > activeSeason;
  const pricePrimary = seasonConfig?.price_primary || 49;
  const priceAddOn = seasonConfig?.price_add_on || 39;

  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const force = params.get("force") === "1";
  const source = params.get("source") || "subscribe_page";

  const rawNext = params.get("next");
  const next = useMemo(() => {
    const candidate = safeNext(rawNext);
    if (!candidate) return null;

    try {
      const u = new URL(candidate, window.location.origin);
      u.searchParams.delete("mode");
      u.searchParams.delete("src");
      u.searchParams.delete("source");
      return `${u.pathname}${u.search ? u.search : ""}`;
    } catch {
      return candidate;
    }
  }, [rawNext]);

  const soldYear = soldSeason;

  // ✅ REQUIRED GUARD: entitled users never see Subscribe
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid" && hasAccess) {
      navigate(next || createPageUrl("Discover"), { replace: true });
    }
  }, [isLoading, mode, hasAccess, next, navigate]);

  // ✅ Subscribe viewed (dedupe)
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid" && hasAccess) return;

    const key = `evt_subscribe_viewed_${soldYear || "na"}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "subscribe_viewed",
      mode: mode || "demo",
      season_year: soldYear || null,
      source,
      account_id: accountId || null,
      force: force ? 1 : 0,
      next: next || null,
      has_access: !!hasAccess,
      demo_year: demoYear || null
    });
  }, [isLoading, mode, hasAccess, soldYear, source, accountId, force, next, demoYear]);

  const [openFaq, setOpenFaq] = useState(null);

  if (isLoading) return null;
  if (mode === "paid" && hasAccess) return null;

  const handleCheckout = () => {
    trackEvent({
      event_name: "checkout_cta_clicked",
      mode: mode || "demo",
      season_year: soldYear || null,
      source,
      account_id: accountId || null,
      force: force ? 1 : 0,
      next: next || null,
      has_access: !!hasAccess,
    });

    const targetNext = next || createPageUrl("Profile");
    const checkoutUrl =
      createPageUrl("Checkout") +
      `?season=${encodeURIComponent(soldYear || "")}` +
      `&source=${encodeURIComponent(source)}` +
      `&next=${encodeURIComponent(targetNext)}`;

    navigate(checkoutUrl);
  };

  const handleKeepDemo = () => {
    trackEvent({
      event_name: "subscribe_keep_demo_clicked",
      mode: mode || "demo",
      season_year: soldYear || null,
      source,
      account_id: accountId || null,
      force: force ? 1 : 0,
      next: next || null,
      has_access: !!hasAccess,
    });

    if (next) navigate(next);
    else navigate(createPageUrl("Discover"));
  };

  const faqs = [
    { q: "Can I add multiple kids?", a: `Yes — your first athlete is $${pricePrimary}, then add more for $${priceAddOn} each. All managed under one account.` },
    { q: "Do I need to create a profile first?", a: "No — you create athlete profiles after purchase. Buy first, set up later." },
    { q: "What does 'Demo' mean?", a: "Demo shows last season's data so you can explore the platform. Subscribe to unlock current camps." },
  ];

  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>



      {/* ── HERO ── */}
      <section style={{ textAlign: "center", padding: "64px 24px 40px", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 3, color: "#e8a020", textTransform: "uppercase", marginBottom: 16 }}>
          SEASON PASS {soldSeason}
        </div>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 6vw, 64px)", lineHeight: 0.95, margin: 0, color: "#f9fafb", letterSpacing: 1 }}>
          UNLOCK EVERY CAMP.<br />ONE SEASON. ONE PRICE.
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 18, marginTop: 20, lineHeight: 1.6 }}>
          {earlyBird
            ? `Full access to the ${soldSeason} camp season (March — August ${soldSeason}) + Immediate access to current ${activeSeason} camp data`
            : `Full access to ${soldSeason} camp season (March — August ${soldSeason})`}
        </p>
      </section>

      {/* ── EARLY BIRD BONUS (Sep-Dec only) ── */}
      {earlyBird && (
        <section style={{ padding: "0 24px 32px", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ background: "rgba(232,160,32,0.12)", border: "1px solid rgba(232,160,32,0.4)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e8a020", marginBottom: 6 }}>🎁 Early Bird Bonus</div>
            <div style={{ fontSize: 15, color: "#f9fafb", lineHeight: 1.6 }}>
              Buy now and get immediate access to {activeSeason} camp data while you wait for {soldSeason} season to open in March.
            </div>
          </div>
        </section>
      )}

      {/* ── PRICING CARD ── */}
      <section style={{ padding: "0 24px 48px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: "#111827", borderRadius: 16, overflow: "hidden", border: "1px solid #1f2937" }}>
          {/* Amber top accent */}
          <div style={{ height: 4, background: "#e8a020" }} />

          <div style={{ padding: "32px 28px" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#e8a020", letterSpacing: 2, textTransform: "uppercase" }}>Season Pass {soldSeason}</div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 80, color: "#f9fafb", lineHeight: 1 }}>${pricePrimary}</span>
              <span style={{ color: "#9ca3af", fontSize: 16 }}>per season</span>
            </div>
            <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 6 }}>
              + ${priceAddOn}/season for each additional athlete
            </div>

            <div style={{ height: 1, background: "rgba(232,160,32,0.3)", margin: "28px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                `Full access to 759 football camps`,
                "Current season dates & details",
                "Unlimited favorites & registration tracking",
                "Calendar view with conflict detection",
                "Multiple athletes under one account",
                "Weekly camp updates",
              ].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 16, color: "#f9fafb" }}>
                  <span style={{ color: "#e8a020", fontSize: 18, lineHeight: "22px", flexShrink: 0 }}>✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <button onClick={handleCheckout} style={{ width: "100%", background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 10, padding: "18px 0", fontSize: 19, fontWeight: 700, cursor: "pointer", marginTop: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Get Season Pass — ${pricePrimary} <ArrowRight style={{ width: 18, height: 18 }} />
            </button>

            <div style={{ textAlign: "center", marginTop: 12 }}>
              <span style={{ fontSize: 14, color: "#6b7280" }}>🔒 Secure checkout</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEMO OPTION ── */}
      <section style={{ textAlign: "center", padding: "0 24px 48px", maxWidth: 480, margin: "0 auto" }}>
        <p style={{ color: "#6b7280", fontSize: 16 }}>Not ready to commit?</p>
        <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 4 }}>
          Try a free demo with {demoYear || "last"} season data
        </p>
        <button onClick={handleKeepDemo} style={{ background: "transparent", border: "1px solid #1f2937", borderRadius: 8, padding: "12px 24px", fontSize: 16, fontWeight: 600, color: "#f9fafb", cursor: "pointer", marginTop: 12 }}>
          Access Free Demo →
        </button>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: "0 24px 48px", maxWidth: 480, margin: "0 auto" }}>
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f9fafb", letterSpacing: 1, marginBottom: 16 }}>FAQ</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ background: "#111827", borderRadius: 10, overflow: "hidden", border: "1px solid #1f2937" }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", background: "none", border: "none", color: "#f9fafb", padding: "16px 20px", fontSize: 16, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}>
                {f.q}
                {openFaq === i ? <ChevronUp style={{ width: 16, height: 16, color: "#9ca3af" }} /> : <ChevronDown style={{ width: 16, height: 16, color: "#9ca3af" }} />}
              </button>
              {openFaq === i && (
                <div style={{ padding: "0 20px 16px", fontSize: 16, color: "#9ca3af", lineHeight: 1.6 }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <footer style={{ borderTop: "1px solid #1f2937", padding: "28px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#6b7280" }}>
          759 camps · 260 programs · Updated weekly · Independent tool · Not affiliated with camps
        </p>
      </footer>
    </div>
  );
}