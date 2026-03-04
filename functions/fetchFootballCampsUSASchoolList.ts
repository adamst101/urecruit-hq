// functions/fetchFootballCampsUSASchoolList.js
// Fetches footballcampsusa.com server-side, parses all program entries
// and returns the school/program list with "View Site" URLs.

const VERSION = "fetchFootballCampsUSASchoolList_v1";

Deno.serve(async (req) => {
  const started = Date.now();

  if (req.method !== "POST") {
    return Response.json({ error: "POST only", version: VERSION }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!(body && body.dryRun);

    // 1. Fetch the full page server-side (no truncation)
    const resp = await fetch("https://www.footballcampsusa.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
        "Accept": "text/html,*/*",
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

    // 2. Parse program entries
    //    The site uses a "programContainer" or similar card structure.
    //    Each program card has: program name, logo image, and a "View Site" link.
    //    We'll try multiple strategies to find the structure.

    const programs = [];
    const parseNotes = [];

    // Strategy A: Look for <div class="programContainer"> or similar wrappers
    //   containing an <a> with "View Site" text
    const viewSitePattern = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site\s*<\/a>/gi;
    let vsMatch;
    const viewSiteUrls = [];
    while ((vsMatch = viewSitePattern.exec(html)) !== null) {
      viewSiteUrls.push({ href: vsMatch[1], index: vsMatch.index, fullMatch: vsMatch[0] });
    }
    parseNotes.push(`Found ${viewSiteUrls.length} "View Site" anchors`);

    // For each View Site link, look backwards in the HTML for the nearest
    // program name (h-tag, strong, or title/alt text)
    for (const vs of viewSiteUrls) {
      // Grab a window of HTML before the View Site link
      const windowStart = Math.max(0, vs.index - 2000);
      const windowHtml = html.slice(windowStart, vs.index + vs.fullMatch.length);

      let name = null;

      // Try: heading tags (h2, h3, h4, h5) nearest to the link
      const headings = [];
      const reH = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/gi;
      let hm;
      while ((hm = reH.exec(windowHtml)) !== null) {
        const t = stripTags(hm[1]).trim();
        if (t && t.length > 2 && t.length < 200) headings.push(t);
      }
      if (headings.length) name = headings[headings.length - 1]; // closest heading

      // Try: <strong> or <b> tags
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

      // Try: <img alt="..." or title="..." near the link
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

      // Try: any prominent text block (div with class containing "name" or "title")
      if (!name) {
        const reName = /class="[^"]*(?:name|title|program)[^"]*"[^>]*>([\s\S]*?)<\//gi;
        let nm;
        while ((nm = reName.exec(windowHtml)) !== null) {
          const t = stripTags(nm[1]).trim();
          if (t && t.length > 3 && t.length < 200) { name = t; break; }
        }
      }

      // Normalize URL
      let url = vs.href;
      if (url && !url.startsWith("http")) {
        if (url.startsWith("//")) url = "https:" + url;
        else url = "https://www.footballcampsusa.com/" + url.replace(/^\//, "");
      }

      // Extract logo from nearby img tags (Ryzer S3 logos)
      let logoUrl = null;
      const reLogoImg = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/gi;
      let lm;
      while ((lm = reLogoImg.exec(windowHtml)) !== null) {
        logoUrl = lm[1]; // take the last/closest one
      }

      programs.push({
        name: name || "(unknown)",
        url: url || null,
        logo_url: logoUrl || null,
      });
    }

    // Strategy B fallback: if no "View Site" found, try looking for
    // programContainer or card-like divs with links to *.ryzerevents.com
    if (programs.length === 0) {
      parseNotes.push("Trying fallback: ryzerevents.com links");
      const reRyzer = /<a[^>]*href="(https?:\/\/[^"]*ryzerevents\.com[^"]*)"[^>]*>/gi;
      let rm;
      while ((rm = reRyzer.exec(html)) !== null) {
        programs.push({ name: "(from ryzer link)", url: rm[1], logo_url: null });
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

    // Raw HTML snippet around first program entry for verification
    let firstSnippet = null;
    if (viewSiteUrls.length > 0) {
      const idx = viewSiteUrls[0].index;
      const start = Math.max(0, idx - 800);
      const end = Math.min(html.length, idx + 400);
      firstSnippet = html.slice(start, end);
    }

    // Also grab a snippet to understand the card structure
    let structureSnippet = null;
    const cardIdx = html.indexOf("programContainer");
    if (cardIdx >= 0) {
      structureSnippet = html.slice(Math.max(0, cardIdx - 200), cardIdx + 1200);
      parseNotes.push(`Found "programContainer" class at index ${cardIdx}`);
    } else {
      // Try other class names
      for (const cls of ["ourprograms", "program-card", "campcard", "school-card", "View Site"]) {
        const ci = html.indexOf(cls);
        if (ci >= 0) {
          structureSnippet = html.slice(Math.max(0, ci - 300), ci + 1200);
          parseNotes.push(`Found "${cls}" at index ${ci}`);
          break;
        }
      }
    }

    return Response.json({
      ok: true,
      version: VERSION,
      dryRun,
      htmlLength: htmlLen,
      totalFound: deduped.length,
      totalRaw: programs.length,
      sample: deduped.slice(0, 10),
      allPrograms: dryRun ? deduped : deduped, // always return full list for now
      parseNotes,
      firstEntryHtmlSnippet: firstSnippet ? firstSnippet.slice(0, 2000) : null,
      structureSnippet: structureSnippet ? structureSnippet.slice(0, 2000) : null,
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