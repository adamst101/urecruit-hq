import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

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

  const {
    promoCode, athleteId, userEmail, accountId,
    isAddOn,
    athleteFirstName, athleteLastName, gradYear, sportId,
    homeCity, homeState,
    parentFirstName, parentLastName, parentPhone,
  } = await req.json();

  if (!promoCode) {
    return Response.json({ ok: false, error: "Promo code required" }, { status: 400 });
  }

  // Verify the promo code exists and is active in Stripe, and gives 100% off
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
    return Response.json({ ok: false, error: "Promo code is invalid or expired" }, { status: 400 });
  }

  // Ensure the coupon actually gives 100% off — security guard
  const coupon = foundPromo.coupon;
  const isFull = coupon?.percent_off === 100 || coupon?.amount_off >= 4900;
  if (!isFull) {
    return Response.json({ ok: false, error: "This code does not give full free access" }, { status: 400 });
  }

  console.log("Free promo verified:", foundPromo.code, "coupon:", coupon.id);

  // Get active season
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

  // Resolve access dates
  const startsAt = season.access_starts_at
    ? new Date(season.access_starts_at).toISOString()
    : new Date().toISOString();
  const endsAt = season.access_ends_at
    ? new Date(season.access_ends_at).toISOString()
    : new Date(Date.UTC(soldSeason + 1, 1, 1, 0, 0, 0)).toISOString();

  // Create entitlement
  await base44.asServiceRole.entities.Entitlement.create({
    account_id: resolvedAccountId,
    athlete_id: athleteId || "",
    season_year: soldSeason,
    status: "active",
    is_primary: !isAddOn,
    amount_paid: 0,
    starts_at: startsAt,
    ends_at: endsAt,
    product: "RecruitMeSeasonAccess",
  });

  console.log("Free access activated for account:", resolvedAccountId, "season:", soldSeason, "isAddOn:", !!isAddOn);

  // Create AthleteProfile if we have a name
  if (athleteFirstName) {
    try {
      const existingProfiles = await base44.asServiceRole.entities.AthleteProfile.filter({
        account_id: resolvedAccountId,
      }).catch(() => []);

      const profileList = Array.isArray(existingProfiles) ? existingProfiles : [];

      if (isAddOn) {
        // Addon: add second athlete — dedupe by name
        const alreadyExists = profileList.some(p =>
          (p.first_name || "").toLowerCase() === athleteFirstName.toLowerCase() &&
          (p.last_name || "") === (athleteLastName || "")
        );
        if (!alreadyExists) {
          await base44.asServiceRole.entities.AthleteProfile.create({
            account_id: resolvedAccountId,
            first_name: athleteFirstName,
            last_name: athleteLastName || null,
            athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
            grad_year: gradYear ? parseInt(gradYear) : null,
            sport_id: sportId || null,
            home_city: homeCity || null,
            home_state: homeState || null,
            is_primary: false,
            active: true,
            primary_position_id: null,
          });
          console.log("Created addon AthleteProfile for account:", resolvedAccountId);
        }
      } else {
        // Primary: only create if none exists
        if (profileList.length === 0) {
          await base44.asServiceRole.entities.AthleteProfile.create({
            account_id: resolvedAccountId,
            first_name: athleteFirstName,
            last_name: athleteLastName || null,
            athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
            grad_year: gradYear ? parseInt(gradYear) : null,
            sport_id: sportId || null,
            home_city: homeCity || null,
            home_state: homeState || null,
            parent_first_name: parentFirstName || null,
            parent_last_name: parentLastName || null,
            parent_phone: parentPhone || null,
            is_primary: true,
            active: true,
            primary_position_id: null,
          });
          console.log("Created primary AthleteProfile for account:", resolvedAccountId);
        }
      }
    } catch (e) {
      // Non-fatal — entitlement was already created
      console.error("AthleteProfile creation failed (non-fatal):", e.message);
    }
  }

  return Response.json({
    ok: true,
    free: true,
    seasonYear: soldSeason,
    accountId: resolvedAccountId,
    email: resolvedEmail,
  });
});
