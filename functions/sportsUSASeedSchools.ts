// functions/sportsUSASeedSchools.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Fetch a SportsUSA sport directory site (e.g., https://www.footballcampsusa.com)
// - Parse school "tiles" / blocks and extract:
//   - school_name (from image alt)
//   - logo_url (from image src)
//   - view_site_url (from "View Site" anchor href)
// - Return normalized list to AdminImport
//
// Notes:
// - No optional chaining (Base44 editor-safe).
// - No external imports (regex-based parsing).
// - This is a "seed schools" collector, not camps ingestion.

const VERSION = "sportsUSASeedSchools_2026-02-02_v3_editor_safe_regex_parser";

function safeString(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  return s ? s : null;
}

function stripNonAscii(s) {
  return String(s || "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lc(s) {
  return String(s || "").toLowerCase().trim();
}

function absUrl(baseUrl, maybeRelative) {
  var u = safeString(maybeRelative);
  if (!u) return null;
  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("/") === 0) {
    // join to origin
    try {
      var b = new URL(baseUrl);
      return b.origin + u;
    } catch (e) {
      return u;
    }
  }
  // relative path
  try {
    return new URL(u, baseUrl).toString();
  } catch (e2) {
    return u;
  }
}

function normalizeSchoolName(raw, sportName) {
  var name = stripNonAscii(raw || "");
  if (!name) return null;

  // Remove trailing sport qualifier like " - Football" when sportName provided.
  if (sportName) {
    var sn = stripNonAscii(sportName);
    var re = new RegExp("\\s*-\\s*" + sn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i");
    name = name.replace(re, "").trim();
  }

  return name || null;
}

function makeSourceKey(viewSiteUrl, schoolName) {
  var v = safeString(viewSiteUrl);
  if (v) return "view:" + lc(v);
  var n = safeString(schoolName);
  if (n) return "name:" + lc(n);
  return null;
}

function parseSchoolsFromHtml(html, siteUrl, sportName, limit) {
  var out = [];
  if (!html) return out;

  // Strategy:
  // - Find each "View Site" anchor
  // - Walk backward within a window to find the closest preceding <img ... alt="X" ... src="Y">
  //
  // This matches the structure visible on footballcampsusa.com pages.

  var viewRe = /<a[^>]*href="([^"]+)"[^>]*>\s*View Site\s*<\/a>/gi;

  var match;
  while ((match = viewRe.exec(html)) !== null) {
    if (limit && out.length >= limit) break;

    var href = match[1];
    var viewSiteUrl = absUrl(siteUrl, href);

    // Look back up to ~6000 chars for the nearest preceding <img ...>
    var idx = match.index;
    var start = idx - 6000;
    if (start < 0) start = 0;
    var windowText = html.slice(start, idx);

    // Find last <img ...> in the window
    var imgRe = /<img[^>]*>/gi;
    var imgTag = null;
    var m2;
    while ((m2 = imgRe.exec(windowText)) !== null) {
      imgTag = m2[0];
    }

    var alt = null;
    var src = null;

    if (imgTag) {
      var altM = /alt="([^"]*)"/i.exec(imgTag);
      if (altM && altM[1] !== undefined) alt = stripNonAscii(altM[1]);

      var srcM = /src="([^"]*)"/i.exec(imgTag);
      if (srcM && srcM[1] !== undefined) src = stripNonAscii(srcM[1]);
    }

    var logoUrl = absUrl(siteUrl, src);

    // Some images on these sites can be generic placeholders; we still keep them,
    // but AdminImport can later mark needs_review=true if logo looks generic.
    var schoolName = normalizeSchoolName(alt, sportName);

    if (!schoolName) continue;

    out.push({
      school_name: schoolName,
      logo_url: logoUrl,
      view_site_url: viewSiteUrl,
      source_key: makeSourceKey(viewSiteUrl, schoolName),
      source_platform: "sportsusa",
      source_school_url: viewSiteUrl || siteUrl,
    });
  }

  return out;
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    siteUrl: null,
    http: null,
    notes: [],
    sample: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var body = await req.json().catch(function () {
      return null;
    });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var siteUrl = safeString(body && body.siteUrl); // required
    var limit = Number(body && body.limit !== undefined ? body.limit : 300);
    var dryRun = !!(body && body.dryRun);

    debug.siteUrl = siteUrl;

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!siteUrl) {
      return new Response(JSON.stringify({ error: "Missing required: siteUrl", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    var r = await fetch(siteUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
        Accept: "text/html,*/*",
      },
    });

    debug.http = r.status;

    var html = await r.text();

    if (!r.ok) {
      debug.notes.push("Non-200 response from site");
      return new Response(
        JSON.stringify({
          error: "Failed to fetch site",
          stats: { schools_found: 0, http: r.status },
          debug: debug,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    var schools = parseSchoolsFromHtml(html, siteUrl, sportName, limit);

    debug.sample = schools.slice(0, 3);

    return new Response(
      JSON.stringify({
        stats: {
          http: r.status,
          schools_found: schools.length,
          dryRun: dryRun,
          limit: limit,
        },
        debug: debug,
        schools: schools,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    debug.notes.push("top-level error: " + String((e && e.message) || e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});