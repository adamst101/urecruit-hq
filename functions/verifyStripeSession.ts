import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return Response.json({ ok: false, error: "Missing sessionId" });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return Response.json({
    ok: true,
    paid: session.payment_status === "paid",
    email: session.customer_email || "",
    amountPaid: (session.amount_total || 0) / 100,
    couponUsed: session.metadata?.coupon_code || null,
    seasonYear: parseInt(session.metadata?.season_year) || null,
  });
});