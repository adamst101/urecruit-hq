import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

async function getActiveSeason(base44, E?) {
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
    coachInviteCode,
  } = await req.json();

  if (!promoCode) {
    return Response.json({ ok: false, error: "Promo code required" }, { status: 400 });
  }

  // Verify the promo code exists and is active in Stripe, and gives 100% off
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

  console.log("activateFreeAccess params — account:", resolvedAccountId, "isAddOn:", !!isAddOn, "athleteFirstName:", athleteFirstName || "(none)");

  // Resolve access dates
  const startsAt = season.access_starts_at
    ? new Date(season.access_starts_at).toISOString()
    : new Date().toISOString();
  const endsAt = season.access_ends_at
    ? new Date(season.access_ends_at).toISOString()
    : new Date(Date.UTC(soldSeason + 1, 1, 1, 0, 0, 0)).toISOString();

  // Create entitlement if one doesn't already exist (scoped to addon vs primary)
  try {
    const entFilter = isAddOn
      ? { account_id: resolvedAccountId, season_year: soldSeason, status: "active", is_primary: false }
      : { account_id: resolvedAccountId, season_year: soldSeason, status: "active" };
    const existing = await base44.asServiceRole.entities.Entitlement.filter(entFilter);
    if (!existing || existing.length === 0) {
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
      console.log("Created entitlement — account:", resolvedAccountId, "isAddOn:", !!isAddOn);
    } else {
      console.log("Entitlement already exists — skipping create");
    }
  } catch (e) {
    console.error("Entitlement create failed:", e.message);
    return Response.json({ ok: false, error: "Failed to create entitlement: " + e.message });
  }

  // Always attempt AthleteProfile creation — even if entitlement already existed
  // (a prior run may have created the entitlement but failed on the profile)
  if (athleteFirstName) {
    try {
      const existingProfiles = await base44.asServiceRole.entities.AthleteProfile.filter({
        account_id: resolvedAccountId,
      }).catch(() => []);

      const profileList = Array.isArray(existingProfiles) ? existingProfiles : [];
      console.log("Existing profiles for account:", profileList.length);

      if (isAddOn) {
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
            parent_first_name: parentFirstName || null,
            parent_last_name: parentLastName || null,
            parent_phone: parentPhone || null,
            is_primary: false,
            active: true,
          });
          console.log("Created addon AthleteProfile:", athleteFirstName, athleteLastName);
        } else {
          console.log("Addon athlete already exists:", athleteFirstName, athleteLastName);
        }
      } else {
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
          });
          console.log("Created primary AthleteProfile:", athleteFirstName, athleteLastName);
        } else {
          console.log("Primary athlete already exists, skipping");
        }
      }
    } catch (e) {
      console.error("AthleteProfile creation failed:", e.message);
      return Response.json({ ok: false, error: "Entitlement created but athlete profile failed: " + e.message });
    }
  } else {
    console.warn("No athleteFirstName received — skipping profile creation");
  }

  // Persist first_name / last_name on the User entity from registration form data
  if (resolvedAccountId && (parentFirstName || parentLastName)) {
    try {
      await base44.asServiceRole.entities.User.update(resolvedAccountId, {
        first_name: parentFirstName || null,
        last_name: parentLastName || null,
      });
      console.log("Updated User first_name/last_name for account:", resolvedAccountId);
    } catch (e) {
      console.warn("Could not update User name fields (non-critical):", (e as Error).message);
    }
  }

  // Link athlete to coach roster if a coach invite code was provided
  if (coachInviteCode && resolvedAccountId) {
    try {
      const coaches = await base44.asServiceRole.entities.Coach.filter({
        invite_code: coachInviteCode,
        status: "approved",
        active: true,
      }).catch(() => []);
      if (Array.isArray(coaches) && coaches.length > 0) {
        const coachId = coaches[0].id;
        const existing = await base44.asServiceRole.entities.CoachRoster.filter({
          coach_id: coachId,
          account_id: resolvedAccountId,
        }).catch(() => []);
        if (!Array.isArray(existing) || existing.length === 0) {
          await base44.asServiceRole.entities.CoachRoster.create({
            coach_id: coachId,
            account_id: resolvedAccountId,
            athlete_id: athleteId || "",
            athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" ") || "",
            athlete_grad_year: gradYear ? parseInt(String(gradYear)) : null,
            invite_code: coachInviteCode,
            joined_at: new Date().toISOString(),
          });
          console.log("Linked account", resolvedAccountId, "to coach roster", coachId, "(free access path)");
        } else {
          console.log("Account already on coach roster:", resolvedAccountId, coachId);
        }
      } else {
        console.warn("Coach not found for invite code (free access):", coachInviteCode);
      }
    } catch (e) {
      console.warn("CoachRoster linking failed (non-critical):", (e as Error).message);
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
