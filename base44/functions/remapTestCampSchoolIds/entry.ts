/**
 * remapTestCampSchoolIds
 *
 * Fixes the school_id mismatch in the test database.
 *
 * Problem: Test Camp records have school_id values copied from production,
 * but test School records have different IDs (assigned on create).
 *
 * Solution: Match prod School IDs → test School IDs via source_key,
 * then update every test Camp's school_id to the correct test ID.
 *
 * Params:
 *   dryRun (default: true) — if true, only reports; no writes
 *   batchSize (default: 50) — camps to update per batch
 *   skip (default: 0) — skip N camps (for resuming)
 *
 * SAFETY: Only reads from production. Only writes to test (dev).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = ["tom.adams101@gmail.com", "sadie_adams@icloud.com"];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function retryOp(fn, maxRetries = 3, baseDelay = 2000) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || '');
      if (i === maxRetries || !msg.toLowerCase().includes('rate limit')) throw err;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Rate limited — retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`);
      await sleep(delay);
    }
  }
}

async function fetchAll(entity, env, limit = 10000) {
  const records = [];
  let offset = 0;
  const PAGE = 50;

  while (records.length < limit) {
    const args = ['-created_date', PAGE, offset];
    if (env) args.push(env);
    const batch = await retryOp(() => entity.list(...args));
    if (!Array.isArray(batch) || batch.length === 0) break;
    records.push(...batch);
    offset += batch.length;
    if (batch.length < PAGE) break;
    await sleep(400);
  }

  return records;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let callerEmail = '';
  let callerRole = '';
  try {
    const me = await base44.auth.me();
    callerRole = me?.role || '';
    callerEmail = me?.email || '';
  } catch {}

  if (callerRole !== 'admin' && !ADMIN_EMAILS.includes(callerEmail)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch {}

  const dryRun = body.dryRun !== false;
  const batchSize = Number(body.batchSize) || 50;
  const skipCount = Number(body.skip) || 0;

  console.log(`remapTestCampSchoolIds — dryRun=${dryRun} batchSize=${batchSize} skip=${skipCount}`);

  // Step 1: Load all prod Schools and build source_key → prod_id map
  console.log('Loading production Schools...');
  const prodSchools = await fetchAll(base44.asServiceRole.entities.School, undefined, 10000);
  console.log(`Production: ${prodSchools.length} schools`);

  const prodIdToSourceKey = new Map();
  for (const s of prodSchools) {
    const sk = s.source_key || '';
    if (sk && s.id) {
      prodIdToSourceKey.set(s.id, sk);
    }
  }

  // Step 2: Load all test Schools and build source_key → test_id map
  console.log('Loading test Schools...');
  const testSchools = await fetchAll(base44.asServiceRole.entities.School, 'dev', 10000);
  console.log(`Test: ${testSchools.length} schools`);

  const sourceKeyToTestId = new Map();
  for (const s of testSchools) {
    const sk = s.source_key || '';
    if (sk && s.id) {
      sourceKeyToTestId.set(sk, s.id);
    }
  }

  // Step 3: Build prod_id → test_id mapping
  const prodIdToTestId = new Map();
  let unmapped = 0;
  for (const [prodId, sourceKey] of prodIdToSourceKey) {
    const testId = sourceKeyToTestId.get(sourceKey);
    if (testId) {
      prodIdToTestId.set(prodId, testId);
    } else {
      unmapped++;
    }
  }

  console.log(`ID mapping: ${prodIdToTestId.size} mapped, ${unmapped} unmapped (no test school for that source_key)`);

  // Step 4: Load test Camps
  console.log('Loading test Camps...');
  const testCamps = await fetchAll(base44.asServiceRole.entities.Camp, 'dev', 20000);
  console.log(`Test: ${testCamps.length} camps`);

  // Step 5: Find camps that need remapping
  const needsRemap = [];
  let alreadyCorrect = 0;
  let noSchoolId = 0;
  let noMapping = 0;

  for (const camp of testCamps) {
    const currentSchoolId = camp.school_id || '';
    if (!currentSchoolId) {
      noSchoolId++;
      continue;
    }

    // Check if current school_id is a prod ID that needs remapping
    const testId = prodIdToTestId.get(currentSchoolId);
    if (testId) {
      if (testId === currentSchoolId) {
        alreadyCorrect++;
      } else {
        needsRemap.push({ campId: camp.id, campName: camp.camp_name, oldSchoolId: currentSchoolId, newSchoolId: testId });
      }
    } else {
      // Check if school_id is already a valid test ID
      const isValidTestId = testSchools.some(s => s.id === currentSchoolId);
      if (isValidTestId) {
        alreadyCorrect++;
      } else {
        noMapping++;
      }
    }
  }

  console.log(`Remap analysis: ${needsRemap.length} need remap, ${alreadyCorrect} already correct, ${noSchoolId} no school_id, ${noMapping} no mapping found`);

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      prodSchools: prodSchools.length,
      testSchools: testSchools.length,
      testCamps: testCamps.length,
      idMappings: prodIdToTestId.size,
      unmappedSchools: unmapped,
      needsRemap: needsRemap.length,
      alreadyCorrect,
      noSchoolId,
      noMapping,
      sampleRemaps: needsRemap.slice(0, 5).map(r => ({
        camp: r.campName,
        oldSchoolId: r.oldSchoolId,
        newSchoolId: r.newSchoolId,
      })),
      message: 'Dry run complete. Pass dryRun:false to execute.',
    });
  }

  // Step 6: Apply remapping in batches
  const batch = needsRemap.slice(skipCount, skipCount + batchSize);
  let updated = 0;
  let errors = 0;
  const errorDetails = [];

  for (const item of batch) {
    try {
      await retryOp(() =>
        base44.asServiceRole.entities.Camp.update(item.campId, { school_id: item.newSchoolId }, 'dev')
      );
      updated++;
      if (updated % 10 === 0) {
        console.log(`Updated ${updated}/${batch.length} camps...`);
        await sleep(300);
      }
    } catch (err) {
      errors++;
      errorDetails.push({ camp: item.campName, error: String(err?.message || err) });
    }
  }

  const nextSkip = skipCount + batchSize;
  const hasMore = nextSkip < needsRemap.length;

  return Response.json({
    ok: true,
    dryRun: false,
    totalNeedingRemap: needsRemap.length,
    batchStart: skipCount,
    batchSize: batch.length,
    updated,
    errors,
    errorDetails: errorDetails.slice(0, 10),
    nextSkip: hasMore ? nextSkip : null,
    hasMore,
  });
});