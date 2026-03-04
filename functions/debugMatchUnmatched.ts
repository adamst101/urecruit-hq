// Lightweight function: returns ONLY unmatched + ambiguous from ingestFootballCampsUSA matchSchools
import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async function(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  // Call the main function
  var resp = await base44.functions.invoke("ingestFootballCampsUSA", { step: "matchSchools" });
  var d = resp.data || resp;

  return Response.json({
    totalPrograms: d.totalPrograms,
    totalMatched: d.totalMatched,
    totalUnmatched: d.totalUnmatched,
    totalAmbiguous: d.totalAmbiguous,
    matchRate: d.matchRate,
    matchByMethod: d.matchByMethod,
    unmatched: d.unmatched,
    ambiguous: d.ambiguous,
  });
});