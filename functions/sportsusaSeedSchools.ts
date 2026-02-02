// functions/sportsUSASeedSchools.js
// Base44 Backend Function (Deno)
// Purpose: Fetch SportUSA "school list" pages (footballcampsusa, soccercampsusa, etc.)
// and return parsed schools: {school_name, logo_url, source_school_url, source_key}
//
// IMPORTANT:
// - This function does NOT write to your DB.
// - AdminImport receives results and upserts into School.
// - "Editor-safe": no optional chaining.

const VERSION = "sportsUSASeedSchools_2026-02-02_v1_editor_safe";

function safeString(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  return s ? s : null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function truncate(s, n) {
  var str = String(s || "");
  var max = typeof n === "number" ? n : 1200;
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
}

function uniqBy(arr, keyFn) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var k = keyFn(arr[i]);
    if (!k) continue;
    if (seen[k]) continue;
    seen[k] = true;
    out.push(arr[i]);
  }
  return out;
}

function normalizeName(name) {
  var s = String(name || "").toLowerCase();
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Heuristic HTML parsing. We try multiple patterns and log counts.
// This is intentionally "best effort" because SportsUSA markup can vary.
function parseSchoolsFromHtml(html, baseUrl) {
  var results = [];
  var h = String(html || "");

  // Pattern A: cards with "View Site" links (external camp site)
  // We capture external URLs and try to grab a nearby title-ish string.
  //
  // This is robust-ish: find any external link not on the base domain.
  var baseHost = "";
  try {
    baseHost = new URL(baseUrl).host;
  } catch {}

  var linkRegex = /href\s*=\s*"([^"]+)"/gi;
  var m;
  var links = [];
  while ((m = linkRegex.exec(h)) !== null) {
    var href = m[1];
    if (!href) continue;
    if (href.indexOf("mailto:") === 0) continue;
    if (href.indexOf("tel:") === 0) continue;
    if (href.indexOf("#") === 0) continue;

    // Make absolute
    var abs = href;
    if (href.indexOf("http://") !== 0 && href.indexOf("https://") !== 0) {
      try {
        abs = new URL(href, baseUrl).toString();
      } catch {
        abs = href;
      }
    }

    // Filter to external sites (not the SportsUSA domain itself)
    var isExternal = true;
    try {
      var host = new URL(abs).host;
      if (host === baseHost) isExternal = false;
    } catch {}

    if (isExternal) links.push(abs);
  }

  // Reduce noise (social links, etc.)
  var cleaned = [];
  for (var i = 0; i < links.length; i++) {
    var u = links[i];
    var low = lc(u);
    if (low.indexOf("facebook.com") > -1) continue;
    if (low.indexOf("instagram.com") > -1) continue;
    if (low.indexOf("twitter.com") > -1) continue;
    if (low.indexOf("x.com") > -1) continue;
    if (low.indexOf("youtube.com") > -1) continue;
    if (low.indexOf("tiktok.com") > -1) continue;
    cleaned.push(u);
  }

  cleaned = uniqBy(cleaned, function (x) { return x; });

  // Pattern B: try to collect logos near cards
  // Collect all img src + alt and later map by proximity (best effort)
  var imgRegex = /<img[^>]*src\s*=\s*"([^"]+)"[^>]*>/gi;
  var img;
  var imgs = [];
  while ((img = imgRegex.exec(h)) !== null) {
    var src = img[1] || "";
    var tag = img[0] || "";
    var altMatch = /alt\s*=\s*"([^"]*)"/i.exec(tag);
    var alt = altMatch ? altMatch[1] : "";
    imgs.push({ src: src, alt: alt });
  }

  // Build “school” objects from external links (most reliable anchor we have)
  for (var j = 0; j < cleaned.length; j++) {
    var viewUrl = cleaned[j];

    // Use hostname as a fallback source_key
    var key = null;
    try {
      key = "sportsusa:" + new URL(viewUrl).host;
    } catch {
      key = "sportsusa:" + viewUrl;
    }

    // Attempt to infer a human name (weak fallback)
    var inferredName = null;
    try {
      var host2 = new URL(viewUrl).host.replace(/^www\./i, "");
      inferredName = host2
        .replace(/\.(com|net|org|edu)$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (inferredName) inferredName = inferredName.toUpperCase().slice(0, 1) + inferredName.slice(1);
    } catch {}

    results.push({
      school_name: inferredName || "Unknown School",
      normalized_name: normalizeName(inferredName || ""),
      logo_url: null,
      source_school_url: viewUrl,
      source_key: key
    });
  }

  // Attach a “best guess” logo: pick first non-empty logo on the page (fallback)
  // NOTE: Real mapping requires tighter selectors; we’ll improve once we see real HTML patterns.
  var firstLogo = null;
  for (var k = 0; k < imgs.length; k++) {
    var src2 = safeString(imgs[k].src);
    if (!src2) continue;
    if (src2.indexOf("data:") === 0) continue;
    firstLogo = src2;
    break;
  }
  if (firstLogo) {
    for (var t = 0; t < results.length; t++) {
      results[t].logo_url = firstLogo;
    }
  }

  // Deduplicate by source_key
  results = uniqBy(results, function (r) { return r.source_key; });

  return {
    schools: results,
    debug: {
      externalLinksFound: cleaned.length,
      imagesFound: imgs.length,
      baseHost: baseHost || null
    }
  };
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    pages: []
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
    } catch {
      body = null;
    }

    var sportName = safeString(body && body.sportName) || "";
    var limit = Number(body && body.limit);
    if (!isFinite(limit) || limit <= 0) limit = 300;

    // AdminImport will pass sites[] from your SchoolSportSite table.
    var sites = asArray(body && body.sites);

    if (!sites.length) {
      return new Response(JSON.stringify({
        error: "Missing sites[]. AdminImport must pass SchoolSportSite rows (with list_url/base_url).",
        debug: debug
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    var allSchools = [];
    var httpAny = 200;

    for (var i = 0; i < sites.length; i++) {
      if (allSchools.length >= limit) break;

      var site = sites[i] || {};
      var listUrl =
        safeString(site.list_url) ||
        safeString(site.schools_url) ||
        safeString(site.seed_url) ||
        safeString(site.base_url) ||
        safeString(site.url) ||
        null;

      if (!listUrl) {
        debug.pages.push({ siteIndex: i, error: "missing list_url/base_url", site: site });
        continue;
      }

      var res = null;
      var text = "";
      var status = 0;

      try {
        res = await fetch(listUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Base44Bot/1.0 (School Seeder)",
            "Accept": "text/html,application/xhtml+xml"
          }
        });

        status = res.status;
        httpAny = status;
        text = await res.text();

        var parsed = parseSchoolsFromHtml(text, listUrl);
        var schools = asArray(parsed && parsed.schools);

        debug.pages.push({
          siteIndex: i,
          listUrl: listUrl,
          http: status,
          found: schools.length,
          parseDebug: parsed && parsed.debug ? parsed.debug : {},
          snippet: truncate(text, 800)
        });

        // Add, but cap
        for (var j = 0; j < schools.length; j++) {
          if (allSchools.length >= limit) break;
          // tag it
          schools[j].sport_name = sportName || null;
          schools[j].source_platform = "sportsusa";
          allSchools.push(schools[j]);
        }
      } catch (e) {
        debug.pages.push({
          siteIndex: i,
          listUrl: listUrl,
          http: status || 0,
          error: String(e && e.message ? e.message : e)
        });
      }
    }

    // De-dupe again
    allSchools = uniqBy(allSchools, function (r) { return r.source_key; });

    // Final cap
    if (allSchools.length > limit) allSchools = allSchools.slice(0, limit);

    var response = {
      stats: {
        http: httpAny,
        sportName: sportName || null,
        sites_in: sites.length,
        schools_found: allSchools.length,
        limit: limit
      },
      sample: allSchools.slice(0, Math.min(8, allSchools.length)),
      schools: allSchools,
      debug: debug
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    debug.notes.push("top-level error: " + String(e && e.message ? e.message : e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     