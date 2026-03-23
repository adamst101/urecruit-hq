import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });

  const { promoCode } = await req.json();

  if (!promoCode || !promoCode.trim()) {
    return Response.json({ ok: false, error: "No code provided" });
  }

  const codesToTry = [...new Set([
    promoCode.trim(),
    promoCode.trim().toUpperCase(),
    promoCode.trim().toLowerCase(),
  ])];

  const results = await Promise.all(
    codesToTry.map(code =>
      stripe.promotionCodes.list({ code, active: true, limit: 1 }).catch(() => ({ data: [] }))
    )
  );

  const foundPromo = results.find(r => r.data.length > 0)?.data[0] ?? null;

  if (!foundPromo) {
    return Response.json({ ok: false, error: "Invalid or expired code" });
  }

  const coupon = foundPromo.coupon;
  const isFree = coupon.percent_off === 100 || (coupon.amount_off && coupon.amount_off >= 4900);
  const percentOff = coupon.percent_off || 0;
  const amountOff = coupon.amount_off ? coupon.amount_off / 100 : 0;

  return Response.json({
    ok: true,
    promoId: foundPromo.id,
    code: foundPromo.code,
    isFree,
    percentOff,
    amountOff,
    couponName: coupon.name || foundPromo.code,
    appliesTo: coupon.applies_to?.products ?? [],
  });
});