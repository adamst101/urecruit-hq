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

  var base44 = createClientFromRequest(req);
  var response = await base44.functions.invoke("ingestCampsUSA", body);

  // Forward the response from the generic function
  return new Response(JSON.stringify(response.data), {
    status: response.status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});