// functions/sportsusaSeedSchools.js
// Base44 Backend Function (Deno)
// Seeds School rows from SportsUSA-style directory pages (FootballCampsUSA).
// Returns normalized list for client to upsert into base44.entities.School.
//
// Editor-safe JS: no optional chaining, no nullish coalescing.

var VERSION = "sportsusaSeedSchools_2026-02-02_v1_editor_safe";

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

function normalizedName(name) {
  var s = lc(name);
  s = s.replace(/&amp;/g, "and");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = normalizeSpaces(s);
  return s;
}

function ensureUrl(u) {
  var s = safeString(u);
  if (!s) return null;

  // handle href like "www.example.com"
  if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0) return s;

  if (s.indexOf("//") === 0) return "https:" + s;

  if (s.indexOf("/") === 0) return "https://www.footballcampsusa.com" + s;

  // bare domain
  return "https://" + s;
}

function tryMatchLast(regex, text) {
  var m;
  var last = null;
  while (true) {
    m = regex.exec(text);
    if (!m) break;
    last = m;
  }
  return last;
}

function stripHtmlEntities(s) {
  var t = String(s || "");
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/&quot;/g, "\"");
  t = t.replace(/&#39;/g, "'");
  t = t.replace(/&lt;/g, "<");
  t = t.replace(/&gt;/g, ">");
  return t;
}

// Finds <a ... href="...">View Site</a> and pulls nearby img alt/src.
function parseSchoolsFromHtml(html) {
  var out = [];
  var seen = {}; // key: normalized_name or view site url

  // Match View Site links
  var viewSiteRe = /<a[^>]*href="([^"]+)"[^>]*>\s*View Site\s*<\/a>/gi;

  var match;
  while (true) {
    match = viewSiteRe.exec(html);
    if (!match) break;

    var href = match[1];
    var source_school_url = ensureUrl(href);

    // Look back a chunk to find the closest img alt/src (school card logo)
    var idx = match.index;
    var start = idx - 6000;
    if (start < 0) start = 0;

    var chunk = html.slice(start, idx);

    // Last image alt in chunk
    var altM = tryMatchLast(/alt="([^"]+)"/gi, chunk);
    var srcM = tryMatchLast(/src="([^"]+)"/gi, chunk);

    var school_name = altM && altM[1] ? stripHtmlEntities(altM[1]) : null;
    school_name = safeString(normalizeSpaces(school_name));

    var logo_url = srcM && srcM[1] ? ensureUrl(stripHtmlEntities(srcM[1])) : null;

    if (!school_name || !source_school_url) {
      continue;
    }

    // Clean up common suffix noise like " - Football"
    // Keep it conservative: do not over-normalize the display name.
    var display = school_name;

    var n = normalizedName(display);
    var source_key = "sportsusa:" + n;

    // Dedupe
    var dedupeKey = source_school_url || source_key;
    if (seen[dedupeKey]) continue;
    seen[dedupeKey] = true;

    out.push({
      school_name: display,
      normalized_name: n,
      aliases_json: "[]",
      school_type: "College/University",
      active: true,
      needs_review: false,

      division: "Unknown",
      conference: null,

      city: null,
      state: null,
      country: "US",

      logo_url: logo_url,
      website_url: null,

      source_platform: "sportsusa",
      source_school_url: source_school_url,
      source_key: source_key
    });
  }

  return out;
}

Deno.serve(async function (req) {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: []
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    var body = null;
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    // For now, "Football" seeds from footballcampsusa.com
    var sportName = safeString(body && body.sportName) || "Football";

    var sourceUrl = "https://www.footballcampsusa.com/";
    // You can extend this mapping later for other sports:
    // if (lc(sportName) === "soccer") sourceUrl = "https://www.soccersportsusa.com/";
    // if (lc(sportName) === "baseball") sourceUrl = "https://www.baseballcampsusa.com/";

    var r = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    var http = r.status;
    var html = await r.text();

    if (http < 200 || http >= 300) {
      debug.notes.push("HTTP " + http + " from sourceUrl");
      return new Response(JSON.stringify({ error: "Failed to fetch source", debug: debug }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    var schools = parseSchoolsFromHtml(html);

    return new Response(
      JSON.stringify({
        stats: {
          sportName: sportName,
          sourceUrl: sourceUrl,
          http: http,
          schools_found: schools.length
        },
        debug: debug,
        schools: schools
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (e) {
    debug.notes.push(String(e && e.message ? e.message : e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
