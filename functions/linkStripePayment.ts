// functions/linkStripePayment.ts
// Called by AuthRedirect when post-payment entitlement polling times out.
// Retrieves the Stripe session, checks if an active entitlement already
// exists for this account, and creates one if not.
// Requires the user to be authenticated (called client-side after login).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.21";
import Stripe from "npm:stripe@17.7.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const accountId = user.id;

  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });

  // Retrieve the Stripe session
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    return Response.json({ ok: false, error: "Could not retrieve Stripe session: " + String(e.message) });
  }

  if (session.payment_status !== "paid") {
    return Response.json({ ok: false, error: "Session not paid" });
  }

  const seasonYear = parseInt(session.metadata?.season_year) || new Date().getFullYear();
  const amountPaid = (session.amount_total || 0) / 100;
  const athleteFirstName = session.metadata?.athlete_first_name || "";
  const athleteLastName = session.metadata?.athlete_last_name || "";
  const gradYear = session.metadata?.grad_year ? parseInt(session.metadata.grad_year) : null;
  const sportId = session.metadata?.sport_id || "";
  const homeCity = session.metadata?.home_city || "";
  const homeState = session.metadata?.home_state || "";
  const parentFirstName = session.metadata?.parent_first_name || "";
  const parentLastName = session.metadata?.parent_last_name || "";
  const parentPhone = session.metadata?.parent_phone || "";

  // Check if entitlement already exists for this account+season
  const existing = await base44.asServiceRole.entities.Entitlement.filter({
    account_id: accountId,
    season_year: seasonYear,
    status: "active",
  }).catch(() => []);

  if (existing && existing.length > 0) {
    return Response.json({ ok: true, already_linked: true });
  }

  // Resolve access dates from SeasonConfig
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
  } catch {}

  // Create entitlement linked to this account
  await base44.asServiceRole.entities.Entitlement.create({
    account_id: accountId,
    athlete_id: "",
    season_year: seasonYear,
    status: "active",
    is_primary: true,
    amount_paid: amountPaid,
    starts_at: accessStartsAt,
    ends_at: accessEndsAt,
    product: "RecruitMeSeasonAccess",
  });

  // Create AthleteProfile if we have the athlete's name
  if (athleteFirstName) {
    try {
      await base44.asServiceRole.entities.AthleteProfile.create({
        account_id: accountId,
        first_name: athleteFirstName,
        last_name: athleteLastName || null,
        athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
        display_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
        grad_year: gradYear || null,
        sport_id: sportId || "",
        home_city: homeCity || null,
        home_state: homeState || null,
        parent_first_name: parentFirstName || null,
        parent_last_name: parentLastName || null,
        parent_phone: parentPhone || null,
        is_primary: true,
        active: true,
        primary_position_id: "",
      });
    } catch (e) {
      console.warn("AthleteProfile creation failed (non-critical):", e.message);
    }
  }

  return Response.json({ ok: true, linked: true, accountId, seasonYear });
});
