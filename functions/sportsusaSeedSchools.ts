// functions/sportsusaSeedSchools.js
// Base44 Backend Function (Deno)
// Seeds School rows (logo + View Site URL) from FootballCampsUSA directory.
//
// Editor-safe: no optional chaining, no nullish coalescing.
// Returns data only. Client/UI decides whether to upsert into DB.

var VERSION = "sportsusaSeedSchools_2026-02-02_v1_editor_safe";

function asString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function safeTrim(x) {
  var s = asString(x).trim();
  return s ? s : "";
}

function lc(x) {
  return safeTrim(x).toLowerCase();
}

function stripNonAscii(s) {
  return asString(s).replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(name) {
  var s = lc(name);
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function hostFromUrl(url) {
  try {
    var u = new URL(url);
    return lc(u.hostname);
  } catch (e) {
    return "";
  }
}

function absolutizeUrl(baseUrl, maybeRelative) {
  var href = safeTrim(maybeRelative);
  if (!href) return "";
  try {
    // already absolute
    new URL(href);
    return href;
  } catch (e) {
    // relative
    try {
      return new URL(href, baseUrl).toString();
    } catch (e2) {
      return href;
    }
  }
}

// Reject obvious non-college hosts (fail-closed-ish; tune as needed)
function rejectProgramNameReason(name) {
  var n = lc(stripNonAscii(name));
  if (!n) return "missing_name";
  if (n.length < 4) return "name_too_short";

  var rejectContains = [
    "middle school",
    "high school",
    "elementary",
    "academy",
    "club",
    "training",
    "performance",
    "facility",
    "complex"
  ];

  for (var i = 0; i < rejectContains.length; i++) {
    if (n.indexOf(rejectContains[i]) >= 0) return "reject_term:" + rejectContains[i];
  }

  return "";
}

function cleanDisplayName(rawAltOrTitle) {
  var s = stripNonAscii(rawAltOrTitle || "");
  // SportsUSA image alts often include " - Football"
  s = s.replace(/\s*-\s*football\s*$/i, "");
  s = s.replace(/\s*\(\s*football\s*\)\s*$/i, "");
  return s.trim();
}

// Parse HTML by finding every "View Site" link and grabbing nearby img alt/src and visible title.
// This is intentionally tolerant and may need tuning as the site evolves.
function parseDirectoryHtml(html, baseUrl) {
  var out = [];
  var seen = {};

  // Match all <a ... href="...">View Site</a>
  var reView = /<a\b[^>]*href="([^"]+)"[^>]*>\s*View Site\s*<\/a>/gi;

  var m;
  while ((m = reView.exec(html)) !== null) {
    var href = m[1];
    var viewSiteUrl = absolutizeUrl(baseUrl, href);
    var host = hostFromUrl(viewSiteUrl);
    if (!host) continue;

    // Look back a bit to find the closest preceding <img ... alt="..."> and src="..."
    var start = Math.max(0, m.index - 2500);
    var windowHtml = html.slice(start, m.index);

    // Find last img in the window
    var imgAlt = "";
    var imgSrc = "";

    var reImg = /<img\b[^>]*>/gi;
    var imgMatch;
    var lastImgTag = "";
    while ((imgMatch = reImg.exec(windowHtml)) !== null) {
      lastImgTag = imgMatch[0];
    }

    if (lastImgTag) {
      var altMatch = /alt="([^"]*)"/i.exec(lastImgTag);
      var srcMatch = /src="([^"]*)"/i.exec(lastImgTag);
      imgAlt = altMatch && altMatch[1] ? altMatch[1] : "";
      imgSrc = srcMatch && srcMatch[1] ? srcMatch[1] : "";
    }

    var display = cleanDisplayName(imgAlt);
    if (!display) {
      // Fallback: try to find some nearby text before View Site (very loose)
      // This is just a best-effort.
      var textSnippet = windowHtml.replace(/<[^>]+>/g, " ");
      textSnippet = stripNonAscii(textSnippet);
      display = textSnippet.split("View Site")[0] || "";
      display = display.slice(-90).trim();
    }

    var rejectReason = rejectProgramNameReason(display);
    if (rejectReason) {
      // We still return rejected rows for tuning/visibility
      out.push({
        ok: false,
        reason: rejectReason,
        school_name: display,
        camp_site_url: viewSiteUrl,
        logo_url: imgSrc ? absolutizeUrl(baseUrl, imgSrc) : "",
        source_key: "sportsusa:football:" + host
      });
      continue;
    }

    var sourceKey = "sportsusa:football:" + host;
    if (seen[sourceKey]) continue;
    seen[sourceKey] = true;

    out.push({
      ok: true,
      school_name: display,
      normalized_name: normalizeName(display),
      aliases_json: "[]",
      school_type: "College/University",
      active: true,
      needs_review: true,

      logo_url: imgSrc ? absolutizeUrl(baseUrl, imgSrc) : "",
      camp_site_url: viewSiteUrl,

      source_platform: "sportsusa",
      source_school_url: baseUrl,
      source_key: sourceKey,
      last_seen_at: new Date().toISOString()
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

    var listUrl = safeTrim(body && body.listUrl ? body.listUrl : "");
    if (!listUrl) listUrl = "https://www.footballcampsusa.com/";

    var res = await fetch(listUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    var http = res.status;
    var html = await res.text();

    if (http < 200 || http >= 300) {
      debug.notes.push("Directory fetch failed: HTTP " + http);
      return new Response(JSON.stringify({ error: "Fetch failed", http: http, debug: debug }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    var rows = parseDirectoryHtml(html, listUrl);

    var ok = 0;
    var rejected = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].ok) ok += 1;
      else rejected += 1;
    }

    return new Response(JSON.stringify({
      stats: {
        ok: ok,
        rejected: rejected,
        total: rows.length
      },
      debug: debug,
      schools: rows
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    debug.notes.push("Unhandled error: " + asString(e && e.message ? e.message : e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});