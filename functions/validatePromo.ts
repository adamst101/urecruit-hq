import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  const { promoCode } = await req.json();

  if (!promoCode || !promoCode.trim()) {
    return Response.json({ ok: false, error: "No code provided" });
  }

  const codesToTry = [
    promoCode.trim(),
    promoCode.trim().toUpperCase(),
    promoCode.trim().toLowerCase(),
  ];

  let foundPromo = null;
  for (const code of codesToTry) {
    try {
      const result = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
      if (result.data.length > 0) {
        foundPromo = result.data[0];
        break;
      }
    } catch (e) {
      console.error("Promo lookup failed for:", code, e.message);
    }
  }

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
  });
});