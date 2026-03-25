import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOp(fn, maxRetries = 3, baseDelay = 3000) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries || !String(err?.message || '').includes('Rate limit')) throw err;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Rate limited, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all test (dev) camps using filter with environment param
    let allCamps = [];
    let offset = 0;
    const PAGE = 50;

    while (true) {
      const batch = await retryOp(() =>
        base44.asServiceRole.entities.Camp.filter({}, '-created_date', PAGE, offset, 'dev')
      );
      if (!Array.isArray(batch) || batch.length === 0) break;
      allCamps = allCamps.concat(batch);
      offset += batch.length;
      if (batch.length < PAGE) break;
      if (allCamps.length >= 10000) break;
      await sleep(500);
    }

    console.log(`Fetched ${allCamps.length} Camps from test database`);

    if (allCamps.length === 0) {
      return Response.json({ ok: false, error: 'No test Camps found' });
    }

    // Insert into production
    let inserted = 0;
    const BULK = 10;

    for (let i = 0; i < allCamps.length; i += BULK) {
      const slice = allCamps.slice(i, i + BULK).map(camp => {
        const d = { ...camp };
        delete d.id;
        delete d.created_date;
        delete d.updated_date;
        delete d.created_by;
        delete d.created_by_id;
        delete d.entity_name;
        delete d.app_id;
        delete d.is_sample;
        delete d.is_deleted;
        delete d.deleted_date;
        delete d.environment;
        return d;
      });

      await retryOp(() => base44.asServiceRole.entities.Camp.bulkCreate(slice));
      inserted += slice.length;
      if (inserted % 50 === 0) console.log(`Inserted ${inserted}/${allCamps.length}`);
      await sleep(800);
    }

    console.log(`Done! Inserted ${inserted} Camps into production`);
    return Response.json({ ok: true, inserted, total: allCamps.length });
  } catch (error) {
    console.error('copyTestCampsToProd error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});