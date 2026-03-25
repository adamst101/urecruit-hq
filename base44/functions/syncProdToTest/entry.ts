/**
 * syncProdToTest
 *
 * Copies entity data from production → test (dev) environment.
 * NEVER reads from or writes to production — only reads from production,
 * only writes/deletes in the dev environment.
 *
 * Supported entities:
 *   Camp, School, DemoCamp, Sport, Position, SportIngestConfig, HostOrgMapping
 *
 * Params (JSON body):
 *   entity      (required) — one of the supported entity names above
 *   dryRun      (default: true)  — if true, only counts; no writes
 *   clearFirst  (default: false) — if true, deletes existing test records before inserting
 *   limit       (default: 10000) — max records to fetch from production
 *
 * Safety guarantees:
 *   - dryRun defaults to true — you must explicitly pass dryRun:false to write anything
 *   - clearFirst defaults to false — additive by default
 *   - All deletes pass 'dev' environment explicitly and are guarded by a pre-check
 *   - Production entity is only ever read, never written or deleted
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = ["tom.adams101@gmail.com", "sadie_adams@icloud.com"];

const SUPPORTED_ENTITIES = [
  "Camp",
  "School",
  "DemoCamp",
  "Sport",
  "Position",
  "SportIngestConfig",
  "HostOrgMapping",
] as const;

type SupportedEntity = typeof SUPPORTED_ENTITIES[number];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOp<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 2000): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as Error)?.message || '');
      if (i === maxRetries || !msg.toLowerCase().includes('rate limit')) throw err;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Rate limited — retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`);
      await sleep(delay);
    }
  }
  throw new Error('retryOp exhausted');
}

/** Fetch all records from an entity in a given environment (undefined = production). */
async function fetchAll(entity: any, env?: string, limit = 10000): Promise<any[]> {
  const records: any[] = [];
  let offset = 0;
  const PAGE = 50;

  while (records.length < limit) {
    const args: any[] = ['-created_date', PAGE, offset];
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

/** Strip base44-managed metadata fields before inserting into another environment. */
function stripMeta(record: Record<string, any>): Record<string, any> {
  const d = { ...record };
  for (const key of [
    'id', 'created_date', 'updated_date', 'created_by', 'created_by_id',
    'entity_name', 'app_id', 'is_sample', 'is_deleted', 'deleted_date', 'environment',
  ]) {
    delete d[key];
  }
  return d;
}

Deno.serve(async (req) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const base44 = createClientFromRequest(req);
  let callerRole = '';
  let callerEmail = '';
  try {
    const me = await base44.auth.me();
    callerRole = me?.role || '';
    callerEmail = me?.email || '';
  } catch {}

  const isAdmin = callerRole === 'admin' || ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin) {
    return Response.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  // ── Params ──────────────────────────────────────────────────────────────────
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {}

  const rawEntity  = String(body.entity || '');
  // Case-insensitive match so "demoCamp", "democamp", "DemoCamp" all work
  const entityName = (SUPPORTED_ENTITIES.find(
    (e) => e.toLowerCase() === rawEntity.toLowerCase()
  ) ?? rawEntity) as string;
  const dryRun     = body.dryRun !== false;   // default true — must explicitly pass false
  const clearFirst = body.clearFirst === true; // default false
  const limit      = Math.min(Number(body.limit) || 10000, 20000);

  if (!SUPPORTED_ENTITIES.includes(entityName as SupportedEntity)) {
    return Response.json({
      ok: false,
      error: `Unsupported entity "${rawEntity}". Supported: ${SUPPORTED_ENTITIES.join(', ')}`,
    }, { status: 400 });
  }

  const entity = (base44.asServiceRole.entities as any)[entityName];
  if (!entity) {
    return Response.json({ ok: false, error: `Entity "${entityName}" not found on base44 client` }, { status: 500 });
  }

  console.log(`syncProdToTest — entity=${entityName} dryRun=${dryRun} clearFirst=${clearFirst} limit=${limit}`);

  // ── Step 1: Count production records ────────────────────────────────────────
  console.log(`Fetching all ${entityName} records from production...`);
  const prodRecords = await fetchAll(entity, undefined, limit);
  console.log(`Production: ${prodRecords.length} ${entityName} records`);

  if (prodRecords.length === 0) {
    return Response.json({
      ok: false,
      error: `No ${entityName} records found in production — nothing to copy`,
    });
  }

  if (dryRun) {
    // Dry run: also count existing test records so the caller can see what would change
    const testRecords = await fetchAll(entity, 'dev', limit);
    return Response.json({
      ok: true,
      dryRun: true,
      entity: entityName,
      production: { count: prodRecords.length },
      test: { count: testRecords.length },
      wouldClear: clearFirst,
      wouldInsert: prodRecords.length,
      message: `Dry run complete. Pass dryRun:false to execute.`,
    });
  }

  // ── Step 2 (optional): Clear test records ───────────────────────────────────
  let deleted = 0;
  if (clearFirst) {
    console.log(`clearFirst=true — fetching existing test ${entityName} records to delete...`);
    const testRecords = await fetchAll(entity, 'dev', limit);
    console.log(`Found ${testRecords.length} test ${entityName} records to delete`);

    for (const rec of testRecords) {
      await retryOp(() => entity.delete(rec.id, 'dev'));
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`Deleted ${deleted}/${testRecords.length} test ${entityName} records...`);
        await sleep(300);
      }
    }
    console.log(`Cleared ${deleted} test ${entityName} records`);
    await sleep(1000); // settle time after bulk delete
  }

  // ── Step 3: Insert production records into test ─────────────────────────────
  let inserted = 0;
  const BULK = 10;
  const stripped = prodRecords.map(stripMeta);

  for (let i = 0; i < stripped.length; i += BULK) {
    const slice = stripped.slice(i, i + BULK);
    await retryOp(() => entity.bulkCreate(slice, 'dev'));
    inserted += slice.length;
    if (inserted % 100 === 0 || inserted === stripped.length) {
      console.log(`Inserted ${inserted}/${stripped.length} ${entityName} records into test`);
    }
    await sleep(600);
  }

  console.log(`syncProdToTest complete — ${entityName}: deleted=${deleted} inserted=${inserted}`);

  return Response.json({
    ok: true,
    dryRun: false,
    entity: entityName,
    cleared: deleted,
    inserted,
    total: prodRecords.length,
  });
});
