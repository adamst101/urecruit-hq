import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

const stripeKeyPrefix = (Deno.env.get("STRIPE_SECRET_KEY") || "").slice(0, 7);
console.log("Stripe mode:", stripeKeyPrefix.startsWith("sk_live") ? "LIVE" : "TEST");

async function getActiveSeason(base44) {
  const seasons = await base44.asServiceRole.entities.SeasonConfig.filter({ active: true });
  const list = Array.isArray(seasons) ? seasons : [];
  const now = new Date();

  const currentSeason = list.find(s => {
    const opens = s.sale_opens_at ? new Date(s.sale_opens_at) : null;
    const closes = s.sale_closes_at ? new Date(s.sale_closes_at) : null;
    if (opens && now < opens) return false;
    if (closes && now > closes) return false;
    return true;
  });

  return currentSeason || list.find(s => s.is_current) || null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow both authenticated and anonymous checkout
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {}

  const {
    couponCode, athleteId, userEmail, successUrl, cancelUrl,
    isAddOn, addSecondAthlete,
    athleteOneName, athleteTwoName, athleteTwoGradYear
  } = await req.json();

  const email = userEmail || user?.email || ""; // optional — Stripe collects if blank
  const accountId = user?.id || "";

  // Get active season from DB
  const season = await getActiveSeason(base44);
  if (!season) {
    return Response.json({ ok: false, error: "No active season configured. Please contact support." });
  }

  const soldSeason = season.season_year;

  // Abuse prevention: max 5 athletes per account
  if (accountId && (isAddOn || addSecondAthlete)) {
    try {
      const existingAthletes = await base44.asServiceRole.entities.AthleteProfile.filter({
        account_id: accountId,
      });
      if (existingAthletes && existingAthletes.length >= 5) {
        return Response.json({ ok: false, error: "Maximum 5 athletes per account" });
      }
    } catch (e) {
      console.warn("Athlete count check failed:", e.message);
    }
  }

  // Additional athlete requires active primary entitlement
  if (isAddOn && accountId) {
    try {
      const primaryEnt = await base44.asServiceRole.entities.Entitlement.filter({
        account_id: accountId,
        is_primary: true,
        season_year: soldSeason,
        status: "active",
      });
      if (!primaryEnt || primaryEnt.length === 0) {
        return Response.json({ ok: false, error: "A Season Pass is required before adding athletes" });
      }
    } catch (e) {
      console.warn("Primary entitlement check failed:", e.message);
    }
  }

  // Pick the right price ID
  const priceId = isAddOn ? season.stripe_price_add_on : season.stripe_price_primary;
  if (!priceId) {
    return Response.json({ ok: false, error: "Price not configured for this season" });
  }

  // Validate promotion code if provided (case-insensitive)
  let discounts = [];
  if (couponCode && couponCode.trim()) {
    const codesToTry = [
      couponCode.trim(),
      couponCode.trim().toUpperCase(),
      couponCode.trim().toLowerCase(),
    ];
    console.log("Received couponCode:", couponCode, "Will try:", codesToTry);

    let foundPromo = null;
    for (const code of codesToTry) {
      try {
        const result = await stripe.promotionCodes.list({
          code: code,
          active: true,
          limit: 1,
        });
        console.log("Promo lookup for '" + code + "':", result.data.length, "results");
        if (result.data.length > 0) {
          foundPromo = result.data[0];
          break;
        }
      } catch (e) {
        console.error("Promo lookup failed for:", code, e.message);
      }
    }

    if (foundPromo) {
      discounts = [{ promotion_code: foundPromo.id }];
      console.log("Applying promotion_code:", foundPromo.id, "code:", foundPromo.code);
    } else {
      console.error("No promo found for any case variation of:", couponCode);
      return Response.json({ ok: false, error: "Invalid or expired promo code" });
    }
  }

  // Build line items
  const lineItems = [{ price: priceId, quantity: 1 }];

  // If adding a second athlete at the same time as the primary
  if (addSecondAthlete && !isAddOn && season.stripe_price_add_on) {
    lineItems.push({ price: season.stripe_price_add_on, quantity: 1 });
  }

  const sessionParams = {
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email || undefined, // Stripe collects email if not provided
    line_items: lineItems,
    metadata: {
      athlete_id: athleteId || "",
      account_id: accountId,
      coupon_code: couponCode || "",
      season_year: soldSeason.toString(),
      is_add_on: isAddOn ? "true" : "false",
      has_second_athlete: addSecondAthlete ? "true" : "false",
      athlete_1_name: athleteOneName || "",
      athlete_2_name: athleteTwoName || "",
      athlete_2_grad_year: athleteTwoGradYear || "",
    },
    success_url: successUrl + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: cancelUrl,
  };

  if (discounts.length > 0) {
    sessionParams.discounts = discounts;
  } else {
    sessionParams.allow_promotion_codes = true;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    return Response.json({
      ok: true,
      sessionUrl: session.url,
      sessionId: session.id,
      soldSeason,
    });
  } catch (err) {
    console.error("Stripe session creation error:", err.message);
    return Response.json({ ok: false, error: err.message });
  }
});