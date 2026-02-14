// functions/seedSchoolsMaster_membership.ts
// Deno + Base44 backend
//
// Seeds School master from official membership sources.
// Writes School rows with stable source_key and normalized_name.
// Does NOT require Scorecard API key.

type AnyRec = Record<string, any>;

function s(x: any) {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function normName(x: any) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKey(org: string, name: string, state: string | null) {
  const n = normName(name);
  const st = state ? lc(state) : "na";
  return `${org}:${n}:${st}`;
}

function absUrl(baseUrl: string, maybeRelative: string | null) {
  const u = s(maybeRelative);
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return u;
  }
}

async function fetchHtml(url: string) {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
      Accept: "text/html,*/*",
    },
  });
  const html = await r.text();
  return { status: r.status, html };
}

/**
 * NCAA.org membership directory
 * Page contains a table with columns including School, Division, Subdivision, Conference, State.
 */
function parseNcaaOrg(html: string): AnyRec[] {
  const out: AnyRec[] = [];
  if (!html) return out;

  // Table row heuristic: capture <tr> ... </tr> blocks
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;

  while ((rm = rowRe.exec(html)) !== null) {
    const row = rm[1] || "";
    // capture all <td> cell text
    const tds = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
      String(m[1] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );

    // Expect at least School, Division, Subdivision, Conference, State (order is stable-ish but not guaranteed)
    if (!tds || tds.length < 3) continue;

    const school = s(tds[0]);
    if (!school) continue;

    // best-effort mapping by known column names: last cell often State
    const state = s(tds[tds.length - 1]) || s(tds[tds.length - 2]) || null;

    // division often second cell
    const division = s(tds[1]) || null;
    const subdivision = s(tds[2]) || null;

    out.push({
      org: "ncaa",
      school_name: school,
      state: state,
      division: division,
      subdivision: subdivision,
      source_url: "https://www.ncaa.org/sports/2021/5/3/membership-directory.aspx",
    });
  }

  // De-dupe by normalized name + state
  const seen: Record<string, boolean> = {};
  const dedup: AnyRec[] = [];
  for (const r of out) {
    const k = buildKey("ncaa", r.school_name, r.state || null);
    if (seen[k]) continue;
    seen[k] = true;
    dedup.push(r);
  }
  return dedup;
}

/**
 * NAIA: the /schools/index page is the official directory entry point.
 * The PDF is often the most stable membership list, but parsing PDF is non-trivial without a PDF library.
 * We will parse the HTML page for school links/text as a baseline and store org membership.
 */
function parseNaiaHtml(html: string): AnyRec[] {
  const out: AnyRec[] = [];
  if (!html) return out;

  // This is intentionally simple: find anchors that look like school entries
  // We accept imperfect coverage; Scorecard enrichment will fill city/state later.
  const linkRe = /<a[^>]*href="([^"]+)"[^>]*>([^<]{2,120})<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const href = s(m[1]);
    const text = s(m[2]);
    if (!text) continue;

    // Heuristic: many NAIA school pages contain "/schools/" in the URL; keep broader to avoid missing.
    // Filter out nav links:
    const t = normName(text);
    if (!t || t.length < 4) continue;
    if (t.includes("naia") || t.includes("membership") || t.includes("conference")) continue;

    out.push({
      org: "naia",
      school_name: text,
      state: null,
      division: "NAIA",
      source_url: absUrl("https://www.naia.org", href) || "https://www.naia.org/schools/index",
    });
  }

  // De-dupe by normalized name
  const seen: Record<string, boolean> = {};
  const dedup: AnyRec[] = [];
  for (const r of out) {
    const k = buildKey("naia", r.school_name, null);
    if (seen[k]) continue;
    seen[k] = true;
    dedup.push(r);
  }
  return dedup;
}

/**
 * NJCAA member directory page lists member colleges.
 * We'll parse anchor text and keep as org membership entries.
 */
