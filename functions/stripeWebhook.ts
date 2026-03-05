import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  // For webhook, we need base44 in service role to write entitlements
  const base44 = createClientFromRequest(req);

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event;
  if (webhookSecret && signature) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return Response.json({ ok: false, error: "Webhook signature failed" }, { status: 400 });
    }
  } else {
    // Fallback for testing without webhook secret
    try {
      event = JSON.parse(body);
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.payment_status !== "paid") {
      return Response.json({ ok: true, skipped: "not paid" });
    }

    const accountId = session.metadata?.account_id || "";
    const athleteId = session.metadata?.athlete_id || "";
    const couponCode = session.metadata?.coupon_code || "";
    const email = session.customer_email || "";
    const amountPaid = (session.amount_total || 0) / 100;
    const seasonYear = parseInt(session.metadata?.season_year) || new Date().getFullYear();

    // Compute ends_at: Feb 1 of next year UTC
    const endsAt = new Date(Date.UTC(seasonYear + 1, 1, 1, 0, 0, 0)).toISOString();

    try {
      // Check for existing entitlement using service role
      const existing = await base44.asServiceRole.entities.Entitlement.filter({
        account_id: accountId,
        season_year: seasonYear,
      });

      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.Entitlement.update(existing[0].id, {
          status: "active",
          starts_at: new Date().toISOString(),
          ends_at: endsAt,
          product: "RecruitMeSeasonAccess",
        });
        console.log(`Updated entitlement ${existing[0].id} for account ${accountId}, season ${seasonYear}`);
      } else {
        await base44.asServiceRole.entities.Entitlement.create({
          account_id: accountId,
          season_year: seasonYear,
          status: "active",
          starts_at: new Date().toISOString(),
          ends_at: endsAt,
          product: "RecruitMeSeasonAccess",
        });
        console.log(`Created entitlement for account ${accountId}, season ${seasonYear}`);
      }

      // Log the event
      try {
        await base44.asServiceRole.entities.Event.create({
          source_platform: "stripe",
          event_type: "purchase_completed",
          title: `Season Pass ${seasonYear} purchased`,
          source_key: `stripe:${session.id}`,
          start_date: new Date().toISOString().slice(0, 10),
          payload_json: JSON.stringify({
            session_id: session.id,
            account_id: accountId,
            athlete_id: athleteId,
            email,
            amount_paid: amountPaid,
            coupon_code: couponCode,
            season_year: seasonYear,
          }),
          ts: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("Event logging failed (non-critical):", e.message);
      }
    } catch (err) {
      console.error("Failed to create/update entitlement:", err.message);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ received: true });
});