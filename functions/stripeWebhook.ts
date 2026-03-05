import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
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
    const isAddOn = session.metadata?.is_add_on === "true";
    const email = session.customer_email || "";
    const amountPaid = (session.amount_total || 0) / 100;
    const seasonYear = parseInt(session.metadata?.season_year) || new Date().getFullYear();

    // Look up SeasonConfig for proper access dates
    let accessStartsAt = new Date().toISOString();
    let accessEndsAt = new Date(Date.UTC(seasonYear + 1, 1, 1, 0, 0, 0)).toISOString();

    try {
      const seasons = await base44.asServiceRole.entities.SeasonConfig.filter({
        season_year: seasonYear,
        active: true,
      });
      if (seasons && seasons.length > 0) {
        const sc = seasons[0];
        if (sc.access_starts_at) accessStartsAt = new Date(sc.access_starts_at).toISOString();
        if (sc.access_ends_at) accessEndsAt = new Date(sc.access_ends_at).toISOString();
      }
    } catch (e) {
      console.warn("Could not fetch SeasonConfig, using defaults:", e.message);
    }

    try {
      // Check for existing entitlement
      const existingFilter = { account_id: accountId, season_year: seasonYear };
      if (athleteId) existingFilter.athlete_id = athleteId;

      const existing = await base44.asServiceRole.entities.Entitlement.filter(existingFilter);

      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.Entitlement.update(existing[0].id, {
          status: "active",
          is_primary: !isAddOn,
          amount_paid: amountPaid,
          starts_at: accessStartsAt,
          ends_at: accessEndsAt,
          product: "RecruitMeSeasonAccess",
        });
        console.log("Updated entitlement " + existing[0].id + " for account " + accountId + ", season " + seasonYear);
      } else {
        await base44.asServiceRole.entities.Entitlement.create({
          account_id: accountId,
          athlete_id: athleteId || "",
          season_year: seasonYear,
          status: "active",
          is_primary: !isAddOn,
          amount_paid: amountPaid,
          starts_at: accessStartsAt,
          ends_at: accessEndsAt,
          product: "RecruitMeSeasonAccess",
        });
        console.log("Created entitlement for account " + accountId + ", season " + seasonYear);
      }

      // Log the event
      try {
        await base44.asServiceRole.entities.Event.create({
          source_platform: "stripe",
          event_type: "purchase_completed",
          title: "Season Pass " + seasonYear + " purchased" + (isAddOn ? " (add-on)" : ""),
          source_key: "stripe:" + session.id,
          start_date: new Date().toISOString().slice(0, 10),
          payload_json: JSON.stringify({
            session_id: session.id,
            account_id: accountId,
            athlete_id: athleteId,
            email,
            amount_paid: amountPaid,
            coupon_code: couponCode,
            season_year: seasonYear,
            is_add_on: isAddOn,
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