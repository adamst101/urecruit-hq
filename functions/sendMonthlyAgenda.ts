import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const RESEND_API_KEY = Deno.env.get("re_MaNmjhJP_88dcmxXVxoCYj16kSTBYANcmI_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "agenda@urecruithq.com";
const NEARBY_RADIUS_MILES = 50;
const NEARBY_MAX = 10;

// ── Haversine (miles) ──────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── City coords (ported from useCityCoords.jsx) ────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  "new york:NY":[40.71,-74.01],"los angeles:CA":[34.05,-118.24],"chicago:IL":[41.88,-87.63],
  "houston:TX":[29.76,-95.37],"phoenix:AZ":[33.45,-112.07],"philadelphia:PA":[39.95,-75.17],
  "san antonio:TX":[29.42,-98.49],"san diego:CA":[32.72,-117.16],"dallas:TX":[32.78,-96.80],
  "columbus:OH":[39.96,-83.00],"charlotte:NC":[35.23,-80.84],"indianapolis:IN":[39.77,-86.16],
  "seattle:WA":[47.61,-122.33],"denver:CO":[39.74,-104.99],"washington:DC":[38.91,-77.04],
  "nashville:TN":[36.16,-86.78],"boston:MA":[42.36,-71.06],"las vegas:NV":[36.17,-115.14],
  "memphis:TN":[35.15,-90.05],"louisville:KY":[38.25,-85.76],"baltimore:MD":[39.29,-76.61],
  "milwaukee:WI":[43.04,-87.91],"kansas city:MO":[39.10,-94.58],"atlanta:GA":[33.75,-84.39],
  "omaha:NE":[41.26,-95.94],"raleigh:NC":[35.78,-78.64],"miami:FL":[25.76,-80.19],
  "minneapolis:MN":[44.98,-93.27],"cleveland:OH":[41.50,-81.69],"pittsburgh:PA":[40.44,-80.00],
  "cincinnati:OH":[39.10,-84.51],"lincoln:NE":[40.81,-96.70],"buffalo:NY":[42.89,-78.88],
  "orlando:FL":[28.54,-81.38],"madison:WI":[43.07,-89.40],"st. louis:MO":[38.63,-90.20],
  "detroit:MI":[42.33,-83.05],"baton rouge:LA":[30.45,-91.19],"lexington:KY":[38.04,-84.50],
  "knoxville:TN":[35.96,-83.92],"salt lake city:UT":[40.76,-111.89],"richmond:VA":[37.54,-77.44],
  "boise:ID":[43.62,-116.21],"birmingham:AL":[33.52,-86.80],"rochester:NY":[43.16,-77.62],
  "durham:NC":[35.99,-78.90],"greensboro:NC":[36.07,-79.79],"spokane:WA":[47.66,-117.43],
  "des moines:IA":[41.59,-93.62],"jackson:MS":[32.30,-90.18],"columbia:SC":[34.00,-81.03],
  "charleston:WV":[38.35,-81.63],"huntington:WV":[38.42,-82.44],"fort wayne:IN":[41.08,-85.14],
  "toledo:OH":[41.65,-83.54],"akron:OH":[41.08,-81.52],"dayton:OH":[39.76,-84.19],
  "grand rapids:MI":[42.96,-85.66],"ann arbor:MI":[42.28,-83.74],"east lansing:MI":[42.74,-84.48],
  "madison:WI":[43.07,-89.40],"green bay:WI":[44.52,-88.02],
  // College towns
  "tuscaloosa:AL":[33.21,-87.57],"auburn:AL":[32.61,-85.48],"clemson:SC":[34.68,-82.84],
  "state college:PA":[40.79,-77.86],"ames:IA":[42.03,-93.62],"lawrence:KS":[38.97,-95.24],
  "stillwater:OK":[36.12,-97.06],"starkville:MS":[33.45,-88.82],"norman:OK":[35.22,-97.44],
  "college station:TX":[30.63,-96.33],"fargo:ND":[46.88,-96.79],"athens:GA":[33.96,-83.38],
  "morgantown:WV":[39.63,-79.96],"blacksburg:VA":[37.23,-80.41],"charlottesville:VA":[38.03,-78.48],
  "champaign:IL":[40.12,-88.24],"bloomington:IN":[39.17,-86.53],"iowa city:IA":[41.66,-91.53],
  "boulder:CO":[40.01,-105.27],"waco:TX":[31.55,-97.15],"denton:TX":[33.21,-97.13],
  "lubbock:TX":[33.58,-101.85],"tallahassee:FL":[30.44,-84.28],"gainesville:FL":[29.65,-82.32],
  "oxford:MS":[34.37,-89.52],"jonesboro:AR":[35.84,-90.70],"fayetteville:AR":[36.06,-94.16],
  "provo:UT":[40.23,-111.66],"laramie:WY":[41.31,-105.59],"corvallis:OR":[44.56,-123.26],
  "eugene:OR":[44.05,-123.09],"pullman:WA":[46.73,-117.17],"missoula:MT":[46.87,-114.00],
  "west lafayette:IN":[40.43,-86.91],"terre haute:IN":[39.47,-87.41],"muncie:IN":[40.19,-85.39],
  "carbondale:IL":[37.73,-89.22],"dekalb:IL":[41.93,-88.75],"murfreesboro:TN":[35.85,-86.39],
  "bowling green:KY":[36.99,-86.44],"richmond:KY":[37.75,-84.29],"hattiesburg:MS":[31.33,-89.29],
  "boone:NC":[36.22,-81.67],"greenville:NC":[35.61,-77.37],"harrisonburg:VA":[38.45,-78.87],
  "williamsburg:VA":[37.27,-76.71],"kalamazoo:MI":[42.29,-85.59],"ypsilanti:MI":[42.24,-83.61],
  "mount pleasant:MI":[43.60,-84.77],"marquette:MI":[46.54,-87.40],
  "la crosse:WI":[43.81,-91.24],"eau claire:WI":[44.81,-91.50],"whitewater:WI":[42.83,-88.73],
  "brookings:SD":[44.31,-96.80],"vermillion:SD":[42.78,-96.93],"sioux falls:SD":[43.55,-96.73],
  "grand forks:ND":[47.93,-97.03],"minot:ND":[48.23,-101.30],
  "duluth:MN":[46.79,-92.10],"mankato:MN":[44.17,-94.00],"moorhead:MN":[46.87,-96.77],
  "columbia:MO":[38.95,-92.33],"springfield:MO":[37.22,-93.29],"cape girardeau:MO":[37.31,-89.52],
  "emporia:KS":[38.40,-96.18],"manhattan:KS":[39.18,-96.57],"pittsburg:KS":[37.41,-94.70],
  "edmond:OK":[35.65,-97.48],"weatherford:OK":[35.53,-98.71],"durant:OK":[33.99,-96.39],
  "conway:AR":[35.09,-92.44],"russellville:AR":[35.28,-93.13],
  "ruston:LA":[32.52,-92.64],"lafayette:LA":[30.22,-92.02],"hammond:LA":[30.50,-90.46],
  "natchitoches:LA":[31.76,-93.09],"monroe:LA":[32.51,-92.12],
  "valdosta:GA":[30.83,-83.28],"statesboro:GA":[32.45,-81.78],"kennesaw:GA":[34.02,-84.62],
  "savannah:GA":[32.08,-81.10],"chattanooga:TN":[35.05,-85.31],
  "pensacola:FL":[30.44,-87.22],"lakeland:FL":[28.04,-81.95],"boca raton:FL":[26.37,-80.13],
  "johnson city:TN":[36.31,-82.35],"clarksville:TN":[36.53,-87.36],"cookeville:TN":[36.16,-85.50],
  "florence:AL":[34.80,-87.68],"huntsville:AL":[34.73,-86.59],"troy:AL":[31.81,-85.97],
  "lynchburg:VA":[37.41,-79.14],"radford:VA":[37.13,-80.58],"farmville:VA":[37.30,-78.40],
  "burlington:VT":[44.48,-73.21],"amherst:MA":[42.38,-72.52],"new haven:CT":[41.31,-72.92],
  "storrs:CT":[41.81,-72.25],"princeton:NJ":[40.35,-74.66],"new brunswick:NJ":[40.49,-74.45],
  "ithaca:NY":[42.44,-76.50],"syracuse:NY":[43.05,-76.15],"albany:NY":[42.65,-73.75],
  "bethlehem:PA":[40.63,-75.37],"harrisburg:PA":[40.27,-76.88],"scranton:PA":[41.41,-75.66],
  "kearney:NE":[40.70,-99.08],"wayne:NE":[42.23,-97.02],
  "cheney:WA":[47.49,-117.58],"ellensburg:WA":[46.99,-120.55],
  "flagstaff:AZ":[35.20,-111.65],"tempe:AZ":[33.43,-111.94],
  "cedar falls:IA":[42.53,-92.45],"storm lake:IA":[42.64,-95.21],
  "san marcos:TX":[29.88,-97.94],"nacogdoches:TX":[31.60,-94.66],"stephenville:TX":[32.22,-98.20],
};

