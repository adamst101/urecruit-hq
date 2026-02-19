// functions/ncaaMembershipSync.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

type AnyObj = Record<string, any>;

function s(x: any): string | null {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}
function lc(x: any): string {
  return String(x || "").toLowerCase().trim();
}
function normName(x: any): string {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/\ba&m\b/g, "am")
    .replace(/\buniv\b/g, "university")
    .replace(/\buniv\.\b/g, "university")
    .replace(/\bst\.\b/g, "state")
    .replace(/\bmt\.\b/g, "mount")
    .replace(/\bthe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function getId(r: any): string | null {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v === null || v === undefined ? null : String(v);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
function isRetryableStatus(st: number): boolean {
  return st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
}
function looksLikeDuplicate(err: any): boolean {
  const msg = lc(err?.message || err);
  const code = err?.status || err?.statusCode || err?.code || null;
  if (code === 409) return true;
  return (
    msg.includes("409") ||
    msg.includes("conflict") ||
    msg.includes("duplicate") ||
    msg.includes("unique") ||
    msg.includes("already exists") ||
    msg.includes("e11000") ||
    msg.includes("constraint")
  );
}
function extractRows(resp: any): any[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records, resp.results, resp.rows];
  for (const c of cands) if (Array.isArray(c)) return c;
  if (resp.data && Array.isArray(resp.data.data)) return resp.data.data;
  return [];
}
function extractCursor(resp: any): any | null {
  if (!resp || Array.isArray(resp)) return null;
  return resp.next_cursor ?? resp.nextCursor ?? resp.next_page_token ?? resp.nextPageToken ?? resp.cursor_next ?? null;
}

async function fetchJsonWithRetry(url: string, debug: AnyObj, tries: number): Promise<any> {
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          Accept: "application/json",
        },
      });

      debug.last_http = r.status;
      debug.last_url = url;

      const txt = await safeText(r);
      debug.last_body_snippet = txt ? txt.slice(0, 800) : null;

      if (!r.ok) {
        if (isRetryableStatus(r.status) && i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "http" });
          await sleep(wait);
          continue;
        }
        throw new Error(`NCAA HTTP ${r.status}`);
      }

      try {
        return txt ? JSON.parse(txt) : null;
      } catch {
        if (i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "json_parse_failed" });
          await sleep(wait);
          continue;
        }
        throw new Error("NCAA invalid JSON");
      }
    } catch (e: any) {
      lastErr = e;
      if (i < tries - 1) {
        const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, error: String(e?.message || e), wait_ms: wait, kind: "exception" });
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error("NCAA fetch failed");
}

function extractSchoolRows(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.schools)) return payload.schools;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function jsonResp(payload: any): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function listAllSchoolsPaged(School: any, debug: AnyObj, timeBudgetMs: number, startedAtMs: number): Promise<any[]> {
  const out: any[] = [];
  const t0 = startedAtMs;
  const elapsed = () => Date.now() - t0;
  const outOfTime = () => elapsed() >= timeBudgetMs;

  const LIMIT = 1000;
  let cursor: any | null = null;
  let pages = 0;

  if (School && typeof School.list === "function") {
    while (!outOfTime()) {
      pages += 1;
      let resp: any = null;

      try {
        resp = await School.list({ where: {}, limit: LIMIT, cursor });
      } catch {
        try {
          resp = await School.list({ where: {}, limit: LIMIT, next_cursor: cursor });
        } catch {
          try {
            resp = await School.list({ where: {}, limit: LIMIT, offset: out.length });
          } catch {
            try {
              resp = await School.list({ limit: LIMIT, offset: out.length });
            } catch {
              break;
            }
          }
        }
      }

      const page = extractRows(resp);
      const next = extractCursor(resp);

      if (!page.length) break;
      out.push(...page);

      if (next) cursor = next;
      else if (page.length < LIMIT) break;
      else cursor = null;

      await sleep(1);
      if (pages > 80) break;
    }

    debug.notes.push(`School paging(list): rows=${out.length} pages=${pages} elapsedMs=${elapsed()}`);
  }

  if (out.length === 0 && School && typeof School.filter === "function") {
    try {
      const resp = await School.filter({});
      const arr = extractRows(resp);
      debug.notes.push(`School fetch(filter fallback): rows=${arr.length} elapsedMs=${elapsed()}`);
      return arr;
    } catch {
      // ignore
    }
  }

  return out;
}

