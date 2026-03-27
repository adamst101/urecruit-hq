import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VALID_TYPES = ["social_like", "dm_received", "camp_invite", "camp_meeting", "offer"] as const;
type ActivityType = typeof VALID_TYPES[number];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: {
    activity_type?: string;
    athlete_id?: string;
    school_name?: string;
    coach_name?: string;
    coach_title?: string;
    coach_twitter?: string;
    activity_date?: string;
    notes?: string;
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

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { activity_type, athlete_id, school_name, coach_name, coach_title, coach_twitter, activity_date, notes } = body;

  if (!activity_type || !(VALID_TYPES as readonly string[]).includes(activity_type)) {
    return Response.json({ ok: false, error: "activity_type is required and must be one of: " + VALID_TYPES.join(", ") }, { status: 400 });
  }

  try {
    const created = await base44.asServiceRole.entities.RecruitingActivity.create({
      account_id: accountId,
      athlete_id: athlete_id?.trim() || null,
      activity_type: activity_type as ActivityType,
      school_name: school_name?.trim() || null,
      coach_name: coach_name?.trim() || null,
      coach_title: coach_title?.trim() || null,
      coach_twitter: coach_twitter?.trim() || null,
      activity_date: activity_date || null,
      notes: notes?.trim() || null,
      created_at: new Date().toISOString(),
    });

    console.log("RecruitingActivity created — account:", accountId, "type:", activity_type, "id:", created.id);
    return Response.json({ ok: true, activity: created });
  } catch (err) {
    console.error("createRecruitingActivity error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
