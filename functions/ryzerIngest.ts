// functions/ryzerIngest.js
// Base44 Backend Function (Deno runtime)
//
// Purpose:
// - Calls Ryzer eventSearch API server-side (avoids browser CORS + hides auth token in secret)
// - Optionally fetches each registration page server-side (HTML) and extracts lightweight sections
// - Returns { stats, accepted, rejected, errors, debug } to the client
//
// Required Base44 Secret:
// - RYZER_AUTH  (the JWT from DevTools request header "authorization")
//
// Optional Base44 Secret (only if Ryzer starts requiring cookies):
// - RYZER_COOKIE  (copy Cookie header from DevTools and paste as a secret)
//
// Client expects endpoint:
// - POST /functions/ryzerIngest
//
// Input JSON (from AdminImport.jsx):
// {
//   sportId: string,
//   sportName: string,
//   activityTypeId: string,         // GUID
//   recordsPerPage?: number,        // default 25
//   maxPages?: number,              // default 10
//   maxEvents?: number,             // default 200
//   dryRun?: boolean,               // default true
//   schools?: Array<{ id, school_name, state?, aliases?: string[] }>  // optional (but needed for school_id mapping)
// }

function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeString(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
}
function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function clampInt(n, min, max, dflt) {
  const v = safeNumber(n);
  if (v == null) return dflt;
  const i = Math.trunc(v);
  return Math.max(min, Math.min(max, i));
}
function isGuid(s) {
  const v = safeString(s);
  if (!v) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}
function json(resBody, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      "Content-Type": "application/json",
      // If Base44 functions are same-origin, CORS typically isn’t needed.
      // Add if you hit CORS issues:
      // "Access-Control-Allow-Origin": "*",
    },
  });
}

function stripHtml(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<\/(p|div|li|br|h1|h2|h3|h4|h5|h6)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/\s+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

// Try to extract “sections” from registration page in a lightweight way.
// This is intentionally heuristic (MVP). We’ll refine once we see consistent HTML patterns.
function extractSectionsFromHtml(html) {
  const text = stripHtml(html);
  if (!text) return null;

  const wanted = [
    { key: "when", labels: ["when", "dates", "date", "time"] },
    { key: "where", labels: ["where", "location", "address"] },
    { key: "what_to_bring", labels: ["what to bring", "bring", "equipment"] },
    { key: "what_to_expect", labels: ["what to expect", "expectations", "overview"] },
    { key: "who_can_attend", labels: ["who can attend", "eligibility", "grades", "age"] },
    { key: "refund_policy", labels: ["refund", "cancellation", "policy"] },
    { key: "contact", labels: ["contact", "questions"] },
  ];

  // Build a quick “heading → following content” extraction by scanning lines.
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const sections = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lc(lines[i]);

    for (const w of wanted) {
      const hit = w.labels.some((lab) => line === lab || line.startsWith(lab + ":") || line.includes(lab));
      if (!hit) continue;

      // Capture the next few lines as section content, stopping when another likely heading appears.
      const buf = [];
      for (let j = i + 1; j < Math.min(i + 1 + 12, lines.length); j++) {
        const nxt = lines[j].trim();
        if (!nxt) continue;

        const nxtLc = lc(nxt);
        const looksLikeHeading =
          nxt.length <= 40 &&
          wanted.some((ww) => ww.labels.some((lab) => nxtLc === lab || nxtLc.startsWith(lab + ":")));

        if (looksLikeHeading) break;

        buf.push(nxt);
      }

      const val = buf.join(" ").trim();
      if (val && !sections[w.key]) sections[w.key] = val;
    }
  }

  return Object.keys(sections).length ? sections : null;
}

function parseEventDatesFromAny(ev) {
  // Prefer API “eventDates” text if present.
  const raw =
    safeString(ev?.eventDates) ||
    safeString(ev?.event_dates) ||
    safeString(ev?.dates) ||
    safeString(ev?.dateText) ||
    null;

  if (!raw) return { event_dates_raw: null, start_date_guess: null };

  // Grab the first mm/dd/yyyy found.
  const m = raw.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  const startGuess = m ? m[1] : null;

  return { event_dates_raw: raw, start_date_guess: startGuess };
}

function buildSchoolIndex(schools) {
  // Build a fast lookup for school name and common alias patterns.
  // schools: [{ id, school_name, state?, aliases?: [] }]
  const idx = new Map(); // key -> school object

  for (const s of asArray(schools)) {
    const id = safeString(s?.id);
    const name = safeString(s?.school_name);
    if (!id || !name) continue;

    const base = lc(name);
    idx.set(base, { id, school_name: name, state: safeString(s?.state) || null });

    // common variant removals
    idx.set(lc(name.replace(/\b(university|college)\b/gi, "").replace(/\s+/g, " ").trim()), {
      id,
      school_name: name,
      state: safeString(s?.state) || null,
    });

    // aliases
    for (const a of asArray(s?.aliases)) {
      const al = safeString(a);
      if (al) idx.set(lc(al), { id, school_name: name, state: safeString(s?.state) || null });
    }
  }

  return idx;
}

