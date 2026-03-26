import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ADMIN_EMAILS = ["tom.adams101@gmail.com", "sadie_adams@icloud.com"];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Admin-only — verify by role OR by known admin email
  let callerRole = "";
  let callerEmail = "";
  try {
    const me = await base44.auth.me();
    callerRole = me?.role || "";
    callerEmail = me?.email || "";
  } catch {}

  const isAdmin = callerRole === "admin" || ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin) {
    return Response.json({ ok: false, error: `Admin access required (role: ${callerRole || "none"})` }, { status: 403 });
  }

  let body: { coachId?: string; env?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { coachId } = body;
  const E = body.env === 'dev' ? { environment: 'dev' as const } : undefined;
  if (!coachId) {
    return Response.json({ ok: false, error: "coachId is required" }, { status: 400 });
  }

  try {
    const coach = await base44.asServiceRole.entities.Coach.get(coachId, E);
    if (!coach) {
      return Response.json({ ok: false, error: "Coach not found" }, { status: 404 });
    }

    const results: Record<string, string> = {};

    // Delete all CoachRoster records for this coach
    try {
      const roster = await base44.asServiceRole.entities.CoachRoster.filter({ coach_id: coachId }, E);
      const rosterList = Array.isArray(roster) ? roster : [];
      await Promise.all(rosterList.map(r => base44.asServiceRole.entities.CoachRoster.delete(r.id, E).catch(() => {})));
      results.roster = `${rosterList.length} roster entries deleted`;
    } catch (e) {
      results.roster = `roster delete failed: ${(e as Error).message}`;
    }

    // Delete all CoachMessage records for this coach
    try {
      const msgs = await base44.asServiceRole.entities.CoachMessage.filter({ coach_id: coachId }, E);
      const msgList = Array.isArray(msgs) ? msgs : [];
      await Promise.all(msgList.map(m => base44.asServiceRole.entities.CoachMessage.delete(m.id, E).catch(() => {})));
      results.messages = `${msgList.length} messages deleted`;
    } catch (e) {
      results.messages = `message delete failed: ${(e as Error).message}`;
    }

    // Reset the user's role to empty string (removes coach access)
    if (coach.account_id) {
      try {
        await base44.asServiceRole.entities.User.update(coach.account_id, { role: "" }, E);
        results.role = "role cleared";
      } catch (e) {
        results.role = `role clear failed: ${(e as Error).message}`;
      }
    }

    // Delete the Coach record itself (last, so we have account_id above)
    await base44.asServiceRole.entities.Coach.delete(coachId, E);
    results.coach = "Coach record deleted";

    console.log("Coach removed:", coachId, results);
    return Response.json({ ok: true, results });
  } catch (err) {
    console.error("removeCoach error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
