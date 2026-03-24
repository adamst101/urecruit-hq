import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

async function createOrUpdateEntitlement(base44, {
  accountId, athleteId, seasonYear, isPrimary, amountPaid, endsAt, startsAt
}) {
  const filter = { account_id: accountId, season_year: seasonYear };
  if (athleteId) filter.athlete_id = athleteId;

  const existing = await base44.asServiceRole.entities.Entitlement.filter(filter);

  // Dedupe: don't create if already active for this athlete+season
  if (existing && existing.length > 0) {
    const activeOne = existing.find(e => e.status === "active");
    if (activeOne) {
      console.log("Entitlement already active for athlete " + athleteId + ", season " + seasonYear);
      return activeOne;
    }
    // Update the first found
    await base44.asServiceRole.entities.Entitlement.update(existing[0].id, {
      status: "active",
      is_primary: isPrimary,
      amount_paid: amountPaid,
      starts_at: startsAt,
      ends_at: endsAt,
      product: "RecruitMeSeasonAccess",
    });
    console.log("Updated entitlement " + existing[0].id);
    return existing[0];
  }

  const created = await base44.asServiceRole.entities.Entitlement.create({
    account_id: accountId,
    athlete_id: athleteId || "",
    season_year: seasonYear,
    status: "active",
    is_primary: isPrimary,
    amount_paid: amountPaid,
    starts_at: startsAt,
    ends_at: endsAt,
    product: "RecruitMeSeasonAccess",
  });
  console.log("Created entitlement for account " + accountId + ", athlete " + athleteId + ", season " + seasonYear);
  return created;
}