function guessSchoolFromEvent(ev, schoolIndex) {
  if (!schoolIndex || !(schoolIndex instanceof Map) || schoolIndex.size === 0) {
    return { school: null, reason: "no_school_index" };
  }

  // Try a few common fields that might contain the host name.
  const candidates = [
    safeString(ev?.hostName),
    safeString(ev?.host),
    safeString(ev?.organizationName),
    safeString(ev?.accountName),
    safeString(ev?.eventHost),
    safeString(ev?.schoolName),
    safeString(ev?.university),
    safeString(ev?.college),
    safeString(ev?.programLabel), // sometimes includes school or program branding
    safeString(ev?.eventTitle),
    safeString(ev?.title),
  ].filter(Boolean);

  for (const c of candidates) {
    const key = lc(c);
    if (schoolIndex.has(key)) return { school: { school_id: schoolIndex.get(key).id, state: schoolIndex.get(key).state }, reason: "exact" };

    // try cleaning “University of …” / punctuation
    const cleaned = lc(
      c
        .replace(/[()|•]/g, " ")
        .replace(/\b(football|baseball|soccer|softball|basketball|volleyball)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (cleaned && schoolIndex.has(cleaned)) {
      return { school: { school_id: schoolIndex.get(cleaned).id, state: schoolIndex.get(cleaned).state }, reason: "cleaned" };
    }
  }

  return { school: null, reason: "unmatched" };
}

function normalizeRyzerSearchRow(row) {
  // Return a consistent event object even if Ryzer changes field names.
  const eventTitle =
    safeString(row?.eventTitle) ||
    safeString(row?.title) ||
    safeString(row?.eventName) ||
    safeString(row?.name) ||
    safeString(row?.programName) ||
    null;

  const registrationUrl =
    safeString(row?.registrationUrl) ||
    safeString(row?.registrationURL) ||
    safeString(row?.registerUrl) ||
    safeString(row?.url) ||
    safeString(row?.linkUrl) ||
    safeString(row?.link_url) ||
    null;

  const locationText =
    safeString(row?.locationText) ||
    safeString(row?.location) ||
    safeString(row?.cityState) ||
    safeString(row?.city) ||
    null;

  const eventDates =
    safeString(row?.eventDates) ||
    safeString(row?.dates) ||
    safeString(row?.dateText) ||
    null;

  const grades =
    safeString(row?.grades) ||
    safeString(row?.gradeText) ||
    safeString(row?.eligibility) ||
    null;

  const registerBy =
    safeString(row?.registerBy) ||
    safeString(row?.registrationDeadline) ||
    safeString(row?.deadline) ||
    null;

  const priceOptions = asArray(row?.priceOptions || row?.prices || row?.priceOptionList || null);

  return {
    raw: row,
    eventTitle,
    registrationUrl,
    locationText,
    eventDates,
    grades,
    registerBy,
    priceOptions,
    // keep a few ids if present
    eventId: safeString(row?.eventId || row?.id || row?.event_id),
    programLabel: safeString(row?.programLabel || row?.program || row?.seriesName || row?.groupName),
    hostName: safeString(row?.hostName || row?.organizationName || row?.accountName),
  };
}

async function ryzerEventSearch({ auth, cookie, activityTypeId, page, recordsPerPage, proximity = "10000" }) {
  const url = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

  const payload = {
    Page: page,
    RecordsPerPage: recordsPerPage,
    SoldOut: 0,
    ActivityTypes: [activityTypeId],
    Proximity: String(proximity),
    // Hosted by: College/University (captured from DevTools as accountTypeList)
    accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"],
  };

  const headers = {
    Accept: "*/*",
    "Content-Type": "application/json; charset=UTF-8",
    Origin: "https://ryzer.com",
    Referer: "https://ryzer.com/Events/?tab=eventSearch",
    authorization: auth,
  };

  if (cookie) headers.Cookie = cookie;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data, textHead: (text || "").slice(0, 500) };
}

async function fetchRegistrationPage({ url }) {
  if (!url) return { ok: false, status: 0, html: null };

  // Keep headers “browser-like” but minimal.
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; Base44Function/1.0)",
    },
  });

  const html = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, html };
}

