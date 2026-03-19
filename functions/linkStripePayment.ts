// functions/linkStripePayment.ts
// Called by AuthRedirect (anonymous post-payment) and CheckoutSuccess (addon fallback).
// Retrieves the Stripe session, ensures the correct Entitlement and AthleteProfile exist.
// Requires the user to be authenticated.

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
  const isAddOn = session.metadata?.is_add_on === "true";
  const sportId = session.metadata?.sport_id || "";

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

  // ── ADDON: second athlete purchase ──
  if (isAddOn) {
    const athlete2Name = (session.metadata?.athlete_2_name || "").trim();
    const athlete2GradYear = session.metadata?.athlete_2_grad_year || "";

    if (!athlete2Name) {
      return Response.json({ ok: false, error: "No athlete name found in session metadata" });
    }

    const parts = athlete2Name.split(" ");
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ") || null;

    // Get existing profiles for this account
    const existingProfiles = await base44.asServiceRole.entities.AthleteProfile.filter({
      account_id: accountId,
    }).catch(() => []);

    // Dedupe by name — don't create if athlete already exists
    const alreadyExists = Array.isArray(existingProfiles) && existingProfiles.some(p =>
      (p.first_name || "").toLowerCase() === firstName.toLowerCase() &&
      (p.last_name || null) === (lastName || null)
    );

    let newAthleteId = null;
    if (!alreadyExists) {
      try {
        const newProfile = await base44.asServiceRole.entities.AthleteProfile.create({
          account_id: accountId,
          first_name: firstName,
          last_name: lastName,
          athlete_name: athlete2Name,
          is_primary: false,
          active: true,
          sport_id: sportId || null,
          primary_position_id: "",
          grad_year: parseInt(athlete2GradYear) || null,
        });
        newAthleteId = newProfile?.id || null;
        console.log("Created addon AthleteProfile:", newAthleteId, "for account:", accountId);
      } catch (e) {
        console.error("Addon AthleteProfile creation failed:", e.message);
        return Response.json({ ok: false, error: "Failed to create athlete profile: " + e.message });
      }
    } else {
      console.log("Addon athlete already exists:", athlete2Name, "for account:", accountId);
    }

    // Create addon entitlement if none exists for this season
    const existingEnt = await base44.asServiceRole.entities.Entitlement.filter({
      account_id: accountId,
      season_year: seasonYear,
      is_primary: false,
      status: "active",
    }).catch(() => []);

    if (!existingEnt || existingEnt.length === 0) {
      await base44.asServiceRole.entities.Entitlement.create({
        account_id: accountId,
        athlete_id: newAthleteId || "",
        season_year: seasonYear,
        status: "active",
        is_primary: false,
        amount_paid: amountPaid,
        starts_at: accessStartsAt,
        ends_at: accessEndsAt,
        product: "RecruitMeSeasonAccess",
      });
      console.log("Created addon Entitlement for account:", accountId, "season:", seasonYear);
    }

    return Response.json({ ok: true, linked: true, accountId, seasonYear, isAddOn: true });
  }

  // ── PRIMARY: initial season pass purchase ──
  const athleteFirstName = session.metadata?.athlete_first_name || "";
  const athleteLastName = session.metadata?.athlete_last_name || "";
  const gradYear = session.metadata?.grad_year ? parseInt(session.metadata.grad_year) : null;
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

  // Create primary entitlement
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

  // Create AthleteProfile if we have the athlete's name and none exists yet
  if (athleteFirstName) {
    try {
      const existingProfiles = await base44.asServiceRole.entities.AthleteProfile.filter({
        account_id: accountId,
      }).catch(() => []);

      if (!existingProfiles || existingProfiles.length === 0) {
        await base44.asServiceRole.entities.AthleteProfile.create({
          account_id: accountId,
          first_name: athleteFirstName,
          last_name: athleteLastName || null,
          athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
          grad_year: gradYear || null,
          sport_id: sportId || null,
          home_city: homeCity || null,
          home_state: homeState || null,
          parent_first_name: parentFirstName || null,
          parent_last_name: parentLastName || null,
          parent_phone: parentPhone || null,
          is_primary: true,
          active: true,
          primary_position_id: "",
        });
        console.log("Created AthleteProfile for account:", accountId);
      } else {
        console.log("AthleteProfile already exists for account:", accountId, "— skipping creation");
      }
    } catch (e) {
      console.error("AthleteProfile creation failed:", e.message);
    }
  }

  return Response.json({ ok: true, linked: true, accountId, seasonYear });
});
