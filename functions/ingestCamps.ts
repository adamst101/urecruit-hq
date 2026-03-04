// functions/ingestCamps.js
// Master camp ingestion pipeline — owns fetch, normalize, school-match, upsert end-to-end.
// Supports: source = "ryzer" | "sportsusa" | "all"
//           sport  = "football" (only football for now; extensible)
// Idempotent: upserts by source_key. Safe to re-run.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

// ─── constants ──────────────────────────────────────────────────────────────

var FOOTBALL_SPORT_ID = "69407156fe19c3615944865f";

var SPORT_CONFIG = {
  football: {
    sport_id: FOOTBALL_SPORT_ID,
    ryzer_activity_type_id: null,          // will use keyword gate
    ryzer_account_type: "A7FA36E0-87BE-4750-9DE3-CB60DE133648",
    sportsusa_directory_url: "https://www.footballcampsusa.com",
    keywords: ["football"],
    enabled: true,
  },
  // basketball: { ... enabled: false },  // add when ready
};

var MATCH_CONFIDENCE_THRESHOLD = 0.7;

// ─── helpers ────────────────────────────────────────────────────────────────

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); }

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x).trim();
}

function safeStrOrNull(x) {
  var s = safeStr(x);
  return s || null;
}

function lc(x) { return safeStr(x).toLowerCase(); }

