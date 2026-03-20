import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function getResendKey() { return Deno.env.get("RESEND_API_KEY") ?? ""; }
function getFromEmail() { return Deno.env.get("RESEND_FROM_EMAIL") || "alerts@urecruithq.com"; }

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function divLabel(div: string): string {
  const map: Record<string, string> = { I: "Division I", II: "Division II", III: "Division III", NAIA: "NAIA", JUCO: "Junior College" };
  return map[div] || div || "";
}

// ── Email HTML ──────────────────────────────────────────────────────────────
function campCard(camp: Record<string, unknown>, athleteName: string, showAthlete: boolean): string {
  const loc = [camp.city, camp.state].filter(Boolean).join(", ");
  const div = divLabel(camp.division as string);
  const athlete = showAthlete && athleteName
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#6b7280;font-size:12px;margin-left:8px;border:1px solid #e5e7eb">${athleteName}</span>`
    : "";
  return `
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid #b45309;border-radius:6px;padding:16px 20px;margin-bottom:12px">
      <div style="font-size:16px;font-weight:700;color:#111827">${camp.camp_name || "Camp"}${athlete}</div>
      <div style="margin-top:8px;display:grid;gap:4px">
        <div style="font-size:13px;color:#6b7280">📅 <strong style="color:#374151">${formatDate(camp.start_date as string)}</strong></div>
        ${loc ? `<div style="font-size:13px;color:#6b7280">📍 <strong style="color:#374151">${loc}</strong></div>` : ""}
        ${div ? `<div style="font-size:13px;color:#6b7280">🏫 <strong style="color:#374151">${div}</strong></div>` : ""}
      </div>
    </div>`;
}

