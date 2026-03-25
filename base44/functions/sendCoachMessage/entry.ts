import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: { subject?: string; message?: string; recipientAthleteId?: string; recipientName?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { subject, message, recipientAthleteId, recipientName } = body;

  if (!message?.trim()) {
    return Response.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  // Resolve the calling coach
  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // Look up their Coach record
  const coaches = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId }).catch(() => []);
  if (!Array.isArray(coaches) || coaches.length === 0) {
    return Response.json({ ok: false, error: "No coach profile found for this account" }, { status: 403 });
  }
  const coach = coaches[0];

  try {
    const created = await base44.asServiceRole.entities.CoachMessage.create({
      coach_id: coach.id,
      subject: subject?.trim() || "",
      message: message.trim(),
      sent_at: new Date().toISOString(),
      recipient_athlete_id: recipientAthleteId || null,
      recipient_name: recipientName || null,
    });

    console.log("CoachMessage sent — coach:", coach.id, "id:", created.id);
    return Response.json({ ok: true, message_id: created.id });
  } catch (err) {
    console.error("sendCoachMessage error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