function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(name) {
  return lc(name)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashLite(s) {
  var str = String(s || "");
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

// state abbreviation → full name mapping for matching
var STATE_ABBR_TO_FULL = {
  AL:"alabama",AK:"alaska",AZ:"arizona",AR:"arkansas",CA:"california",
  CO:"colorado",CT:"connecticut",DE:"delaware",FL:"florida",GA:"georgia",
  HI:"hawaii",ID:"idaho",IL:"illinois",IN:"indiana",IA:"iowa",
  KS:"kansas",KY:"kentucky",LA:"louisiana",ME:"maine",MD:"maryland",
  MA:"massachusetts",MI:"michigan",MN:"minnesota",MS:"mississippi",MO:"missouri",
  MT:"montana",NE:"nebraska",NV:"nevada",NH:"new hampshire",NJ:"new jersey",
  NM:"new mexico",NY:"new york",NC:"north carolina",ND:"north dakota",OH:"ohio",
  OK:"oklahoma",OR:"oregon",PA:"pennsylvania",RI:"rhode island",SC:"south carolina",
  SD:"south dakota",TN:"tennessee",TX:"texas",UT:"utah",VT:"vermont",
  VA:"virginia",WA:"washington",WV:"west virginia",WI:"wisconsin",WY:"wyoming",
  DC:"district of columbia",
};

function normalizeState(s) {
  var v = lc(s);
  if (!v) return "";
  // If 2-letter, convert to full
  var full = STATE_ABBR_TO_FULL[v.toUpperCase()];
  if (full) return full;
  return v;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    var u = new URL(String(url));
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return null;
  }
}

// ─── school index builder ───────────────────────────────────────────────────

function buildSchoolIndex(schools) {
  var byNormName = {};    // normalized_name → [{ id, school }]
  var byDomain = {};      // domain → [{ id, school }]
  var byNicknameState = {};  // "nickname|state" → [{ id, school }]
  var byLogoUrl = {};     // logo_url → [{ id, school }]

  for (var i = 0; i < schools.length; i++) {
    var s = schools[i];
    var sid = safeStr(s.id);
    if (!sid) continue;

    // By normalized name
    var nn = lc(s.normalized_name || s.school_name || "");
    if (nn) {
      if (!byNormName[nn]) byNormName[nn] = [];
      byNormName[nn].push({ id: sid, school: s });
    }

    // By website domain
    var dom = extractDomain(s.website_url);
    if (dom) {
      if (!byDomain[dom]) byDomain[dom] = [];
      byDomain[dom].push({ id: sid, school: s });
    }

    // By nickname + state
    var nick = lc(s.athletics_nickname || "");
    var st = normalizeState(s.state);
    if (nick && st) {
      var nk = nick + "|" + st;
      if (!byNicknameState[nk]) byNicknameState[nk] = [];
      byNicknameState[nk].push({ id: sid, school: s });
    }

    // By logo URLs
    var logos = [s.logo_url, s.athletic_logo_url];
    for (var li = 0; li < logos.length; li++) {
      var lu = safeStrOrNull(logos[li]);
      if (lu) {
        var luKey = lc(lu);
        if (!byLogoUrl[luKey]) byLogoUrl[luKey] = [];
        byLogoUrl[luKey].push({ id: sid, school: s });
      }
    }
  }

  return { byNormName: byNormName, byDomain: byDomain, byNicknameState: byNicknameState, byLogoUrl: byLogoUrl };
}

// Fuzzy name matching: check if one name contains the other's key words
function fuzzyNameScore(campOrgName, schoolNormName) {
  var a = normalizeName(campOrgName);
  var b = schoolNormName; // already normalized
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  // Check if one contains the other
  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.85;

  // Word overlap
  var aw = a.split(" ").filter(function(w) { return w.length > 2; });
  var bw = b.split(" ").filter(function(w) { return w.length > 2; });
  if (aw.length === 0 || bw.length === 0) return 0;

  var overlap = 0;
  for (var i = 0; i < aw.length; i++) {
    for (var j = 0; j < bw.length; j++) {
      if (aw[i] === bw[j]) { overlap++; break; }
    }
  }

  var maxLen = Math.max(aw.length, bw.length);
  var ratio = overlap / maxLen;
  return ratio >= 0.6 ? ratio * 0.8 : 0;
}

function matchSchool(idx, campName, campCity, campState, hostName, logoUrl) {
  // 1. Logo URL match → confidence 1.0
  if (logoUrl) {
    var luKey = lc(logoUrl);
    var logoMatches = idx.byLogoUrl[luKey];
    if (logoMatches && logoMatches.length === 1) {
      return { school_id: logoMatches[0].id, method: "logo", confidence: 1.0 };
    }
  }

  // Build list of name candidates to try matching
  var nameCandidates = [];
  if (hostName) nameCandidates.push(hostName);
  if (campName) nameCandidates.push(campName);

  // 2. Exact normalized name → confidence 0.95
  for (var ni = 0; ni < nameCandidates.length; ni++) {
    var nn = normalizeName(nameCandidates[ni]);
    if (!nn) continue;

    var exact = idx.byNormName[nn];
    if (exact && exact.length === 1) {
      return { school_id: exact[0].id, method: "exact_name", confidence: 0.95 };
    }

    // Try common variations: remove "university", add "university", etc.
    var variations = [
      nn.replace(/ university$/, "").replace(/ college$/, ""),
      nn + " university",
      nn + " college",
      nn.replace(/^university of /, ""),
      "university of " + nn,
    ];
    for (var vi = 0; vi < variations.length; vi++) {
      var vn = variations[vi].trim();
      if (vn && vn !== nn) {
        var vMatch = idx.byNormName[vn];
        if (vMatch && vMatch.length === 1) {
          return { school_id: vMatch[0].id, method: "exact_name", confidence: 0.9 };
        }
      }
    }
  }

  // 3. Domain match → confidence 0.85
  // (not commonly available from camp sources, but check if we have a URL)

  // 4. Fuzzy name match → confidence 0.7-0.8
  var bestFuzzy = null;
  var bestFuzzyScore = 0;
  var allNormNames = Object.keys(idx.byNormName);
  for (var ci = 0; ci < nameCandidates.length; ci++) {
    var cand = nameCandidates[ci];
    for (var si = 0; si < allNormNames.length; si++) {
      var schoolNN = allNormNames[si];
      var entries = idx.byNormName[schoolNN];
      if (!entries || entries.length !== 1) continue; // skip ambiguous
      var score = fuzzyNameScore(cand, schoolNN);
      if (score > bestFuzzyScore) {
        bestFuzzyScore = score;
        bestFuzzy = entries[0];
      }
    }
  }
  if (bestFuzzy && bestFuzzyScore >= 0.6) {
    var conf = Math.min(0.85, bestFuzzyScore * 0.85 + 0.1);
    return { school_id: bestFuzzy.id, method: "fuzzy_name", confidence: Math.round(conf * 100) / 100 };
  }

  // 5. Nickname + state → confidence 0.65
  var cState = normalizeState(campState);
  if (cState) {
    for (var nci = 0; nci < nameCandidates.length; nci++) {
      var nk = lc(nameCandidates[nci]) + "|" + cState;
      var nkMatch = idx.byNicknameState[nk];
      if (nkMatch && nkMatch.length === 1) {
        return { school_id: nkMatch[0].id, method: "nickname_state", confidence: 0.65 };
      }
    }
  }

  return { school_id: null, method: null, confidence: 0 };
}

// ─── Ryzer API fetcher ──────────────────────────────────────────────────────

async function fetchRyzerPage(auth, activityTypeId, accountTypeId, page, recordsPerPage) {
  var endpoint = "https://ryzer.com/rest/controller/connect/event/eventSearch/";
  var payload = {
    Page: page,
    RecordsPerPage: recordsPerPage,
    SoldOut: 0,
    Proximity: "10000",
  };
  // accountTypeList filters to college accounts only
  if (accountTypeId) {
    payload.accountTypeList = [accountTypeId];
  }
  // ActivityTypes filters by sport — only add if we have a real ID
  if (activityTypeId) {
    payload.ActivityTypes = [activityTypeId];
  }

  var resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "*/*",
      authorization: auth,
      Origin: "https://ryzer.com",
      Referer: "https://ryzer.com/Events/?tab=eventSearch",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    return { ok: false, status: resp.status, rows: [], total: 0 };
  }

  var text = await resp.text();
  var data = null;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, status: resp.status, rows: [], total: 0 }; }

  // Normalize nested response
  if (data && typeof data.data === "string") {
    try { data = JSON.parse(data.data); } catch (e) {}
  }
  if (data && data.data && typeof data.data === "object") {
    data = data.data;
  }

  var rows = data.events || data.Events || [];
  if (!Array.isArray(rows)) rows = [];
  var total = data.totalresults || data.total || data.count || rows.length;

  return { ok: true, status: resp.status, rows: rows, total: total };
}

