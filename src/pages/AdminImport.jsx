// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

/* ----------------------------
   Helpers (editor-safe)
----------------------------- */
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeString(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}
function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function safeObject(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return x;
}
function tryParseJson(value) {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!s) return value;
  if (!(s.startsWith("{") || s.startsWith("["))) return value;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}
function normalizeStringArray(value) {
  const v = tryParseJson(value);
  if (Array.isArray(v)) {
    return v
      .map((x) => (x == null ? null : String(x).trim()))
      .filter((x) => !!x);
  }
  const one = safeString(v);
  return one ? [one] : [];
}
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function simpleHash(obj) {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj ?? {});
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = String(mdy[1]).padStart(2, "0");
      const dd = String(mdy[2]).padStart(2, "0");
      const yyyy = String(mdy[3]);
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
// Football rollover: Feb 1 UTC
function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  const d = new Date(`${startDateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}
function normalizeSportNameFromRow(r) {
  return String((r && (r.sport_name || r.name || r.sportName)) || "").trim();
}
function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;
  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;
  return true;
}

/* ----------------------------
   Routes (hardcoded)
----------------------------- */
const ROUTES = {
  Workspace: "/Workspace",
  Home: "/Home",
};

/* ----------------------------
   SportsUSA directory defaults
----------------------------- */
const SPORTSUSA_DIRECTORY_BY_SPORT = {
  Football: "https://www.footballcampsusa.com/",
  Baseball: "https://www.baseballcampsusa.com/",
  Softball: "https://www.softballcampsusa.com/",
  Soccer: "https://www.soccercampsusa.com/",
  Volleyball: "https://www.volleyballcampsusa.com/",
};

export default function AdminImport() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const SchoolEntity = base44?.entities?.School || base44?.entities?.Schools || null;
  const SchoolSportSiteEntity =
    base44?.entities?.SchoolSportSite || base44?.entities?.SchoolSportSites || null;
  const CampDemoEntity = base44?.entities?.CampDemo || null;

  // Shared sport selection
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // Per-section logs
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");

  const appendSportsUSA = (line) =>
    setLogSportsUSA((p) => (p ? p + "\n" + line : line));
  const appendCamps = (line) => setLogCamps((p) => (p ? p + "\n" + line : line));

  // ----------------------------
  // SportsUSA: seed schools controls
  // ----------------------------
  const [sportsUSADryRun, setSportsUSADryRun] = useState(true);
  const [sportsUSALimit, setSportsUSALimit] = useState(300);
  const [sportsUSASiteUrl, setSportsUSASiteUrl] = useState("");

  const [sportsUSAWorking, setSportsUSAWorking] = useState(false);

  // ----------------------------
  // Camps ingest controls
  // ----------------------------
  const [campsDryRun, setCampsDryRun] = useState(true);
  const [campsMaxSites, setCampsMaxSites] = useState(5);
  const [campsMaxRegsPerSite, setCampsMaxRegsPerSite] = useState(5);
  const [campsMaxEvents, setCampsMaxEvents] = useState(25);
  const [campsWorking, setCampsWorking] = useState(false);

  // ----------------------------
  // Load sports
  // ----------------------------
  async function loadSports() {
    if (!SportEntity?.filter) return;
    setSportsLoading(true);
    try {
      const rows = asArray(await SportEntity.filter({}));
      const normalized = rows
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
          name: normalizeSportNameFromRow(r),
          active: readActiveFlag(r),
          raw: r,
        }))
        .filter((r) => r.id && r.name);

      normalized.sort((a, b) => a.name.localeCompare(b.name));
      setSports(normalized);

      if (!selectedSportId && normalized.length) {
        setSelectedSportId(normalized[0].id);
        setSelectedSportName(normalized[0].name);
      } else if (selectedSportId) {
        const hit = normalized.find((s) => s.id === selectedSportId);
        if (hit) setSelectedSportName(hit.name);
      }
    } finally {
      setSportsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSports();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update directory URL when sport changes (default suggestion)
  useEffect(() => {
    const guess = SPORTSUSA_DIRECTORY_BY_SPORT[String(selectedSportName || "").trim()] || "";
    if (guess) setSportsUSASiteUrl(guess);
  }, [selectedSportName]);

  const selectedSportLabel = useMemo(() => {
    if (!selectedSportId) return "";
    return `${selectedSportName} (${selectedSportId})`;
  }, [selectedSportId, selectedSportName]);

  /* ----------------------------
     Upserts
  ----------------------------- */
  async function upsertSchoolBySourceKey({ school_name, logo_url, source_key, source_school_url }) {
    if (!SchoolEntity?.filter || !SchoolEntity?.create || !SchoolEntity?.update) {
      throw new Error("School entity not available.");
    }

    const name = safeString(school_name);
    if (!name) throw new Error("Missing school_name.");

    const key = safeString(source_key) || `name:${String(name).toLowerCase()}`;
    const nowIso = new Date().toISOString();

    // find by source_key first, else by school_name
    let existing = [];
    try {
      existing = asArray(await SchoolEntity.filter({ source_key: key }));
    } catch {
      existing = [];
    }

    if (!existing.length) {
      try {
        existing = asArray(await SchoolEntity.filter({ school_name: name }));
      } catch {
        existing = [];
      }
    }

    const payload = {
      school_name: name,
      logo_url: safeString(logo_url) || null,
      source_platform: "sportsusa",
      source_school_url: safeString(source_school_url) || null,
      source_key: key,
      active: true,
      needs_review: false,
      last_seen_at: nowIso,
    };

    if (existing.length && existing[0]?.id) {
      await SchoolEntity.update(String(existing[0].id), payload);
      return { id: String(existing[0].id), mode: "updated" };
    }

    const created = await SchoolEntity.create(payload);
    const id = created?.id ? String(created.id) : null;
    return { id, mode: "created" };
  }

  async function upsertSchoolSportSite({
    school_id,
    sport_id,
    camp_site_url,
    logo_url,
    source_key,
  }) {
    if (!SchoolSportSiteEntity?.filter || !SchoolSportSiteEntity?.create || !SchoolSportSiteEntity?.update) {
      throw new Error("SchoolSportSite entity not available.");
    }

    const sid = safeString(school_id);
    const spid = safeString(sport_id);
    const url = safeString(camp_site_url);
    const key = safeString(source_key) || `sportsusa:${spid}:${String(url || "").toLowerCase()}`;

    if (!sid || !spid || !url) throw new Error("Missing required school_id/sport_id/camp_site_url");

    const nowIso = new Date().toISOString();

    let existing = [];
    try {
      existing = asArray(await SchoolSportSiteEntity.filter({ school_id: sid, sport_id: spid }));
    } catch {
      existing = [];
    }

    // If multiple rows exist, we upsert the first (MVP safe)
    const hit = existing.length ? existing[0] : null;

    const payload = {
      school_id: sid,
      sport_id: spid,
      camp_site_url: url,
      logo_url: safeString(logo_url) || null,
      source_platform: "sportsusa",
      source_key: key,
      active: true,
      needs_review: false,
      last_seen_at: nowIso,
    };

    if (hit?.id) {
      await SchoolSportSiteEntity.update(String(hit.id), payload);
      return { id: String(hit.id), mode: "updated" };
    }

    const created = await SchoolSportSiteEntity.create(payload);
    const id = created?.id ? String(created.id) : null;
    return { id, mode: "created" };
  }

  async function upsertCampDemoByEventKey(payload) {
    if (!CampDemoEntity?.filter || !CampDemoEntity?.create || !CampDemoEntity?.update) {
      throw new Error("CampDemo entity not available.");
    }
    const key = payload?.event_key;
    if (!key) throw new Error("Missing event_key for CampDemo upsert.");

    let existing = [];
    try {
      existing = asArray(await CampDemoEntity.filter({ event_key: key }));
    } catch {
      existing = [];
    }

    if (existing.length && existing[0]?.id) {
      await CampDemoEntity.update(String(existing[0].id), payload);
      return "updated";
    }

    await CampDemoEntity.create(payload);
    return "created";
  }

  /* ----------------------------
     1) SportsUSA Seed Schools
  ----------------------------- */
  async function runSportsUSASeedSchools() {
    if (!selectedSportId) return appendSportsUSA("[SportsUSA] ERROR: Select a sport first.");
    if (!safeString(sportsUSASiteUrl)) return appendSportsUSA("[SportsUSA] ERROR: Provide SportsUSA directory URL.");

    setSportsUSAWorking(true);
    setLogSportsUSA("");

    const runIso = new Date().toISOString();
    appendSportsUSA(`[SportsUSA] Starting: SportsUSA School Seed (${selectedSportName}) @ ${runIso}`);
    appendSportsUSA(`[SportsUSA] DryRun=${sportsUSADryRun ? "true" : "false"} | Limit=${sportsUSALimit}`);
    appendSportsUSA(`[SportsUSA] Directory URL: ${sportsUSASiteUrl}`);

    try {
      // Call backend collector
      const res = await fetch("/functions/sportsUSASeedSchools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: selectedSportId,
          sportName: selectedSportName,
          siteUrl: sportsUSASiteUrl,
          limit: sportsUSALimit,
          dryRun: sportsUSADryRun,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendSportsUSA(`[SportsUSA] ERROR: Collector HTTP ${res.status}`);
        appendSportsUSA(JSON.stringify(data || {}, null, 2));
        return;
      }

      const schools = asArray(data?.schools);
      appendSportsUSA(`[SportsUSA] SportsUSA fetched: schools_found=${data?.stats?.schools_found ?? schools.length} | http=${data?.stats?.http ?? "n/a"}`);

      const sample = schools.slice(0, 3);
      if (sample.length) {
        appendSportsUSA(`[SportsUSA] SportsUSA sample (first ${sample.length}):`);
        for (let i = 0; i < sample.length; i++) {
          appendSportsUSA(`- name="${sample[i]?.school_name || ""}" | logo="${sample[i]?.logo_url || ""}" | view="${sample[i]?.view_site_url || ""}"`);
        }
      }

      if (sportsUSADryRun) {
        appendSportsUSA("[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
        return;
      }

      if (!SchoolEntity || !SchoolSportSiteEntity) {
        appendSportsUSA("[SportsUSA] ERROR: Missing School or SchoolSportSite entities in base44.");
        return;
      }

      appendSportsUSA(`[SportsUSA] Writing ${schools.length} rows to School + SchoolSportSite…`);

      let schoolCreated = 0;
      let schoolUpdated = 0;
      let siteCreated = 0;
      let siteUpdated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < schools.length; i++) {
        const row = schools[i] || {};
        const school_name = safeString(row.school_name);
        const logo_url = safeString(row.logo_url);
        const view_site_url = safeString(row.view_site_url);
        const source_key = safeString(row.source_key) || `view:${String(view_site_url || "").toLowerCase()}`;

        if (!school_name || !view_site_url) {
          skipped += 1;
          continue;
        }

        try {
          const sRes = await upsertSchoolBySourceKey({
            school_name,
            logo_url,
            source_key,
            source_school_url: view_site_url,
          });

          if (sRes.mode === "created") schoolCreated += 1;
          if (sRes.mode === "updated") schoolUpdated += 1;

          const school_id = sRes.id;
          if (!school_id) {
            errors += 1;
            continue;
          }

          const siteRes = await upsertSchoolSportSite({
            school_id,
            sport_id: selectedSportId,
            camp_site_url: view_site_url,
            logo_url,
            source_key: `sportsusa:${selectedSportId}:${String(view_site_url).toLowerCase()}`,
          });

          if (siteRes.mode === "created") siteCreated += 1;
          if (siteRes.mode === "updated") siteUpdated += 1;
        } catch (e) {
          errors += 1;
          appendSportsUSA(`[SportsUSA] ERROR row #${i + 1}: ${String(e?.message || e)}`);
        }

        if ((i + 1) % 10 === 0) {
          appendSportsUSA(
            `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolCreated}/${schoolUpdated} | Sites c/u=${siteCreated}/${siteUpdated} | skipped=${skipped} errors=${errors}`
          );
        }

        await sleep(35);
      }

      appendSportsUSA(
        `[SportsUSA] Writes done. Schools: created=${schoolCreated} updated=${schoolUpdated} | Sites: created=${siteCreated} updated=${siteUpdated} | skipped=${skipped} errors=${errors}`
      );
    } catch (e) {
      appendSportsUSA(`[SportsUSA] ERROR: ${String(e?.message || e)}`);
    } finally {
      setSportsUSAWorking(false);
    }
  }

  /* ----------------------------
     2) Camps ingest (from SchoolSportSite)
  ----------------------------- */
  async function runSportsUSACampsIngest() {
    if (!selectedSportId) return appendCamps("[Camps] ERROR: Select a sport first.");
    if (!SchoolSportSiteEntity?.filter) return appendCamps("[Camps] ERROR: SchoolSportSite entity missing.");
    if (!CampDemoEntity) return appendCamps("[Camps] ERROR: CampDemo entity missing.");

    setCampsWorking(true);
    setLogCamps("");

    const runIso = new Date().toISOString();
    appendCamps(`[Camps] Starting: SportsUSA Camps Ingest (${selectedSportName}) @ ${runIso}`);
    appendCamps(
      `[Camps] DryRun=${campsDryRun ? "true" : "false"} | MaxSites=${campsMaxSites} | MaxRegsPerSite=${campsMaxRegsPerSite} | MaxEvents=${campsMaxEvents}`
    );

    try {
      // Load per-sport sites
      const siteRows = asArray(
        await SchoolSportSiteEntity.filter({
          sport_id: selectedSportId,
          active: true,
        })
      );

      // Normalize + keep only usable URLs
      const sites = siteRows
        .map((r) => ({
          id: r?.id ? String(r.id) : "",
          school_id: safeString(r?.school_id),
          camp_site_url: safeString(r?.camp_site_url),
          logo_url: safeString(r?.logo_url),
          active: r?.active !== false,
        }))
        .filter((s) => s.school_id && s.camp_site_url && s.active);

      appendCamps(`[Camps] Loaded SchoolSportSite rows: ${sites.length} (active)`);

      const payload = {
        sportId: selectedSportId,
        sportName: selectedSportName,
        dryRun: true, // always dry-run on function; DB writes happen here
        maxSites: campsMaxSites,
        maxRegsPerSite: campsMaxRegsPerSite,
        maxEvents: campsMaxEvents,
        sites: sites.slice(0, Math.max(1, campsMaxSites)),
      };

      // Call backend collector+parser
      const res = await fetch("/functions/sportsUSAIngestCamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        appendCamps(`[Camps] ERROR: Function HTTP ${res.status}`);
        appendCamps(JSON.stringify(data || {}, null, 2));
        return;
      }

      appendCamps(
        `[Camps] Function stats: processedSites=${data?.stats?.processedSites ?? 0} processedRegs=${data?.stats?.processedRegs ?? 0} accepted=${data?.stats?.accepted ?? 0} rejected=${data?.stats?.rejected ?? 0} errors=${data?.stats?.errors ?? 0}`
      );
      appendCamps(`[Camps] Function version: ${data?.debug?.version || "MISSING"}`);

      // Print per-site debug (THIS is what will explain processedRegs=0)
      const dbgSites = asArray(data?.debug?.sites);
      if (dbgSites.length) {
        appendCamps(`[Camps] Site debug (first ${Math.min(5, dbgSites.length)}):`);
        for (let i = 0; i < Math.min(5, dbgSites.length); i++) {
          const s = dbgSites[i] || {};
          appendCamps(
            `- school_id=${s.school_id || ""} http=${s.http ?? "n/a"} html=${s.htmlLooksLike || "n/a"} regLinks=${s.foundRegLinks ?? 0} sample=${(s.regLinksSample || []).slice(0, 2).join(" | ")}`
          );
          if (s.notes && s.notes.length) appendCamps(`  notes=${s.notes.join(", ")}`);
        }
      }

      const accepted = asArray(data?.accepted);

      if (!accepted.length) {
        appendCamps("[Camps] No accepted events returned from function.");
        // If you want deeper debug, print a snippet of the first site’s HTML
        if (dbgSites.length && dbgSites[0]?.snippet) {
          appendCamps("[Camps] First site HTML snippet (debug):");
          appendCamps(String(dbgSites[0].snippet));
        }
        return;
      }

      // If DryRun, do not write
      if (campsDryRun) {
        appendCamps("[Camps] DryRun=true: no CampDemo writes performed.");
        // show a few accepted samples
        const sample = accepted.slice(0, 5);
        appendCamps(`[Camps] Accepted sample (first ${sample.length}):`);
        for (let i = 0; i < sample.length; i++) {
          appendCamps(`- ${sample[i]?.camp_name || ""} | ${sample[i]?.start_date || ""} | ${sample[i]?.link_url || ""}`);
        }
        return;
      }

      // Write to CampDemo
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      appendCamps(`[Camps] Writing ${accepted.length} events → CampDemo (upsert by event_key)…`);

      for (let i = 0; i < accepted.length; i++) {
        const item = accepted[i] || {};

        const school_id = safeString(item.school_id);
        const sport_id = safeString(item.sport_id);
        const camp_name = safeString(item.camp_name);
        const start_date = safeString(item.start_date);
        const end_date = safeString(item.end_date);

        const event_key = safeString(item.event_key);
        const program_id = safeString(item.program_id);
        const season_year = safeNumber(item.season_year) ?? safeNumber(computeSeasonYearFootball(start_date));

        if (!school_id || !sport_id || !camp_name || !start_date || !event_key || !program_id || season_year == null) {
          skipped += 1;
          continue;
        }

        const payloadRow = {
          school_id,
          sport_id,
          camp_name,
          start_date,
          end_date: end_date || null,
          city: null,
          state: null,
          position_ids: [],
          price: null,
          link_url: safeString(item.link_url) || null,
          notes: null,

          season_year,
          program_id,
          event_key,
          source_platform: safeString(item.source_platform) || "sportsusa",
          source_url: safeString(item.source_url) || null,
          last_seen_at: safeString(item.last_seen_at) || new Date().toISOString(),
          content_hash: safeString(item.content_hash) || simpleHash(item),

          event_dates_raw: safeString(item.event_dates_raw) || null,
          grades_raw: safeString(item.grades_raw) || null,
          register_by_raw: safeString(item.register_by_raw) || null,
          price_raw: safeString(item.price_raw) || null,
          price_min: safeNumber(item.price_min),
          price_max: safeNumber(item.price_max),
          sections_json: safeObject(item.sections_json) || null,
        };

        try {
          const r = await upsertCampDemoByEventKey(payloadRow);
          if (r === "created") created += 1;
          if (r === "updated") updated += 1;
        } catch (e) {
          errors += 1;
          appendCamps(`[Camps] ERROR write #${i + 1}: ${String(e?.message || e)}`);
        }

        if ((i + 1) % 10 === 0) appendCamps(`[Camps] Progress ${i + 1}/${accepted.length} c/u=${created}/${updated} skipped=${skipped} errors=${errors}`);
        await sleep(35);
      }

      appendCamps(`[Camps] Writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
    } catch (e) {
      appendCamps(`[Camps] ERROR: ${String(e?.message || e)}`);
    } finally {
      setCampsWorking(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Admin Import</div>
            <div className="text-sm text-slate-600">
              SportsUSA seed → School/SchoolSportSite → Camps ingest → CampDemo.
            </div>
          </div>
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Back to Workspace
          </Button>
        </div>

        {/* ✅ Single sport selector (drives everything) */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Select Sport</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sport</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={selectedSportId}
                onChange={(e) => {
                  const id = e.target.value;
                  const hit = sports.find((x) => x.id === id) || null;
                  setSelectedSportId(id);
                  setSelectedSportName(hit?.name || "");
                }}
                disabled={sportsLoading || sportsUSAWorking || campsWorking}
              >
                <option value="">Select…</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.active ? "" : "(Inactive)"}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {selectedSportId ? `Selected: ${selectedSportLabel}` : "Choose a sport to enable tools below."}
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={loadSports} disabled={sportsLoading}>
                {sportsLoading ? "Refreshing…" : "Refresh Sports"}
              </Button>
            </div>
          </div>
        </Card>

        {/* ✅ SportsUSA Seed Schools */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">SportsUSA: Seed Schools + SchoolSportSite</div>
          <div className="text-sm text-slate-600 mt-1">
            Pulls directory tiles from SportsUSA (footballcampsusa, etc.), then upserts:
            <b> School</b> (logo) + <b>SchoolSportSite</b> (camp_site_url per sport).
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SportsUSA Directory URL</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sportsUSASiteUrl}
                onChange={(e) => setSportsUSASiteUrl(e.target.value)}
                placeholder="https://www.footballcampsusa.com/"
                disabled={sportsUSAWorking || !selectedSportId}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                This is the directory site (not the school camp site). Defaults based on sport name.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  value={sportsUSALimit}
                  onChange={(e) => setSportsUSALimit(Number(e.target.value || 0))}
                  min={10}
                  max={2000}
                  disabled={sportsUSAWorking || !selectedSportId}
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={sportsUSADryRun}
                    onChange={(e) => setSportsUSADryRun(e.target.checked)}
                    disabled={sportsUSAWorking || !selectedSportId}
                  />
                  Dry Run
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={runSportsUSASeedSchools} disabled={!selectedSportId || sportsUSAWorking || campsWorking}>
              {sportsUSAWorking ? "Running…" : sportsUSADryRun ? "Run Seed (Dry Run)" : "Run Seed → Write"}
            </Button>

            <Button
              variant="outline"
              onClick={() => setLogSportsUSA("")}
              disabled={sportsUSAWorking}
            >
              Clear Log
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">SportsUSA Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logSportsUSA || "—"}
            </pre>
          </div>
        </Card>

        {/* ✅ Camps ingest */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Camps: Ingest from SchoolSportSite → CampDemo</div>
          <div className="text-sm text-slate-600 mt-1">
            Reads <b>SchoolSportSite</b> for the selected sport (camp_site_url), extracts registration links,
            fetches registration pages, parses details, and writes to <b>CampDemo</b>.
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Sites</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxSites}
                onChange={(e) => setCampsMaxSites(Number(e.target.value || 0))}
                min={1}
                max={200}
                disabled={campsWorking || !selectedSportId}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Reg Links / Site</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxRegsPerSite}
                onChange={(e) => setCampsMaxRegsPerSite(Number(e.target.value || 0))}
                min={1}
                max={50}
                disabled={campsWorking || !selectedSportId}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Events</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={campsMaxEvents}
                onChange={(e) => setCampsMaxEvents(Number(e.target.value || 0))}
                min={5}
                max={2000}
                disabled={campsWorking || !selectedSportId}
              />
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={campsDryRun}
                  onChange={(e) => setCampsDryRun(e.target.checked)}
                  disabled={campsWorking || !selectedSportId}
                />
                Dry Run
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={runSportsUSACampsIngest} disabled={!selectedSportId || campsWorking || sportsUSAWorking}>
              {campsWorking ? "Running…" : campsDryRun ? "Run Camps (Dry Run)" : "Run Camps → Write CampDemo"}
            </Button>

            <Button variant="outline" onClick={() => setLogCamps("")} disabled={campsWorking}>
              Clear Log
            </Button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Camps Log</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-80">
              {logCamps || "—"}
            </pre>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            If you still see processedRegs=0, the first site HTML snippet will print in this log so we can confirm whether links are JS-injected.
          </div>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => nav(ROUTES.Home)} disabled={sportsUSAWorking || campsWorking}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
