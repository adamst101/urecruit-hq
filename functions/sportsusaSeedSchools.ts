// functions/sportsusaSeedSchools.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Fetch SportsUSA listing page for a given sport site (footballcampsusa, soccercampsusa, etc.)
// - Extract a deduped list of schools with logo_url and source_school_url best-effort
// - Return schools[] + debug so AdminImport can upsert into School
//
// Notes:
// - No optional chaining (Base44 editor-safe).
// - Uses regex parsing (no external libs).
// - "University only" gate is enforced by name heuristics (fail-closed-ish).
//
// VERSION
const VERSION = "sportsusaSeedSchools_2026-02-02_v1_editor_safe";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeString(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  return s ? s : null;
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function normalizeSpaces(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]*>/g, " ");
}

function decodeHtmlEntities(s) {
  // minimal, good enough for names
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSchoolNameForKey(name) {
  // canonical matching string: lowercase, punctuation removed, spaces collapsed
  var s = String(name || "").toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function absolutizeUrl(url, baseUrl) {
  var u = safeString(url);
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) {
    try {
      var b = new URL(baseUrl);
      return b.origin + u;
    } catch {
      return u;
    }
  }
  // relative
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return u;
  }
}

// University-only gate (best effort)
function looksLikeCollegeUniversity(name) {
  var n = lc(name);
  if (!n) return false;

  // must contain at least one higher-ed signal
  var signals = [
    "university",
    "college",
    "institute",
    "polytechnic",
    "state",
    "a&m",
    "community college",
    "tech",
    "school of",
  ];

  var ok = false;
  for (var i = 0; i < signals.length; i++) {
    if (n.indexOf(signals[i]) >= 0) {
      ok = true;
      break;
    }
  }
  if (!ok) return false;

  // reject obvious non-university orgs (fail-closed)
  var reject = [
    "middle school",
    "high school",
    "elementary",
    "academy",
    "club",
    "llc",
    "inc",
    "performance",
    "training",
    "facility",
  ];
  for (var j = 0; j < reject.length; j++) {
    if (n.indexOf(reject[j]) >= 0) return false;
  }

  // length sanity
  if (n.length < 6) return false;

  return true;
}

// Pull the first "City, ST" pattern from a chunk
function extractCityState(text) {
  var t = normalizeSpaces(stripTags(text));
  t = decodeHtmlEntities(t);
  t = stripNonAscii(t);

  // City, ST (2 letters)
  var m = t.match(/\b([A-Za-z .'-]{2,40}),\s*([A-Z]{2})\b/);
  if (m && m[1] && m[2]) {
    return { city: normalizeSpaces(m[1]), state: m[2] };
  }
  return { city: null, state: null };
}

// Extract school candidates from the SportsUSA page HTML
function extractSchoolsFromHtml(html, baseUrl) {
  var schoolsByKey = new Map();
  var debug = {
    patterns_hit: [],
    candidates_seen: 0,
    accepted: 0,
    rejected: 0,
  };

  var h = String(html || "");

  // Strategy:
  // 1) Find repeated "cards" by splitting on common separators (best effort)
  // 2) Within each chunk, look for:
  //    - an image (logo)
  //    - a school name line (often near the logo)
  //    - a "View Site" or similar link, OR any link that looks like a school page
  //
  // Because we don't know exact markup, we take multiple passes and dedupe.

  var chunks = [];
  var splitters = [
    /class="[^"]*(?:camp|event)[^"]*(?:card|item|row)[^"]*"/gi,
    /class="[^"]*(?:listing|result)[^"]*(?:card|item|row)[^"]*"/gi,
  ];

  // If we can’t find structural chunks, fall back to slicing by "Go to Registration"
  var fallbackSplit = /Go to Registration/gi;

  var usedSplitter = null;
  for (var s = 0; s < splitters.length; s++) {
    var re = splitters[s];
    if (re.test(h)) {
      usedSplitter = re;
      break;
    }
  }

  if (usedSplitter) {
    // crude: split by matches of the splitter pattern
    var parts = h.split(usedSplitter);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p && p.length > 200) chunks.push(p.slice(0, 8000));
    }
    debug.patterns_hit.push("chunk_split:class_card_item");
  } else if (fallbackSplit.test(h)) {
    var parts2 = h.split(fallbackSplit);
    for (var k = 0; k < parts2.length; k++) {
      var p2 = parts2[k];
      if (p2 && p2.length > 200) chunks.push(p2.slice(0, 8000));
    }
    debug.patterns_hit.push("chunk_split:go_to_registration");
  } else {
    chunks = [h.slice(0, 200000)];
    debug.patterns_hit.push("chunk_split:none");
  }

  // Patterns to pull likely school name
  var namePatterns = [
    // Common: "Hardin Simmons University - Football Camps"
    /([A-Z][A-Za-z0-9&.'’-]{2,80}\s(?:University|College|Institute|Polytechnic|State)(?:\s[A-Za-z0-9&.'’-]{0,40})?)/g,

    // Common variants: "University of X", "X State University"
    /((?:University|College|Institute)\s+of\s+[A-Z][A-Za-z0-9&.'’-]{2,80}(?:\s[A-Za-z0-9&.'’-]{0,40})?)/g,
  ];

  // Logo img src
  var imgPattern = /<img[^>]+src="([^"]+)"[^>]*>/i;

  // "View site" / "site" / "football camps"
  var linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi;

  for (var c = 0; c < chunks.length; c++) {
    var chunk = chunks[c];
    if (!chunk) continue;

    // grab logo
    var logoUrl = null;
    var im = chunk.match(imgPattern);
    if (im && im[1]) {
      logoUrl = absolutizeUrl(im[1], baseUrl);
    }

    // find a candidate school name (first good match wins)
    var schoolName = null;

    for (var np = 0; np < namePatterns.length; np++) {
      var reN = namePatterns[np];
      reN.lastIndex = 0;
      var m;
      while ((m = reN.exec(chunk))) {
        var cand = normalizeSpaces(stripTags(m[1] || ""));
        cand = decodeHtmlEntities(cand);
        cand = stripNonAscii(cand);
        cand = normalizeSpaces(cand);

        debug.candidates_seen += 1;

        // Clean suffix like "- Football Camps" if present
        cand = cand.replace(/\s*-\s*.*camps.*$/i, "").trim();

        if (looksLikeCollegeUniversity(cand)) {
          schoolName = cand;
          break;
        }
      }
      if (schoolName) {
        debug.patterns_hit.push("namePattern:" + String(np));
        break;
      }
    }

    if (!schoolName) {
      debug.rejected += 1;
      continue;
    }

    // best-effort city/state from chunk
    var cs = extractCityState(chunk);

    // best-effort source_school_url:
    // prefer a link that includes "footballcampsusa" domain and mentions the school
    var sourceUrl = null;
    linkPattern.lastIndex = 0;
    var lm;
    while ((lm = linkPattern.exec(chunk))) {
      var href = lm[1];
      var label = stripNonAscii(decodeHtmlEntities(stripTags(lm[2] || ""))).toLowerCase();

      var abs = absolutizeUrl(href, baseUrl);
      if (!abs) continue;

      // prefer "view site" or includes the school name slug-ish
      if (label.indexOf("view") >= 0 || label.indexOf("site") >= 0) {
        sourceUrl = abs;
        break;
      }
      if (abs.indexOf(new URL(baseUrl).hostname) >= 0 && abs.indexOf(slugify(schoolName)) >= 0) {
        sourceUrl = abs;
        break;
      }
    }

    // key + dedupe
    var normalized = normalizeSchoolNameForKey(schoolName);
    var sourceKey = "sportsusa:" + slugify(normalized);

    var existing = schoolsByKey.get(sourceKey);
    if (!existing) {
      schoolsByKey.set(sourceKey, {
        school_name: schoolName,
        normalized_name: normalized,
        aliases_json: "[]",
        school_type: "College/University",
        active: true,
        needs_review: false,

        division: "Unknown",
        conference: null,

        city: cs.city,
        state: cs.state,
        country: "US",

        logo_url: logoUrl,
        website_url: null,

        source_platform: "sportsusa",
        source_school_url: sourceUrl || baseUrl,
        source_key: sourceKey,
      });
      debug.accepted += 1;
    } else {
      // merge better fields
      if (!existing.logo_url && logoUrl) existing.logo_url = logoUrl;
      if ((!existing.city || !existing.state) && (cs.city || cs.state)) {
        existing.city = existing.city || cs.city;
        existing.state = existing.state || cs.state;
      }
      if (existing.source_school_url === baseUrl && sourceUrl) existing.source_school_url = sourceUrl;
    }
  }

  return { schools: Array.from(schoolsByKey.values()), debug: debug };
}

