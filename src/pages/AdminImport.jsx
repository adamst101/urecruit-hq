// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * ADMINIMPORT (Resolved build error version)
 *
 * Why this fixes "Failed to resolve import ../lib/db":
 * - We do NOT import db/callFunction from local files.
 * - We resolve them from Base44 globals at runtime:
 *    window.db
 *    window.callFunction
 *    window.base44?.db / window.base44?.callFunction
 *
 * If your Base44 project uses different globals, adjust resolveDb/resolveCallFunction below.
 */

function nowIso() {
  return new Date().toISOString();
}

function safeString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function lc(x) {
  return safeString(x).toLowerCase().trim();
}

function resolveDb() {
  // Try common Base44 global shapes
  if (typeof window !== "undefined") {
    if (window.db) return window.db;
    if (window.base44 && window.base44.db) return window.base44.db;
  }
  return null;
}

function resolveCallFunction() {
  if (typeof window !== "undefined") {
    if (window.callFunction) return window.callFunction;
    if (window.base44 && window.base44.callFunction) return window.base44.callFunction;
  }
  return null;
}

function sportToSportsUSASite(sportName) {
  // Central mapping (single source of truth)
  const s = lc(sportName);
  if (s === "football") return "https://www.footballcampsusa.com/";
  if (s === "baseball") return "https://www.baseballcampsusa.com/";
  if (s === "softball") return "https://www.softballcampsusa.com/";
  if (s === "soccer") return "https://www.soccersportsusa.com/";
  if (s === "volleyball") return "https://www.volleyballcampsusa.com/";
  // Extend as you add sports
  return "";
}

