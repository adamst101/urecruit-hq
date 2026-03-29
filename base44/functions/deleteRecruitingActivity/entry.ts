import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  let body: { activityId?: string; accountId?: string } = {};
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

  const { activityId } = body;
  if (!activityId) {
    return Response.json({ ok: false, error: "activityId is required" }, { status: 400 });
  }

  try {
    // Verify ownership before deleting
    const activity = await base44.asServiceRole.entities.RecruitingActivity.get(activityId).catch(() => null);

    if (!activity) {
      return Response.json({ ok: false, error: "Activity not found" }, { status: 404 });
    }

    if (activity.account_id !== accountId) {
      return Response.json({ ok: false, error: "Not authorized to delete this activity" }, { status: 403 });
    }

    await base44.asServiceRole.entities.RecruitingActivity.delete(activityId);

    console.log("RecruitingActivity deleted — account:", accountId, "id:", activityId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("deleteRecruitingActivity error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
