import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow both authenticated and anonymous checkout
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {}

  const { couponCode, athleteId, userEmail, successUrl, cancelUrl } = await req.json();

  const email = userEmail || user?.email || "";
  if (!email) {
    // Stripe will collect email during checkout if not provided
  }

  // Determine correct season and price ID
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const soldSeason = month >= 9 ? year + 1 : year;

  const priceId = soldSeason === 2026
    ? Deno.env.get("STRIPE_PRICE_ID_2026")
    : Deno.env.get("STRIPE_PRICE_ID_2027");

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

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    allow_promotion_codes: discounts.length === 0,
    customer_email: email || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: discounts.length > 0 ? discounts : undefined,
    metadata: {
      athlete_id: athleteId || "",
      account_id: user?.id || "",
      coupon_code: couponCode || "",
      season_year: soldSeason.toString(),
    },
    success_url: successUrl + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: cancelUrl,
  });

  return Response.json({
    ok: true,
    sessionUrl: session.url,
    sessionId: session.id,
    soldSeason,
  });
});