import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ADMIN_EMAILS = ["tom.adams101@gmail.com", "sadie_adams@icloud.com"];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Admin-only — verify caller is admin by role OR by known admin email
  let callerRole = "";
  let callerEmail = "";
  try {
    const me = await base44.auth.me();
    callerRole = me?.role || "";
    callerEmail = me?.email || "";
  } catch {}

  const isAdmin = callerRole === "admin" || ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin) {
    return Response.json({ ok: false, error: `Admin access required (role: ${callerRole || "none"}, email: ${callerEmail || "unknown"})` }, { status: 403 });
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

    const results: Record<string, string> = {};

    // Prefer email stored directly on Coach record (set by registerCoach).
    // Fall back to User entity lookup in case the Coach record predates this field.
    let coachEmail = (coach.email as string) || "";
    if (!coachEmail && coach.account_id) {
      try {
        const user = await base44.asServiceRole.entities.User.get(coach.account_id);
        coachEmail = (user?.email as string) || "";
        if (coachEmail) results.emailSource = "fetched from User entity";
      } catch (e) {
        results.emailSource = `User lookup failed: ${(e as Error).message}`;
      }
    } else if (coachEmail) {
      results.emailSource = "Coach record";
    } else {
      results.emailSource = "no email found";
    }

    if (!coach.account_id) {
      results.accountId = "MISSING — role update skipped";
    }

    if (action === "approve") {
      // Update Coach status
      try {
        await base44.asServiceRole.entities.Coach.update(coachId, { status: "approved" });
        results.coachStatus = "set to approved";
      } catch (e) {
        results.coachStatus = `FAILED: ${(e as Error).message}`;
        return Response.json({ ok: false, error: `Coach status update failed: ${(e as Error).message}`, results }, { status: 500 });
      }

      // Update User role
      if (coach.account_id) {
        try {
          await base44.asServiceRole.entities.User.update(coach.account_id, { role: "coach" });
          results.userRole = "set to coach";
          console.log("Upgraded role to coach for account:", coach.account_id);
        } catch (e) {
          results.userRole = `FAILED: ${(e as Error).message}`;
          console.warn("Could not upgrade coach role:", (e as Error).message);
        }
      }

      // Email the coach
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
    <p style="font-size:14px;color:#374151;line-height:1.6;">
      To access your dashboard, <strong>sign out and sign back in</strong> to activate your coach access —
      then click the button below.
    </p>
    <div style="margin-top:20px;">
      <a href="https://urecruithq.com/CoachDashboard" style="display:inline-block;background:#0B1F3B;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:7px;font-size:14px;font-weight:600;">
        Go to Your Dashboard →
      </a>
    </div>
    <p style="margin-top:20px;font-size:13px;color:#6b7280;">
      If this email landed in your spam folder, please mark it as "Not Spam" so you receive future messages from us.
    </p>
    <p style="margin-top:4px;font-size:13px;color:#9ca3af;">— URecruit HQ</p>
  </div>
</div>`,
          });
          results.email = `sent to ${coachEmail}`;
        } catch (e) {
          results.email = `FAILED: ${(e as Error).message}`;
          console.warn("Could not send approval email:", (e as Error).message);
        }
      } else {
        results.email = "skipped — no email address";
      }

      console.log("Coach approved:", coachId, results);
      return Response.json({ ok: true, status: "approved", results });

    } else {
      // Reject — deactivate coach record, clear role completely
      try {
        await base44.asServiceRole.entities.Coach.update(coachId, { status: "rejected", active: false });
        results.coachStatus = "set to rejected";
      } catch (e) {
        results.coachStatus = `FAILED: ${(e as Error).message}`;
        return Response.json({ ok: false, error: `Coach status update failed: ${(e as Error).message}`, results }, { status: 500 });
      }

      if (coach.account_id) {
        try {
          await base44.asServiceRole.entities.User.update(coach.account_id, { role: "" });
          results.userRole = "cleared";
          console.log("Cleared role for rejected coach account:", coach.account_id);
        } catch (e) {
          results.userRole = `FAILED: ${(e as Error).message}`;
          console.warn("Could not clear role on rejected coach:", (e as Error).message);
        }
      }

      // Email the coach
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
          results.email = `sent to ${coachEmail}`;
        } catch (e) {
          results.email = `FAILED: ${(e as Error).message}`;
          console.warn("Could not send rejection email:", (e as Error).message);
        }
      } else {
        results.email = "skipped — no email address";
      }

      console.log("Coach rejected:", coachId, results);
      return Response.json({ ok: true, status: "rejected", results });
    }
  } catch (err) {
    console.error("approveCoach error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
