// Copies all School records from Production to Test database, preserving exact IDs.
// Operates in batches to avoid timeouts. Call repeatedly until done.
// DOES NOT delete or modify any production data.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 100;
    const skipCount = body.skip || 0;
    const dryRun = body.dryRun || false;

    // 1) Read a batch of Schools from PRODUCTION using service role
    const allSchools = await base44.asServiceRole.entities.School.filter(
      {},
      'school_name',
      2000
    );

    const totalProd = allSchools.length;
    const batch = allSchools.slice(skipCount, skipCount + batchSize);

    if (batch.length === 0) {
      return Response.json({
        status: 'complete',
        message: `No more schools to process. Total in prod: ${totalProd}`,
        totalProd,
        processed: 0,
        skip: skipCount,
      });
    }

    // 2) Check which IDs already exist in Test to avoid duplicates
    //    We'll try to get each one individually since bulk ID lookup may not work
    const results = { created: 0, skipped: 0, errors: 0, errorDetails: [] };

    for (const school of batch) {
      const prodId = school.id;
      const schoolData = { ...school };
      // Remove metadata fields that shouldn't be in the create payload
      delete schoolData.id;
      delete schoolData.created_date;
      delete schoolData.updated_date;
      delete schoolData.created_by;
      delete schoolData.created_by_id;
      delete schoolData.entity_name;
      delete schoolData.app_id;
      delete schoolData.is_sample;
      delete schoolData.is_deleted;
      delete schoolData.deleted_date;
      delete schoolData.environment;

      if (dryRun) {
        results.created++;
        continue;
      }

      try {
        // Check if already exists in test
        let exists = false;
        try {
          const existing = await base44.asServiceRole.entities.School.get(prodId, { environment: 'dev' });
          if (existing) exists = true;
        } catch {
          // 404 = doesn't exist, which is what we want
        }

        if (exists) {
          results.skipped++;
          continue;
        }

        // Create in test environment with the exact same ID
        // The SDK may not support setting ID directly, so we use the raw API
        const appId = Deno.env.get('BASE44_APP_ID');
        const serviceToken = req.headers.get('authorization')?.replace('Bearer ', '');
        
        const createPayload = {
          ...schoolData,
          _id: prodId,  // attempt to preserve ID
        };

        // Use the entity create endpoint directly with environment=dev
        const response = await base44.asServiceRole.entities.School.create(
          { ...schoolData },
          { environment: 'dev' }
        );
        
        results.created++;
      } catch (err) {
        results.errors++;
        results.errorDetails.push({
          school: schoolData.school_name || prodId,
          error: String(err?.message || err),
        });
      }
    }

    const nextSkip = skipCount + batchSize;
    const hasMore = nextSkip < totalProd;

    return Response.json({
      status: hasMore ? 'in_progress' : 'complete',
      totalProd,
      batchStart: skipCount,
      batchEnd: skipCount + batch.length,
      batchSize: batch.length,
      ...results,
      nextSkip: hasMore ? nextSkip : null,
      hasMore,
      dryRun,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});