function isFootballEvent(row) {
  var title = lc(row.eventTitle || row.EventTitle || row.title || row.Name || row.name || "");
  var actName = lc(row.activitytype || row.activityType || row.ActivityType || "");

  if (actName.indexOf("football") >= 0) return true;
  if (title.indexOf("football") >= 0) return true;

  // Reject clearly non-football
  var nonFootball = ["basketball", "baseball", "soccer", "volleyball", "softball", "lacrosse",
    "hockey", "tennis", "wrestling", "track", "swimming", "golf", "cheer", "dance", "yoga"];
  for (var i = 0; i < nonFootball.length; i++) {
    if (title.indexOf(nonFootball[i]) >= 0 || actName.indexOf(nonFootball[i]) >= 0) return false;
  }

  // Camp with a college host mentioning "camp" is likely football if no other sport indicated
  var host = lc(row.organizer || row.Organizer || row.accountName || row.AccountName || "");
  if (host.indexOf("football") >= 0) return true;

  return false;
}

function isCollegeHost(row) {
  var host = lc(row.organizer || row.Organizer || row.accountName || row.AccountName ||
    row.hostName || row.HostName || row.organizationName || row.OrganizationName ||
    row.schoolName || row.SchoolName || "");
  if (!host || host.length < 4) return false;

  // Reject obvious non-college
  var rejectPatterns = ["middle school", "high school", "elementary", "youth league",
    "rec center", "pee wee", "little league", "pop warner", "youth athletics"];
  for (var i = 0; i < rejectPatterns.length; i++) {
    if (host.indexOf(rejectPatterns[i]) >= 0) return false;
  }

  // Accept college-like
  if (host.indexOf("university") >= 0 || host.indexOf("college") >= 0 ||
      host.indexOf("athletics") >= 0 || host.indexOf("institute") >= 0) return true;

  // Broader accept: many college programs just use their name (e.g. "Michigan State")
  // Since accountTypeList already filters to college accounts on Ryzer, be more permissive
  return true;
}

function extractRyzerCampId(url) {
  if (!url) return null;
  try {
    var u = new URL(String(url));
    var id = u.searchParams.get("id");
    if (id && id.trim()) return id.trim();
  } catch (e) {}
  var m = String(url).match(/[?&]id=(\d{5,7})/i);
  return m && m[1] ? m[1].trim() : null;
}

