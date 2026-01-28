// functions/ryzerIngest.js
// Base44 Backend Function (Deno runtime)
//
// Purpose:
// - Call Ryzer eventSearch API by sport/activityTypeId (paged)
// - For each returned event, locate a registration URL (or best-effort derive)
// - Fetch the registration page HTML server-side (avoids CORS)
// - Parse details: programLabel, eventTitle, location, eventDates, grades, registerBy, priceOptions, sections
// - Fail-closed: match to School registry passed in from AdminImport (college-only gate)
//
// NOTE: Do NOT hardcode auth tokens. Use secret env var RYZER_AUTH.

import * as cheerio from "npm:cheerio@1.0.0-rc.12";

const RYZER_SEARCH_URL = "https://ryzer.com/rest/controller/connect/event/eventSearch/";
const USER_AGENT = "URecruitHQ/1.0 (Ryzer ingestion)";
const DEFAULT_TIMEOUT_MS = 30000;

// Hosted By: College/University (from your captured payload)
const DEFAULT_COLLEGE_ACCOUNT_TYPE_ID = "A7FA36E0-87BE-4750-9DE3-CB60DE133648";

const SECTION_KEYS = [
  "WHERE",
  "WHAT TO BRING",
  "WHAT TO EXPECT",
  "NOTE",
  "ABOUT",
  "QUESTIONS",
];