function parseNjcaaHtml(html: string): AnyRec[] {
  const out: AnyRec[] = [];
  if (!html) return out;

  const linkRe = /<a[^>]*href="([^"]+)"[^>]*>([^<]{2,160})<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const href = s(m[1]);
    const text = s(m[2]);
    if (!text) continue;

    const t = normName(text);
    if (!t || t.length < 4) continue;

    // Filter out obvious nav links
    if (t.includes("member directory") || t.includes("membership") || t.includes("njcaa")) continue;
    if (t.includes("facebook") || t.includes("twitter") || t.includes("print")) continue;

    out.push({
      org: "njcaa",
      school_name: text,
      state: null,
      division: "JUCO",
      source_url: absUrl("https://njcaa.org", href) || "https://njcaa.org/member_colleges/directory/members",
    });
  }

  const seen: Record<string, boolean> = {};
  const dedup: AnyRec[] = [];
  for (const r of out) {
    const k = buildKey("njcaa", r.school_name, null);
    if (seen[k]) continue;
    seen[k] = true;
    dedup.push(r);
  }
  return dedup;
}

async function listBySourceKey(School: any, key: string) {
  try {
    const rows = await School.filter({ source_key: key });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  const debug: AnyRec = {
    startedAt: new Date().toISOString(),
    pages: [],
    notes: [],
    sample: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const includeNCAA = body?.includeNCAA !== false;
    const includeNAIA = body?.includeNAIA !== false;
    const includeNJCAA = body?.includeNJCAA !== false;

    const School = (globalThis as any)?.base44?.entities?.School || (globalThis as any)?.base44?.entities?.Schools;
    if (!School?.create || !School?.update) {
      return new Response(JSON.stringify({ error: "School entity not available.", debug }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const all: AnyRec[] = [];

    if (includeNCAA) {
      const url = "https://www.ncaa.org/sports/2021/5/3/membership-directory.aspx";
      const r = await fetchHtml(url);
      debug.pages.push({ org: "ncaa", url, http: r.status });
      const rows = parseNcaaOrg(r.html);
      all.push(...rows);
    }

    if (includeNAIA) {
      const url = "https://www.naia.org/schools/index";
      const r = await fetchHtml(url);
      debug.pages.push({ org: "naia", url, http: r.status });
      const rows = parseNaiaHtml(r.html);
      all.push(...rows);
      debug.notes.push("NAIA HTML parsing is best-effort; consider using the NAIA institutions PDF for a more stable list.");
    }

    if (includeNJCAA) {
      const url = "https://njcaa.org/member_colleges/directory/members";
      const r = await fetchHtml(url);
      debug.pages.push({ org: "njcaa", url, http: r.status });
      const rows = parseNjcaaHtml(r.html);
      all.push(...rows);
    }

    // Upsert into School by stable source_key
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const sample: AnyRec[] = [];

    for (const r of all) {
      const org = s(r.org) || "unknown";
      const name = s(r.school_name);
      if (!name) {
        skipped += 1;
        continue;
      }

      const state = s(r.state);
      const key = buildKey(org, name, state);
      const payload: AnyRec = {
        school_name: name,
        normalized_name: normName(name),
        source_platform: org,
        source_key: key,
        source_school_url: s(r.source_url),
        active: true,

        // athletics fields
        school_type: "College/University",
        division: s(r.division) || (org === "ncaa" ? "NCAA" : org === "naia" ? "NAIA" : "JUCO"),
        subdivision: s(r.subdivision) || null,
        conference: null,

        // stable fields to be enriched later
        unitid: null,
        city: null,
        state: state || null,
        country: "US",
        website_url: null,

        // logos handled later (tiered)
        logo_url: null,

        last_seen_at: new Date().toISOString(),
      };

      const existing = await listBySourceKey(School, key);
      if (dryRun) {
        if (sample.length < 5) sample.push({ mode: existing.length ? "would_update" : "would_create", key, name, org });
        continue;
      }

      if (existing.length && existing[0]?.id) {
        await School.update(String(existing[0].id), payload);
        updated += 1;
      } else {
        await School.create(payload);
        created += 1;
      }
    }

    debug.sample = sample;

    return new Response(
      JSON.stringify({
        stats: { created, updated, skipped, notes: debug.notes.length },
        sample,
        debug,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e), debug }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});