function normalizeRyzerRow(row, sportId, runIso) {
  var title = stripNonAscii(row.eventTitle || row.EventTitle || row.title || row.name || row.Name || "Camp");
  var url = safeStrOrNull(row.rlink || row.RLink || row.registrationUrl || row.RegistrationUrl ||
    row.registration_url || row.eventUrl || row.EventUrl || row.url || row.Url);
  var city = safeStrOrNull(row.city || row.City || row.locationCity || row.LocationCity);
  var state = safeStrOrNull(row.state || row.State || row.locationState || row.LocationState);
  var host = safeStrOrNull(row.organizer || row.Organizer || row.accountName || row.AccountName ||
    row.hostName || row.HostName || row.organizationName || row.OrganizationName ||
    row.schoolName || row.SchoolName);
  var logoUrl = safeStrOrNull(row.logo || row.Logo); // S3 school logo from Ryzer
  var dateRange = safeStrOrNull(row.daterange || row.startdate || row.startDate || row.StartDate);
  var price = row.cost ? parseFloat(String(row.cost).replace(/[^0-9.]/g, "")) : null;
  if (price !== null && (isNaN(price) || price <= 0)) price = null;

  var eventId = safeStrOrNull(row.id || row.Id || row.eventId || row.EventId);
  var ryzerCampId = extractRyzerCampId(url) || eventId;

  // Parse start date from daterange
  var startDate = null;
  var endDate = null;
  if (dateRange) {
    // Try "MM/DD/YYYY - MM/DD/YYYY" or "MM/DD/YYYY"
    var rangeParts = dateRange.split(/\s*[-–]\s*/);
    var parseDateStr = function(s) {
      var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
      if (m) return m[3] + "-" + (m[1].length === 1 ? "0" + m[1] : m[1]) + "-" + (m[2].length === 1 ? "0" + m[2] : m[2]);
      // Try ISO
      var iso = /(\d{4}-\d{2}-\d{2})/.exec(s);
      if (iso) return iso[1];
      return null;
    };
    startDate = parseDateStr(rangeParts[0]);
    if (rangeParts.length > 1) endDate = parseDateStr(rangeParts[1]);
  }

  if (!startDate) return null; // skip camps without dates

  var seasonYear = startDate ? parseInt(startDate.substring(0, 4)) : null;
  var sourceKey = "ryzer:" + (ryzerCampId || hashLite(url || title + startDate));

  return {
    camp_name: title,
    sport_id: sportId,
    start_date: startDate,
    end_date: endDate,
    city: city,
    state: state,
    price: price,
    link_url: url,
    source_url: url,
    source_platform: "ryzer",
    source_key: sourceKey,
    ryzer_camp_id: ryzerCampId,
    season_year: seasonYear,
    active: true,
    last_seen_at: runIso,
    last_ingested_at: runIso,
    position_ids: [],
    notes: null,
    _host_name: host,    // transient, for school matching only
    _logo_url: logoUrl,  // transient, for school matching only
  };
}

// ─── SportsUSA scraper helpers ──────────────────────────────────────────────

async function fetchHtmlSafe(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 12000);
  try {
    var resp = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, status: resp.status, html: "" };
    var html = await resp.text();
    return { ok: true, status: resp.status, html: html };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, html: "", error: String(e.message || e) };
  }
}

function extractCampLinksFromSiteHtml(html, baseUrl) {
  var out = [];
  if (!html) return out;
  var seen = {};

  function absUrl(u) {
    if (!u) return null;
    var s = String(u).trim().replace(/&amp;/g, "&").split("#")[0];
    if (s.startsWith("//")) s = "https:" + s;
    if (!s.startsWith("http")) {
      try { s = new URL(s, baseUrl).toString(); } catch (e) { return null; }
    }
    return s;
  }

  var re = /href=["']([^"']*camp\.cfm[^"']*)["']/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var u = absUrl(m[1]);
    if (u && !seen[u]) { seen[u] = true; out.push(u); }
  }

  // Also full URLs
  var re2 = /(https?:\/\/[^"' <]*camp\.cfm[^"' <]*)/gi;
  while ((m = re2.exec(html)) !== null) {
    var u2 = absUrl(m[1]);
    if (u2 && !seen[u2]) { seen[u2] = true; out.push(u2); }
  }

  // Prefer links with id= param
  var withId = out.filter(function(u) { return lc(u).indexOf("id=") >= 0; });
  return withId.length ? withId : out;
}

function extractCampNameFromHtml(html) {
  if (!html) return null;
  // Try h1
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1]) {
    var t = stripNonAscii(h1[1].replace(/<[^>]+>/g, " "));
    t = t.replace(/\s*\|\s*Event Registration.*$/i, "").replace(/\s*-\s*Registration.*$/i, "").trim();
    if (t.length > 3 && t.length < 200) return t;
  }
  // Try title
  var title = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (title && title[1]) {
    var t2 = stripNonAscii(title[1]).replace(/\s*\|\s*Event Registration.*$/i, "").replace(/\s*-\s*Registration.*$/i, "").trim();
    if (t2.length > 3 && t2.length < 200) return t2;
  }
  return null;
}

