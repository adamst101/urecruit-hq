// functions/sportsUSASeedSchools.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Fetch a SportsUSA sport directory page (e.g., https://www.footballcampsusa.com/)
// - Extract a SCHOOL LIST (university only, best-effort) from listing pages that show camps.
// - Return normalized school objects to AdminImport for upsert into School.
//
// Important:
// - SportsUSA pages vary: some show "View Site", some show "Go to Registration" cards.
// - This parser supports multiple patterns and dedupes hard.
//
// Editor-safe constraints:
// - No optional chaining
// - No external imports
// - Regex/string parsing only

const VERSION = "sportsUSASeedSchools_2026-02-02_v4_multi_pattern_parser";

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
    try {
      var b = new URL(baseUrl);
      return b.origin + u;
    } catch (e) {
      return u;
    }
  }

  try {
    return new URL(u, baseUrl).toString();
  } catch (e2) {
    return u;
  }
}

function isProbablyUniversityName(name) {
  var n = lc(stripNonAscii(name || ""));
  if (!n) return false;

  // keep it permissive but still exclude obvious non-university hosts
  var reject = [
    "middle school",
    "high school",
    "elementary",
    "academy",
    "club",
    "training",
    "performance",
    "llc",
    "inc",
    "complex",
    "facility",
    "youth",
  ];
  for (var i = 0; i < reject.length; i++) {
    if (n.indexOf(reject[i]) >= 0) return false;
  }

  // positive signals (broad)
  var allow = [
    "university",
    "college",
    "state",
    "institute",
    "polytechnic",
    "tech",
    "a&m",
    "community college",
    "junior college",
    "jc",
    "school of",
  ];

  for (var j = 0; j < allow.length; j++) {
    if (n.indexOf(allow[j]) >= 0) return true;
  }

  // If it doesn't match allow list, still allow it if it *looks* like a school
  // (e.g., "UW - Oshkosh", "Hardin Simmons", etc.)
  // We'll accept here and rely on downstream review if needed.
  return true;
}

function normalizeSchoolName(raw, sportName) {
  var name = stripNonAscii(raw || "");
  if (!name) return null;

  // Remove trailing sport qualifier like " - Football" or " - Football Camps" etc.
  if (sportName) {
    var sn = stripNonAscii(sportName);
    // remove " - Football" or " - Football Camps"
    var re1 = new RegExp("\\s*-\\s*" + escapeReg(sn) + "\\s*$", "i");
    var re2 = new RegExp("\\s*-\\s*" + escapeReg(sn) + "\\s+camps\\s*$", "i");
    name = name.replace(re2, "").replace(re1, "").trim();
  }

  // Also remove trailing "- Camps"
  name = name.replace(/\s*-\s*camps\s*$/i, "").trim();

  return name || null;
}

function escapeReg(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeSourceKey(viewSiteUrl, schoolName) {
  var v = safeString(viewSiteUrl);
  if (v) return "view:" + lc(v);
  var n = safeString(schoolName);
  if (n) return "name:" + lc(n);
  return null;
}

function looksLikePlaceholderLogo(url) {
  var u = lc(url || "");
  if (!u) return false;
  // Example placeholder you saw: /images/logo-athletic.png
  if (u.indexOf("logo-athletic") >= 0) return true;
  if (u.indexOf("placeholder") >= 0) return true;
  return false;
}

function parseNearestImg(windowText, siteUrl) {
  var imgRe = /<img[^>]*>/gi;
  var imgTag = null;
  var m;
  while ((m = imgRe.exec(windowText)) !== null) {
    imgTag = m[0];
  }
  if (!imgTag) return { alt: null, src: null, logo_url: null };

  var alt = null;
  var src = null;

  var altM = /alt="([^"]*)"/i.exec(imgTag);
  if (altM && altM[1] !== undefined) alt = stripNonAscii(altM[1]);

  var srcM = /src="([^"]*)"/i.exec(imgTag);
  if (srcM && srcM[1] !== undefined) src = stripNonAscii(srcM[1]);

  var logoUrl = absUrl(siteUrl, src);
  return { alt: alt, src: src, logo_url: logoUrl };
}

