import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let user = null;
  try {
    user = await base44.auth.me();
  } catch {}

  const { promoCode, athleteId, userEmail, accountId } = await req.json();

  // HARD CHECK — only BETA100 bypasses Stripe
  if (!promoCode || promoCode.toUpperCase() !== "BETA100") {
    return Response.json({ ok: false, error: "This code requires card payment" }, { status: 400 });
  }

  // Validate BETA100 exists and is active in Stripe
  try {
    const promoCodes = await stripe.promotionCodes.list({
      code: "BETA100",
      active: true,
      limit: 1,
    });

    if (promoCodes.data.length === 0) {
      return Response.json({ ok: false, error: "BETA100 code is no longer active" }, { status: 400 });
    }
  } catch (err) {
    console.error("Stripe promo validation error:", err.message);
    return Response.json({ ok: false, error: "Could not validate promo code" }, { status: 500 });
  }

  // Determine season
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const soldSeason = month >= 9 ? year + 1 : year;

  const resolvedAccountId = accountId || user?.id || "";
  const resolvedEmail = userEmail || user?.email || "";

  if (!resolvedAccountId) {
    return Response.json({ ok: false, error: "You must be logged in to activate free access" }, { status: 401 });
  }

  // Check for existing entitlement
  try {
    const existing = await base44.asServiceRole.entities.Entitlement.filter({
      account_id: resolvedAccountId,
      season_year: soldSeason,
      status: "active",
    });

    if (existing && existing.length > 0) {
      return Response.json({ ok: true, alreadyActive: true, seasonYear: soldSeason });
    }
  } catch {}

  // Create entitlement
  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.UTC(soldSeason + 1, 1, 1, 0, 0, 0)).toISOString();

  await base44.asServiceRole.entities.Entitlement.create({
    account_id: resolvedAccountId,
    season_year: soldSeason,
    status: "active",
    starts_at: startsAt,
    ends_at: endsAt,
    product: "RecruitMeSeasonAccess",
  });

  console.log("BETA100 free access activated for account " + resolvedAccountId + ", season " + soldSeason);

  return Response.json({
    ok: true,
    seasonYear: soldSeason,
    accountId: resolvedAccountId,
    email: resolvedEmail,
  });
});