function extractDateFromHtml(html) {
  if (!html) return { start: null, end: null };
  var text = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Try MM/DD/YYYY range
  var rangeMatch = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
  if (rangeMatch) {
    return { start: parseMDY(rangeMatch[1]), end: parseMDY(rangeMatch[2]) };
  }

  // Single MM/DD/YYYY
  var single = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
  if (single) {
    return { start: parseMDY(single[1]), end: null };
  }

  return { start: null, end: null };
}

function parseMDY(s) {
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  var mm = m[1].length === 1 ? "0" + m[1] : m[1];
  var dd = m[2].length === 1 ? "0" + m[2] : m[2];
  return m[3] + "-" + mm + "-" + dd;
}

function extractPriceFromHtml(html) {
  if (!html) return null;
  var text = String(html).replace(/<[^>]+>/g, " ");
  var prices = [];
  var re = /\$\s*(\d{1,5})(?:\.(\d{2}))?/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var val = parseFloat(m[1] + (m[2] ? "." + m[2] : ""));
    if (val > 0 && val < 20000) prices.push(val);
    if (prices.length >= 10) break;
  }
  if (prices.length === 0) return null;
  return Math.max.apply(null, prices);
}

function extractCityStateFromHtml(html) {
  if (!html) return { city: null, state: null };
  var text = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Look for "Location ... City, ST"
  var locMatch = /Location\s+(.{0,140}?)(?:Event Date|Grades|Register By|Select a price|$)/i.exec(text);
  if (locMatch && locMatch[1]) {
    var seg = locMatch[1].indexOf("|") >= 0 ? locMatch[1].split("|").pop().trim() : locMatch[1].trim();
    var csMatch = /([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/.exec(seg);
    if (csMatch) return { city: csMatch[1].trim(), state: csMatch[2].trim() };
  }
  return { city: null, state: null };
}

// ─── upsert logic ───────────────────────────────────────────────────────────

function campFieldsChanged(existing, incoming) {
  // Compare key fields to decide if update is needed
  var fields = ["camp_name", "start_date", "end_date", "city", "state", "price",
    "link_url", "source_url", "ryzer_camp_id", "season_year"];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var ev = safeStr(existing[f]);
    var iv = safeStr(incoming[f]);
    if (ev !== iv) return true;
  }
  return false;
}

async function upsertCamp(Camp, incoming, schoolMatch, existingBySourceKey, dryRun, runIso) {
  var sourceKey = incoming.source_key;
  var existing = existingBySourceKey[sourceKey] || null;

  // Build the payload
  var payload = {
    camp_name: incoming.camp_name,
    sport_id: incoming.sport_id,
    start_date: incoming.start_date,
    end_date: incoming.end_date || null,
    city: incoming.city || null,
    state: incoming.state || null,
    price: incoming.price || null,
    link_url: incoming.link_url || null,
    source_url: incoming.source_url || null,
    source_platform: incoming.source_platform,
    source_key: sourceKey,
    ryzer_camp_id: incoming.ryzer_camp_id || null,
    season_year: incoming.season_year || null,
    active: true,
    last_seen_at: runIso,
    last_ingested_at: runIso,
    position_ids: incoming.position_ids || [],
    notes: incoming.notes || null,
    ingestion_status: "active",
  };

  // School matching — respect school_manually_verified
  if (existing && existing.school_manually_verified) {
    // Keep existing school assignment
    payload.school_id = existing.school_id || null;
    payload.school_match_method = existing.school_match_method || "manual";
    payload.school_match_confidence = existing.school_match_confidence || 1.0;
    payload.school_manually_verified = true;
  } else if (schoolMatch && schoolMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
    payload.school_id = schoolMatch.school_id;
    payload.school_match_method = schoolMatch.method;
    payload.school_match_confidence = schoolMatch.confidence;
    payload.school_manually_verified = false;
    payload.ingestion_status = "active";
  } else {
    payload.school_id = null;
    payload.school_match_method = schoolMatch ? schoolMatch.method : null;
    payload.school_match_confidence = schoolMatch ? schoolMatch.confidence : 0;
    payload.school_manually_verified = false;
    if (!schoolMatch || schoolMatch.confidence < MATCH_CONFIDENCE_THRESHOLD) {
      payload.ingestion_status = "needs_review";
    }
  }

  if (existing) {
    // Check if anything changed
    if (!campFieldsChanged(existing, incoming) &&
        safeStr(existing.school_id) === safeStr(payload.school_id)) {
      // Nothing changed — just touch timestamps
      if (!dryRun) {
        await Camp.update(String(existing.id), {
          last_seen_at: runIso,
          last_ingested_at: runIso,
        });
      }
      return "skipped";
    }
    // Update
    if (!dryRun) {
      await Camp.update(String(existing.id), payload);
    }
    return "updated";
  } else {
    // Insert
    if (!dryRun) {
      await Camp.create(payload);
    }
    return "inserted";
  }
}

// ─── main handler ───────────────────────────────────────────────────────────

Deno.serve(async function(req) {
  var t0 = Date.now();
  var runIso = new Date().toISOString();

  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  var body = {};
  try { body = await req.json(); } catch (e) { body = {}; }

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return json({ ok: false, error: "Forbidden: Admin access required" }, 403);
  }

  var source = lc(body.source || "all");           // ryzer | sportsusa | all
  var sport = lc(body.sport || "football");         // football only for now
  var dryRun = body.dryRun !== false && body.dryRun !== "false"; // default true
  var maxCamps = Math.max(1, Number(body.maxCamps || 200));
  var startAt = Math.max(0, Number(body.startAt || 0));
  var sleepMs = Math.max(0, Number(body.sleepMs || 200));
  var timeBudgetMs = Math.max(5000, Number(body.timeBudgetMs || 50000));

  var sportCfg = SPORT_CONFIG[sport];
  if (!sportCfg || !sportCfg.enabled) {
    return json({ ok: false, error: "Sport '" + sport + "' not configured or not enabled." });
  }

  var Camp = base44.entities.Camp;
  var School = base44.entities.School;
  var SchoolSportSite = base44.entities.SchoolSportSite;
  var LastIngestRun = base44.entities.LastIngestRun;

  var stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, matched: 0, unmatched: 0, processedFromSource: 0 };
  var samples = { inserted: [], updated: [], errors: [], unmatched: [] };
  var debugInfo = { source: source, sport: sport, dryRun: dryRun, startAt: startAt, maxCamps: maxCamps };

  // ── 1. Load ALL existing camps by source_key for O(1) lookup ──
  var allCamps = [];
  try {
    allCamps = await Camp.filter({}, "source_key", 99999);
  } catch (e) {
    allCamps = [];
  }
  var existingBySourceKey = {};
  for (var ci = 0; ci < allCamps.length; ci++) {
    var sk = safeStr(allCamps[ci].source_key);
    if (sk) existingBySourceKey[sk] = allCamps[ci];
  }
  debugInfo.existingCampsLoaded = allCamps.length;

  // ── 2. Load ALL schools and build index ──
  var allSchools = [];
  try {
    allSchools = await School.filter({}, "school_name", 99999);
  } catch (e) {
    allSchools = [];
  }
  var schoolIdx = buildSchoolIndex(allSchools);
  debugInfo.schoolsLoaded = allSchools.length;

  // ── 3. Collect normalized camps from sources ──
  var normalizedCamps = []; // array of { camp, hostName }

  var elapsed = function() { return Date.now() - t0; };

  // ──── Source: Ryzer ────
  if (source === "ryzer" || source === "all") {
    var auth = Deno.env.get("RYZER_AUTH");
    if (!auth) {
      debugInfo.ryzerError = "Missing RYZER_AUTH secret";
    } else {
      var ryzerPage = 0;
      var ryzerMaxPages = 20;
      var ryzerPerPage = 25;
      var ryzerTotal = 0;
      var ryzerSkippedSport = 0;
      var ryzerSkippedHost = 0;

      for (ryzerPage = 0; ryzerPage < ryzerMaxPages; ryzerPage++) {
        if (elapsed() >= timeBudgetMs * 0.6) break; // save time for sportsusa + upserts
        if (normalizedCamps.length >= maxCamps * 2) break; // collect more than needed, filter later

        var pageResult = await fetchRyzerPage(
          auth,
          sportCfg.ryzer_activity_type_id,
          sportCfg.ryzer_account_type,
          ryzerPage,
          ryzerPerPage
        );

        if (!pageResult.ok || pageResult.rows.length === 0) break;
        if (ryzerPage === 0) ryzerTotal = pageResult.total;

        for (var ri = 0; ri < pageResult.rows.length; ri++) {
          var row = pageResult.rows[ri];

          // Football gate
          if (!isFootballEvent(row)) { ryzerSkippedSport++; continue; }
          // College gate
          if (!isCollegeHost(row)) { ryzerSkippedHost++; continue; }

          var normalized = normalizeRyzerRow(row, sportCfg.sport_id, runIso);
          if (!normalized) continue;

          normalizedCamps.push({
            camp: normalized,
            hostName: normalized._host_name,
            logoUrl: normalized._logo_url || null,
          });
        }

        await sleep(sleepMs);
      }

      debugInfo.ryzerPages = ryzerPage;
      debugInfo.ryzerTotal = ryzerTotal;
      debugInfo.ryzerSkippedSport = ryzerSkippedSport;
      debugInfo.ryzerSkippedHost = ryzerSkippedHost;
      debugInfo.ryzerAccepted = normalizedCamps.length;
    }
  }

  // ──── Source: SportsUSA ────
  var sportsusaCountBefore = normalizedCamps.length;
  if (source === "sportsusa" || source === "all") {
    // Load SchoolSportSite records for football
    var sites = [];
    try {
      sites = await SchoolSportSite.filter({ sport_id: sportCfg.sport_id, active: true }, "camp_site_url", 5000);
    } catch (e) {
      try {
        sites = await SchoolSportSite.filter({ sport_id: sportCfg.sport_id }, "camp_site_url", 5000);
      } catch (e2) {
        sites = [];
      }
    }
    debugInfo.sportsusaSites = sites.length;

    var sitesFetched = 0;
    var sitesSkipped = 0;

    for (var si = 0; si < sites.length; si++) {
      if (elapsed() >= timeBudgetMs * 0.8) break;
      if (normalizedCamps.length >= maxCamps * 3) break;

      var site = sites[si];
      var siteUrl = safeStr(site.camp_site_url);
      if (!siteUrl) continue;

      var siteResult = await fetchHtmlSafe(siteUrl, 12000);
      sitesFetched++;
      if (!siteResult.ok) { sitesSkipped++; continue; }

      var campLinks = extractCampLinksFromSiteHtml(siteResult.html, siteUrl).slice(0, 10);
      if (campLinks.length === 0) { sitesSkipped++; continue; }

      for (var cli = 0; cli < campLinks.length; cli++) {
        if (elapsed() >= timeBudgetMs * 0.8) break;

        var campUrl = campLinks[cli];
        var campResult = await fetchHtmlSafe(campUrl, 10000);
        if (!campResult.ok) continue;

        var campName = extractCampNameFromHtml(campResult.html) || "Camp";
        var dates = extractDateFromHtml(campResult.html);
        if (!dates.start) continue;

        var price = extractPriceFromHtml(campResult.html);
        var loc = extractCityStateFromHtml(campResult.html);
        var ryzerId = extractRyzerCampId(campUrl);

        var seasonYear = dates.start ? parseInt(dates.start.substring(0, 4)) : null;
        var campSourceKey = "sportsusa:" + (ryzerId || hashLite(campUrl + dates.start));

        normalizedCamps.push({
          camp: {
            camp_name: campName,
            sport_id: sportCfg.sport_id,
            start_date: dates.start,
            end_date: dates.end || null,
            city: loc.city || null,
            state: loc.state || null,
            price: price,
            link_url: campUrl,
            source_url: campUrl,
            source_platform: "sportsusa",
            source_key: campSourceKey,
            ryzer_camp_id: ryzerId,
            season_year: seasonYear,
            active: true,
            last_seen_at: runIso,
            last_ingested_at: runIso,
            position_ids: [],
            notes: null,
          },
          hostName: safeStr(site.school_id ? null : null), // no host name from sportsusa
          siteSchoolId: safeStr(site.school_id),
          logoUrl: null,
        });

        await sleep(Math.max(100, sleepMs));
      }

      await sleep(sleepMs);
    }

    debugInfo.sportsusaSitesFetched = sitesFetched;
    debugInfo.sportsusaSitesSkipped = sitesSkipped;
    debugInfo.sportsusaCampsFound = normalizedCamps.length - sportsusaCountBefore;
  }

  debugInfo.totalNormalizedCamps = normalizedCamps.length;

  // ── 4. Slice for pagination ──
  var slice = normalizedCamps.slice(startAt, startAt + maxCamps);
  var nextStartAt = startAt + slice.length;
  var done = nextStartAt >= normalizedCamps.length;

  debugInfo.sliceStart = startAt;
  debugInfo.sliceSize = slice.length;

  // ── 5. Upsert each camp ──
  for (var ui = 0; ui < slice.length; ui++) {
    if (elapsed() >= timeBudgetMs) {
      done = false;
      debugInfo.stoppedEarly = true;
      break;
    }

    var entry = slice[ui];
    var camp = entry.camp;
    stats.processedFromSource++;

    // School matching
    var schoolMatch = matchSchool(
      schoolIdx,
      camp.camp_name,
      camp.city,
      camp.state,
      entry.hostName || null,
      entry.logoUrl || null
    );

    if (schoolMatch.school_id && schoolMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
      stats.matched++;
    } else {
      stats.unmatched++;
    }

    try {
      var result = await upsertCamp(Camp, camp, schoolMatch, existingBySourceKey, dryRun, runIso);

      if (result === "inserted") {
        stats.inserted++;
        if (samples.inserted.length < 5) {
          samples.inserted.push({ source_key: camp.source_key, name: camp.camp_name, school_id: schoolMatch.school_id, method: schoolMatch.method, confidence: schoolMatch.confidence });
        }
      } else if (result === "updated") {
        stats.updated++;
        if (samples.updated.length < 5) {
          samples.updated.push({ source_key: camp.source_key, name: camp.camp_name });
        }
      } else {
        stats.skipped++;
      }
    } catch (e) {
      stats.errors++;
      if (samples.errors.length < 5) {
        samples.errors.push({ source_key: camp.source_key, name: camp.camp_name, error: String(e.message || e) });
      }
    }

    if (ui % 5 === 0 && sleepMs > 0) await sleep(sleepMs / 2);
  }

  // ── 6. Calculate match rate ──
  var totalProcessed = stats.inserted + stats.updated + stats.skipped;
  var matchRate = totalProcessed > 0 ? Math.round((stats.matched / totalProcessed) * 1000) / 10 : 0;

  // ── 7. Record run history ──
  if (!dryRun) {
    try {
      await LastIngestRun.create({
        sport: sport,
        source: source,
        run_at: runIso,
        camps_inserted: stats.inserted,
        camps_updated: stats.updated,
        camps_skipped: stats.skipped,
        camps_errors: stats.errors,
        match_rate: matchRate,
        dry_run: false,
        duration_ms: elapsed(),
        notes: "Processed " + totalProcessed + " camps. Match rate: " + matchRate + "%",
      });
    } catch (e) {
      debugInfo.runHistoryError = String(e.message || e);
    }
  }

  // Unmatched samples
  for (var umi = 0; umi < slice.length && samples.unmatched.length < 10; umi++) {
    var ue = slice[umi];
    var um = matchSchool(schoolIdx, ue.camp.camp_name, ue.camp.city, ue.camp.state, ue.hostName, ue.logoUrl);
    if (!um.school_id || um.confidence < MATCH_CONFIDENCE_THRESHOLD) {
      samples.unmatched.push({
        source_key: ue.camp.source_key,
        name: ue.camp.camp_name,
        host: ue.hostName || null,
        city: ue.camp.city,
        state: ue.camp.state,
        bestMethod: um.method,
        bestConfidence: um.confidence,
      });
    }
  }

  return json({
    ok: true,
    dryRun: dryRun,
    sport: sport,
    source: source,
    stats: stats,
    matchRate: matchRate,
    pagination: {
      startAt: startAt,
      processed: slice.length,
      nextStartAt: nextStartAt,
      done: done,
      totalAvailable: normalizedCamps.length,
    },
    samples: samples,
    debug: debugInfo,
    elapsedMs: elapsed(),
  });
});