function dedupePush(out, seen, item) {
  var key = safeString(item && item.source_key);
  if (!key) return;

  if (seen[key]) return;
  seen[key] = true;
  out.push(item);
}

// ---------------------------
// Pattern 1: "View Site" anchors (when present)
// ---------------------------
function parseByViewSite(html, siteUrl, sportName, limit, out, seen) {
  var viewRe = /<a[^>]*href="([^"]+)"[^>]*>\s*View Site\s*<\/a>/gi;
  var match;

  while ((match = viewRe.exec(html)) !== null) {
    if (limit && out.length >= limit) break;

    var href = match[1];
    var viewSiteUrl = absUrl(siteUrl, href);

    var idx = match.index;
    var start = idx - 6000;
    if (start < 0) start = 0;
    var windowText = html.slice(start, idx);

    var img = parseNearestImg(windowText, siteUrl);

    var schoolName = normalizeSchoolName(img.alt, sportName);
    if (!schoolName) continue;
    if (!isProbablyUniversityName(schoolName)) continue;

    var item = {
      school_name: schoolName,
      logo_url: img.logo_url,
      view_site_url: viewSiteUrl,
      source_key: makeSourceKey(viewSiteUrl, schoolName),
      source_platform: "sportsusa",
      source_school_url: viewSiteUrl || siteUrl,
      logo_is_placeholder: looksLikePlaceholderLogo(img.logo_url),
    };

    dedupePush(out, seen, item);
  }
}

// ---------------------------
// Pattern 2: School line like: "Hardin Simmons University - Football Camps"
// Often appears as an anchor or text line inside the camp listing cards.
// ---------------------------
function parseBySchoolCampsLine(html, siteUrl, sportName, limit, out, seen) {
  // Capture text content that looks like: {School Name} - {Sport} Camps
  // Keep permissive: anything ending with "Camps"
  var re = />\s*([^<]{3,120}?)\s*-\s*([^<]{3,40}?)\s*Camps\s*</gi;
  var m;

  while ((m = re.exec(html)) !== null) {
    if (limit && out.length >= limit) break;

    var schoolRaw = stripNonAscii(m[1]);
    var sportRaw = stripNonAscii(m[2]);

    // If sportName provided, prefer matching it, but don't require (site sometimes uses variations)
    if (sportName) {
      var sn = lc(sportName);
      var sr = lc(sportRaw);
      if (sr && sn && sr !== sn) {
        // allow common variants (e.g., "Men's Soccer" vs "Soccer")
        // If it is clearly a different sport, skip
        if (sr.indexOf(sn) < 0 && sn.indexOf(sr) < 0) {
          continue;
        }
      }
    }

    var schoolName = normalizeSchoolName(schoolRaw, sportName);
    if (!schoolName) continue;
    if (!isProbablyUniversityName(schoolName)) continue;

    // Look backward near this match for a logo <img>
    var idx = m.index;
    var start = idx - 5000;
    if (start < 0) start = 0;
    var windowText = html.slice(start, idx);

    var img = parseNearestImg(windowText, siteUrl);

    // Try to find the closest preceding <a href="..."> wrapping this line (school/camps page)
    // We'll search in the same window for the last href
    var aHref = null;
    var aRe = /<a[^>]*href="([^"]+)"[^>]*>\s*[^<]*$/gi;
    var m2;
    while ((m2 = aRe.exec(windowText)) !== null) {
      aHref = m2[1];
    }

    var schoolPageUrl = absUrl(siteUrl, aHref);

    var item = {
      school_name: schoolName,
      logo_url: img.logo_url,
      view_site_url: schoolPageUrl,
      source_key: makeSourceKey(schoolPageUrl, schoolName),
      source_platform: "sportsusa",
      source_school_url: schoolPageUrl || siteUrl,
      logo_is_placeholder: looksLikePlaceholderLogo(img.logo_url),
    };

    dedupePush(out, seen, item);
  }
}