Deno.serve(async (req) => {
  // Basic method gate
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // Read raw body for visibility + robust parsing
  const raw = await req.text();
  const rawLen = raw?.length || 0;

  let input = null;
  try {
    input = raw ? JSON.parse(raw) : null;
  } catch {
    return json(
      { ok: false, error: "bad_json", raw_head: (raw || "").slice(0, 250) },
      400
    );
  }

  const sportId = safeString(input?.sportId);
  const sportName = safeString(input?.sportName) || "";
  const activityTypeId = safeString(input?.activityTypeId);
  const dryRun = !!input?.dryRun;

  const recordsPerPage = clampInt(input?.recordsPerPage, 5, 100, 25);
  const maxPages = clampInt(input?.maxPages, 1, 200, 10);
  const maxEvents = clampInt(input?.maxEvents, 1, 5000, 200);

  const schools = asArray(input?.schools);

  // Auth from secrets
  const auth = Deno.env.get("RYZER_AUTH");
  const cookie = Deno.env.get("RYZER_COOKIE") || null;

  if (!sportId) return json({ ok: false, error: "missing_sportId" }, 400);
  if (!isGuid(activityTypeId)) return json({ ok: false, error: "missing_or_invalid_activityTypeId" }, 400);
  if (!auth) {
    return json(
      { ok: false, error: "missing_secret_RYZER_AUTH", hint: "Add Base44 secret RYZER_AUTH = authorization JWT from DevTools." },
      500
    );
  }

  // Build school index (optional)
  const schoolIndex = buildSchoolIndex(schools);

  const stats = {
    pages_attempted: 0,
    events_seen: 0,
    accepted: 0,
    rejected: 0,
    errors: 0,
    registration_pages_fetched: 0,
  };

  const accepted = [];
  const rejected = [];
  const errors = [];

  // Debug summary (safe; no secrets)
  const debug = {
    raw_input_len: rawLen,
    input_keys: Object.keys(input || {}),
    sportId,
    sportName,
    activityTypeId,
    recordsPerPage,
    maxPages,
    maxEvents,
    dryRun,
    schools_count: schools.length,
    school_index_size: schoolIndex.size,
    has_cookie_secret: !!cookie,
  };

  // Iterate pages until maxPages or maxEvents reached
  for (let page = 0; page < maxPages; page++) {
    if (stats.events_seen >= maxEvents) break;

    stats.pages_attempted += 1;

    const api = await ryzerEventSearch({
      auth,
      cookie,
      activityTypeId,
      page,
      recordsPerPage,
      proximity: "10000",
    });

    if (!api.ok) {
      stats.errors += 1;
      errors.push({
        type: "eventSearch_http_error",
        status: api.status,
        page,
        textHead: api.textHead,
      });

      // If auth is invalid, stop early to avoid hammering.
      if (api.status === 401 || api.status === 403) break;
      continue;
    }

    // Ryzer responses can vary; attempt to find the list.
    const data = api.data || {};
    const list =
      asArray(data?.Events) ||
      asArray(data?.events) ||
      asArray(data?.Records) ||
      asArray(data?.records) ||
      asArray(data?.Data) ||
      asArray(data?.data) ||
      [];

    if (!list.length) {
      // No more results; stop paging
      break;
    }

    for (const row of list) {
      if (stats.events_seen >= maxEvents) break;
      stats.events_seen += 1;

      try {
        const ev = normalizeRyzerSearchRow(row);

        // Require a usable title and url for the MVP
        const title = safeString(ev.eventTitle) || "Camp";
        const regUrl = safeString(ev.registrationUrl);

        // School mapping (needs schools list to return school_id)
        const schoolGuess = guessSchoolFromEvent(ev, schoolIndex);

        if (!schoolGuess.school) {
          stats.rejected += 1;
          rejected.push({
            reason: schools.length ? `school_unmatched:${schoolGuess.reason}` : "school_unmatched_no_schools_list",
            event: {
              eventTitle: title,
              registrationUrl: regUrl,
              locationText: safeString(ev.locationText),
              eventDates: safeString(ev.eventDates),
              hostName: safeString(ev.hostName),
              programLabel: safeString(ev.programLabel),
            },
          });
          continue;
        }

        // Fetch registration page (best-effort)
        let sections = null;
        let registrationHtmlStatus = null;

        if (regUrl) {
          const pg = await fetchRegistrationPage({ url: regUrl });
          registrationHtmlStatus = pg.status;
          if (pg.ok && pg.html) {
            stats.registration_pages_fetched += 1;
            sections = extractSectionsFromHtml(pg.html);
          }
        }

        // Provide raw date text and a start_date_guess (client can refine)
        const { event_dates_raw, start_date_guess } = parseEventDatesFromAny(ev);

        // Build accepted item shaped for your AdminImport.jsx writer
        // (keep the “event” object stable)
        accepted.push({
          school: {
            school_id: schoolGuess.school.school_id,
            state: schoolGuess.school.state || null,
            match_reason: schoolGuess.reason,
          },
          event: {
            eventTitle: title,
            registrationUrl: regUrl,
            locationText: safeString(ev.locationText),
            eventDates: event_dates_raw || safeString(ev.eventDates) || null,
            grades: safeString(ev.grades) || null,
            registerBy: safeString(ev.registerBy) || null,
            priceOptions: asArray(ev.priceOptions),
            programLabel: safeString(ev.programLabel) || null,
            hostName: safeString(ev.hostName) || null,
            startDateGuess: start_date_guess, // mm/dd/yyyy string (best-effort)
            sections: sections || null,
            registrationHtmlStatus: registrationHtmlStatus,
          },
        });

        stats.accepted += 1;
      } catch (e) {
        stats.errors += 1;
        errors.push({ type: "row_parse_error", message: String(e?.message || e) });
      }
    }
  }

  return json({
    ok: true,
    stats,
    accepted,
    rejected,
    errors,
    debug,
  });
});
