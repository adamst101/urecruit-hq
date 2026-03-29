import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VALID_TYPES = [
  // Legacy (always accepted)
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

const VALID_OFFER_TYPES    = ["scholarship", "preferred_walk_on", "walk_on"] as const;
const VALID_OFFER_STATUSES = ["active", "expired", "withdrawn", "accepted", "declined"] as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  let body: {
    activityId?: string;
    accountId?: string;
    activity_type?: string;
    school_name?: string;
    school_id?: string;
    coach_name?: string;
    coach_title?: string;
    coach_twitter?: string;
    activity_date?: string;
    notes?: string;
    is_athlete_specific?: boolean | null;
    is_two_way_engagement?: boolean | null;
    is_verified_personal?: boolean | null;
    evidence_reference?: string;
    offer_type?: string;
    offer_status?: string;
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

  const { activityId, activity_type } = body;

  if (!activityId) {
    return Response.json({ ok: false, error: "activityId is required" }, { status: 400 });
  }

  if (!activity_type || !(VALID_TYPES as readonly string[]).includes(activity_type)) {
    return Response.json({
      ok: false,
      error: "activity_type is required and must be a valid type",
    }, { status: 400 });
  }

  try {
    // Verify ownership before updating
    const existing = await base44.asServiceRole.entities.RecruitingActivity.get(activityId).catch(() => null);

    if (!existing) {
      return Response.json({ ok: false, error: "Activity not found" }, { status: 404 });
    }

    if (existing.account_id !== accountId) {
      return Response.json({ ok: false, error: "Not authorized to edit this activity" }, { status: 403 });
    }

    const {
      school_name, school_id, coach_name, coach_title, coach_twitter,
      activity_date, notes,
      is_athlete_specific, is_two_way_engagement, is_verified_personal,
      offer_type, offer_status, evidence_reference,
    } = body;

    const updated = await base44.asServiceRole.entities.RecruitingActivity.update(activityId, {
      activity_type,
      school_name:          school_name?.trim()  || null,
      school_id:            school_id?.trim()    || null,
      coach_name:           coach_name?.trim()   || null,
      coach_title:          coach_title?.trim()  || null,
      coach_twitter:        coach_twitter?.trim() || null,
      activity_date:        activity_date        || null,
      notes:                notes?.trim()        || null,
      is_athlete_specific:  is_athlete_specific  ?? null,
      is_two_way_engagement: is_two_way_engagement ?? null,
      is_verified_personal: is_verified_personal ?? null,
      offer_type:
        (offer_type && (VALID_OFFER_TYPES as readonly string[]).includes(offer_type))
          ? offer_type : null,
      offer_status:
        (offer_status && (VALID_OFFER_STATUSES as readonly string[]).includes(offer_status))
          ? offer_status : null,
      evidence_reference:   evidence_reference?.trim() || null,
    });

    console.log("RecruitingActivity updated — account:", accountId, "type:", activity_type, "id:", activityId);
    return Response.json({ ok: true, activity: updated });
  } catch (err) {
    console.error("updateRecruitingActivity error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
