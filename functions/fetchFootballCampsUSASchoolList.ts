// functions/fetchFootballCampsUSASchoolList.js
// v4: Proper card-boundary parsing using <div class="listItem"> as delimiter.
// Each card contains: schoolLogo img, span.school, p (description), a.viewSite.

const VERSION = "fetchFootballCampsUSASchoolList_v4";

Deno.serve(async (req) => {
  const started = Date.now();
  if (req.method !== "POST") {
    return Response.json({ error: "POST only", version: VERSION }, { status: 405 });
  }

  try {
    const resp = await fetch("https://www.footballcampsusa.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
        Accept: "text/html,*/*",
      },
    });
    if (!resp.ok) {
      return Response.json({ error: `HTTP ${resp.status}`, version: VERSION }, { status: 502 });
    }

    const html = await resp.text();

    // Split on <div class="listItem" to get individual card chunks
    const chunks = html.split('<div class="listItem"');
    // First chunk is everything before the first card — skip it
    const cardChunks = chunks.slice(1);

    const programs = [];

    for (var i = 0; i < cardChunks.length; i++) {
      var card = cardChunks[i];

      // Extract program name from <span class="school">...</span>
      var nameMatch = /<span class="school">([^<]+)<\/span>/i.exec(card);
      var name = nameMatch ? nameMatch[1].trim() : null;

      // Extract logo from <img ... class="schoolLogo" ... src="...">
      var logoMatch = /src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*class="schoolLogo"/i.exec(card);
      if (!logoMatch) {
        logoMatch = /class="schoolLogo"[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"/i.exec(card);
      }
      // Also try: src comes before class in the img tag
      if (!logoMatch) {
        logoMatch = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/i.exec(card);
      }
      var logoUrl = logoMatch ? logoMatch[1] : null;

      // If name not found from span, try img alt
      if (!name) {
        var altMatch = /alt="([^"]+)"/i.exec(card);
        name = altMatch ? altMatch[1].trim() : "(unknown)";
      }

      // Extract URL from <a href="..." class="viewSite">
      var urlMatch = /<a\s+href="([^"]+)"[^>]*class="viewSite"/i.exec(card);
      if (!urlMatch) {
        urlMatch = /class="viewSite"[^>]*href="([^"]+)"/i.exec(card);
      }
      if (!urlMatch) {
        urlMatch = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site/i.exec(card);
      }
      var url = urlMatch ? urlMatch[1].trim() : null;

      // Extract description from <p>...</p> inside <div class="extraInfo">
      var descMatch = /<p>([^<]+(?:<[^>]+>[^<]*)*)<\/p>/i.exec(card);
      var description = descMatch ? stripTags(descMatch[1]).trim() : null;

      // Extract school name + city/state from description
      var extracted = extractSchoolFromDescription(description);

      programs.push({
        name: name || "(unknown)",
        url: url || null,
        logo_url: logoUrl || null,
        description: description || null,
        extracted_school: extracted.school,
        extracted_city: extracted.city,
        extracted_state: extracted.state,
      });
    }

    // Dedupe by URL
    var seen = {};
    var deduped = [];
    for (var j = 0; j < programs.length; j++) {
      var p = programs[j];
      var key = (p.url || "").toLowerCase().replace(/\/+$/, "");
      if (!key || seen[key]) continue;
      seen[key] = true;
      deduped.push(p);
    }

    var withDesc = deduped.filter(function(p) { return p.description; }).length;
    var withSchool = deduped.filter(function(p) { return p.extracted_school; }).length;

    return Response.json({
      ok: true,
      version: VERSION,
      htmlLength: html.length,
      cardChunksFound: cardChunks.length,
      totalFound: deduped.length,
      withDescription: withDesc,
      withExtractedSchool: withSchool,
      sample: deduped.slice(0, 10),
      allPrograms: deduped,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return Response.json({ error: String(err.message || err), version: VERSION }, { status: 500 });
  }
});

function extractSchoolFromDescription(desc) {
  var result = { school: null, city: null, state: null };
  if (!desc) return result;

  // Extract city, state: "in City, ST" or "in City, State"
  var csMatch = /\bin\s+([A-Z][A-Za-z\s.'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(desc);
  if (csMatch) {
    result.city = csMatch[1].trim();
    result.state = csMatch[2].trim();
  }

  // Try patterns in priority order to extract school name:

  // 1. "campus of [School Name]"
  var m = /campus of\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  // 2. "on the [School Name] campus"
  m = /on the\s+(.+?)\s+campus/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  // 3. "held at [Venue] at [School]" or "held at [School's Something]"
  m = /held at\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) {
    // The "held at" might reference a venue, so look for university/college within it
    var venueText = m[1];
    var uniInVenue = /((?:University of [A-Za-z\s.&'-]+|[A-Za-z\s.&'-]+ University|[A-Za-z\s.&'-]+ College|[A-Za-z\s.&'-]+ Institute))/i.exec(venueText);
    if (uniInVenue) {
      result.school = cleanSchoolName(uniInVenue[1]);
      if (result.school) return result;
    }
  }

  // 4. "led by the [School] football/coaching staff"
  m = /led by the\s+(.+?)\s+(?:football|coaching)\s+staff/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  // 5. General: find "University of X" or "X University" or "X College" anywhere in description
  m = /(University of [A-Za-z\s.&'-]+|[A-Z][A-Za-z\s.&'-]+ University|[A-Z][A-Za-z\s.&'-]+ College(?!\s+Football))/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  return result;
}

function cleanSchoolName(raw) {
  if (!raw) return null;
  var s = raw.trim();
  // Remove trailing "Football" and everything after
  s = s.replace(/\s+Football.*$/i, "");
  // Remove trailing keywords
  s = s.replace(/\s+(campus|staff|coaching|camp|camps|stadium).*$/i, "");
  // Remove leading "the"
  s = s.replace(/^the\s+/i, "");
  // Remove punctuation at end
  s = s.replace(/[.,;:!]+$/, "").trim();
  if (s.length < 3) return null;
  return s;
}

function stripTags(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}