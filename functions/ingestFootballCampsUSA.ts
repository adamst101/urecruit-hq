// functions/ingestFootballCampsUSA.js
// Thin wrapper — delegates to ingestCampsUSA with sport_key="football"
// Keeps existing callers (scheduled jobs, TestFunctions) working unchanged.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async function(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  // Inject sport_key if not already set
  if (!body.sport_key) body.sport_key = "football";

  try {
    var base44 = createClientFromRequest(req);
    var response = await base44.functions.invoke("ingestCampsUSA", body);

    // response is Axios-shaped: { data, status, headers }
    var data = response.data || response;
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    // If the inner function returned an error status, Axios throws
    var errData = e.response ? e.response.data : { error: String(e.message || e) };
    var errStatus = e.response ? e.response.status : 500;
    return new Response(JSON.stringify(errData), {
      status: errStatus,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
});