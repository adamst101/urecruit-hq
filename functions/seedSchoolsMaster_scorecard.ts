// functions/seedSchoolsMaster_scorecard.ts
// Base44 Backend Function (Deno)
//
// FETCH ONLY (no DB writes).
// Returns normalized School rows from College Scorecard API.
//
// Body: { page?: number, perPage?: number, maxPages?: number }

const VERSION = "seedSchoolsMaster_scorecard_2026-02-14_v1_fetch_only_editor_safe";

function safeString(x) {
  if (x === null || x === undefined) return null;
  var t = String(x).trim();
  return t ? t : null;
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeUrl(apiKey, page, perPage) {
  var fields = "id,school.name,school.city,school.state,school.school_url";
  var qs =
    "api_key=" +
    encodeURIComponent(apiKey) +
    "&fields=" +
    encodeURIComponent(fields) +
    "&per_page=" +
    encodeURIComponent(String(perPage)) +
    "&page=" +
    encodeURIComponent(String(page));
  return "https://api.data.gov/ed/collegescorecard/v1/schools?" + qs;
}

async function fetchScorecard(apiKey, page, perPage) {
  var url = makeUrl(apiKey, page, perPage);

  var r = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
      Accept: "application/json"
    }
  });

  var txt = "";
  try {
    txt = await r.text();
  } catch (e) {
    txt = "";
  }

  var json = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch (e2) {
    json = null;
  }

  return { http: r.status, url: url, txt: txt, json: json };
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    step: "init",
    pageCalls: [],
    errors: []
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    debug.step = "read_body";
    var body = await req.json().catch(function () {
      return null;
    });

    var page0 = Number(body && body.page !== undefined ? body.page : 0);
    var perPage = Number(body && body.perPage !== undefined ? body.perPage : 100);
    var maxPages = Number(body && body.maxPages !== undefined ? body.maxPages : 1);

    if (!(perPage > 0)) perPage = 100;
    if (!(maxPages > 0)) maxPages = 1;
    if (!(page0 >= 0)) page0 = 0;

    debug.step = "resolve_secret";
    var apiKey = safeString(Deno.env.get("SCORECARD_API_KEY"));
    if (!apiKey) {
      debug.errors.push("Missing SCORECARD_API_KEY in Deno.env.get");
      return new Response(JSON.stringify({ error: "Missing SCORECARD_API_KEY", debug: debug }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    var rows = [];

    debug.step = "loop_pages";
    for (var p = page0; p < page0 + maxPages; p++) {
      debug.step = "fetch_page_" + p;

      var resp = await fetchScorecard(apiKey, p, perPage);
      debug.pageCalls.push({ page: p, http: resp.http, url: resp.url });

      if (resp.http >= 400) {
        debug.errors.push("Scorecard HTTP " + resp.http + " page=" + p);
        debug.errors.push(resp.txt ? resp.txt.slice(0, 220) : "no body");
        return new Response(JSON.stringify({ error: "Scorecard HTTP " + resp.http, debug: debug }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      var results = resp && resp.json && Array.isArray(resp.json.results) ? resp.json.results : [];
      if (!results.length) break;

      for (var i = 0; i < results.length; i++) {
        var r = results[i];

        var unitid = r && r.id !== undefined && r.id !== null ? String(r.id) : null;
        var name = safeString(r && (r["school.name"] || (r.school && r.school.name)));
        if (!unitid || !name) continue;

        var city = safeString(r && (r["school.city"] || (r.school && r.school.city)));
        var state = safeString(r && (r["school.state"] || (r.school && r.school.state)));
        var website = safeString(r && (r["school.school_url"] || (r.school && r.school.school_url)));

        rows.push({
          unitid: unitid,
          school_name: name,
          normalized_name: normName(name),
          city: city,
          state: state,
          website_url: website,
          source_platform: "scorecard",
          source_key: "scorecard:" + unitid
        });
      }
    }

    debug.step = "done";
    return new Response(JSON.stringify({ rows: rows, debug: debug }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e3) {
    debug.errors.push(String((e3 && e3.message) ? e3.message : e3));
    return new Response(JSON.stringify({ error: String((e3 && e3.message) ? e3.message : e3), debug: debug }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
});
