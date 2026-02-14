// functions/probeMinimal.js
// Minimal diagnostic to verify runtime + SDK + secrets
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const hasSecret = !!Deno.env.get("SCORECARD_API_KEY");
    const School = base44?.entities?.School || base44?.entities?.Schools;
    
    return Response.json({
      ok: true,
      hasEntities: !!base44?.entities,
      hasSchool: !!School,
      schoolMethods: {
        create: !!School?.create,
        update: !!School?.update,
        filter: !!School?.filter,
      },
      hasSecret,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: String(e?.message || e),
    });
  }
});