function mapSportToBaseUrl(sportName) {
  var s = lc(sportName);

  // SportsUSA family sites
  if (s === "football") return "https://www.footballcampsusa.com/";
  if (s === "soccer" || s === "men's soccer" || s === "women's soccer") return "https://www.soccercampsusa.com/";
  if (s === "baseball") return "https://www.baseballcampsusa.com/";
  if (s === "softball") return "https://www.softballcampsusa.com/";
  if (s === "basketball") return "https://www.basketballcampsusa.com/";

  // Volleyball site may vary; keep configurable via body.indexUrl
  if (s === "volleyball" || s === "vollyball") return "https://www.volleyballcampsusa.com/";

  // Default to football (explicit is better, but this avoids hard failure)
  return "https://www.footballcampsusa.com/";
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    fetch: {},
    parse: {},
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var body = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    var sportName = safeString(body && body.sportName) || "Football";
    var indexUrl = safeString(body && body.indexUrl) || mapSportToBaseUrl(sportName);

    debug.notes.push("sportName=" + sportName);
    debug.notes.push("indexUrl=" + indexUrl);

    var http = 0;
    var html = "";

    try {
      var r = await fetch(indexUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; URecruitHQ/1.0)",
          Accept: "text/html,*/*",
        },
      });
      http = r.status;
      html = await r.text();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Fetch failed", message: String(e && e.message ? e.message : e), debug: debug }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    debug.fetch.http = http;
    debug.fetch.bytes = html ? html.length : 0;

    if (http < 200 || http >= 300) {
      return new Response(JSON.stringify({ error: "Non-200 response", debug: debug }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    var extracted = extractSchoolsFromHtml(html, indexUrl);
    var schools = asArray(extracted.schools);

    // stamp last_seen_at
    var nowIso = new Date().toISOString();
    for (var i = 0; i < schools.length; i++) {
      schools[i].last_seen_at = nowIso;
    }

    debug.parse = extracted.debug;
    debug.parse.schools_returned = schools.length;

    return new Response(
      JSON.stringify({
        stats: {
          http: http,
          schools_found: schools.length,
        },
        debug: debug,
        schools: schools,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    debug.notes.push("top-level error: " + String(e && e.message ? e.message : e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

