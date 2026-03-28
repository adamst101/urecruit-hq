import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: {
    accountId?: string;
    athlete_id?: string;
    fbs_1?: string; fbs_2?: string; fbs_3?: string;
    fcs_1?: string; fcs_2?: string; fcs_3?: string;
    d2_1?: string;  d2_2?: string;  d2_3?: string;
    d3_1?: string;  d3_2?: string;  d3_3?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId && body.accountId) accountId = body.accountId;

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const fields = [
    "fbs_1", "fbs_2", "fbs_3",
    "fcs_1", "fcs_2", "fcs_3",
    "d2_1",  "d2_2",  "d2_3",
    "d3_1",  "d3_2",  "d3_3",
  ] as const;

  const payload: Record<string, string | null> = {
    athlete_id: body.athlete_id?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  for (const f of fields) {
    payload[f] = (body[f] as string | undefined)?.trim() || null;
  }

  try {
    const existing = await base44.asServiceRole.entities.SchoolPreference
      .filter({ account_id: accountId })
      .catch(() => []);

    let result;
    if (Array.isArray(existing) && existing.length > 0) {
      result = await base44.asServiceRole.entities.SchoolPreference.update(existing[0].id, payload);
    } else {
      result = await base44.asServiceRole.entities.SchoolPreference.create({
        account_id: accountId,
        ...payload,
        created_at: new Date().toISOString(),
      });
    }

    console.log("SchoolPreference saved — account:", accountId);
    return Response.json({ ok: true, preferences: result });
  } catch (err) {
    console.error("saveSchoolPreferences error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