function checklistSection(title: string, color: string, icon: string, items: string[]): string {
  return `
    <div style="margin-bottom:24px">
      <div style="border-left:4px solid ${color};padding:10px 14px;background:#f9fafb;border-radius:4px 4px 0 0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#111827;border:1px solid #e5e7eb;border-bottom:none">
        ${icon}&nbsp; ${title}
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;padding:16px 20px">
        ${items.map(item => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-bottom:1px solid #f3f4f6">
            <span style="color:${color};font-size:14px;flex-shrink:0;margin-top:1px">✓</span>
            <span style="font-size:14px;color:#374151;line-height:1.5">${item}</span>
          </div>`).join("")}
      </div>
    </div>`;
}

function renderAlertEmail(
  greeting: string,
  camps: { camp: Record<string, unknown>; athleteName: string }[],
  multiAthlete: boolean,
): string {
  const campCount = camps.length;
  const firstCamp = camps[0]?.camp;
  const headline = campCount === 1
    ? `You're 7 days out from <strong>${firstCamp?.camp_name || "your camp"}</strong>`
    : `You have <strong>${campCount} camps</strong> coming up in 7 days`;

  const campCards = camps.map(({ camp, athleteName }) =>
    campCard(camp, athleteName, multiAthlete)
  ).join("");

  const whatToBring = checklistSection("What to Bring", "#22c55e", "🎒", [
    "Athletic shoes (cleats if applicable) — break them in before camp day",
    "Change of clothes and extra socks — you will sweat",
    "Water bottle — at least 32oz, refillable preferred",
    "Healthy snacks — granola bars, fruit, nuts for energy between sessions",
    "Sunscreen and hat if outdoor sessions are scheduled",
    "A small notepad or use your phone notes — write down coach feedback immediately after",
    "Any required medical forms, waivers, or registration confirmation email",
    "Insurance card if required by the camp paperwork",
  ]);

  const travelTips = checklistSection("Travel & Timing", "#3b82f6", "🚗", [
    "Map the venue tonight — know exactly where you're going and where to park",
    "Plan to arrive 20–30 minutes early — late arrivals get noticed (not in a good way)",
    "Check the camp itinerary for check-in time vs. start time — they are often different",
    "Get 8+ hours of sleep the night before — performance drops significantly with fatigue",
    "Eat a real meal 2–3 hours before you arrive, not a sugar spike right before",
    "Have a contact number for the camp in case of traffic or emergency",
    "If traveling overnight, confirm your hotel checkout time won't make you rush",
  ]);

  const coachEval = checklistSection("What Coaches Are Evaluating", "#b45309", "👁", [
    "<strong>Coachability</strong> — Do you listen, adjust, and apply corrections immediately?",
    "<strong>Effort level</strong> — Are you competing in every rep, or saving energy?",
    "<strong>Body language</strong> — Coaches watch how you react to mistakes and adversity",
    "<strong>Athleticism & measurables</strong> — Speed, size, explosiveness relative to peers",
    "<strong>Skill execution under pressure</strong> — Can you perform your skills in a competitive setting?",
    "<strong>Interaction with teammates</strong> — Recruiting is partly about finding good teammates",
    "<strong>How you handle downtime</strong> — Are you engaged and focused between sessions?",
    "<strong>The intangibles</strong> — Energy, confidence, and presence matter as much as physical tools",
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Camp Week Alert — uRecruitHQ</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;padding:28px 24px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb">
      <div style="font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#b45309;margin-bottom:6px">uRecruitHQ</div>
      <div style="font-size:26px;font-weight:700;color:#111827">Camp Week Alert</div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px">Your camp is 7 days away — time to prepare</div>
    </div>

    <!-- Greeting -->
    <div style="margin-bottom:24px;font-size:15px;color:#374151;line-height:1.6;background:#ffffff;padding:20px 24px;border-radius:8px;border:1px solid #e5e7eb">
      Hi ${greeting},<br><br>
      ${headline}. Here's everything you need to show up prepared, confident, and ready to perform.
    </div>

    <!-- Camp Details -->
    <div style="margin-bottom:28px">
      <div style="border-left:4px solid #b45309;padding:10px 14px;background:#f9fafb;border-radius:4px 4px 0 0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#111827;border:1px solid #e5e7eb;border-bottom:none">
        🏕️&nbsp; Your Upcoming ${campCount > 1 ? "Camps" : "Camp"}
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;padding:16px">
        ${campCards}
      </div>
    </div>

    ${whatToBring}
    ${travelTips}
    ${coachEval}

    <!-- Closing -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px 24px;margin-bottom:24px;font-size:14px;color:#374151;line-height:1.7">
      <strong style="color:#b45309">One last thing:</strong> Coaches remember the athletes who are prepared, present, and positive. Everything else — the measurables, the highlights — they can see on film. What they can't see on film is your character. Camp is your chance to show them.
      <br><br>
      Good luck. Go show them what you've got. 🏆
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:20px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.8">
      <p style="margin:0">You're receiving this because you have a registered camp on your uRecruitHQ calendar.</p>
      <p style="margin:8px 0 0">
        <a href="https://urecruithq.com/Account" style="color:#b45309;text-decoration:none">Manage preferences</a>
        &nbsp;·&nbsp;
        <a href="https://urecruithq.com/Account" style="color:#9ca3af;text-decoration:none">Unsubscribe</a>
        &nbsp;·&nbsp;
        <a href="https://urecruithq.com" style="color:#b45309;text-decoration:none">urecruithq.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { accountId: targetAccountId, mode = "dry_run", targetDate } = body;
  // mode: "preview" | "dry_run" | "send" | "list_subscribers"

  // Resolve the "7 days from now" date (or override for testing)
  const checkDate = targetDate
    ? new Date(targetDate + "T00:00:00Z")
    : (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 7); d.setUTCHours(0,0,0,0); return d; })();
  const checkDateStr = checkDate.toISOString().slice(0, 10);

  const RESEND_API_KEY = getResendKey();
  const FROM_EMAIL = getFromEmail();

  if (!RESEND_API_KEY && mode === "send") {
    return Response.json({ ok: false, error: "RESEND_API_KEY is not set." }, { status: 400 });
  }

  // ── Batch fetch ─────────────────────────────────────────────────────────
  const [rawAthletes, rawIntents, rawCamps, rawOptOuts] = await Promise.all([
    base44.asServiceRole.entities.AthleteProfile.filter({ active: true }).catch(() => []),
    base44.asServiceRole.entities.CampIntent.filter({}).catch(() => []),
    base44.asServiceRole.entities.Camp.filter({ active: true }).catch(() => []),
    base44.asServiceRole.entities.EmailPreferences.filter({ camp_week_alert_opt_out: true }).catch(() => []),
  ]);

  const athletes:  Record<string, unknown>[] = Array.isArray(rawAthletes) ? rawAthletes : [];
  const intents:   Record<string, unknown>[] = Array.isArray(rawIntents)  ? rawIntents  : [];
  const allCamps:  Record<string, unknown>[] = Array.isArray(rawCamps)    ? rawCamps    : [];

  const optedOutIds = new Set(
    (Array.isArray(rawOptOuts) ? rawOptOuts : []).map(p => p.account_id as string).filter(Boolean)
  );

  // Camps starting on the check date
  const alertCamps = allCamps.filter(c => {
    if (!c.start_date) return false;
    return (c.start_date as string).slice(0, 10) === checkDateStr;
  });
  const alertCampIds = new Set(alertCamps.map(c => c.id as string));
  const campById = new Map(allCamps.map(c => [c.id as string, c]));

  // Find registered intents for alert camps
  const registeredIntents = intents.filter(i =>
    (i.status === "registered" || i.status === "completed") &&
    alertCampIds.has(i.camp_id as string)
  );

  // Group by athlete then by account
  const athleteById = new Map(athletes.map(a => [a.id as string, a]));
  const athletesByAccount = new Map<string, Record<string, unknown>[]>();
  for (const a of athletes) {
    const aid = a.account_id as string;
    if (!aid) continue;
    if (!athletesByAccount.has(aid)) athletesByAccount.set(aid, []);
    athletesByAccount.get(aid)!.push(a);
  }

  // Build per-account camp list
  const accountCamps = new Map<string, { camp: Record<string, unknown>; athleteName: string }[]>();
  for (const intent of registeredIntents) {
    const athlete = athleteById.get(intent.athlete_id as string);
    if (!athlete) continue;
    const accountId = athlete.account_id as string;
    if (!accountId) continue;
    const camp = campById.get(intent.camp_id as string);
    if (!camp) continue;
    if (!accountCamps.has(accountId)) accountCamps.set(accountId, []);
    const athleteName = [athlete.first_name, athlete.last_name].filter(Boolean).join(" ");
    accountCamps.get(accountId)!.push({ camp, athleteName });
  }

  // Filter to target account for preview/send_one
  const targetAccounts = (mode === "preview" && targetAccountId)
    ? [targetAccountId]
    : [...accountCamps.keys()];

  // Preview with no camps
  if (mode === "preview" && targetAccounts.length === 0) {
    const placeholderCamp = { camp_name: "Example Camp", start_date: checkDateStr, city: "Columbus", state: "OH", division: "I" };
    const html = renderAlertEmail("there", [{ camp: placeholderCamp, athleteName: "" }], false);
    return Response.json({ ok: true, html, subject: "Camp Week Alert — uRecruitHQ", checkDate: checkDateStr });
  }

  const results: Record<string, unknown>[] = [];

  for (const accountId of targetAccounts) {
    const camps = accountCamps.get(accountId) || [];

    if (camps.length === 0) {
      results.push({ accountId, status: "skipped", reason: "no registered camps on this date" });
      continue;
    }

    // Enforce opt-out for sends
    if (mode === "send" && optedOutIds.has(accountId)) {
      results.push({ accountId, status: "skipped", reason: "opted out" });
      continue;
    }

    // Resolve greeting
    let greeting = "";
    const acctAthletes = athletesByAccount.get(accountId) || [];
    for (const a of acctAthletes) {
      const pf = (a.parent_first_name as string)?.trim();
      const pl = (a.parent_last_name as string)?.trim();
      const af = (a.first_name as string)?.trim();
      if (pf && pl) { greeting = `${pf} ${pl}`; break; }
      if (pf) { greeting = pf; break; }
      if (af) { greeting = `${af}'s Family`; break; }
    }
    if (!greeting) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ id: accountId });
        const u = Array.isArray(users) ? users[0] : null;
        greeting = (u?.full_name as string)?.trim() || (u?.email as string) || "uRecruitHQ Subscriber";
      } catch { greeting = "uRecruitHQ Subscriber"; }
    }

    const multiAthlete = acctAthletes.length > 1;
    const html = renderAlertEmail(greeting, camps, multiAthlete);
    const campNames = camps.map(c => c.camp.camp_name || "Camp").join(", ");
    const subject = camps.length === 1
      ? `Camp Week — ${campNames} is 7 days away`
      : `Camp Week — ${camps.length} camps coming up in 7 days`;

    if (mode === "preview") {
      return Response.json({ ok: true, html, subject, checkDate: checkDateStr, camps: camps.length });
    }

    if (mode === "dry_run") {
      results.push({ accountId, status: "dry_run", camps: camps.length, campNames });
      continue;
    }

    // Send
    let userEmail = "";
    try {
      const users = await base44.asServiceRole.entities.User.filter({ id: accountId });
      userEmail = Array.isArray(users) && users[0]?.email ? users[0].email as string : "";
    } catch {
      results.push({ accountId, status: "error", reason: "could not resolve email" });
      continue;
    }
    if (!userEmail) {
      results.push({ accountId, status: "skipped", reason: "no email found" });
      continue;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_EMAIL, to: userEmail, subject, html }),
      });
      const data = await res.json();
      if (res.ok) {
        results.push({ accountId, email: userEmail, status: "sent", camps: camps.length });
      } else {
        results.push({ accountId, email: userEmail, status: "error", reason: data?.message });
      }
    } catch (e) {
      results.push({ accountId, email: userEmail, status: "error", reason: (e as Error).message });
    }
  }

  const summary = {
    sent:    results.filter(r => r.status === "sent").length,
    dry_run: results.filter(r => r.status === "dry_run").length,
    skipped: results.filter(r => r.status === "skipped").length,
    errors:  results.filter(r => r.status === "error").length,
  };

  return Response.json({ ok: true, mode, checkDate: checkDateStr, summary, results });
});