// NOTE: stripeWebhook is intentionally unauthenticated — Stripe cannot send user auth tokens.
// Security is enforced via Stripe webhook signature verification (STRIPE_WEBHOOK_SECRET).
// createClientFromRequest does NOT consume the body stream, so req.text() below still
// reads the raw body intact for signature validation.
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

    // Accept both paid sessions and $0 sessions from 100% promo codes
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return Response.json({ ok: true, skipped: "not paid" });
    }

    const accountId = session.metadata?.account_id || "";
    const athleteId = session.metadata?.athlete_id || "";
    const couponCode = session.metadata?.coupon_code || "";
    const coachInviteCode = session.metadata?.coach_invite_code || "";
    const isAddOn = session.metadata?.is_add_on === "true";
    const hasSecondAthlete = session.metadata?.has_second_athlete === "true";
    const athleteTwoName = session.metadata?.athlete_2_name || "";
    const athleteTwoGradYear = session.metadata?.athlete_2_grad_year || "";
    const email = session.customer_email || session.customer_details?.email || "";
    const amountTotal = (session.amount_total || 0) / 100;
    const seasonYear = parseInt(session.metadata?.season_year) || new Date().getFullYear();

    // Profile fields from checkout form
    const parentFirstName = session.metadata?.parent_first_name || "";
    const parentLastName = session.metadata?.parent_last_name || "";
    const parentPhone = session.metadata?.parent_phone || "";
    const athleteFirstName = session.metadata?.athlete_first_name || "";
    const athleteLastName = session.metadata?.athlete_last_name || "";
    const gradYear = session.metadata?.grad_year ? parseInt(session.metadata.grad_year) : null;
    const sportId = session.metadata?.sport_id || "";
    const homeCity = session.metadata?.home_city || "";
    const homeState = session.metadata?.home_state || "";

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
      // SCENARIO A — Primary athlete purchase (or standalone add-on)
      if (!isAddOn) {
        const primaryAmount = hasSecondAthlete ? 49 : amountTotal;
        await createOrUpdateEntitlement(base44, {
          accountId,
          athleteId,
          seasonYear,
          isPrimary: true,
          amountPaid: primaryAmount,
          startsAt: accessStartsAt,
          endsAt: accessEndsAt,
        });

        // Write profile data to AthleteProfile if we have a name
        if (athleteFirstName && accountId) {
          try {
            const profileFields = {
              first_name: athleteFirstName,
              last_name: athleteLastName || null,
              athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
              display_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" "),
              grad_year: gradYear || null,
              sport_id: sportId || null,
              home_city: homeCity || null,
              home_state: homeState || null,
              parent_first_name: parentFirstName || null,
              parent_last_name: parentLastName || null,
              parent_phone: parentPhone || null,
            };

            if (athleteId) {
              // Update existing profile
              await base44.asServiceRole.entities.AthleteProfile.update(athleteId, profileFields);
              console.log("Updated AthleteProfile:", athleteId);
            } else {
              // Create new profile linked to account
              const newProfile = await base44.asServiceRole.entities.AthleteProfile.create({
                account_id: accountId,
                ...profileFields,
                is_primary: true,
                active: true,
                sport_id: sportId || null,
              });
              console.log("Created AthleteProfile from checkout:", newProfile.id);
            }
          } catch (e) {
            console.warn("Profile save failed (non-critical):", e.message);
          }
        }
      }

      // SCENARIO B — Second athlete bundled with primary
      if (!isAddOn && hasSecondAthlete && athleteTwoName) {
        try {
          const newAthlete = await base44.asServiceRole.entities.AthleteProfile.create({
            account_id: accountId,
            first_name: athleteTwoName.split(" ")[0] || athleteTwoName,
            last_name: athleteTwoName.split(" ").slice(1).join(" ") || null,
            athlete_name: athleteTwoName,
            display_name: athleteTwoName,
            is_primary: false,
            grad_year: parseInt(athleteTwoGradYear) || null,
            sport_id: sportId || null,
            parent_first_name: parentFirstName || null,
            parent_last_name: parentLastName || null,
            parent_phone: parentPhone || null,
            home_city: homeCity || null,
            home_state: homeState || null,
            active: true,
          });
          console.log("Created secondary athlete profile:", newAthlete.id);

          await createOrUpdateEntitlement(base44, {
            accountId,
            athleteId: newAthlete.id,
            seasonYear,
            isPrimary: false,
            amountPaid: 39,
            startsAt: accessStartsAt,
            endsAt: accessEndsAt,
          });
        } catch (e) {
          console.error("Failed to create secondary athlete from checkout:", e.message);
        }
      }

      // SCENARIO C — Standalone add-on athlete purchase
      if (isAddOn && athleteTwoName) {
        try {
          const newAthlete = await base44.asServiceRole.entities.AthleteProfile.create({
            account_id: accountId,
            first_name: athleteTwoName.split(" ")[0] || athleteTwoName,
            last_name: athleteTwoName.split(" ").slice(1).join(" ") || null,
            athlete_name: athleteTwoName,
            display_name: athleteTwoName,
            is_primary: false,
            grad_year: parseInt(athleteTwoGradYear) || null,
            sport_id: sportId || null,
            parent_first_name: parentFirstName || null,
            parent_last_name: parentLastName || null,
            parent_phone: parentPhone || null,
            home_city: homeCity || null,
            home_state: homeState || null,
            active: true,
          });
          console.log("Created add-on athlete profile:", newAthlete.id);

          await createOrUpdateEntitlement(base44, {
            accountId,
            athleteId: newAthlete.id,
            seasonYear,
            isPrimary: false,
            amountPaid: amountTotal,
            startsAt: accessStartsAt,
            endsAt: accessEndsAt,
          });
        } catch (e) {
          console.error("Failed to create add-on athlete:", e.message);
        }
      } else if (isAddOn && !athleteTwoName) {
        // Fallback: add-on purchase without athlete name (just create entitlement)
        await createOrUpdateEntitlement(base44, {
          accountId,
          athleteId,
          seasonYear,
          isPrimary: false,
          amountPaid: amountTotal,
          startsAt: accessStartsAt,
          endsAt: accessEndsAt,
        });
      }

      // Auto-invite user if they don't have an account yet
      if (email) {
        try {
          const existingUsers = await base44.asServiceRole.entities.User.filter({ email: email });
          if (!existingUsers || existingUsers.length === 0) {
            await base44.users.inviteUser(email, "user");
            console.log("Auto-invited new user:", email);
          } else {
            console.log("User already exists:", email);
          }
        } catch (e) {
          console.warn("Auto-invite failed (non-critical):", e.message);
        }
      }

      // Log the event
      try {
        await base44.asServiceRole.entities.Event.create({
          source_platform: "stripe",
          event_type: "purchase_completed",
          title: "Season Pass " + seasonYear + " purchased" + (isAddOn ? " (add-on)" : "") + (hasSecondAthlete ? " (+2nd athlete)" : ""),
          source_key: "stripe:" + session.id,
          start_date: new Date().toISOString().slice(0, 10),
          payload_json: JSON.stringify({
            session_id: session.id,
            account_id: accountId,
            athlete_id: athleteId,
            email,
            amount_paid: amountTotal,
            coupon_code: couponCode,
            season_year: seasonYear,
            is_add_on: isAddOn,
            has_second_athlete: hasSecondAthlete,
            athlete_2_name: athleteTwoName,
          }),
          ts: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("Event logging failed (non-critical):", e.message);
      }
      // Link athlete to coach roster if a coach invite code was used
      if (coachInviteCode && accountId) {
        try {
          const coaches = await base44.asServiceRole.entities.Coach.filter({ invite_code: coachInviteCode, active: true }).catch(() => []);
          if (Array.isArray(coaches) && coaches.length > 0) {
            const coachId = coaches[0].id;
            // Idempotency: skip if already on roster
            const existing = await base44.asServiceRole.entities.CoachRoster.filter({ coach_id: coachId, account_id: accountId }).catch(() => []);
            if (!Array.isArray(existing) || existing.length === 0) {
              await base44.asServiceRole.entities.CoachRoster.create({
                coach_id: coachId,
                account_id: accountId,
                athlete_id: athleteId || "",
                athlete_name: [athleteFirstName, athleteLastName].filter(Boolean).join(" ") || "",
                invite_code: coachInviteCode,
                joined_at: new Date().toISOString(),
              });
              console.log("Linked account", accountId, "to coach roster", coachId);
            } else {
              console.log("Account already on coach roster:", accountId, coachId);
            }
          } else {
            console.warn("Coach not found for invite code:", coachInviteCode);
          }
        } catch (e) {
          console.warn("CoachRoster linking failed (non-critical):", e.message);
        }
      }
    } catch (err) {
      console.error("Failed to process checkout:", err.message);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ received: true });
});