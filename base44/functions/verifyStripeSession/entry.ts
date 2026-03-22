import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  try {
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
      isAddOn: session.metadata?.is_add_on === "true",
      accountId: session.metadata?.account_id || "",
      athlete2Name: session.metadata?.athlete_2_name || "",
      athlete2GradYear: session.metadata?.athlete_2_grad_year || "",
      sportId: session.metadata?.sport_id || "",
    });
  } catch (err) {
    console.error("verifyStripeSession error:", err.message);
    return Response.json({ ok: false, error: err.message });
  }
});