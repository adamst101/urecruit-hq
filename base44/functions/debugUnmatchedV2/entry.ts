// Thin wrapper: calls ingestFootballCampsUSA matchOnly and returns ONLY unmatched programs
import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  
  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  var result = await base44.functions.invoke("ingestFootballCampsUSA", { matchOnly: true, dryRun: true });
  var data = result.data || result;

  return Response.json({
    totalPrograms: data.totalPrograms,
    totalMatched: data.totalMatched,
    totalUnmatched: data.totalUnmatched,
    matchRate: data.matchRate,
    matchByMethod: data.matchByMethod,
    unmatched: data.unmatched,
    ambiguous: data.ambiguous,
  });
});