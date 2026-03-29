import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// All valid activity types — legacy values kept for backward compatibility
const VALID_TYPES = [
  // Legacy (original 5 — always accepted)
  "social_like", "dm_received", "camp_invite", "camp_meeting", "offer",
  // Social
  "social_follow",
  // Messaging
  "generic_email", "personal_email", "dm_sent", "text_received", "text_sent", "phone_call",
  // Camp
  "generic_camp_invite", "personal_camp_invite", "camp_registered", "camp_attended",
  "post_camp_followup_sent", "post_camp_personal_response",
  // Visit
  "unofficial_visit_requested", "unofficial_visit_completed",
  "official_visit_requested",   "official_visit_completed",
  // Milestone
  "offer_received", "offer_updated", "commitment", "signed",
] as const;

const VALID_PLATFORMS  = ["x", "text", "email", "phone", "in_person", "camp", "other"] as const;
const VALID_DIRECTIONS = ["inbound", "outbound", "in_person"] as const;
const VALID_OFFER_TYPES    = ["scholarship", "preferred_walk_on", "walk_on"] as const;
const VALID_OFFER_STATUSES = ["active", "expired", "withdrawn", "accepted", "declined"] as const;

// Auto-infer source_platform from activity_type so existing callers get enriched data
function inferPlatform(t: string): string | null {
  if (["social_like", "social_follow", "dm_received", "dm_sent"].includes(t)) return "x";
  if (["text_received", "text_sent"].includes(t)) return "text";
  if (["phone_call"].includes(t)) return "phone";
  if (["generic_email", "personal_email"].includes(t)) return "email";
  if (["camp_invite", "generic_camp_invite", "personal_camp_invite",
       "camp_registered", "camp_attended", "camp_meeting",
       "post_camp_followup_sent", "post_camp_personal_response"].includes(t)) return "camp";
  if (["unofficial_visit_requested", "unofficial_visit_completed",
       "official_visit_requested",   "official_visit_completed"].includes(t)) return "in_person";
  return null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: {
    accountId?: string;
    activity_type?: string;
    athlete_id?: string;
    school_name?: string;
    coach_name?: string;
    coach_title?: string;
    coach_twitter?: string;
    activity_date?: string;
    notes?: string;
    // New normalized fields
    source_platform?: string;
    interaction_direction?: string;
    is_athlete_specific?: boolean | null;
    is_two_way_engagement?: boolean | null;
    is_verified_personal?: boolean | null;
    offer_type?: string;
    offer_status?: string;
    evidence_reference?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId && body.accountId) accountId = body.accountId;

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const {
    activity_type, athlete_id, school_name, coach_name, coach_title, coach_twitter,
    activity_date, notes,
    source_platform, interaction_direction,
    is_athlete_specific, is_two_way_engagement, is_verified_personal,
    offer_type, offer_status, evidence_reference,
  } = body;

  if (!activity_type || !(VALID_TYPES as readonly string[]).includes(activity_type)) {
    return Response.json({
      ok: false,
      error: "activity_type is required and must be one of: " + VALID_TYPES.join(", "),
    }, { status: 400 });
  }

  // Resolve source_platform: use provided value if valid, otherwise auto-infer from type
  const resolvedPlatform =
    (source_platform && (VALID_PLATFORMS as readonly string[]).includes(source_platform))
      ? source_platform
      : (inferPlatform(activity_type) ?? null);

  try {
    const created = await base44.asServiceRole.entities.RecruitingActivity.create({
      account_id:           accountId,
      athlete_id:           athlete_id?.trim() || null,
      activity_type,
      school_name:          school_name?.trim() || null,
      coach_name:           coach_name?.trim() || null,
      coach_title:          coach_title?.trim() || null,
      coach_twitter:        coach_twitter?.trim() || null,
      activity_date:        activity_date || null,
      notes:                notes?.trim() || null,
      // New fields
      source_platform:      resolvedPlatform,
      interaction_direction:
        (interaction_direction && (VALID_DIRECTIONS as readonly string[]).includes(interaction_direction))
          ? interaction_direction : null,
      is_athlete_specific:  is_athlete_specific ?? null,
      is_two_way_engagement: is_two_way_engagement ?? null,
      is_verified_personal: is_verified_personal ?? null,
      offer_type:
        (offer_type && (VALID_OFFER_TYPES as readonly string[]).includes(offer_type))
          ? offer_type : null,
      offer_status:
        (offer_status && (VALID_OFFER_STATUSES as readonly string[]).includes(offer_status))
          ? offer_status : null,
      evidence_reference:   evidence_reference?.trim() || null,
      created_at:           new Date().toISOString(),
    });

    console.log("RecruitingActivity created — account:", accountId, "type:", activity_type, "id:", created.id);
    return Response.json({ ok: true, activity: created });
  } catch (err) {
    console.error("createRecruitingActivity error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
