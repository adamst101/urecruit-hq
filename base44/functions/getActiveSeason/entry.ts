import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow both authenticated and anonymous callers
  try {
    const seasons = await base44.asServiceRole.entities.SeasonConfig.filter({
      active: true,
    });

    const list = Array.isArray(seasons) ? seasons : [];
    const now = new Date();

    // Find season where today falls in sale window
    const currentSeason = list.find(s => {
      const opens = s.sale_opens_at ? new Date(s.sale_opens_at) : null;
      const closes = s.sale_closes_at ? new Date(s.sale_closes_at) : null;
      if (opens && now < opens) return false;
      if (closes && now > closes) return false;
      return true;
    });

    // Fallback to is_current = true
    const result = currentSeason || list.find(s => s.is_current) || null;

    return Response.json({ ok: true, season: result });
  } catch (err) {
    console.error("getActiveSeason error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});