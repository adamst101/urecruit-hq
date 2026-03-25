import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all camps from production
    let allCamps = [];
    let offset = 0;
    const batchSize = 50;
    
    while (true) {
      const batch = await base44.asServiceRole.entities.Camp.list('-created_date', batchSize, offset);
      if (!Array.isArray(batch) || batch.length === 0) break;
      allCamps = allCamps.concat(batch);
      offset += batch.length;
      if (batch.length < batchSize) break;
      // Safety limit
      if (allCamps.length > 10000) break;
    }

    console.log(`Fetched ${allCamps.length} camps from production`);

    // Delete all existing test camps first
    let testCamps = [];
    let testOffset = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Camp.list('-created_date', batchSize, testOffset, 'dev');
      if (!Array.isArray(batch) || batch.length === 0) break;
      testCamps = testCamps.concat(batch);
      testOffset += batch.length;
      if (batch.length < batchSize) break;
      if (testCamps.length > 10000) break;
    }

    console.log(`Found ${testCamps.length} existing test camps to delete`);

    // Delete existing test camps
    for (const camp of testCamps) {
      await base44.asServiceRole.entities.Camp.delete(camp.id, 'dev');
    }
    console.log(`Deleted ${testCamps.length} test camps`);

    // Insert camps into test in batches of 20
    let inserted = 0;
    const insertBatchSize = 20;
    
    for (let i = 0; i < allCamps.length; i += insertBatchSize) {
      const batch = allCamps.slice(i, i + insertBatchSize);
      const cleanBatch = batch.map(camp => {
        // Extract just the data fields, removing system fields
        const data = { ...camp };
        delete data.id;
        delete data.created_date;
        delete data.updated_date;
        delete data.created_by;
        delete data.created_by_id;
        delete data.entity_name;
        delete data.app_id;
        delete data.is_sample;
        delete data.is_deleted;
        delete data.deleted_date;
        delete data.environment;
        return data;
      });

      try {
        await base44.asServiceRole.entities.Camp.bulkCreate(cleanBatch, 'dev');
        inserted += cleanBatch.length;
        console.log(`Inserted ${inserted}/${allCamps.length}`);
      } catch (err) {
        console.error(`Error inserting batch at ${i}: ${err.message}`);
        // Try one by one
        for (const camp of cleanBatch) {
          try {
            await base44.asServiceRole.entities.Camp.create(camp, 'dev');
            inserted++;
          } catch (e2) {
            console.error(`Error inserting camp: ${e2.message}`);
          }
        }
      }
    }

    return Response.json({ 
      ok: true, 
      total_prod: allCamps.length,
      deleted_test: testCamps.length,
      inserted_test: inserted 
    });

  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});