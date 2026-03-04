// functions/fetchFootballCampsUSASchoolList.js
// v2: Now also extracts description text for each program entry.
// The description contains "held at/on the campus of [School]" which
// lets us resolve coach-named / nickname camps to their actual school.

const VERSION = "fetchFootballCampsUSASchoolList_v2";

Deno.serve(async (req) => {
  const started = Date.now();

  if (req.method !== "POST") {
    return Response.json({ error: "POST only", version: VERSION }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 1. Fetch the full page server-side
    const resp = await fetch("https://www.footballcampsusa.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
        Accept: "text/html,*/*",
      },
    });

    if (!resp.ok) {
      return Response.json({
        error: `HTTP ${resp.status} from footballcampsusa.com`,
        version: VERSION,
      }, { status: 502 });
    }

    const html = await resp.text();
    const htmlLen = html.length;

    // ──────────────────────────────────────────────
    // 2. Parse program entries
    // ──────────────────────────────────────────────
    const programs = [];
    const parseNotes = [];

    // Find all "View Site" anchors
    const viewSitePattern = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site\s*<\/a>/gi;
    let vsMatch;
    const viewSiteUrls = [];
    while ((vsMatch = viewSitePattern.exec(html)) !== null) {
      viewSiteUrls.push({ href: vsMatch[1], index: vsMatch.index, fullMatch: vsMatch[0] });
    }
    parseNotes.push(`Found ${viewSiteUrls.length} "View Site" anchors`);

    for (const vs of viewSiteUrls) {
      // Grab a window of HTML around the View Site link
      const windowStart = Math.max(0, vs.index - 3000);
      const windowEnd = Math.min(html.length, vs.index + vs.fullMatch.length + 500);
      const windowHtml = html.slice(windowStart, windowEnd);

      // ── Extract program name ──
      let name = null;

      // Try heading tags nearest to the link
      const headings = [];
      const reH = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/gi;
      let hm;
      while ((hm = reH.exec(windowHtml)) !== null) {
        const t = stripTags(hm[1]).trim();
        if (t && t.length > 2 && t.length < 200) headings.push(t);
      }
      if (headings.length) name = headings[headings.length - 1];

      // Try <strong> or <b> tags
      if (!name) {
        const strongs = [];
        const reSt = /<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi;
        let sm;
        while ((sm = reSt.exec(windowHtml)) !== null) {
          const t = stripTags(sm[1]).trim();
          if (t && t.length > 4 && t.length < 200) strongs.push(t);
        }
        if (strongs.length) name = strongs[strongs.length - 1];
      }

      // Try img alt/title
      if (!name) {
        const imgs = [];
        const reImg = /<img[^>]*(?:alt|title)="([^"]+)"[^>]*>/gi;
        let im;
        while ((im = reImg.exec(windowHtml)) !== null) {
          const t = (im[1] || "").trim();
          if (t && t.length > 3 && t.length < 200) imgs.push(t);
        }
        if (imgs.length) name = imgs[imgs.length - 1];
      }

      // ── Extract description paragraph ──
      // The description is in a <p> tag (or sometimes <div>) near the View Site link.
      // It typically contains phrases like "held at", "campus of", etc.
      let description = null;

      // Collect all <p> tags in the window
      const allParagraphs = [];
      const reP = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pm;
      while ((pm = reP.exec(windowHtml)) !== null) {
        const t = stripTags(pm[1]).trim();
        if (t && t.length > 20 && t.length < 2000) {
          allParagraphs.push(t);
        }
      }

      // Pick the best paragraph — prefer ones with school-related keywords
      const schoolKeywords = [
        "campus of", "held at", "held on", "held in", "university",
        "college", "football staff", "head coach", "led by",
      ];
      for (const p of allParagraphs) {
        const pl = p.toLowerCase();
        for (const kw of schoolKeywords) {
          if (pl.includes(kw)) {
            description = p;
            break;
          }
        }
        if (description) break;
      }
      // Fallback: if no keyword match, take the longest paragraph as description
      if (!description && allParagraphs.length > 0) {
        description = allParagraphs.reduce((a, b) => a.length >= b.length ? a : b);
      }

      // ── Extract school name from description ──
      let extractedSchool = null;
      let extractedCity = null;
      let extractedState = null;

      if (description) {
        const d = description;

        // Pattern 1: "on the campus of [School Name]"
        // Pattern 2: "held at [School Name/Location]"
        // Pattern 3: "at the [School Name]"
        // Pattern 4: "[Name] Football Camps are ... [School] ... in [City], [State]"
        const schoolPatterns = [
          /(?:on the campus of|campus of)\s+(?:the\s+)?([A-Z][A-Za-z\s.&'-]+?)(?:\s+in\s+|\s*[,.]|\s+and\b)/,
          /(?:held at|held on)\s+(?:the\s+)?([A-Z][A-Za-z\s.&'-]+?(?:University|College|Institute|Academy|School))(?:\s|[,.])/,
          /(?:led by|run by)\s+(?:the\s+)?([A-Z][A-Za-z\s.&'-]+?(?:University|College|Institute))\s+(?:football|coaching)/i,
          /(?:University of [A-Z][A-Za-z\s.&'-]+|[A-Z][A-Za-z\s.&'-]+ University|[A-Z][A-Za-z\s.&'-]+ College)/,
        ];

        for (const pat of schoolPatterns) {
          const m = pat.exec(d);
          if (m) {
            extractedSchool = (m[1] || m[0]).trim()
              .replace(/\s+/g, " ")
              .replace(/[.,;:!]+$/, "")
              .trim();
            if (extractedSchool.length > 3) break;
            extractedSchool = null;
          }
        }

        // Extract "in City, ST" or "in City, State"
        const cityStateMatch = /\bin\s+([A-Z][A-Za-z\s.'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(d);
        if (cityStateMatch) {
          extractedCity = cityStateMatch[1].trim();
          extractedState = cityStateMatch[2].trim();
        }
      }

      // ── Extract logo URL ──
      let logoUrl = null;
      const reLogoImg = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/gi;
      let lm;
      while ((lm = reLogoImg.exec(windowHtml)) !== null) {
        logoUrl = lm[1];
      }

      // Normalize URL
      let url = vs.href;
      if (url && !url.startsWith("http")) {
        if (url.startsWith("//")) url = "https:" + url;
        else url = "https://www.footballcampsusa.com/" + url.replace(/^\//, "");
      }

      programs.push({
        name: name || "(unknown)",
        url: url || null,
        logo_url: logoUrl || null,
        description: description || null,
        extracted_school: extractedSchool || null,
        extracted_city: extractedCity || null,
        extracted_state: extractedState || null,
      });
    }

    // Strategy B fallback: ryzerevents links
    if (programs.length === 0) {
      parseNotes.push("Trying fallback: ryzerevents.com links");
      const reRyzer = /<a[^>]*href="(https?:\/\/[^"]*ryzerevents\.com[^"]*)"[^>]*>/gi;
      let rm;
      while ((rm = reRyzer.exec(html)) !== null) {
        programs.push({ name: "(from ryzer link)", url: rm[1], logo_url: null, description: null, extracted_school: null, extracted_city: null, extracted_state: null });
      }
      parseNotes.push(`Fallback found ${programs.length} ryzerevents links`);
    }

    // Dedupe by URL
    const seen = {};
    const deduped = [];
    for (const p of programs) {
      const key = (p.url || "").toLowerCase().replace(/\/+$/, "");
      if (seen[key]) continue;
      seen[key] = true;
      deduped.push(p);
    }

    // Stats
    const withDescription = deduped.filter(p => p.description).length;
    const withExtractedSchool = deduped.filter(p => p.extracted_school).length;

    return Response.json({
      ok: true,
      version: VERSION,
      htmlLength: htmlLen,
      totalFound: deduped.length,
      totalRaw: programs.length,
      withDescription,
      withExtractedSchool,
      sample: deduped.slice(0, 10),
      allPrograms: deduped,
      parseNotes,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return Response.json({
      error: String(err.message || err),
      version: VERSION,
      durationMs: Date.now() - started,
    }, { status: 500 });
  }
});

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