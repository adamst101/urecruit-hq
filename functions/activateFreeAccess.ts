import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

const stripeKeyPrefix = (Deno.env.get("STRIPE_SECRET_KEY") || "").slice(0, 7);
console.log("Stripe mode:", stripeKeyPrefix.startsWith("sk_live") ? "LIVE" : "TEST");

async function getActiveSeason(base44) {
  const seasons = await base44.asServiceRole.entities.SeasonConfig.filter({ active: true });
  const list = Array.isArray(seasons) ? seasons : [];
  const now = new Date();

  const currentSeason = list.find(s => {
    const opens = s.sale_opens_at ? new Date(s.sale_opens_at) : null;
    const closes = s.sale_closes_at ? new Date(s.sale_closes_at) : null;
    if (opens && now < opens) return false;
    if (closes && now > closes) return false;
    return true;
  });

  return currentSeason || list.find(s => s.is_current) || null;
}

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

  // Case-insensitive promo lookup in Stripe
  const codesToTry = [
    promoCode.trim(),
    promoCode.trim().toUpperCase(),
    promoCode.trim().toLowerCase(),
  ];

  let foundPromo = null;
  for (const code of codesToTry) {
    try {
      const result = await stripe.promotionCodes.list({
        code: code,
        active: true,
        limit: 1,
      });
      console.log("Promo lookup for '" + code + "':", result.data.length, "results");
      if (result.data.length > 0) {
        foundPromo = result.data[0];
        break;
      }
    } catch (e) {
      console.error("Promo lookup failed for:", code, e.message);
    }
  }

  if (!foundPromo) {
    console.error("No promo found for any case variation of:", promoCode);
    return Response.json({ ok: false, error: "BETA100 code is no longer active" }, { status: 400 });
  }

  console.log("Found promo:", foundPromo.id, "code:", foundPromo.code);

  // Get active season from DB
  const season = await getActiveSeason(base44);
  if (!season) {
    return Response.json({ ok: false, error: "No active season configured" }, { status: 400 });
  }

  const soldSeason = season.season_year;
  const resolvedAccountId = accountId || user?.id || "";
  const resolvedEmail = userEmail || user?.email || "";

  if (!resolvedAccountId) {
    return Response.json({ ok: false, error: "You must be logged in to activate free access" }, { status: 401 });
  }

  // Check for existing active entitlement
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

  // Create entitlement using season config dates
  const startsAt = season.access_starts_at ? new Date(season.access_starts_at).toISOString() : new Date().toISOString();
  const endsAt = season.access_ends_at ? new Date(season.access_ends_at).toISOString() : new Date(Date.UTC(soldSeason + 1, 1, 1, 0, 0, 0)).toISOString();

  await base44.asServiceRole.entities.Entitlement.create({
    account_id: resolvedAccountId,
    athlete_id: athleteId || "",
    season_year: soldSeason,
    status: "active",
    is_primary: true,
    amount_paid: 0,
    starts_at: startsAt,
    ends_at: endsAt,
    product: "RecruitMeSeasonAccess",
  });

  console.log("BETA100 free access activated for account " + resolvedAccountId + ", season " + soldSeason);

  return Response.json({
    ok: true,
    free: true,
    seasonYear: soldSeason,
    accountId: resolvedAccountId,
    email: resolvedEmail,
  });
});