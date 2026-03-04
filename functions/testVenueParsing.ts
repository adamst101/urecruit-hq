import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const urls = body.urls || [
    "https://register.ryzer.com/camp.cfm?sport=1&id=327110",
    "https://register.ryzer.com/camp.cfm?sport=1&id=323666",
    "https://register.ryzer.com/camp.cfm?sport=1&id=324588",
  ];

  // --- Helpers (inlined from ingestFootballCampsUSA) ---
  function safeStr(x) { return x == null ? "" : String(x).trim(); }
  function lc(x) { return safeStr(x).toLowerCase(); }
  function stripNonAscii(s) { return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim(); }
  function decodeHtmlEntities(s) {
    if (!s) return "";
    return String(s).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&rsquo;/gi, "'").replace(/&lsquo;/gi, "'").replace(/&rdquo;/gi, '"').replace(/&ldquo;/gi, '"')
      .replace(/&#(\d+);/gi, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  function stripTags(html) {
    if (!html) return "";
    return decodeHtmlEntities(String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  }
  function cleanTextField(s) { if (!s) return null; var v = decodeHtmlEntities(String(s)).replace(/\s+/g, " ").trim(); return v || null; }

  const results = [];

  for (const url of urls) {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)" },
      redirect: "follow",
    });
    if (!resp.ok) {
      results.push({ url, error: "HTTP " + resp.status });
      continue;
    }
    const html = await resp.text();
    const text = stripTags(html);

    // --- Parse header LOCATION (blue bar) ---
    let locationRaw = null;
    let eventDateRaw = null;
    const detailsBlock = html.match(/<div class="row campDetailsTable">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
    if (detailsBlock) {
      const block = detailsBlock[1];
      const spanSections = block.split(/<span>\s*<div class="leftflt campDetailsIcon">/i);
      for (const sec of spanSections) {
        const labelMatch = /<span>([^<]+)<\/span>/i.exec(sec);
        if (!labelMatch) continue;
        const label = lc(labelMatch[1]);
        const afterLabel = sec.substring(sec.indexOf(labelMatch[0]) + labelMatch[0].length);
        const val = stripTags(afterLabel).trim();
        if (label.indexOf("location") >= 0 && val) locationRaw = val;
        else if (label.indexOf("event date") >= 0 && val) eventDateRaw = val;
      }
    }

    let city = null;
    let state = null;
    if (locationRaw) {
      const csMatch = /([A-Za-z .'-]{2,}),+\s*([A-Z]{2})\b/.exec(locationRaw);
      if (csMatch) {
        city = csMatch[1].replace(/,+$/, "").trim();
        state = csMatch[2].trim();
      }
    }

    // --- Parse CampInfo LOCATION section (venue) ---
    let venueName = null;
    let venueAddress = null;

    let campInfoHtml = "";
    const campInfoBlock = /<div class="CampInfo">([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i.exec(html);
    if (campInfoBlock) campInfoHtml = campInfoBlock[1];

    if (campInfoHtml) {
      // Pattern 1: inline "<strong>Location</strong>:</span>&nbsp;text"
      let inlineLocMatch = /<strong>\s*LOCATION\s*<\/strong>\s*:?\s*<\/span>([^<]*)/i.exec(campInfoHtml);
      if (!inlineLocMatch) {
        inlineLocMatch = /<strong>\s*Location\s*<\/strong>\s*:?\s*<\/span>\s*(?:&nbsp;|\s)*([^<]+)/i.exec(campInfoHtml);
      }
      if (inlineLocMatch && inlineLocMatch[1]) {
        const inlineVal = stripNonAscii(inlineLocMatch[1]).trim();
        if (inlineVal && inlineVal.length >= 3 && inlineVal.length < 200) {
          if (/^\d/.test(inlineVal)) {
            venueAddress = inlineVal;
          } else {
            venueName = inlineVal;
          }
        }
      }

      // Pattern 2: block "<p><strong>LOCATION</strong></p><p>venue<br>addr</p>"
      if (!venueName && !venueAddress) {
        const locBlockMatch = /<(?:p|div)[^>]*>\s*(?:<[^>]*>)*\s*LOCATION\s*(?:<[^>]*>)*\s*<\/(?:p|div)>\s*<(?:p|div)[^>]*>([\s\S]*?)<\/(?:p|div)>/i.exec(campInfoHtml);
        if (locBlockMatch && locBlockMatch[1]) {
          const locContent = locBlockMatch[1];
          const locLines = locContent.split(/<br\s*\/?>/i)
            .map(l => stripTags(l).replace(/&nbsp;/gi, " ").trim())
            .filter(l => l.length > 0 && !/^[.,;:!]+$/.test(l));

          if (locLines.length >= 1) {
            const firstLine = locLines[0];
            if (/^\d/.test(firstLine)) venueAddress = firstLine;
            else venueName = firstLine;
          }
          if (locLines.length >= 2) {
            const secondLine = locLines[1];
            if (!venueAddress) venueAddress = secondLine;
          }
        }
      }
    }

    // Fallback: city/state from venueAddress
    if ((!city || !state) && venueAddress) {
      const vaCsMatch = /([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/.exec(venueAddress);
      if (vaCsMatch) {
        if (!city) city = vaCsMatch[1].replace(/,+$/, "").trim();
        if (!state) state = vaCsMatch[2].trim();
      }
    }

    // host_org
    let hostOrg = null;
    const hostMatch = /<div class="campDetailsCustomer">([^<]+)<\/div>/i.exec(html);
    if (hostMatch) hostOrg = stripNonAscii(hostMatch[1]).trim() || null;

    results.push({
      url,
      locationRaw,
      city,
      state,
      venueName: cleanTextField(venueName),
      venueAddress: cleanTextField(venueAddress),
      hostOrg,
    });
  }

  return Response.json({ ok: true, results });
});