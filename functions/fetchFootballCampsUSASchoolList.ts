// functions/fetchFootballCampsUSASchoolList.js
// v3: Diagnostic mode — returns raw HTML snippets around View Site anchors
// so we can determine the exact card boundary pattern.

const VERSION = "fetchFootballCampsUSASchoolList_v3_diag";

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

    // Count occurrences of candidate patterns
    function countOccurrences(str, substr) {
      let count = 0;
      let pos = 0;
      while ((pos = str.indexOf(substr, pos)) !== -1) { count++; pos += substr.length; }
      return count;
    }

    const counts = {
      "View Site": countOccurrences(html, "View Site"),
      "programContainer": countOccurrences(html, "programContainer"),
      "camp-card": countOccurrences(html, "camp-card"),
      "card": countOccurrences(html, '"card"'),
      "viewSiteBtn": countOccurrences(html, "viewSiteBtn"),
      "view-site": countOccurrences(html, "view-site"),
      "ryzerevents.com": countOccurrences(html, "ryzerevents.com"),
      "ourprograms": countOccurrences(html, "ourprograms"),
      "programDiv": countOccurrences(html, "programDiv"),
      "program-item": countOccurrences(html, "program-item"),
      "campListing": countOccurrences(html, "campListing"),
      "campCard": countOccurrences(html, "campCard"),
      "col-md": countOccurrences(html, "col-md"),
      "col-sm": countOccurrences(html, "col-sm"),
      "col-lg": countOccurrences(html, "col-lg"),
    };

    // Find first "View Site" anchor
    const firstIdx = html.indexOf("View Site");
    const before200 = firstIdx >= 0 ? html.slice(Math.max(0, firstIdx - 600), firstIdx) : null;
    const after200 = firstIdx >= 0 ? html.slice(firstIdx, Math.min(html.length, firstIdx + 300)) : null;

    // Find second "View Site" to see the gap between cards
    const secondIdx = firstIdx >= 0 ? html.indexOf("View Site", firstIdx + 10) : -1;
    const betweenCards = (firstIdx >= 0 && secondIdx >= 0)
      ? html.slice(firstIdx, Math.min(html.length, secondIdx + 100))
      : null;

    // Also get a chunk around the 3rd View Site for confirmation
    const thirdIdx = secondIdx >= 0 ? html.indexOf("View Site", secondIdx + 10) : -1;
    const before3rd = thirdIdx >= 0 ? html.slice(Math.max(0, thirdIdx - 600), thirdIdx) : null;

    return Response.json({
      ok: true,
      version: VERSION,
      htmlLength: html.length,
      counts,
      firstViewSiteIndex: firstIdx,
      before_first_ViewSite_600chars: before200,
      after_first_ViewSite_300chars: after200,
      between_1st_and_2nd_ViewSite: betweenCards ? betweenCards.slice(0, 2000) : null,
      before_3rd_ViewSite_600chars: before3rd,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return Response.json({ error: String(err.message || err), version: VERSION }, { status: 500 });
  }
});