// functions/fetchFootballCampsUSASchoolList.js
// v4b: Card-boundary parsing. mode=failed returns only programs where school extraction failed.

const VERSION = "fetchFootballCampsUSASchoolList_v4b";

Deno.serve(async (req) => {
  const started = Date.now();
  if (req.method !== "POST") {
    return Response.json({ error: "POST only", version: VERSION }, { status: 405 });
  }

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }
  var mode = String(body.mode || "all"); // "all" | "failed" | "stats"

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
    const cardChunks = chunks.slice(1);

    const programs = [];

    for (var i = 0; i < cardChunks.length; i++) {
      var card = cardChunks[i];

      var nameMatch = /<span class="school">([^<]+)<\/span>/i.exec(card);
      var name = nameMatch ? nameMatch[1].trim() : null;

      var logoMatch = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/i.exec(card);
      var logoUrl = logoMatch ? logoMatch[1] : null;

      if (!name) {
        var altMatch = /alt="([^"]+)"/i.exec(card);
        name = altMatch ? altMatch[1].trim() : "(unknown)";
      }

      var urlMatch = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site/i.exec(card);
      if (!urlMatch) urlMatch = /<a\s+href="([^"]+)"[^>]*class="viewSite"/i.exec(card);
      var url = urlMatch ? urlMatch[1].trim() : null;

      var descMatch = /<p>([^<]+(?:<[^>]+>[^<]*)*)<\/p>/i.exec(card);
      var description = descMatch ? stripTags(descMatch[1]).trim() : null;

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
      var key = (p.url || p.name || "").toLowerCase().replace(/\/+$/, "");
      if (seen[key]) continue;
      seen[key] = true;
      deduped.push(p);
    }

    var withDesc = deduped.filter(function(p) { return p.description; }).length;
    var withSchool = deduped.filter(function(p) { return p.extracted_school; }).length;

    var output;
    if (mode === "failed") {
      // Only programs WITH description but WITHOUT extracted school, plus those without description
      var failed = deduped.filter(function(p) { return !p.extracted_school; });
      output = {
        ok: true, version: VERSION, mode: "failed",
        totalPrograms: deduped.length,
        failedCount: failed.length,
        failed: failed,
        durationMs: Date.now() - started,
      };
    } else if (mode === "stats") {
      output = {
        ok: true, version: VERSION, mode: "stats",
        totalPrograms: deduped.length,
        withDescription: withDesc,
        withExtractedSchool: withSchool,
        withoutSchool: deduped.length - withSchool,
        durationMs: Date.now() - started,
      };
    } else {
      output = {
        ok: true, version: VERSION,
        cardChunksFound: cardChunks.length,
        totalFound: deduped.length,
        withDescription: withDesc,
        withExtractedSchool: withSchool,
        allPrograms: deduped,
        durationMs: Date.now() - started,
      };
    }

    return Response.json(output);
  } catch (err) {
    return Response.json({ error: String(err.message || err), version: VERSION }, { status: 500 });
  }
});

function extractSchoolFromDescription(desc) {
  var result = { school: null, city: null, state: null };
  if (!desc) return result;

  var csMatch = /\bin\s+([A-Z][A-Za-z\s.'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(desc);
  if (csMatch) {
    result.city = csMatch[1].trim();
    result.state = csMatch[2].trim();
  }

  var m = /campus of\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  m = /on the\s+(.+?)\s+campus/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  m = /held at\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) {
    var venueText = m[1];
    var uniInVenue = /((?:University of [A-Za-z\s.&'-]+|[A-Za-z\s.&'-]+ University|[A-Za-z\s.&'-]+ College|[A-Za-z\s.&'-]+ Institute))/i.exec(venueText);
    if (uniInVenue) {
      result.school = cleanSchoolName(uniInVenue[1]);
      if (result.school) return result;
    }
  }

  m = /led by the\s+(.+?)\s+(?:football|coaching)\s+staff/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  m = /(University of [A-Za-z\s.&'-]+|[A-Z][A-Za-z\s.&'-]+ University|[A-Z][A-Za-z\s.&'-]+ College(?!\s+Football))/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  return result;
}

function cleanSchoolName(raw) {
  if (!raw) return null;
  var s = raw.trim();
  s = s.replace(/\s+Football.*$/i, "");
  s = s.replace(/\s+(campus|staff|coaching|camp|camps|stadium).*$/i, "");
  s = s.replace(/^the\s+/i, "");
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