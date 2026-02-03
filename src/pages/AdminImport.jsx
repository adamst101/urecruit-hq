// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";

// NOTE: Replace these with your actual Base44 DB utilities if named differently.
import { db } from "../lib/db"; // common pattern; adjust if your app uses a different path
import { callFunction } from "../lib/functions"; // common pattern; adjust if your app uses a different path

// If your project doesn't have these helpers, search your codebase for existing usage of db.table(...)
// and callFunction("functionName", payload) and align the imports accordingly.

function nowIso() {
  return new Date().toISOString();
}

function safeString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function AdminImport() {
  // -------------------------
  // Sport selection (top-level)
  // -------------------------
  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState("");
  const selectedSport = useMemo(() => {
    let s = null;
    for (let i = 0; i < sports.length; i++) {
      if (sports[i].id === selectedSportId) {
        s = sports[i];
        break;
      }
    }
    return s;
  }, [sports, selectedSportId]);

  // -------------------------
  // Logging (per section)
  // -------------------------
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");

  function appendLog(setter, line) {
    setter((prev) => prev + line + "\n");
  }

  // -------------------------
  // Controls
  // -------------------------
  const [dryRun, setDryRun] = useState(true);

  // SportsUSA seed controls
  const [seedLimit, setSeedLimit] = useState(300);

  // Camps ingest controls
  const [maxSites, setMaxSites] = useState(5);
  const [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  const [maxEvents, setMaxEvents] = useState(25);
  const [testSiteUrl, setTestSiteUrl] = useState("");

  // Load Sports
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const rows = await db.table("Sport").select("*").order("sport_name");
        if (!mounted) return;
        setSports(rows || []);
        if ((rows || []).length && !selectedSportId) {
          setSelectedSportId(rows[0].id);
        }
      } catch (e) {
        // If Sport load fails, user will see empty dropdown.
        // You can also add a UI alert if you want.
      }
    }
    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line
  }, []);

  // -------------------------
  // Actions: SportsUSA Seed
  // -------------------------
  async function runSportsUSASeed() {
    setLogSportsUSA("");
    if (!selectedSportId || !selectedSport) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: Select a sport first.`);
      return;
    }

    appendLog(setLogSportsUSA, `[SportsUSA] Starting: SportsUSA School Seed (${selectedSport.sport_name}) @ ${nowIso()}`);
    appendLog(setLogSportsUSA, `[SportsUSA] DryRun=${dryRun} | Limit=${seedLimit}`);

    try {
      // You must have /functions/sportsUSASeedSchools.js deployed.
      // It requires: sportId, sportName, siteUrl, limit, dryRun
      // We'll map sportName -> sports site URL by convention:
      // football -> https://www.footballcampsusa.com
      // soccer -> https://www.soccersportsusa.com  (adjust if your actual domains differ)
      // baseball -> https://www.baseballcampsusa.com (etc)
      //
      // If you want this configurable later, store it in a table. For now, deterministic mapping.

      const sportNameLc = safeString(selectedSport.sport_name).toLowerCase().trim();
      let siteUrl = "";
      if (sportNameLc === "football") siteUrl = "https://www.footballcampsusa.com/";
      else if (sportNameLc === "baseball") siteUrl = "https://www.baseballcampsusa.com/";
      else if (sportNameLc === "softball") siteUrl = "https://www.softballcampsusa.com/";
      else if (sportNameLc === "soccer") siteUrl = "https://www.soccersportsusa.com/";
      else if (sportNameLc === "volleyball") siteUrl = "https://www.volleyballcampsusa.com/";
      else {
        appendLog(setLogSportsUSA, `[SportsUSA] ERROR: No known SportsUSA site mapping for sport "${selectedSport.sport_name}".`);
        appendLog(setLogSportsUSA, `[SportsUSA] Fix: add a mapping in code for this sport.`);
        return;
      }

      const payload = {
        sportId: selectedSportId,
        sportName: selectedSport.sport_name,
        siteUrl: siteUrl,
        limit: Number(seedLimit || 300),
        dryRun: !!dryRun
      };

      const resp = await callFunction("sportsUSASeedSchools", payload);

      if (!resp || !resp.stats) {
        appendLog(setLogSportsUSA, `[SportsUSA] ERROR: No response or missing stats.`);
        appendLog(setLogSportsUSA, JSON.stringify(resp || {}, null, 2));
        return;
      }

      appendLog(setLogSportsUSA, `[SportsUSA] SportsUSA fetched: schools_found=${resp.stats.schools_found} | http=${resp.stats.http}`);

      if (resp.debug && resp.debug.sample && resp.debug.sample.length) {
        appendLog(setLogSportsUSA, `[SportsUSA] SportsUSA sample (first ${Math.min(resp.debug.sample.length, 3)}):`);
        for (let i = 0; i < Math.min(resp.debug.sample.length, 3); i++) {
          const s = resp.debug.sample[i];
          appendLog(setLogSportsUSA, `- name="${s.school_name}" | logo="${s.logo_url}" | view="${s.view_site_url}"`);
        }
      }

      // Optional DB write (seed School + SchoolSportSite) should be done here.
      // Based on your previous logs, you already have this part working in some version.
      // Below is a safe upsert approach aligned with your schemas.

      if (dryRun) {
        appendLog(setLogSportsUSA, `[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.`);
        return;
      }

      const schools = resp.schools || [];
      appendLog(setLogSportsUSA, `[SportsUSA] Writing ${schools.length} rows to School + SchoolSportSite…`);

      let schoolsCreated = 0;
      let schoolsUpdated = 0;
      let sitesCreated = 0;
      let sitesUpdated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < schools.length; i++) {
        const row = schools[i];
        const schoolName = row.school_name;
        const logoUrl = row.logo_url || null;
        const campSiteUrl = row.view_site_url || null;

        if (!schoolName || !campSiteUrl) {
          skipped += 1;
          continue;
        }

        try {
          // Upsert School by normalized_name or school_name. We'll use school_name exact match for now.
          const existing = await db.table("School").select("*").eq("school_name", schoolName).maybeSingle();

          let schoolId = "";
          if (!existing) {
            const created = await db.table("School").insert({
              school_name: schoolName,
              logo_url: logoUrl,
              active: true,
              school_type: "College/University",
              source_platform: "sportsusa",
              source_school_url: campSiteUrl,
              source_key: row.source_key || null,
              needs_review: false,
              last_seen_at: nowIso()
            }).single();
            schoolId = created.id;
            schoolsCreated += 1;
          } else {
            schoolId = existing.id;
            await db.table("School").update({
              logo_url: logoUrl || existing.logo_url || null,
              source_platform: existing.source_platform || "sportsusa",
              source_school_url: existing.source_school_url || campSiteUrl,
              last_seen_at: nowIso()
            }).eq("id", schoolId);
            schoolsUpdated += 1;
          }

          // Upsert SchoolSportSite by (school_id + sport_id)
          const existingSite = await db.table("SchoolSportSite")
            .select("*")
            .eq("school_id", schoolId)
            .eq("sport_id", selectedSportId)
            .maybeSingle();

          const sourceKey = row.source_key || ("sportsusa:" + safeString(selectedSport.sport_name).toLowerCase() + ":" + safeString(campSiteUrl).toLowerCase());

          if (!existingSite) {
            await db.table("SchoolSportSite").insert({
              school_id: schoolId,
              sport_id: selectedSportId,
              camp_site_url: campSiteUrl,
              logo_url: logoUrl,
              source_platform: "sportsusa",
              source_key: sourceKey,
              active: true,
              needs_review: false,
              last_seen_at: nowIso()
            });
            sitesCreated += 1;
          } else {
            await db.table("SchoolSportSite").update({
              camp_site_url: campSiteUrl,
              logo_url: logoUrl || existingSite.logo_url || null,
              source_platform: existingSite.source_platform || "sportsusa",
              source_key: existingSite.source_key || sourceKey,
              active: true,
              last_seen_at: nowIso()
            }).eq("id", existingSite.id);
            sitesUpdated += 1;
          }

          if ((i + 1) % 10 === 0) {
            appendLog(setLogSportsUSA, `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`);
          }
        } catch (e) {
          errors += 1;
          appendLog(setLogSportsUSA, `[SportsUSA] ERROR row ${i + 1}: ${safeString((e && e.message) || e)}`);
        }
      }

      appendLog(setLogSportsUSA, `[SportsUSA] Writes done. Schools: created=${schoolsCreated} updated=${schoolsUpdated} | Sites: created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`);
    } catch (e) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: ${safeString((e && e.message) || e)}`);
    }
  }

  // -------------------------
  // Actions: Camps ingest -> CampDemo
  // -------------------------
  async function runCampsIngest() {
    setLogCamps("");
    if (!selectedSportId || !selectedSport) {
      appendLog(setLogCamps, `[Camps] ERROR: Select a sport first.`);
      return;
    }

    appendLog(setLogCamps, `[Camps] Starting: SportsUSA Camps Ingest (${selectedSport.sport_name}) @ ${nowIso()}`);
    appendLog(setLogCamps, `[Camps] DryRun=${dryRun} | MaxSites=${maxSites} | MaxRegsPerSite=${maxRegsPerSite} | MaxEvents=${maxEvents}`);

    try {
      // Load active SchoolSportSite rows for this sport
      const sites = await db.table("SchoolSportSite")
        .select("*")
        .eq("sport_id", selectedSportId)
        .eq("active", true);

      appendLog(setLogCamps, `[Camps] Loaded SchoolSportSite rows: ${(sites || []).length} (active)`);

      const urls = [];
      for (let i = 0; i < (sites || []).length; i++) {
        const u = sites[i].camp_site_url;
        if (u) urls.push(u);
      }

      const payload = {
        sportId: selectedSportId,
        sportName: selectedSport.sport_name,
        dryRun: !!dryRun,
        maxSites: Number(maxSites || 5),
        maxRegsPerSite: Number(maxRegsPerSite || 10),
        maxEvents: Number(maxEvents || 25),
        testSiteUrl: safeString(testSiteUrl).trim() ? safeString(testSiteUrl).trim() : null,
        siteUrls: safeString(testSiteUrl).trim() ? null : urls
      };

      const resp = await callFunction("sportsUSAIngestCamps", payload);

      // ✅ Always print version reliably
      const fnVersion = (resp && (resp.version || (resp.debug && resp.debug.version))) || "MISSING";
      appendLog(setLogCamps, `[Camps] Function version: ${fnVersion}`);

      // ✅ Stats
      if (resp && resp.stats) {
        appendLog(
          setLogCamps,
          `[Camps] Function stats: processedSites=${resp.stats.processedSites} processedRegs=${resp.stats.processedRegs} accepted=${resp.stats.accepted} rejected=${resp.stats.rejected} errors=${resp.stats.errors}`
        );
      } else {
        appendLog(setLogCamps, `[Camps] ERROR: Missing resp.stats`);
      }

      // ✅ Errors (first 3)
      if (resp && resp.errors && resp.errors.length) {
        appendLog(setLogCamps, `[Camps] Function errors (first ${Math.min(resp.errors.length, 3)}):`);
        for (let i = 0; i < Math.min(resp.errors.length, 3); i++) {
          appendLog(setLogCamps, `- ${JSON.stringify(resp.errors[i])}`);
        }
      }

      // ✅ Per-site debug (first 1)
      if (resp && resp.debug && resp.debug.siteDebug && resp.debug.siteDebug.length) {
        const s0 = resp.debug.siteDebug[0];
        appendLog(setLogCamps, `[Camps] Site debug (first 1):`);
        appendLog(
          setLogCamps,
          `- url=${s0.siteUrl || ""} http=${s0.http || ""} htmlType=${s0.htmlType || ""} regLinks=${s0.regLinks || 0} sample=${s0.sample || ""} notes=${s0.notes || ""}`
        );
      }

      // ✅ HTML snippet (only useful when regLinks=0 or errors>0)
      if (resp && resp.debug && resp.debug.firstSiteHtmlSnippet) {
        appendLog(setLogCamps, `[Camps] First site HTML snippet (debug):`);
        appendLog(setLogCamps, resp.debug.firstSiteHtmlSnippet);
      }

      // If nothing accepted, show rejects
      if (resp && resp.accepted && resp.accepted.length) {
        appendLog(setLogCamps, `[Camps] Accepted events returned: ${resp.accepted.length}`);
        appendLog(setLogCamps, `[Camps] Sample (first 3):`);
        for (let i = 0; i < Math.min(resp.accepted.length, 3); i++) {
          const a = resp.accepted[i];
          const ev = a.event || {};
          appendLog(setLogCamps, `- camp="${ev.camp_name}" start=${ev.start_date || "n/a"} url=${ev.link_url || ""}`);
        }
      } else {
        if (resp && resp.rejected_samples && resp.rejected_samples.length) {
          appendLog(setLogCamps, `[Camps] Rejected samples (first ${Math.min(resp.rejected_samples.length, 5)}):`);
          for (let i = 0; i < Math.min(resp.rejected_samples.length, 5); i++) {
            const rj = resp.rejected_samples[i];
            appendLog(setLogCamps, `- reason=${rj.reason} title="${rj.title || ""}" url=${rj.registrationUrl || ""} datesLine=${rj.event_dates_line || ""}`);
          }
        }
        appendLog(setLogCamps, `[Camps] No accepted events returned from function.`);
        if (dryRun) appendLog(setLogCamps, `[Camps] DryRun=true: no CampDemo writes performed.`);
        return;
      }

      if (dryRun) {
        appendLog(setLogCamps, `[Camps] DryRun=true: no CampDemo writes performed.`);
        return;
      }

      // Write to CampDemo
      let wrote = 0;
      let writeErrors = 0;
      const accepted = resp.accepted || [];

      for (let i = 0; i < accepted.length; i++) {
        const a = accepted[i];
        const ev = a.event || {};
        const dr = a.derived || {};

        // We need a school_id. Since testSiteUrl may not map to a known school,
        // we only write when we can resolve a SchoolSportSite row by matching camp_site_url.
        let schoolId = null;

        // Try match by site_url (derived)
        const siteUrl = dr.site_url || null;
        if (siteUrl) {
          const srow = await db.table("SchoolSportSite").select("*").eq("camp_site_url", siteUrl).maybeSingle();
          if (srow) schoolId = srow.school_id;
        }

        if (!schoolId) {
          // If we can’t resolve school_id, skip write
          writeErrors += 1;
          appendLog(setLogCamps, `[Camps] SKIP: Could not resolve school_id for camp "${ev.camp_name}" (site_url missing or not found in SchoolSportSite).`);
          continue;
        }

        try {
          await db.table("CampDemo").insert({
            school_id: schoolId,
            sport_id: selectedSportId,
            camp_name: ev.camp_name,
            start_date: ev.start_date,
            end_date: ev.end_date || null,
            city: ev.city || null,
            state: ev.state || null,
            price: ev.price || null,
            link_url: ev.link_url,
            notes: ev.notes || null,

            season_year: new Date(ev.start_date).getFullYear(),
            program_id: dr.program_id,
            event_key: dr.event_key,
            source_platform: ev.source_platform || "sportsusa",
            source_url: ev.source_url || ev.link_url,
            last_seen_at: nowIso(),
            content_hash: null,

            event_dates_raw: ev.event_dates_raw || null,
            grades_raw: null,
            register_by_raw: null,
            price_raw: null,
            price_min: null,
            price_max: null,
            sections_json: null
          });
          wrote += 1;
        } catch (e) {
          writeErrors += 1;
          appendLog(setLogCamps, `[Camps] ERROR writing CampDemo: ${safeString((e && e.message) || e)}`);
        }
      }

      appendLog(setLogCamps, `[Camps] CampDemo writes complete. wrote=${wrote} errors=${writeErrors}`);
    } catch (e) {
      appendLog(setLogCamps, `[Camps] ERROR: ${safeString((e && e.message) || e)}`);
    }
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2>Admin Import</h2>

      {/* Top-level sport selector */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Sport</div>
          <select
            value={selectedSportId}
            onChange={(e) => setSelectedSportId(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          >
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sport_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Dry Run</div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            <span>{dryRun ? "On" : "Off"}</span>
          </label>
        </div>
      </div>

      {/* Section 1: Seed schools */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>[SportsUSA] Seed Schools</h3>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Limit</div>
            <input
              type="number"
              value={seedLimit}
              onChange={(e) => setSeedLimit(Number(e.target.value))}
              style={{ padding: 8, width: 120 }}
            />
          </div>

          <button onClick={runSportsUSASeed} style={{ padding: "10px 14px" }}>
            Run Seed
          </button>
        </div>

        <pre style={{ marginTop: 12, background: "#111", color: "#0f0", padding: 12, borderRadius: 8, overflow: "auto" }}>
          {logSportsUSA}
        </pre>
      </div>

      {/* Section 2: Ingest camps */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>[Camps] Ingest Camps → CampDemo</h3>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Max Sites</div>
            <input type="number" value={maxSites} onChange={(e) => setMaxSites(Number(e.target.value))} style={{ padding: 8, width: 120 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Max Reg Links / Site</div>
            <input type="number" value={maxRegsPerSite} onChange={(e) => setMaxRegsPerSite(Number(e.target.value))} style={{ padding: 8, width: 160 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Max Events</div>
            <input type="number" value={maxEvents} onChange={(e) => setMaxEvents(Number(e.target.value))} style={{ padding: 8, width: 120 }} />
          </div>

          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Test Site URL (optional)</div>
            <input
              value={testSiteUrl}
              onChange={(e) => setTestSiteUrl(e.target.value)}
              placeholder="https://www.hardingfootballcamps.com/"
              style={{ padding: 8, width: "100%" }}
            />
          </div>

          <button onClick={runCampsIngest} style={{ padding: "10px 14px" }}>
            Run Camps Ingest
          </button>
        </div>

        <pre style={{ marginTop: 12, background: "#111", color: "#0f0", padding: 12, borderRadius: 8, overflow: "auto" }}>
          {logCamps}
        </pre>
      </div>
    </div>
  );
}

export default AdminImport;
