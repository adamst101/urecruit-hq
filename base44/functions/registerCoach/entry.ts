import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ADMIN_EMAILS = ["tom.adams101@gmail.com", "sadie_adams@icloud.com"];

// Generates a unique invite code: LASTNAME-SCHOOLABBR-XXXX
function generateInviteCode(lastName: string, schoolOrOrg: string): string {
  const lastNamePart = (lastName || "").trim().toUpperCase().replace(/[^A-Z]/g, "") || "COACH";
  const schoolAbbr = (schoolOrOrg || "").trim().replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase() || "SCH";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${lastNamePart}-${schoolAbbr}-${rand}`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: { accountId?: string; coach_type?: string; first_name?: string; last_name?: string; title?: string; school_or_org?: string; sport?: string; email?: string; phone?: string; website?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  // auth.me() is the authoritative source for the account ID — it uses the
  // token on the request so it always matches what getMyCoachProfile will use
  // later to look up the coach record. body.accountId is kept as a fallback
  // for the rare case where auth.me() fails immediately after account creation.
  let accountId = body.accountId || "";
  let coachEmail = body.email || "";
  try {
    const me = await base44.auth.me();
    if (me?.id) accountId = me.id; // always prefer the server-side ID
    if (!coachEmail && me?.email) coachEmail = me.email;
  } catch {}

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated — accountId required" }, { status: 401 });
  }

  const { coach_type, first_name, last_name, title, school_or_org, sport, phone, website } = body;
  const resolvedCoachType = (coach_type === "Trainer" || coach_type === "HS Coach") ? coach_type : "HS Coach";

  if (!first_name || !last_name || !school_or_org) {
    return Response.json({ ok: false, error: "first_name, last_name, and school_or_org are required" }, { status: 400 });
  }

  try {
    // Check for existing coach record for this account (idempotent re-runs)
    const existingCoach = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId }).catch(() => []);
    if (Array.isArray(existingCoach) && existingCoach.length > 0) {
      console.log("Coach record already exists for account:", accountId);
      return Response.json({ ok: true, invite_code: existingCoach[0].invite_code, coach_id: existingCoach[0].id, already_existed: true });
    }

    // Generate invite code — retry once on collision (extremely rare)
    let invite_code = generateInviteCode(last_name, school_or_org);
    const collision = await base44.asServiceRole.entities.Coach.filter({ invite_code }).catch(() => []);
    if (Array.isArray(collision) && collision.length > 0) {
      invite_code = generateInviteCode(last_name, school_or_org);
    }

    // Create the Coach entity record — status starts as "pending" until admin approves
    const coach = await base44.asServiceRole.entities.Coach.create({
      account_id: accountId,
      coach_type: resolvedCoachType,
      first_name,
      last_name,
      title: title || null,
      school_or_org,
      sport: sport || "Football",
      phone: phone || null,
      website: website || null,
      invite_code,
      status: "pending",
      active: true,
      email: coachEmail || null,
      created_at: new Date().toISOString(),
    });

    // Set role="coach_pending" and persist name — full coach access granted only after admin approval
    try {
      await base44.asServiceRole.entities.User.update(accountId, {
        role: "coach_pending",
        first_name,
        last_name,
      });
      console.log("Set role=coach_pending on user:", accountId);
    } catch (e) {
      console.warn("Could not set coach_pending role on User entity:", (e as Error).message);
    }

    // Create a support ticket for admin review
    try {
      const existing = await base44.asServiceRole.entities.SupportTicket.filter({}).catch(() => []);
      const num = String((Array.isArray(existing) ? existing.length : 0) + 1).padStart(4, "0");
      const ticketNumber = `COACH-${new Date().getFullYear()}-${num}`;

      await base44.asServiceRole.entities.SupportTicket.create({
        ticket_number: ticketNumber,
        type: "support",
        status: "open",
        priority: "normal",
        subject: `${resolvedCoachType} Application — ${first_name} ${last_name} · ${school_or_org}`,
        description: `New ${resolvedCoachType} account pending approval.\n\nType: ${resolvedCoachType}\nName: ${first_name} ${last_name}\nTitle: ${title || "—"}\nSchool/Org: ${school_or_org}\nSport: ${sport || "Football"}\nEmail: ${coachEmail || "unknown"}\nPhone: ${phone || "—"}\nWebsite: ${website || "—"}\nAccount ID: ${accountId}\nCoach ID: ${coach.id}`,
        user_id: accountId,
        user_email: coachEmail || null,
        user_name: `${first_name} ${last_name}`,
        account_type: "coach_pending",
      });
      console.log("Support ticket created for coach application:", ticketNumber);
    } catch (e) {
      console.warn("Could not create support ticket (non-critical):", (e as Error).message);
    }

    // Send admin notification email
    try {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
      const adminBody = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <div style="background:#0B1F3B;padding:20px 24px;">
    <h2 style="margin:0;color:#D4AF37;font-size:18px;">New ${resolvedCoachType} Application</h2>
    <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">Pending your review and approval</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;width:130px;vertical-align:top;">Type</td><td style="padding:8px 12px;color:#111827;font-weight:600;">${resolvedCoachType}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Name</td><td style="padding:8px 12px;color:#111827;font-weight:600;">${first_name} ${last_name}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Title</td><td style="padding:8px 12px;color:#111827;">${title || "—"}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">School / Org</td><td style="padding:8px 12px;color:#111827;">${school_or_org}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Sport</td><td style="padding:8px 12px;color:#111827;">${sport || "Football"}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Email</td><td style="padding:8px 12px;color:#111827;">${coachEmail || "—"}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Phone</td><td style="padding:8px 12px;color:#111827;">${phone || "—"}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;vertical-align:top;">Website</td><td style="padding:8px 12px;color:#111827;">${website ? `<a href="${website}" style="color:#0B1F3B;">${website}</a>` : "—"}</td></tr>
    </table>
    <div style="margin-top:20px;padding:16px;background:#fef9ec;border:1px solid #e8a020;border-radius:8px;">
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
        <strong>Action required:</strong> Visit Coach Network Admin to approve or reject this application.
      </p>
    </div>
    <div style="margin-top:20px;">
      <a href="https://urecruithq.com/CoachNetworkAdmin" style="display:inline-block;background:#0B1F3B;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:7px;font-size:14px;font-weight:600;">
        Review Application →
      </a>
    </div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      <p style="margin:0;">Submitted: ${timestamp} CT</p>
    </div>
  </div>
</div>`;

      await Promise.allSettled(
        ADMIN_EMAILS.map(email =>
          base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            from_name: "URecruit HQ",
            subject: `🎽 New ${resolvedCoachType} Application — ${first_name} ${last_name} · ${school_or_org}`,
            body: adminBody,
          })
        )
      );
      console.log("Admin notification emails sent");
    } catch (e) {
      console.warn("Could not send admin notification (non-critical):", (e as Error).message);
    }

    console.log("Coach registered (pending) — id:", coach.id, "invite_code:", invite_code);
    return Response.json({ ok: true, invite_code, coach_id: coach.id, status: "pending" });
  } catch (err) {
    console.error("registerCoach error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
