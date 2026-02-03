import React, { useEffect, useMemo, useState } from "react";

/**
 * AdminImport.jsx
 *
 * Goals:
 * - Select sport once at the top.
 * - Seed Schools (SportsUSA) and Ingest Camps (SportsUSA) both use that selected sport.
 * - Each section has its own log panel.
 *
 * IMPORTANT:
 * - You must wire the 3 adapter functions below to your Base44 table API:
 *   - listTable(tableName, filter)
 *   - upsertSchoolAndSiteRows(rows)  // for seed write
 *   - writeCampDemoRows(rows)        // for camp ingest write
 *
 * Everything else should be copy/paste ready.
 */

// -------------------------
// ADAPTERS (wire these once)
// -------------------------

async function callFunction(functionName, payload) {
  // Base44 typically exposes backend functions under /api/functions/<name>
  // If yours differs, change it here.
  const res = await fetch(`/api/functions/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (e) { /* ignore */ }
  return { ok: res.ok, status: res.status, raw: txt, json };
}

// TODO: Replace with your Base44 table reads
async function listTable(tableName, filterObj) {
  // You MUST implement this for your Base44 project.
  // Return: array of rows
  // Example return shape per row:
  // { id, ...fields }
  throw new Error(`listTable() not wired for ${tableName}`);
}

// TODO: Replace with your Base44 School + SchoolSportSite upsert writes
async function upsertSchoolAndSiteRows(seedRows, logFn) {
  // seedRows entries look like:
  // { school_name, logo_url, view_site_url, source_key, ... }
  // You should:
  // 1) upsert School by normalized_name or source_key
  // 2) upsert SchoolSportSite for the selected sport
  // Return { schools_created, schools_updated, sites_created, sites_updated, errors }
  throw new Error("upsertSchoolAndSiteRows() not wired");
}

// TODO: Replace with your Base44 CampDemo writes
async function writeCampDemoRows(campDemoRows, logFn) {
  // campDemoRows entries look like:
  // { school_id, sport_id, camp_name, start_date, season_year, program_id, event_key, source_platform, ... }
  // You should upsert by event_key.
  throw new Error("writeCampDemoRows() not wired");
}

// -------------------------
// UI Helpers
// -------------------------

function nowIso() {
  return new Date().toISOString();
}

function useLogger(prefix) {
  const [lines, setLines] = useState([]);
  function log(msg) {
    setLines(prev => prev.concat([`${prefix} ${msg}`]));
  }
  function clear() {
    setLines([]);
  }
  return { lines, log, clear };
}

function shuffleCopy(arr) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// -------------------------
// Component
// -------------------------

export default function AdminImport() {
  const sportsLog = useLogger("[Admin]");
  const seedLog = useLogger("[SportsUSA]");
  const campsLog = useLogger("[Camps]");

  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState("");
  const selectedSport = useMemo(() => {
    for (let i = 0; i < sports.length; i++) {
      if (sports[i].id === selectedSportId) return sports[i];
    }
    return null;
  }, [sports, selectedSportId]);

  // Shared controls
  const [dryRun, setDryRun] = useState(true);

  // Seed controls
  const [seedLimit, setSeedLimit] = useState(300);
  const [seedSiteUrl, setSeedSiteUrl] = useState("https://www.footballcampsusa.com/");

  // Camps controls
  const [sitesToScan, setSitesToScan] = useState(50);
  const [sitesWithEventsToProcess, setSitesWithEventsToProcess] = useState(5);
  const [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  const [maxEvents, setMaxEvents] = useState(50);
  const [enforceUniversityOnly, setEnforceUniversityOnly] = useState(true);

  // Load sports
  useEffect(() => {
    (async () => {
      sportsLog.clear();
      sportsLog.log(`Loading Sport table @ ${nowIso()}`);
      try {
        const rows = await listTable("Sport", {});
        setSports(rows || []);
        if ((rows || []).length && !selectedSportId) setSelectedSportId(rows[0].id);
        sportsLog.log(`Loaded sports: ${(rows || []).length}`);
      } catch (e) {
        sportsLog.log(`ERROR: ${String(e && e.message ? e.message : e)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSeedSchools() {
    seedLog.clear();

    if (!selectedSport) {
      seedLog.log("ERROR: Select a sport first.");
      return;
    }

    seedLog.log(`Starting: SportsUSA School Seed (${selectedSport.sport_name}) @ ${nowIso()}`);
    seedLog.log(`DryRun=${dryRun} | Limit=${seedLimit}`);
    seedLog.log(`Site URL=${seedSiteUrl}`);

    // 1) Collect from server-side function (avoids CORS)
    const { ok, status, json, raw } = await callFunction("sportsUSASeedSchools", {
      sportId: selectedSport.id,
      sportName: selectedSport.sport_name,
      siteUrl: seedSiteUrl,
      limit: Number(seedLimit),
      dryRun: true // collector always dry-run; AdminImport decides DB writes
    });

    if (!ok || !json) {
      seedLog.log(`ERROR: sportsUSASeedSchools function failed HTTP ${status}`);
      seedLog.log(raw ? truncate(raw, 800) : "");
      return;
    }

    const schools = (json && json.schools) ? json.schools : [];
    const stats = (json && json.stats) ? json.stats : {};
    seedLog.log(`SportsUSA fetched: schools_found=${stats.schools_found || schools.length} | http=${stats.http || "?"}`);

    const sample = schools.slice(0, 3);
    for (let i = 0; i < sample.length; i++) {
      seedLog.log(`Sample: name="${sample[i].school_name}" | logo="${sample[i].logo_url}" | view="${sample[i].view_site_url}"`);
    }

    if (dryRun) {
      seedLog.log("DryRun=true: no School / SchoolSportSite writes performed.");
      return;
    }

    // 2) Write School + SchoolSportSite
    try {
      seedLog.log(`Writing ${schools.length} rows to School + SchoolSportSite…`);
      const result = await upsertSchoolAndSiteRows(
        schools.map(s => ({
          school_name: s.school_name,
          logo_url: s.logo_url,
          camp_site_url: s.view_site_url, // map to your SchoolSportSite field
          source_platform: "sportsusa",
          source_key: s.source_key
        })),
        seedLog.log
      );

      seedLog.log(`Writes done. ${JSON.stringify(result)}`);
    } catch (e) {
      seedLog.log(`ERROR writing: ${String(e && e.message ? e.message : e)}`);
    }
  }

  async function runIngestCamps() {
    campsLog.clear();

    if (!selectedSport) {
      campsLog.log("ERROR: Select a sport first.");
      return;
    }

    campsLog.log(`Starting: SportsUSA Camps Ingest (${selectedSport.sport_name}) @ ${nowIso()}`);
    campsLog.log(`DryRun=${dryRun} | SitesToScan=${sitesToScan} | SitesWithEventsToProcess=${sitesWithEventsToProcess} | MaxRegsPerSite=${maxRegsPerSite} | MaxEvents=${maxEvents}`);

    // 1) Load SchoolSportSite (active) for this sport
    let siteRows = [];
    try {
      // You must implement listTable to support filtering
      // at minimum, filter in JS after read if your adapter is basic.
      const all = await listTable("SchoolSportSite", {});
      const filtered = (all || []).filter(r => {
        if (!r) return false;
        if (r.active === false) return false;
        if (r.sport_id !== selectedSport.id) return false;
        return !!r.camp_site_url;
      });
      siteRows = filtered;
      campsLog.log(`Loaded SchoolSportSite rows: ${siteRows.length} (active)`);
    } catch (e) {
      campsLog.log(`ERROR loading SchoolSportSite: ${String(e && e.message ? e.message : e)}`);
      return;
    }

    if (!siteRows.length) {
      campsLog.log("No SchoolSportSite rows found for this sport. Seed schools first.");
      return;
    }

    // Shuffle to avoid getting “empty sites” clustered together
    const shuffled = shuffleCopy(siteRows);

    // 2) Send subset to backend function (it will scan and skip empties)
    const sitesSubset = shuffled.slice(0, Number(sitesToScan)).map(r => ({
      school_id: r.school_id,
      camp_site_url: r.camp_site_url,
      logo_url: r.logo_url
    }));

    const fnResp = await callFunction("sportsUSAIngestCamps", {
      sportId: selectedSport.id,
      sportName: selectedSport.sport_name,
      dryRun: true, // function returns data only; AdminImport writes
      enforceUniversityOnly: !!enforceUniversityOnly,
      maxSitesToScan: Number(sitesToScan),
      maxSitesWithEvents: Number(sitesWithEventsToProcess),
      maxRegsPerSite: Number(maxRegsPerSite),
      maxEvents: Number(maxEvents),
      sites: sitesSubset
    });

    if (!fnResp.ok || !fnResp.json) {
      campsLog.log(`ERROR: sportsUSAIngestCamps function failed HTTP ${fnResp.status}`);
      campsLog.log(fnResp.raw ? fnResp.raw.slice(0, 1200) : "");
      return;
    }

    const stats = fnResp.json.stats || {};
    campsLog.log(`Function stats: processedSites=${stats.processedSites} sitesWithEventsProcessed=${stats.sitesWithEventsProcessed} processedRegs=${stats.processedRegs} accepted=${stats.accepted} rejected=${stats.rejected} errors=${stats.errors}`);
    campsLog.log(`Skips: noUpcoming=${stats.skippedNoUpcoming} noRegLinks=${stats.skippedNoRegLinks}`);
    campsLog.log(`Function version: ${(fnResp.json.debug && fnResp.json.debug.version) || "?"}`);

    // Helpful per-site debug sample
    const siteDebug = (fnResp.json.debug && fnResp.json.debug.siteDebug) ? fnResp.json.debug.siteDebug : [];
    const first = siteDebug.slice(0, 5);
    for (let i = 0; i < first.length; i++) {
      campsLog.log(`Site debug: school_id=${first[i].school_id} http=${first[i].http} regLinks=${first[i].regLinks} notes=${first[i].notes || ""}`);
    }

    const accepted = fnResp.json.accepted || [];
    if (!accepted.length) {
      campsLog.log("No accepted events returned from function (likely the scanned sites had no camps posted). Increase SitesToScan.");
      return;
    }

    // 3) Write CampDemo (unless dryRun)
    if (dryRun) {
      campsLog.log("DryRun=true: no CampDemo writes performed.");
      campsLog.log(`Accepted sample (first 3):`);
      const sample = accepted.slice(0, 3);
      for (let i = 0; i < sample.length; i++) {
        const c = sample[i].campdemo;
        campsLog.log(`- ${c.camp_name} | ${c.start_date} | ${c.link_url}`);
      }
      return;
    }

    try {
      const campRows = accepted.map(a => a.campdemo);
      campsLog.log(`Writing ${campRows.length} rows to CampDemo…`);
      const writeResult = await writeCampDemoRows(campRows, campsLog.log);
      campsLog.log(`CampDemo writes done: ${JSON.stringify(writeResult)}`);
    } catch (e) {
      campsLog.log(`ERROR writing CampDemo: ${String(e && e.message ? e.message : e)}`);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2>Admin Import</h2>

      {/* Global controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Sport</div>
          <select value={selectedSportId} onChange={(e) => setSelectedSportId(e.target.value)}>
            {sports.map(s => (
              <option key={s.id} value={s.id}>{s.sport_name}</option>
            ))}
          </select>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry Run
        </label>
      </div>

      {/* Seed Schools */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <h3>SportsUSA: Seed Schools</h3>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Site URL</div>
            <input
              style={{ width: 420 }}
              value={seedSiteUrl}
              onChange={(e) => setSeedSiteUrl(e.target.value)}
              placeholder="https://www.footballcampsusa.com/"
            />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Limit</div>
            <input type="number" value={seedLimit} onChange={(e) => setSeedLimit(e.target.value)} />
          </div>
          <button onClick={runSeedSchools}>Run Seed Schools</button>
        </div>

        <pre style={{ background: "#f7f7f7", padding: 10, borderRadius: 6, maxHeight: 220, overflow: "auto" }}>
          {seedLog.lines.join("\n")}
        </pre>
      </div>

      {/* Ingest Camps */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <h3>SportsUSA: Ingest Camps</h3>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Sites to scan</div>
            <input type="number" value={sitesToScan} onChange={(e) => setSitesToScan(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Sites with events to process</div>
            <input type="number" value={sitesWithEventsToProcess} onChange={(e) => setSitesWithEventsToProcess(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Max regs per site</div>
            <input type="number" value={maxRegsPerSite} onChange={(e) => setMaxRegsPerSite(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Max events</div>
            <input type="number" value={maxEvents} onChange={(e) => setMaxEvents(e.target.value)} />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={enforceUniversityOnly} onChange={(e) => setEnforceUniversityOnly(e.target.checked)} />
            University-only guardrail
          </label>

          <button onClick={runIngestCamps}>Run Camps Ingest</button>
        </div>

        <pre style={{ background: "#f7f7f7", padding: 10, borderRadius: 6, maxHeight: 260, overflow: "auto" }}>
          {campsLog.lines.join("\n")}
        </pre>
      </div>

      {/* Admin log */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
        <h3>Admin Log</h3>
        <pre style={{ background: "#f7f7f7", padding: 10, borderRadius: 6, maxHeight: 180, overflow: "auto" }}>
          {sportsLog.lines.join("\n")}
        </pre>
      </div>
    </div>
  );
}