function AdminImport() {
  // Resolve Base44 runtime services
  const db = useMemo(() => resolveDb(), []);
  const callFunction = useMemo(() => resolveCallFunction(), []);

  // -------------------------
  // Top-level sport selection
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
  // Controls (shared)
  // -------------------------
  const [dryRun, setDryRun] = useState(true);

  // SportsUSA seed controls
  const [seedLimit, setSeedLimit] = useState(300);

  // Camps ingest controls
  const [maxSites, setMaxSites] = useState(5);
  const [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  const [maxEvents, setMaxEvents] = useState(25);

  // Optional test URL (lets you ingest Harding even if not in SchoolSportSite yet)
  const [testSiteUrl, setTestSiteUrl] = useState("");

  // -------------------------
  // Logging (section-specific)
  // -------------------------
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");

  function appendLog(setter, line) {
    setter((prev) => prev + line + "\n");
  }

  function guardBase44OrLog(setter, sectionTag) {
    if (!db) {
      appendLog(
        setter,
        `${sectionTag} ERROR: Base44 db not found on window. Fix resolveDb() to match your project globals.`
      );
      return false;
    }
    if (!callFunction) {
      appendLog(
        setter,
        `${sectionTag} ERROR: Base44 callFunction not found on window. Fix resolveCallFunction() to match your project globals.`
      );
      return false;
    }
    return true;
  }

  function guardSportSelectedOrLog(setter, sectionTag) {
    if (!selectedSportId || !selectedSport) {
      appendLog(setter, `${sectionTag} ERROR: Select a sport at the top first.`);
      return false;
    }
    return true;
  }

  // -------------------------
  // Load Sports (once)
  // -------------------------
  useEffect(() => {
    let mounted = true;

    async function loadSports() {
      if (!db) return;

      try {
        // Base44 db style varies. Common patterns:
        // db.table("Sport").select("*").order("sport_name")
        // If your db uses a different API, you’ll see it in the error log below.
        const rows = await db.table("Sport").select("*").order("sport_name");
        if (!mounted) return;

        const list = rows || [];
        setSports(list);

        if (list.length && !selectedSportId) {
          setSelectedSportId(list[0].id);
        }
      } catch (e) {
        // If the db API shape differs, surface it in Camps log (so it’s visible)
        if (mounted) {
          setLogCamps("");
          appendLog(setLogCamps, `[Init] ERROR loading Sports from db.table("Sport"): ${safeString(e && e.message ? e.message : e)}`);
          appendLog(setLogCamps, `[Init] Tip: search your codebase for "db.table(" usage and align the API call shape here.`);
        }
      }
    }

    loadSports();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line
  }, [db]);

  // ============================================================
  // SECTION 1: SportsUSA seed (School + SchoolSportSite)
  // ============================================================
  async function runSportsUSASeed() {
    setLogSportsUSA("");

    if (!guardBase44OrLog(setLogSportsUSA, "[SportsUSA]")) return;
    if (!guardSportSelectedOrLog(setLogSportsUSA, "[SportsUSA]")) return;

    const sportName = safeString(selectedSport.sport_name);
    const siteUrl = sportToSportsUSASite(sportName);

    appendLog(setLogSportsUSA, `[SportsUSA] Starting: SportsUSA School Seed (${sportName}) @ ${nowIso()}`);
    appendLog(setLogSportsUSA, `[SportsUSA] DryRun=${dryRun} | Limit=${seedLimit}`);
    appendLog(setLogSportsUSA, `[SportsUSA] Resolved siteUrl=${siteUrl || "(missing mapping)"}`);

    if (!siteUrl) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: No SportsUSA site mapping for sport="${sportName}".`);
      appendLog(setLogSportsUSA, `[SportsUSA] Fix: add mapping in sportToSportsUSASite().`);
      return;
    }

    // 1) Call function: sportsUSASeedSchools
    let resp;
    try {
      resp = await callFunction("sportsUSASeedSchools", {
        sportId: selectedSportId,
        sportName: sportName,
        siteUrl: siteUrl,
        limit: Number(seedLimit || 300),
        dryRun: !!dryRun,
      });
    } catch (e) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR calling function sportsUSASeedSchools: ${safeString(e && e.message ? e.message : e)}`);
      appendLog(setLogSportsUSA, `[SportsUSA] NOTE: Confirm /functions/sportsUSASeedSchools.js exists and function name matches exactly.`);
      return;
    }

    // 2) Log function stats
    const stats = resp && resp.stats ? resp.stats : null;
    if (!stats) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: Missing resp.stats. Raw response:`);
      appendLog(setLogSportsUSA, JSON.stringify(resp || {}, null, 2));
      return;
    }

    appendLog(setLogSportsUSA, `[SportsUSA] SportsUSA fetched: schools_found=${stats.schools_found} | http=${stats.http}`);

    // Sample from debug
    const sample = resp && resp.debug && resp.debug.sample ? resp.debug.sample : [];
    if (sample && sample.length) {
      appendLog(setLogSportsUSA, `[SportsUSA] SportsUSA sample (first ${Math.min(sample.length, 3)}):`);
      for (let i = 0; i < Math.min(sample.length, 3); i++) {
        const s = sample[i];
        appendLog(setLogSportsUSA, `- name="${safeString(s.school_name)}" | logo="${safeString(s.logo_url)}" | view="${safeString(s.view_site_url)}"`);
      }
    }

    // If dryRun, stop here
    if (dryRun) {
      appendLog(setLogSportsUSA, `[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.`);
      return;
    }

    // 3) Upsert into School + SchoolSportSite
    const schools = resp && resp.schools ? resp.schools : [];
    appendLog(setLogSportsUSA, `[SportsUSA] Writing ${schools.length} rows to School + SchoolSportSite…`);

    let schoolsCreated = 0;
    let schoolsUpdated = 0;
    let sitesCreated = 0;
    let sitesUpdated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < schools.length; i++) {
      const row = schools[i] || {};
      const schoolName = safeString(row.school_name).trim();
      const logoUrl = row.logo_url || null;
      const campSiteUrl = row.view_site_url || null;

      if (!schoolName || !campSiteUrl) {
        skipped += 1;
        continue;
      }

      try {
        // ---- School: upsert by school_name (good enough for SportsUSA seed phase)
        const existingSchool = await db.table("School").select("*").eq("school_name", schoolName).maybeSingle();

        let schoolId = "";
        if (!existingSchool) {
          const created = await db.table("School").insert({
            school_name: schoolName,
            logo_url: logoUrl,
            active: true,
            school_type: "College/University",
            source_platform: "sportsusa",
            source_school_url: campSiteUrl,
            source_key: row.source_key || null,
            needs_review: false,
            last_seen_at: nowIso(),
          }).single();

          schoolId = created && created.id ? created.id : "";
          schoolsCreated += 1;
        } else {
          schoolId = existingSchool.id;
          await db.table("School").update({
            logo_url: logoUrl || existingSchool.logo_url || null,
            last_seen_at: nowIso(),
          }).eq("id", schoolId);

          schoolsUpdated += 1;
        }

        if (!schoolId) {
          errors += 1;
          appendLog(setLogSportsUSA, `[SportsUSA] ERROR: could not resolve school_id for "${schoolName}"`);
          continue;
        }

        // ---- SchoolSportSite: upsert by (school_id + sport_id)
        const existingSite = await db
          .table("SchoolSportSite")
          .select("*")
          .eq("school_id", schoolId)
          .eq("sport_id", selectedSportId)
          .maybeSingle();

        const sourceKey =
          row.source_key ||
          ("sportsusa:" + lc(sportName) + ":" + lc(campSiteUrl));

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
            last_seen_at: nowIso(),
          });

          sitesCreated += 1;
        } else {
          await db.table("SchoolSportSite").update({
            camp_site_url: campSiteUrl,
            logo_url: logoUrl || existingSite.logo_url || null,
            active: true,
            last_seen_at: nowIso(),
          }).eq("id", existingSite.id);

          sitesUpdated += 1;
        }

        if ((i + 1) % 10 === 0) {
          appendLog(
            setLogSportsUSA,
            `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`
          );
        }
      } catch (e) {
        errors += 1;
        appendLog(setLogSportsUSA, `[SportsUSA] ERROR row ${i + 1}: ${safeString(e && e.message ? e.message : e)}`);
      }
    }

    appendLog(
      setLogSportsUSA,
      `[SportsUSA] Writes done. Schools: created=${schoolsCreated} updated=${schoolsUpdated} | Sites: created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`
    );
  }

  // ============================================================
  // SECTION 2: Camps ingest (SchoolSportSite -> CampDemo)
  // ============================================================
  async function runCampsIngest() {
    setLogCamps("");

    if (!guardBase44OrLog(setLogCamps, "[Camps]")) return;
    if (!guardSportSelectedOrLog(setLogCamps, "[Camps]")) return;

    const sportName = safeString(selectedSport.sport_name);

    appendLog(setLogCamps, `[Camps] Starting: SportsUSA Camps Ingest (${sportName}) @ ${nowIso()}`);
    appendLog(setLogCamps, `[Camps] DryRun=${dryRun} | MaxSites=${maxSites} | MaxRegsPerSite=${maxRegsPerSite} | MaxEvents=${maxEvents}`);

    // 1) Load SchoolSportSite rows for this sport (unless user uses Test Site URL)
    let siteRows = [];
    try {
      siteRows = await db
        .table("SchoolSportSite")
        .select("*")
        .eq("sport_id", selectedSportId)
        .eq("active", true);

      appendLog(setLogCamps, `[Camps] Loaded SchoolSportSite rows: ${(siteRows || []).length} (active)`);
    } catch (e) {
      appendLog(setLogCamps, `[Camps] ERROR reading SchoolSportSite: ${safeString(e && e.message ? e.message : e)}`);
      return;
    }

    const trimmedTestUrl = safeString(testSiteUrl).trim();

    const payload = {
      sportId: selectedSportId,
      sportName: sportName,
      dryRun: !!dryRun,
      maxSites: Number(maxSites || 5),
      maxRegsPerSite: Number(maxRegsPerSite || 10),
      maxEvents: Number(maxEvents || 25),

      // If user gives a test URL, function should use it exclusively
      testSiteUrl: trimmedTestUrl ? trimmedTestUrl : null,

      // Otherwise pass site URLs from SchoolSportSite
      siteUrls: trimmedTestUrl
        ? null
        : (siteRows || [])
            .map((r) => (r ? r.camp_site_url : null))
            .filter((u) => !!u),
    };

    // 2) Call sportsUSAIngestCamps
    let resp;
    try {
      resp = await callFunction("sportsUSAIngestCamps", payload);
    } catch (e) {
      appendLog(setLogCamps, `[Camps] ERROR calling function sportsUSAIngestCamps: ${safeString(e && e.message ? e.message : e)}`);
      appendLog(setLogCamps, `[Camps] NOTE: Confirm /functions/sportsUSAIngestCamps.js exists and function name matches exactly.`);
      return;
    }

    // 3) Log function version + stats reliably
    const fnVersion = (resp && (resp.version || (resp.debug && resp.debug.version))) || "MISSING";
    appendLog(setLogCamps, `[Camps] Function version: ${fnVersion}`);

    const stats = resp && resp.stats ? resp.stats : null;
    if (!stats) {
      appendLog(setLogCamps, `[Camps] ERROR: Missing resp.stats. Raw response:`);
      appendLog(setLogCamps, JSON.stringify(resp || {}, null, 2));
      return;
    }

    appendLog(
      setLogCamps,
      `[Camps] Function stats: processedSites=${stats.processedSites} processedRegs=${stats.processedRegs} accepted=${stats.accepted} rejected=${stats.rejected} errors=${stats.errors}`
    );

    // Function errors (first 5)
    if (resp && resp.errors && resp.errors.length) {
      appendLog(setLogCamps, `[Camps] Function errors (first ${Math.min(resp.errors.length, 5)}):`);
      for (let i = 0; i < Math.min(resp.errors.length, 5); i++) {
        appendLog(setLogCamps, `- ${JSON.stringify(resp.errors[i])}`);
      }
    }

    // Site debug (first 1)
    if (resp && resp.debug && resp.debug.siteDebug && resp.debug.siteDebug.length) {
      const s0 = resp.debug.siteDebug[0];
      appendLog(setLogCamps, `[Camps] Site debug (first 1):`);
      appendLog(
        setLogCamps,
        `- url=${safeString(s0.siteUrl)} http=${safeString(s0.http)} htmlType=${safeString(s0.htmlType)} regLinks=${safeString(s0.regLinks)} sample=${safeString(s0.sample)} notes=${safeString(s0.notes)}`
      );
    }

    // HTML snippet (when helpful)
    if (resp && resp.debug && resp.debug.firstSiteHtmlSnippet) {
      appendLog(setLogCamps, `[Camps] First site HTML snippet (debug):`);
      appendLog(setLogCamps, safeString(resp.debug.firstSiteHtmlSnippet));
    }

    // Accepted sample
    const accepted = resp && resp.accepted ? resp.accepted : [];
    if (accepted && accepted.length) {
      appendLog(setLogCamps, `[Camps] Accepted events returned: ${accepted.length}`);
      appendLog(setLogCamps, `[Camps] Sample (first 5):`);
      for (let i = 0; i < Math.min(accepted.length, 5); i++) {
        const a = accepted[i] || {};
        const ev = a.event || a || {};
        appendLog(
          setLogCamps,
          `- camp="${safeString(ev.camp_name || ev.eventTitle || ev.campName)}" start=${safeString(ev.start_date || ev.startDate || "n/a")} url=${safeString(ev.link_url || ev.registrationUrl || "")}`
        );
      }
    } else {
      // If no accepted, show rejects if present
      const rj = resp && resp.rejected_samples ? resp.rejected_samples : [];
      if (rj && rj.length) {
        appendLog(setLogCamps, `[Camps] Rejected samples (first ${Math.min(rj.length, 10)}):`);
        for (let i = 0; i < Math.min(rj.length, 10); i++) {
          const x = rj[i] || {};
          appendLog(
            setLogCamps,
            `- reason=${safeString(x.reason)} title="${safeString(x.title)}" url=${safeString(x.registrationUrl || x.url)}`
          );
        }
      } else {
        appendLog(setLogCamps, `[Camps] No accepted events returned from function.`);
      }
    }

    // 4) If dryRun, stop here (function already didn’t write CampDemo)
    if (dryRun) {
      appendLog(setLogCamps, `[Camps] DryRun=true: no CampDemo writes performed.`);
      return;
    }

    // If you later decide AdminImport should write CampDemo (instead of the function),
    // we can implement that here. Right now you’ve been running with the function doing the parsing
    // and AdminImport doing the DB writes in other flows — but your current log indicates
    // function is returning accepted events and you want AdminImport to handle writes.
    //
    // For now: keep this as a pure collector/log viewer unless you tell me “write CampDemo here”.
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h2 style={{ marginTop: 0 }}>Admin Import</h2>

      {/* Top-level: Sport selection controls everything */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Sport</div>
          <select
            value={selectedSportId}
            onChange={(e) => setSelectedSportId(e.target.value)}
            style={{ padding: 8, minWidth: 240 }}
          >
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sport_name}
              </option>
            ))}
          </select>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry Run
        </label>

        {!db || !callFunction ? (
          <div style={{ color: "crimson", fontSize: 12 }}>
            Missing Base44 globals (db/callFunction). This page will load but actions won’t run.
          </div>
        ) : null}
      </div>

      {/* SECTION: SportsUSA Seed */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>1) Seed Schools from SportsUSA</h3>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Limit</div>
            <input
              type="number"
              value={seedLimit}
              onChange={(e) => setSeedLimit(Number(e.target.value))}
              style={{ padding: 8, width: 120 }}
            />
          </div>

          <button onClick={runSportsUSASeed} style={{ padding: "10px 14px" }}>
            Run SportsUSA Seed
          </button>
        </div>

        <textarea
          value={logSportsUSA}
          readOnly
          rows={12}
          style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
        />
      </div>

      {/* SECTION: Camps Ingest */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>2) Ingest Camps from SchoolSportSite</h3>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Max Sites</div>
            <input
              type="number"
              value={maxSites}
              onChange={(e) => setMaxSites(Number(e.target.value))}
              style={{ padding: 8, width: 120 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Max Reg Links / Site</div>
            <input
              type="number"
              value={maxRegsPerSite}
              onChange={(e) => setMaxRegsPerSite(Number(e.target.value))}
              style={{ padding: 8, width: 160 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Max Events</div>
            <input
              type="number"
              value={maxEvents}
              onChange={(e) => setMaxEvents(Number(e.target.value))}
              style={{ padding: 8, width: 120 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Optional Test Site URL (overrides SchoolSportSite selection)</div>
          <input
            type="text"
            value={testSiteUrl}
            onChange={(e) => setTestSiteUrl(e.target.value)}
            placeholder="e.g., https://www.hardingfootballcamps.com/"
            style={{ padding: 8, width: "100%" }}
          />
        </div>

        <button onClick={runCampsIngest} style={{ padding: "10px 14px", marginBottom: 10 }}>
          Run Camps Ingest
        </button>

        <textarea
          value={logCamps}
          readOnly
          rows={14}
          style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
        />
      </div>
    </div>
  );
}

export default AdminImport;