function json(res, status = 200) {
  return new Response(JSON.stringify(res, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeString(x) {
  if (x == null) return "";
  return String(x).trim();
}

function extractStateFromLocation(locationText) {
  const m = (locationText || "").match(/,\s*([A-Z]{2})\b/);
  return m ? m[1] : "";
}

function stripSportAndCampWords(programLabel) {
  let s = (programLabel || "").trim();

  const parts = s.split(/\s[-–—]\s/);
  if (parts.length > 1) s = parts[0].trim();

  s = s
    .replace(/\b(camps?|camp)\b/gi, "")
    .replace(
      /\b(football|baseball|softball|soccer|basketball|volleyball|lacrosse|tennis|golf|swimming|wrestling|track|field|cheer|dance)\b/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();

  return s;
}

/**
 * Match School: FAIL CLOSED.
 * schools[] must include: { id, school_name, state?, aliases?[] }
 * Returns: { school_id, school_name, state } or null
 */
function matchSchool({ programLabel, locationText }, schools) {
  const state = extractStateFromLocation(locationText);
  const candidate = stripSportAndCampWords(programLabel);
  const candNorm = norm(candidate);
  if (!candNorm) return null;

  const prepared = safeArray(schools).map((s) => ({
    id: safeString(s?.id),
    name: safeString(s?.school_name || s?.name),
    state: safeString(s?.state).toUpperCase(),
    aliases: safeArray(s?.aliases).map((a) => safeString(a)),
    _nameNorm: norm(s?.school_name || s?.name),
    _aliasesNorm: safeArray(s?.aliases).map((a) => norm(a)),
  })).filter((s) => !!s.id && !!s.name);

  // Exact match (name/alias)
  let hits = prepared.filter(
    (s) => s._nameNorm === candNorm || s._aliasesNorm.includes(candNorm)
  );

  if (hits.length > 1 && state) {
    const stateHits = hits.filter((h) => h.state === state);
    if (stateHits.length === 1) return pick(stateHits[0]);
    if (stateHits.length > 1) hits = stateHits;
  }

  if (hits.length === 1) return pick(hits[0]);

  // Conservative contains match WITH state anchor (fail closed if no state)
  const containsHits = prepared.filter((s) => {
    const nameOk = s._nameNorm.includes(candNorm) || candNorm.includes(s._nameNorm);
    const aliasOk = s._aliasesNorm.some((a) => a.includes(candNorm) || candNorm.includes(a));
    if (!(nameOk || aliasOk)) return false;
    if (state) return s.state === state;
    return false;
  });

  if (containsHits.length === 1) return pick(containsHits[0]);

  return null;

  function pick(s) {
    return { school_id: s.id, school_name: s.name, state: s.state || "" };
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Ryzer Search API call
 */
async function ryzerSearchPage({ page, recordsPerPage, activityTypeId, collegeAccountTypeId }) {
  const auth = Deno.env.get("RYZER_AUTH") || "";

  const payload = {
    Page: page,
    RecordsPerPage: recordsPerPage,
    SoldOut: 0,
    ActivityTypes: [activityTypeId],
    Proximity: "10000",
    accountTypeList: [collegeAccountTypeId || DEFAULT_COLLEGE_ACCOUNT_TYPE_ID],
  };

  const headers = {
    "Accept": "*/*",
    "Content-Type": "application/json; charset=UTF-8",
    "User-Agent": USER_AGENT,
    "Origin": "https://ryzer.com",
    "Referer": "https://ryzer.com/Events/?tab=eventSearch",
  };

  // Add auth only if provided
  if (auth) headers["authorization"] = auth;

  const res = await fetchWithTimeout(RYZER_SEARCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  return { ok: res.ok, status: res.status, data, rawText: text, payload };
}

/**
 * Find event rows from unknown JSON shape (defensive)
 */
function extractEventRows(searchJson) {
  if (!searchJson || typeof searchJson !== "object") return [];

  // common patterns
  const candidates = [
    searchJson?.records,
    searchJson?.Records,
    searchJson?.data?.records,
    searchJson?.data?.Records,
    searchJson?.data?.results,
    searchJson?.data?.Results,
    searchJson?.results,
    searchJson?.Results,
    searchJson?.Items,
    searchJson?.items,
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.length && typeof c[0] === "object") return c;
  }

  // fallback: scan one level deep for first array of objects
  for (const k of Object.keys(searchJson)) {
    const v = searchJson[k];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
    if (v && typeof v === "object") {
      for (const kk of Object.keys(v)) {
        const vv = v[kk];
        if (Array.isArray(vv) && vv.length && typeof vv[0] === "object") return vv;
      }
    }
  }

  return [];
}

/**
 * Try to locate a registration URL in an event row.
 */
function extractRegistrationUrlFromRow(row) {
  const urlCandidates = [];

  // Scan string fields for anything URL-like
  for (const [k, v] of Object.entries(row || {})) {
    if (typeof v === "string" && v.startsWith("http")) urlCandidates.push(v);
    if (typeof v === "string" && v.includes("ryzer.com") && v.includes("camp.cfm?id=")) urlCandidates.push(v);
    if (typeof v === "string" && v.includes("register.ryzer.com")) urlCandidates.push(v);
  }

  // Prefer registration domains
  const pick =
    urlCandidates.find((u) => u.includes("register.ryzer.com")) ||
    urlCandidates.find((u) => u.includes("camp.cfm?id=")) ||
    urlCandidates[0] ||
    "";

  return pick;
}

function extractEventLabelFields(row) {
  // best-effort names
  const eventTitle =
    safeString(row?.EventName) ||
    safeString(row?.event_name) ||
    safeString(row?.Name) ||
    safeString(row?.name) ||
    "";

  const programLabel =
    safeString(row?.AccountName) ||
    safeString(row?.HostedBy) ||
    safeString(row?.hosted_by) ||
    safeString(row?.OrganizationName) ||
    safeString(row?.organization) ||
    "";

  const locationText =
    safeString(row?.Location) ||
    safeString(row?.location) ||
    [safeString(row?.City), safeString(row?.State)].filter(Boolean).join(", ") ||
    "";

  return { eventTitle, programLabel, locationText };
}

/**
 * Registration page parse (your "full extraction")
 */
function extractAfterLabel(text, label) {
  const pattern = new RegExp(`${label}\\s+([^]+?)\\s+(Location|Event Date\\(s\\)|Event Dates|Grades|Grade|Register By)\\b`, "i");
  const m = text.match(pattern);
  if (m) return m[1].replace(/\s+/g, " ").trim();

  const m2 = text.match(new RegExp(`${label}\\s+([^]+?)(\\.|\\||$)`, "i"));
  if (m2) return m2[1].replace(/\s+/g, " ").trim();

  return "";
}

function extractSectionsFromText($) {
  const main = $("main").length ? $("main") : $("body");
  const raw = main
    .text()
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const joined = raw.join("\n");

  const indices = [];
  for (const key of SECTION_KEYS) {
    const re = new RegExp(`\\b${key}:`, "gi");
    let match;
    while ((match = re.exec(joined)) !== null) {
      indices.push({ key, idx: match.index });
    }
  }
  indices.sort((a, b) => a.idx - b.idx);

  const out = {};
  for (let i = 0; i < indices.length; i++) {
    const { key, idx } = indices[i];
    const nextIdx = i + 1 < indices.length ? indices[i + 1].idx : joined.length;
    const block = joined.slice(idx, nextIdx).trim();

    const body = block.replace(new RegExp(`^\\s*${key}:\\s*`, "i"), "").trim();
    if (!body) continue;

    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines
      .filter((l) => /^[-•]\s+/.test(l))
      .map((l) => l.replace(/^[-•]\s+/, "").trim());

    out[key] = bulletLines.length >= 2 ? bulletLines : body;
  }

  return out;
}

function parseRyzerRegistrationPage(html, url) {
  const $ = cheerio.load(html);

  const eventTitle = $("h1").first().text().trim();

  let programLabel =
    $(".page-title, .camp-title, header, .hero")
      .find("h2, h3, .subtitle, .small, .subhead")
      .first()
      .text()
      .trim() || "";

  if (!programLabel) {
    const docTitle = $("title").text().trim();
    programLabel = (docTitle.split("|")[0] || docTitle).trim();
  }

  const allText = $("body").text().replace(/\s+/g, " ").trim();

  const locationText = extractAfterLabel(allText, "Location");
  const eventDates =
    extractAfterLabel(allText, "Event Date(s)") ||
    extractAfterLabel(allText, "Event Dates");

  const grades =
    extractAfterLabel(allText, "Grades") ||
    extractAfterLabel(allText, "Grade");

  const registerBy = extractAfterLabel(allText, "Register By");

  const priceOptions = [];
  const radios = $('input[type="radio"]');
  radios.each((_, el) => {
    const id = $(el).attr("id");
    let labelText = "";

    if (id) labelText = $(`label[for="${id}"]`).text().replace(/\s+/g, " ").trim();
    if (!labelText) {
      labelText = $(el)
        .closest("label, .option, .price-option, .card, .row")
        .text()
        .replace(/\s+/g, " ")
        .trim();
    }

    const priceMatch = labelText.match(/\$[0-9]+(?:\.[0-9]{2})?/);
    const price = priceMatch ? priceMatch[0] : "";

    const cleanLabel = labelText.replace(/\s*\$[0-9]+(?:\.[0-9]{2})?.*$/, "").trim();

    if (cleanLabel || price) {
      priceOptions.push({ label: cleanLabel || labelText, price, rawText: labelText });
    }
  });

  // dedupe
  const seen = new Set();
  const deduped = [];
  for (const o of priceOptions) {
    const k = norm(o.rawText);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(o);
  }

  const sections = extractSectionsFromText($);

  return {
    source: "ryzer",
    registrationUrl: url,
    programLabel: programLabel || "",
    eventTitle: eventTitle || "",
    locationText: locationText || "",
    eventDates: eventDates || "",
    grades: grades || "",
    registerBy: registerBy || "",
    priceOptions: deduped,
    sections,
  };
}

async function fetchRegistrationHtml(regUrl) {
  const res = await fetchWithTimeout(regUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept": "text/html,*/*" },
  });

  if (!res.ok) {
    throw new Error(`Registration fetch failed: HTTP ${res.status} for ${regUrl}`);
  }
  return await res.text();
}

/**
 * Entry
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sportId = safeString(body?.sportId);
  const sportName = safeString(body?.sportName);
  const activityTypeId = safeString(body?.activityTypeId);
  const collegeAccountTypeId = safeString(body?.collegeAccountTypeId) || DEFAULT_COLLEGE_ACCOUNT_TYPE_ID;

  const recordsPerPage = Number(body?.recordsPerPage ?? 25);
  const maxPages = Number(body?.maxPages ?? 10);
  const maxEvents = Number(body?.maxEvents ?? 200);
  const dryRun = !!body?.dryRun;

  const schools = safeArray(body?.schools);

  if (!activityTypeId) {
    return json({
      error: "Missing activityTypeId (Ryzer ActivityTypes GUID)",
      hint: "Capture it from the Ryzer eventSearch request payload (ActivityTypes[0]) in DevTools.",
    }, 400);
  }

  const startedAt = new Date().toISOString();

  // 1) enumerate events from Ryzer (paged)
  const rawRows = [];
  let apiErrors = [];

  for (let page = 0; page < maxPages; page++) {
    const r = await ryzerSearchPage({
      page,
      recordsPerPage,
      activityTypeId,
      collegeAccountTypeId,
    });

    if (!r.ok) {
      apiErrors.push({
        page,
        status: r.status,
        note:
          r.status === 401 || r.status === 403
            ? "Ryzer rejected auth. Add secret env var RYZER_AUTH (authorization JWT) in Base44 settings."
            : "Ryzer request failed",
      });

      // fail fast on auth
      if (r.status === 401 || r.status === 403) {
        return json({
          error: "Ryzer eventSearch rejected the request (auth required).",
          status: r.status,
          howToFix: "Add Base44 secret RYZER_AUTH = the authorization JWT from your DevTools request.",
          payloadExample: r.payload,
          startedAt,
        }, 401);
      }

      break;
    }

    const rows = extractEventRows(r.data);
    if (!rows.length) break;

    for (const row of rows) {
      rawRows.push(row);
      if (rawRows.length >= maxEvents) break;
    }
    if (rawRows.length >= maxEvents) break;

    await sleep(120); // polite pacing
  }

  // 2) For each row: locate registration URL, fetch + parse, match school fail-closed
  const accepted = [];
  const rejected = [];
  const errors = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    try {
      const regUrl = extractRegistrationUrlFromRow(row);
      const { eventTitle, programLabel, locationText } = extractEventLabelFields(row);

      if (!regUrl) {
        rejected.push({
          status: "rejected",
          reason: "no_registration_url_found",
          sportId,
          sportName,
          eventTitle,
          programLabel,
          locationText,
          row,
        });
        continue;
      }

      const html = await fetchRegistrationHtml(regUrl);
      const parsed = parseRyzerRegistrationPage(html, regUrl);

      // school matching uses parsed programLabel/locationText (best source)
      const school = matchSchool(
        { programLabel: parsed.programLabel, locationText: parsed.locationText },
        schools
      );

      if (!school) {
        rejected.push({
          status: "rejected",
          reason: "non_college_or_unverified_school",
          sportId,
          sportName,
          registrationUrl: regUrl,
          programLabel: parsed.programLabel,
          locationText: parsed.locationText,
        });
        continue;
      }

      accepted.push({
        status: "accepted",
        sportId,
        sportName,
        school,
        event: {
          ...parsed,
          // helpful raw fields for debugging
          searchRowTitle: eventTitle,
          searchRowHost: programLabel,
          searchRowLocation: locationText,
        },
      });

      await sleep(120);
    } catch (e) {
      errors.push({
        status: "error",
        index: i,
        error: String(e?.message || e),
      });
    }
  }

  const finishedAt = new Date().toISOString();

  return json({
    startedAt,
    finishedAt,
    dryRun,
    input: {
      sportId,
      sportName,
      activityTypeId,
      recordsPerPage,
      maxPages,
      maxEvents,
      schoolsCount: safeArray(schools).length,
    },
    stats: {
      searchRows: rawRows.length,
      accepted: accepted.length,
      rejected: rejected.length,
      errors: errors.length,
      apiErrors: apiErrors.length,
    },
    apiErrors,
    accepted,
    rejected,
    errors,
  });
});