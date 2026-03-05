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

  // Validate coupon if provided
  let discounts = [];
  if (couponCode && couponCode.trim()) {
    try {
      const coupon = await stripe.coupons.retrieve(couponCode.trim().toUpperCase());
      if (coupon.valid) {
        discounts = [{ coupon: coupon.id }];
      } else {
        return Response.json({ ok: false, error: "Coupon is expired or invalid" });
      }
    } catch {
      return Response.json({ ok: false, error: "Invalid coupon code" });
    }
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    discounts,
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