// ---------------------------
// Pattern 3: "Go to Registration" cards
// If the page is primarily camp occurrences, we still want the SCHOOL identity.
// We'll treat each "Go to Registration" button as a card anchor, then look backward for a
// nearby school line and logo.
// ---------------------------
function parseByGoToRegistration(html, siteUrl, sportName, limit, out, seen) {
  var btnRe = /<a[^>]*href="([^"]+)"[^>]*>\s*Go to Registration\s*<\/a>/gi;
  var m;

  while ((m = btnRe.exec(html)) !== null) {
    if (limit && out.length >= limit) break;

    var regUrl = absUrl(siteUrl, m[1]);

    var idx = m.index;
    var start = idx - 9000;
    if (start < 0) start = 0;
    var windowText = html.slice(start, idx);

    var img = parseNearestImg(windowText, siteUrl);

    // Find a school-ish line in the window: "XYZ University" or "XYZ College"
    // Usually appears above.
    var schoolGuess = null;

    // Prefer lines like "{School} - {Sport} Camps"
    var scRe = /([^<]{3,120}?)\s*-\s*([^<]{3,40}?)\s*Camps/i;
    var scM = scRe.exec(windowText);
    if (scM && scM[1]) {
      schoolGuess = stripNonAscii(scM[1]);
    }

    // Fallback: use img alt
    if (!schoolGuess) schoolGuess = img.alt;

    var schoolName = normalizeSchoolName(schoolGuess, sportName);
    if (!schoolName) continue;
    if (!isProbablyUniversityName(schoolName)) continue;

    // We do NOT want regUrl as "view_site_url" (it is a camp occurrence),
    // but it's better than nothing if we can't find a school page link.
    // So: try to locate a non-registration link in the window that looks like a school page.
    var schoolPageUrl = null;

    // Look for an internal link that contains the word "camps" but not "register" / not ryzer
    var aRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
    var a;
    while ((a = aRe.exec(windowText)) !== null) {
      var href = a[1];
      var full = absUrl(siteUrl, href);
      var lf = lc(full || "");
      if (!full) continue;
      if (lf.indexOf("register") >= 0) continue;
      if (lf.indexOf("ryzer.com") >= 0) continue;
      if (lf.indexOf("camp.cfm") >= 0) continue;
      if (lf.indexOf("camps") >= 0) {
        schoolPageUrl = full;
      }
    }

    var item = {
      school_name: schoolName,
      logo_url: img.logo_url,
      view_site_url: schoolPageUrl || null,
      source_key: makeSourceKey(schoolPageUrl || regUrl, schoolName),
      source_platform: "sportsusa",
      source_school_url: schoolPageUrl || siteUrl,
      logo_is_placeholder: looksLikePlaceholderLogo(img.logo_url),
      // keep the registration url as a hint (optional)
      sample_registration_url: regUrl,
    };

    dedupePush(out, seen, item);
  }
}

// ---------------------------
// Main parser: run patterns in order
// ---------------------------
function parseSchoolsFromHtml(html, siteUrl, sportName, limit) {
  var out = [];
  var seen = {};

  if (!html) return out;

  // 1) View Site pattern (if present)
  parseByViewSite(html, siteUrl, sportName, limit, out, seen);

  // 2) School - Sport Camps line pattern
  if (!limit || out.length < limit) {
    parseBySchoolCampsLine(html, siteUrl, sportName, limit, out, seen);
  }

  // 3) Go to Registration cards fallback
  if (!limit || out.length < limit) {
    parseByGoToRegistration(html, siteUrl, sportName, limit, out, seen);
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
          stats: { schools_found: 0, http: r.status, dryRun: dryRun, limit: limit },
          debug: debug,
          schools: [],
          sample: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    var schools = parseSchoolsFromHtml(html, siteUrl, sportName, limit);

    debug.sample = schools.slice(0, 5);

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
        sample: schools.slice(0, 5),
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           