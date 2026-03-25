import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const step = body.step || 'fetch'; // fetch | delete | insert
    
    // Step 1: Fetch all prod camps and store count
    if (step === 'fetch') {
      let allCamps = [];
      let offset = 0;
      const PAGE = 50;

      while (true) {
        const batch = await base44.asServiceRole.entities.Camp.list('-created_date', PAGE, offset);
        if (!Array.isArray(batch) || batch.length === 0) break;
        allCamps = allCamps.concat(batch);
        offset += batch.length;
        if (batch.length < PAGE) break;
        if (allCamps.length >= 10000) break;
      }

      console.log(`Fetched ${allCamps.length} camps from production`);
      return Response.json({ ok: true, step: 'fetch', count: allCamps.length, message: `Found ${allCamps.length} production camps. Call with step='delete' to clear test, then step='insert' to copy.` });
    }

    // Step 2: Delete all test camps (with throttling)
    if (step === 'delete') {
      let deleted = 0;
      const PAGE = 50;

      while (true) {
        const testBatch = await base44.asServiceRole.entities.Camp.list('-created_date', PAGE, 0, 'dev');
        if (!Array.isArray(testBatch) || testBatch.length === 0) break;
        
        for (const c of testBatch) {
          await base44.asServiceRole.entities.Camp.delete(c.id, 'dev');
          deleted++;
          if (deleted % 10 === 0) await sleep(500);
        }
        console.log(`Deleted ${deleted} test camps so far...`);
        await sleep(1000);
      }

      return Response.json({ ok: true, step: 'delete', deleted });
    }

    // Step 3: Copy prod → test (with throttling)
    if (step === 'insert') {
      let allCamps = [];
      let offset = 0;
      const PAGE = 50;

      while (true) {
        const batch = await base44.asServiceRole.entities.Camp.list('-created_date', PAGE, offset);
        if (!Array.isArray(batch) || batch.length === 0) break;
        allCamps = allCamps.concat(batch);
        offset += batch.length;
        if (batch.length < PAGE) break;
        if (allCamps.length >= 10000) break;
      }

      console.log(`Fetched ${allCamps.length} camps from production, inserting into test...`);

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

        await base44.asServiceRole.entities.Camp.bulkCreate(slice, 'dev');
        inserted += slice.length;
        if (inserted % 50 === 0) {
          console.log(`Inserted ${inserted}/${allCamps.length}`);
          await sleep(1000);
        }
      }

      return Response.json({ ok: true, step: 'insert', inserted, total: allCamps.length });
    }

    return Response.json({ error: 'Invalid step. Use: fetch, delete, or insert' }, { status: 400 });
  } catch (error) {
    console.error('copyProdCampsToTest error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});