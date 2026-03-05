import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

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

  const { couponCode, athleteId, userEmail, successUrl, cancelUrl, isAddOn } = await req.json();

  const email = userEmail || user?.email || "";

  // Get active season from DB
  const season = await getActiveSeason(base44);
  if (!season) {
    return Response.json({ ok: false, error: "No active season configured. Please contact support." });
  }

  const soldSeason = season.season_year;

  // Pick the right price ID: add-on ($39) vs primary ($49)
  const priceId = isAddOn ? season.stripe_price_add_on : season.stripe_price_primary;
  if (!priceId) {
    return Response.json({ ok: false, error: "Price not configured for this season" });
  }

  // Validate promotion code if provided
  let discounts = [];
  if (couponCode && couponCode.trim()) {
    const code = couponCode.trim().toUpperCase();
    console.log("Received couponCode:", couponCode, "Uppercased:", code);

    try {
      const promoCodes = await stripe.promotionCodes.list({
        code,
        active: true,
        limit: 1,
      });
      console.log("Stripe promotionCodes.list response:", JSON.stringify(promoCodes.data));

      if (promoCodes.data.length > 0) {
        discounts = [{ promotion_code: promoCodes.data[0].id }];
        console.log("Applying promotion_code:", promoCodes.data[0].id);
      } else {
        return Response.json({ ok: false, error: "Invalid or expired promo code" });
      }
    } catch (err) {
      console.error("Promo code validation error:", err.message);
      return Response.json({ ok: false, error: "Could not validate promo code" });
    }
  }

  const sessionParams = {
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      athlete_id: athleteId || "",
      account_id: user?.id || "",
      coupon_code: couponCode || "",
      season_year: soldSeason.toString(),
      is_add_on: isAddOn ? "true" : "false",
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