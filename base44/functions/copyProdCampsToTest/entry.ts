import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 1. Fetch ALL production camps (paginate in batches of 50)
    let allCamps = [];
    let offset = 0;
    const PAGE = 50;

    while (true) {
      const batch = await base44.asServiceRole.entities.Camp.list('-created_date', PAGE, offset);
      if (!Array.isArray(batch) || batch.length === 0) break;
      allCamps = allCamps.concat(batch);
      offset += batch.length;
      if (batch.length < PAGE) break;
      if (allCamps.length >= 10000) break; // safety cap
    }

    console.log(`Fetched ${allCamps.length} camps from production`);

    // 2. Delete all existing test camps
    let deleted = 0;
    while (true) {
      const testBatch = await base44.asServiceRole.entities.Camp.list('-created_date', PAGE, 0, 'dev');
      if (!Array.isArray(testBatch) || testBatch.length === 0) break;
      for (const c of testBatch) {
        await base44.asServiceRole.entities.Camp.delete(c.id, 'dev');
        deleted++;
      }
      console.log(`Deleted ${deleted} test camps so far...`);
    }

    console.log(`Deleted ${deleted} test camps total`);

    // 3. Insert production camps into test (bulk create in batches of 20)
    let inserted = 0;
    const BULK = 20;

    for (let i = 0; i < allCamps.length; i += BULK) {
      const slice = allCamps.slice(i, i + BULK).map(camp => {
        // Keep only data fields
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

      await base44.asServiceRole.entities.Camp.bulkCreate(slice, 'dev');
      inserted += slice.length;
      console.log(`Inserted ${inserted}/${allCamps.length}`);
    }

    return Response.json({
      ok: true,
      production_count: allCamps.length,
      test_deleted: deleted,
      test_inserted: inserted,
    });
  } catch (error) {
    console.error('copyProdCampsToTest error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});