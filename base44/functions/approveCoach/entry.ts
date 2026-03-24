import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Admin-only — verify caller is admin
  let callerRole = "";
  try {
    const me = await base44.auth.me();
    callerRole = me?.role || "";
  } catch {}

  if (callerRole !== "admin") {
    return Response.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  let body: { coachId?: string; action?: "approve" | "reject" } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { coachId, action } = body;

  if (!coachId || !action) {
    return Response.json({ ok: false, error: "coachId and action are required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return Response.json({ ok: false, error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  try {
    const coach = await base44.asServiceRole.entities.Coach.get(coachId);
    if (!coach) {
      return Response.json({ ok: false, error: "Coach not found" }, { status: 404 });
    }

    // Fetch coach's email from User entity for notifications
    let coachEmail = "";
    if (coach.account_id) {
      try {
        const user = await base44.asServiceRole.entities.User.get(coach.account_id);
        coachEmail = user?.email || "";
      } catch {}
    }

    if (action === "approve") {
      await base44.asServiceRole.entities.Coach.update(coachId, { status: "approved" });

      if (coach.account_id) {
        try {
          await base44.asServiceRole.entities.User.update(coach.account_id, { role: "coach" });
          console.log("Upgraded role to coach for account:", coach.account_id);
        } catch (e) {
          console.warn("Could not upgrade coach role:", (e as Error).message);
        }
      }

      // Email the coach to let them know they're approved
      if (coachEmail) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: coachEmail,
            from_name: "URecruit HQ",
            subject: "Your coach account is approved — URecruit HQ",
            body: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:#0B1F3B;padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">You're Approved!</h2>
  </div>
  <div style="padding:24px;">
    <p style="font-size:15px;color:#111827;line-height:1.6;">Hi ${coach.first_name},</p>
    <p style="font-size:15px;color:#111827;line-height:1.6;">
      Your coach account at URecruit HQ has been approved. You now have full access to your Coach Dashboard,
      your personal invite link, and the ability to message your roster.
    </p>
    <div style="margin-top:20px;">
      <a href="https://urecruithq.com/CoachDashboard" style="display:inline-block;background:#0B1F3B;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:7px;font-size:14px;font-weight:600;">
        Go to Your Dashboard →
      </a>
    </div>
    <p style="margin-top:20px;font-size:13px;color:#9ca3af;">— URecruit HQ</p>
  </div>
</div>`,
          });
        } catch (e) {
          console.warn("Could not send approval email (non-critical):", (e as Error).message);
        }
      }

      console.log("Coach approved:", coachId);
      return Response.json({ ok: true, status: "approved" });

    } else {
      // Reject — deactivate coach record, clear role completely
      await base44.asServiceRole.entities.Coach.update(coachId, { status: "rejected", active: false });

      if (coach.account_id) {
        try {
          // Set role to empty string — no coach access, no special bypass, falls through to subscriber check
          await base44.asServiceRole.entities.User.update(coach.account_id, { role: "" });
          console.log("Cleared role for rejected coach account:", coach.account_id);
        } catch (e) {
          console.warn("Could not clear role on rejected coach:", (e as Error).message);
        }
      }

      // Email the coach to let them know they were not approved
      if (coachEmail) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: coachEmail,
            from_name: "URecruit HQ",
            subject: "Update on your coach account application — URecruit HQ",
            body: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:#0B1F3B;padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">Application Update</h2>
  </div>
  <div style="padding:24px;">
    <p style="font-size:15px;color:#111827;line-height:1.6;">Hi ${coach.first_name},</p>
    <p style="font-size:15px;color:#111827;line-height:1.6;">
      Thank you for applying for a coach account on URecruit HQ. After review, we were unable to verify
      your credentials at this time and your application was not approved.
    </p>
    <p style="font-size:15px;color:#111827;line-height:1.6;">
      If you believe this is an error or would like to provide additional information,
      please reply to this email and we'll take another look.
    </p>
    <p style="margin-top:20px;font-size:13px;color:#9ca3af;">— URecruit HQ</p>
  </div>
</div>`,
          });
        } catch (e) {
          console.warn("Could not send rejection email (non-critical):", (e as Error).message);
        }
      }

      console.log("Coach rejected:", coachId);
      return Response.json({ ok: true, status: "rejected" });
    }
  } catch (err) {
    console.error("approveCoach error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
