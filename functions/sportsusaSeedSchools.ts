// functions/sportsusaSeedSchools.js
// Base44 Backend Function (Deno)
//
// Purpose: Fetch SportsUSA sport landing page (FootballCampsUSA) and extract
//          one "card" per program/school with logo + view site URL.
//          Returns candidate School rows for AdminImport to upsert.
//
// Notes:
// - Editor-safe: no optional chaining, no nullish coalescing
// - No external imports
// - Sport support: Football only for now (easy to extend)

const VERSION = "sportsusaSeedSchools_2026-02-02_v3_card_safe_parser";

function asString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function safeString(x) {
  var s = asString(x).trim();
  return s ? s : null;
}

function lc(x) {
  return asString(x).toLowerCase().trim();
}

function stripTags(html) {
  // Basic HTML->text (good enough for our parsing windows)
  var s = asString(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<\/?[^>]+>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeName(name) {
  var s = lc(name || "");
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

function simpleHash(str) {
  var s = asString(str);
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return "h" + Math.abs(h);
}

function absolutizeUrl(baseUrl, maybeUrl) {
  var u = safeString(maybeUrl);
  if (!u) return null;
  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("/") === 0) return baseUrl.replace(/\/+$/g, "") + u;
  return baseUrl.replace(/\/+$/g, "") + "/" + u;
}

function sportLandingUrl(sportName) {
  var sn = lc(sportName || "");
  if (sn === "football") return "https://www.footballcampsusa.com/";
  // Extend later: baseballcampsusa, soccercampsusa, etc.
  return null;
}

// Heuristics to infer a canonical school name from title/description
function inferSchoolName(titleText, descText) {
  var title = asString(titleText || "").trim();
  var desc = asString(descText || "").trim();

  // 1) Prefer explicit "on the <SCHOOL> campus"
  // examples on footballcampsusa: "on the Abilene Christian University campus"
  var m1 = desc.match(/on the ([A-Za-z0-9&.'() \-]+?) campus/i);
  if (m1 && m1[1]) {
    var candidate = asString(m1[1]).trim();
    if (candidate.length >= 4) return candidate;
  }

  // 2) "held at <SCHOOL>" (less strong, but useful)
  var m2 = desc.match(/held (?:at|on) ([A-Za-z0-9&.'() \-]+?)(?: in |, |\.|$)/i);
  if (m2 && m2[1]) {
    var cand2 = asString(m2[1]).trim();
    // only accept if it smells like a school
    if (/university|college|institute|state/i.test(cand2)) return cand2;
  }

  // 3) Title already looks like a school/program listing
  // Strip sport suffixes
  var t = title
    .replace(/\s+-\s+football\s*$/i, "")
    .replace(/\s+football\s+camps?\s*$/i, "")
    .replace(/\s+football\s*$/i, "")
    .trim();

  // If it contains University/College, accept
  if (/university|college|institute/i.test(t)) return t;

  // 4) If still not clear, return null (forces review)
  return null;
}

// Some items are clearly not schools/universities (LLCs, generic training, etc.)
function isJunkNonUniversity(titleText, descText) {
  var t = lc(titleText || "");
  var d = lc(descText || "");

  // reject strong non-school signals
  var bad = [
    " llc",
    " training",
    " performance",
    " academy",
    " middle school",
    " high school",
    " elementary",
    " complex",
    " facility",
    " club",
    " recreation",
  ];

  for (var i = 0; i < bad.length; i++) {
    if (t.indexOf(bad[i]) >= 0 || d.indexOf(bad[i]) >= 0) return true;
  }

  return false;
}

// Extract cards by anchoring on the "View Site" link and backtracking to the nearest img + title + description.
function extractCardsFromHtml(html, baseUrl, limit) {
  var out = [];

  // Find "View Site" anchors
  var reView = /<a[^>]*href="([^"]+)"[^>]*>\s*View Site\s*<\/a>/gi;

  var match;
  while ((match = reView.exec(html)) !== null) {
    if (limit && out.length >= limit) break;

    var viewHref = safeString(match[1]);
    if (!viewHref) continue;

    // Window around the View Site link (backtrack to keep the same card)
    var idx = match.index;
    var start = idx - 2600;
    if (start < 0) start = 0;
    var end = idx + 300;
    if (end > html.length) end = html.length;

    var windowHtml = html.slice(start, end);

    // Find the last <img ... alt="..." src="..."> in this window
    var imgAlt = null;
    var imgSrc = null;
    var reImg = /<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"/gi;
    var mImg;
    while ((mImg = reImg.exec(windowHtml)) !== null) {
      imgAlt = safeString(mImg[1]) || imgAlt;
      imgSrc = safeString(mImg[2]) || imgSrc;
    }

    // Find the last "title-ish" text near the view link:
    // many cards have an <h3>Title</h3> or similar; we’ll approximate via text extraction.
    var windowText = stripTags(windowHtml);

    // Try to locate the card’s title by grabbing the last occurrence of imgAlt or a line before "View Site"
    // As a fallback, use imgAlt.
    var title = imgAlt;

    // Description: try to pull a reasonable chunk from windowText by removing the title
    var desc = null;
    if (windowText && title) {
      var pos = windowText.lastIndexOf(title);
      if (pos >= 0) {
        var tail = windowText.slice(pos + title.length).trim();
        // trim at "View Site" if present
        var vs = tail.indexOf("View Site");
        if (vs >= 0) tail = tail.slice(0, vs).trim();
        desc = tail || null;
      }
    }

    var logoUrl = absolutizeUrl(baseUrl, imgSrc);
    var viewUrl = absolutizeUrl(baseUrl, viewHref);

    // Deduplicate by view url
    var key = viewUrl ? simpleHash(viewUrl) : simpleHash(title || ("row" + out.length));
    out.push({
      title: title,
      description: desc,
      logo_url: logoUrl,
      view_site_url: viewUrl,
      source_key: key,
    });
  }

  // De-dupe by view_site_url
  var seen = {};
  var deduped = [];
  for (var j = 0; j < out.length; j++) {
    var v = out[j].view_site_url || ("nokey:" + out[j].source_key);
    if (!seen[v]) {
      seen[v] = true;
      deduped.push(out[j]);
    }
  }

  return deduped;
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
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

    var sportName = safeString(body && body.sportName) || "Football";
    var limit = Number((body && body.limit) || 300);
    var dryRun = !!(body && body.dryRun);

    var url = sportLandingUrl(sportName);
    if (!url) {
      return new Response(JSON.stringify({ error: "Unsupported sportName for SportsUSA seed", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    var resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Base44SeedBot)",
        Accept: "text/html,*/*",
      },
    });

    var http = resp.status;
    var html = await resp.text();

    debug.http = http;
    debug.bytes = html ? html.length : 0;
    debug.sourceUrl = url;

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: "SportsUSA fetch failed", http: http, debug: debug }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    var cards = extractCardsFromHtml(html, url.replace(/\/+$/g, ""), limit);

    var schools = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var title = safeString(c.title) || "";
      var desc = safeString(c.description) || "";

      if (isJunkNonUniversity(title, desc)) {
        continue;
      }

      var inferred = inferSchoolName(title, desc);
      var needsReview = false;

      var schoolNameGuess = inferred;
      if (!schoolNameGuess) {
        // If we can’t confidently infer, fall back to title but force review
        schoolNameGuess = title ? title : null;
        needsReview = true;
      }

      // Hard gate: must look like a college/university *somewhere*
      var looksSchool =
        /university|college|institute|state/i.test(schoolNameGuess || "") ||
        /university|college|institute|state/i.test(desc || "");

      if (!looksSchool) {
        // drop obvious non-school programs (keeps your "university only" requirement tight)
        continue;
      }

      var normalized = normalizeName(schoolNameGuess) || null;

      schools.push({
        school_name_guess: schoolNameGuess,
        normalized_name: normalized,
        logo_url: c.logo_url || null,
        view_site_url: c.view_site_url || null,
        source_platform: "sportsusa",
        source_school_url: c.view_site_url || null,
        source_key: c.source_key || null,
        needs_review: needsReview,
        sport_name: sportName,
      });
    }

    var result = {
      stats: {
        sportName: sportName,
        http: http,
        cards_found: cards.length,
        schools_found: schools.length,
        dryRun: dryRun,
        limit: limit,
      },
      debug: debug,
      schools: dryRun ? schools.slice(0, 50) : schools,
      sample: schools.slice(0, 5),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    debug.notes.push("top-level error: " + asString(e && e.message ? e.message : e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