function getCityCoords(city: string, state: string): { lat: number; lng: number } | null {
  if (!city || !state) return null;
  const key = `${city.trim().toLowerCase()}:${state.trim().toUpperCase()}`;
  const c = CITY_COORDS[key];
  return c ? { lat: c[0], lng: c[1] } : null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getMonthRange(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end:   new Date(Date.UTC(year, month,     1)),
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatPrice(camp: Record<string, unknown>): string {
  if (camp.price === 0 || camp.price === "0") return "Free";
  if (!camp.price) return "";
  const lo = Number(camp.price);
  const hi = camp.price_max ? Number(camp.price_max) : 0;
  if (hi > lo) return `$${lo}–$${hi}`;
  return `$${lo}`;
}

function divLabel(div: string): string {
  const map: Record<string, string> = { I: "D1", II: "D2", III: "D3", NAIA: "NAIA", JUCO: "JUCO" };
  return map[div] || div || "";
}

// ── Email HTML ─────────────────────────────────────────────────────────────
function campRows(camps: Record<string, unknown>[], showAthlete: boolean): string {
  return camps.map(c => {
    const loc = [c.city, c.state].filter(Boolean).join(", ");
    const athlete = showAthlete && c._athleteName
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:10px;background:#1f2937;color:#9ca3af;font-size:11px;margin-left:6px">${c._athleteName}</span>`
      : "";
    return `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 12px;color:#9ca3af;font-size:13px;white-space:nowrap;vertical-align:top">${formatDate(c.start_date as string)}</td>
        <td style="padding:10px 12px;vertical-align:top">
          <span style="font-size:14px;font-weight:600;color:#f9fafb">${c.camp_name || "Camp"}</span>${athlete}
        </td>
        <td style="padding:10px 12px;color:#9ca3af;font-size:13px;white-space:nowrap;vertical-align:top">${divLabel(c.division as string)}</td>
        <td style="padding:10px 12px;color:#9ca3af;font-size:13px;vertical-align:top">${loc}</td>
        <td style="padding:10px 12px;color:#e8a020;font-size:13px;white-space:nowrap;vertical-align:top;text-align:right">${formatPrice(c)}</td>
      </tr>`;
  }).join("");
}

function section(icon: string, title: string, borderColor: string, camps: Record<string, unknown>[], showAthlete: boolean): string {
  if (!camps.length) return "";
  return `
    <div style="margin-bottom:28px">
      <div style="border-left:4px solid ${borderColor};padding:10px 14px;background:#111827;border-radius:4px;margin-bottom:0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#f9fafb">
        ${icon}&nbsp; ${title}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0d1117;border:1px solid #1f2937;border-top:none;border-radius:0 0 6px 6px">
        <tbody>${campRows(camps, showAthlete)}</tbody>
      </table>
    </div>`;
}

function renderEmail(
  monthLabel: string,
  registered: Record<string, unknown>[],
  watchlist: Record<string, unknown>[],
  nearby: Record<string, unknown>[],
  homeState: string,
  multiAthlete: boolean,
): string {
  const body =
    section("✅", "Camps You're Registered For", "#22c55e", registered, multiAthlete) +
    section("⭐", "Camps on Your Watchlist", "#e8a020", watchlist, multiAthlete) +
    section("📍", `Also Happening Near You${homeState ? ` · ${homeState}` : ""}`, "#3b82f6", nearby, false);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${monthLabel} Camp Agenda</title>
  <style>
    @media print {
      body { background:#fff !important; color:#000 !important; }
      a { color:#000 !important; }
    }
    @media (max-width:600px) {
      .hide-mobile { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:Arial,sans-serif;color:#f9fafb">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #1f2937">
      <div style="font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#e8a020;margin-bottom:6px">uRecruitHQ</div>
      <div style="font-size:26px;font-weight:700;color:#f9fafb">${monthLabel} Camp Agenda</div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px">Your personalized monthly camp calendar</div>
    </div>

    ${body || '<p style="color:#6b7280;text-align:center;padding:32px 0">No camps found for this month. Check back soon — we update every Monday.</p>'}

    <!-- Footer -->
    <div style="border-top:1px solid #1f2937;margin-top:16px;padding-top:20px;text-align:center;font-size:12px;color:#6b7280;line-height:1.8">
      <p style="margin:0">You're receiving this because you have an active uRecruitHQ subscription.</p>
      <p style="margin:8px 0 0">
        <a href="https://urecruithq.com/Account" style="color:#e8a020;text-decoration:none">Manage preferences</a>
        &nbsp;·&nbsp;
        <a href="https://urecruithq.com" style="color:#e8a020;text-decoration:none">urecruithq.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const body = await req.json().catch(() => ({}));
  const { month, accountId: targetAccountId, mode = "dry_run" } = body;
  // mode: "preview" | "dry_run" | "send_one" | "send_all"

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ ok: false, error: "month required in YYYY-MM format" }, { status: 400 });
  }

  const { start, end } = getMonthRange(month);
  const monthLabel = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  // ── Batch fetch shared data ──────────────────────────────────────────────
  const [rawEntitlements, rawAthletes, rawIntents, rawCamps] = await Promise.all([
    base44.asServiceRole.entities.Entitlement.filter({ status: "active" }).catch(() => []),
    base44.asServiceRole.entities.AthleteProfile.filter({ active: true }).catch(() => []),
    base44.asServiceRole.entities.CampIntent.filter({}).catch(() => []),
    base44.asServiceRole.entities.Camp.filter({ active: true }).catch(() => []),
  ]);

  const entitlements: Record<string, unknown>[] = Array.isArray(rawEntitlements) ? rawEntitlements : [];
  const athletes:     Record<string, unknown>[] = Array.isArray(rawAthletes)     ? rawAthletes     : [];
  const intents:      Record<string, unknown>[] = Array.isArray(rawIntents)      ? rawIntents      : [];
  const allCamps:     Record<string, unknown>[] = Array.isArray(rawCamps)        ? rawCamps        : [];

  // Month's camps only
  const monthCamps = allCamps.filter(c => {
    if (!c.start_date) return false;
    const d = new Date(c.start_date as string);
    return d >= start && d < end;
  });

  // Index structures
  const campById  = new Map(allCamps.map(c => [c.id, c]));
  const campByKey = new Map(allCamps.filter(c => c.event_key).map(c => [c.event_key, c]));

  const athletesByAccount = new Map<string, Record<string, unknown>[]>();
  for (const a of athletes) {
    const aid = a.account_id as string;
    if (!aid) continue;
    if (!athletesByAccount.has(aid)) athletesByAccount.set(aid, []);
    athletesByAccount.get(aid)!.push(a);
  }

  const intentsByAthlete = new Map<string, Record<string, unknown>[]>();
  for (const i of intents) {
    const aid = i.athlete_id as string;
    if (!aid) continue;
    if (!intentsByAthlete.has(aid)) intentsByAthlete.set(aid, []);
    intentsByAthlete.get(aid)!.push(i);
  }

  // Deduplicate entitlements by account (one per account)
  const accountsSeen = new Set<string>();
  const uniqueEntitlements = entitlements.filter(e => {
    const id = e.account_id as string;
    if (!id || accountsSeen.has(id)) return false;
    accountsSeen.add(id);
    return true;
  });

  // Filter to target account for preview/send_one
  const targets = (mode === "preview" || mode === "send_one") && targetAccountId
    ? uniqueEntitlements.filter(e => e.account_id === targetAccountId)
    : uniqueEntitlements;

  const results: Record<string, unknown>[] = [];

  for (const ent of targets) {
    const accountId = ent.account_id as string;
    const accountAthletes = athletesByAccount.get(accountId) || [];
    if (!accountAthletes.length) continue;

    // Resolve home coords from first athlete that has them
    let homeCoords: { lat: number; lng: number } | null = null;
    let homeState = "";
    for (const a of accountAthletes) {
      const coords = (a.home_lat && a.home_lng)
        ? { lat: Number(a.home_lat), lng: Number(a.home_lng) }
        : getCityCoords(a.home_city as string, a.home_state as string);
      if (coords) { homeCoords = coords; homeState = (a.home_state as string) || ""; break; }
    }

    // Collect all intents for this account's athletes
    const registered: Record<string, unknown>[] = [];
    const watchlist:  Record<string, unknown>[] = [];

    for (const athlete of accountAthletes) {
      const athleteIntents = intentsByAthlete.get(athlete.id as string) || [];
      const athleteName = [athlete.first_name, athlete.last_name].filter(Boolean).join(" ");

      for (const intent of athleteIntents) {
        const camp = campById.get(intent.camp_id as string) || campByKey.get(intent.event_key as string);
        if (!camp || !camp.start_date) continue;
        const d = new Date(camp.start_date as string);
        if (d < start || d >= end) continue;

        const enriched = { ...camp, _athleteName: athleteName };
        const status = intent.status as string;
        if (status === "registered" || status === "completed") {
          registered.push(enriched);
        } else if (status === "favorite") {
          watchlist.push(enriched);
        }
      }
    }

    // Sort by date
    const byDate = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(a.start_date as string).getTime() - new Date(b.start_date as string).getTime();
    registered.sort(byDate);
    watchlist.sort(byDate);

    // Nearby camps (not registered or watchlisted)
    let nearby: Record<string, unknown>[] = [];
    if (homeCoords) {
      const interactedIds = new Set([
        ...registered.map(c => c.id),
        ...watchlist.map(c => c.id),
      ]);
      for (const c of monthCamps) {
        if (interactedIds.has(c.id)) continue;
        const coords = getCityCoords(c.city as string, c.state as string);
        if (!coords) continue;
        const dist = haversine(homeCoords.lat, homeCoords.lng, coords.lat, coords.lng);
        if (dist <= NEARBY_RADIUS_MILES) {
          nearby.push({ ...c, _dist: dist });
        }
      }
      nearby.sort(byDate);
      nearby = nearby.slice(0, NEARBY_MAX);
    }

    if (!registered.length && !watchlist.length && !nearby.length) {
      results.push({ accountId, status: "skipped", reason: "no camps this month" });
      continue;
    }

    const multiAthlete = accountAthletes.length > 1;
    const html = renderEmail(monthLabel, registered, watchlist, nearby, homeState, multiAthlete);
    const subject = `Your ${monthLabel} Camp Agenda — uRecruitHQ`;

    // Preview mode — return HTML directly
    if (mode === "preview") {
      return Response.json({
        ok: true,
        html,
        subject,
        registered: registered.length,
        watchlist: watchlist.length,
        nearby: nearby.length,
      });
    }

    if (mode === "dry_run") {
      results.push({ accountId, status: "dry_run", registered: registered.length, watchlist: watchlist.length, nearby: nearby.length });
      continue;
    }

    // Get user email for send modes
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

    // Send via Resend
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM_EMAIL, to: userEmail, subject, html }),
      });
      const data = await res.json();
      if (res.ok) {
        results.push({ accountId, email: userEmail, status: "sent", registered: registered.length, watchlist: watchlist.length, nearby: nearby.length });
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

  return Response.json({ ok: true, month, monthLabel, mode, summary, results });
});