async function writeRetry<T>(fn: () => Promise<T>, debug: AnyObj, label: string): Promise<T> {
  const tries = 4;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || e);
      const retryable =
        msg.includes("502") ||
        msg.includes("504") ||
        msg.includes("503") ||
        msg.includes("429") ||
        msg.includes("timeout") ||
        msg.includes("rate");

      if (!retryable || i === tries - 1) throw e;

      const wait = Math.min(8000, 400 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
      debug.retries = (debug.retries || 0) + 1;
      debug.retry_notes = debug.retry_notes || [];
      debug.retry_notes.push({ attempt: i + 1, wait_ms: wait, kind: "write_retry", label, msg: msg.slice(0, 140) });
      await sleep(wait);
    }
  }
  // unreachable
  throw new Error("writeRetry failed");
}

async function getExistingBySourceKey(AthleticsMembership: any, sourceKey: string, debug: AnyObj): Promise<any | null> {
  // Try multiple filter shapes because Base44 SDKs differ by version
  const shapes = [
    { source_key: sourceKey },
    { where: { source_key: sourceKey } },
    { filter: { source_key: sourceKey } },
  ];

  for (const q of shapes) {
    try {
      const resp = await writeRetry(() => AthleticsMembership.filter(q as any), debug, "membership_filter");
      const rows = extractRows(resp);
      if (rows.length) return rows[0];
    } catch {
      // keep trying
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const debug: AnyObj = {
    startedAt: new Date().toISOString(),
    retries: 0,
    retry_notes: [],
    last_http: null,
    last_url: null,
    last_body_snippet: null,
    samples: [],
    errors: [],
    notes: [],
    stoppedEarly: false,
    elapsedMs: 0,
    indexMissingSamples: [],
  };

  const stats: AnyObj = {
    fetched: 0,
    processed: 0,
    matched: 0,
    noMatch: 0,
    ambiguous: 0,
    created: 0,
    updated: 0,
    skippedDryRun: 0,
    missingName: 0,
    errors: 0,
    indexedSchools: 0,
    indexMissingName: 0,
  };

  let nextStartAt = 0;
  let done = false;

  const elapsed = () => Date.now() - t0;
  const outOfTime = (budgetMs: number) => elapsed() >= budgetMs;

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed", stats, debug, nextStartAt, done });

    const body: AnyObj = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const seasonYear = body?.seasonYear != null ? Number(body.seasonYear) : null;
    const startAt = Math.max(0, Number(body?.startAt || 0));
    const maxRows = Number(body?.maxRows || 0);
    const threshold = Number(body?.confidenceThreshold || 0.92);
    const throttleMs = Number(body?.throttleMs || (dryRun ? 0 : 8));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs || 22000));
    const sourcePlatform = s(body?.sourcePlatform) || "ncaa-api";

    const client = createClientFromRequest(req) as any;
    const School = client.entities.School || client.entities.Schools;
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;
    const Unmatched = client.entities.UnmatchedAthleticsRow || client.entities.UnmatchedAthleticsRows;

    if (!School) return jsonResp({ ok: false, error: "School entity not found", stats, debug, nextStartAt, done });
    if (!AthleticsMembership) return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug, nextStartAt, done });

    const allSchools = await listAllSchoolsPaged(School, debug, timeBudgetMs, t0);

    const byNormName = new Map<string, any[]>();
    for (const r of allSchools) {
      const rawName = s(r?.school_name) || s(r?.name) || s(r?.institution_name) || s(r?.display_name) || null;
      const nn = s(r?.normalized_name) || (rawName ? normName(rawName) : null);
      if (!nn) {
        stats.indexMissingName += 1;
        if (debug.indexMissingSamples.length < 6) debug.indexMissingSamples.push({ id: getId(r) });
        continue;
      }
      if (!byNormName.has(nn)) byNormName.set(nn, []);
      byNormName.get(nn)!.push(r);
    }

    stats.indexedSchools = allSchools.length;
    debug.notes.push(`Indexed schools: keys=${byNormName.size} rows=${allSchools.length} missingName=${stats.indexMissingName} elapsedMs=${elapsed()}`);

    const url = "https://ncaa-api.henrygd.me/schools-index";
    const payload = await fetchJsonWithRetry(url, debug, 6);
    const rows = extractSchoolRows(payload);
    stats.fetched = rows.length;

    const effectiveMax = maxRows > 0 ? maxRows : rows.length;
    const endAt = Math.min(rows.length, startAt + effectiveMax);
    nextStartAt = endAt;
    done = endAt >= rows.length;

    for (let i = startAt; i < endAt; i++) {
      if (outOfTime(timeBudgetMs)) {
        debug.stoppedEarly = true;
        nextStartAt = i;
        done = false;
        break;
      }

      const raw = rows[i];
      stats.processed += 1;

      const rawName = s(raw?.long) || s(raw?.name);
      const slug = s(raw?.slug);

      if (!rawName) {
        stats.missingName += 1;
        continue;
      }

      const nkey = normName(rawName);
      const candidates = nkey ? (byNormName.get(nkey) || []) : [];

      if (!candidates.length) {
        stats.noMatch += 1;
        // keep staging optional; do not treat staging dup as error
        if (Unmatched && !dryRun) {
          const rawKey = `ncaa:${nkey || "no_name"}:${slug || "no_slug"}`;
          try {
            await writeRetry(() => Unmatched.create({
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: null,
              raw_state: null,
              raw_source_key: rawKey,
              source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
              reason: "no_match",
              attempted_match_notes: `name_only; normalized="${nkey}"`,
              created_at: new Date().toISOString(),
            }), debug, "unmatched_create");
          } catch (e: any) {
            const msg = String(e?.message || e);
            if (!looksLikeDuplicate(e)) {
              stats.errors += 1;
              debug.errors.push({ step: "unmatched_create", message: msg, rawKey });
            }
          }
        }
        continue;
      }

      if (candidates.length > 1) {
        stats.ambiguous += 1;
        if (Unmatched && !dryRun) {
          const rawKey = `ncaa:${nkey}:${slug || "no_slug"}`;
          try {
            await writeRetry(() => Unmatched.create({
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: null,
              raw_state: null,
              raw_source_key: rawKey,
              source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
              reason: "ambiguous",
              attempted_match_notes: `name_only; candidates=${candidates.length}`,
              created_at: new Date().toISOString(),
            }), debug, "unmatched_create_ambiguous");
          } catch (e: any) {
            const msg = String(e?.message || e);
            if (!looksLikeDuplicate(e)) {
              stats.errors += 1;
              debug.errors.push({ step: "unmatched_create_ambiguous", message: msg, rawKey });
            }
          }
        }
        continue;
      }

      const school = candidates[0];
      const schoolId = getId(school);
      if (!schoolId) {
        stats.errors += 1;
        debug.errors.push({ step: "candidate_missing_id", raw: { rawName, slug } });
        continue;
      }

      const confidence = 0.95;
      if (confidence < threshold) {
        stats.ambiguous += 1;
        continue;
      }

      stats.matched += 1;

      const sourceKey = `ncaa:${schoolId}`; // seasonless
      const rec: AnyObj = {
        school_id: schoolId,
        org: "ncaa",
        member: true,
        division: null,
        subdivision: null,
        conference: null,
        // season_year omitted intentionally (seasonless model)
        source_platform: sourcePlatform,
        source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
        source_key: sourceKey,
        confidence,
        last_verified_at: new Date().toISOString(),
        // optional: store last season we verified (informational only)
        last_verified_season_year: seasonYear ?? null,
      };

      if (dryRun) {
        stats.skippedDryRun += 1;
        continue;
      }

      try {
        await writeRetry(() => AthleticsMembership.create(rec), debug, "membership_create");
        stats.created += 1;
      } catch (e: any) {
        if (!looksLikeDuplicate(e)) {
          stats.errors += 1;
          debug.errors.push({ step: "membership_create", message: String(e?.message || e), sourceKey });
        } else {
          try {
            const existing = await getExistingBySourceKey(AthleticsMembership, sourceKey, debug);
            const id = existing ? getId(existing) : null;

            if (id) {
              await writeRetry(() => AthleticsMembership.update(id, rec), debug, "membership_update");
              stats.updated += 1;
            } else {
              // If we cannot find the record, do NOT keep creating in a loop.
              stats.errors += 1;
              debug.errors.push({
                step: "membership_update_on_dup",
                message: "Duplicate reported but existing row could not be located via filter()",
                sourceKey,
              });
            }
          } catch (e2: any) {
            stats.errors += 1;
            debug.errors.push({ step: "membership_update_on_dup", message: String(e2?.message || e2), sourceKey });
          }
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
    }

    debug.elapsedMs = elapsed();
    return jsonResp({ ok: true, dryRun, stats, debug, nextStartAt, done });
  } catch (e: any) {
    stats.errors += 1;
    debug.errors.push({ step: "fatal", message: String(e?.message || e) });
    debug.elapsedMs = Date.now() - t0;
    return jsonResp({ ok: false, error: String(e?.message || e), stats, debug, nextStartAt, done });
  }
});