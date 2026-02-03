// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";

// ✅ FIX: Your repo has /src/api (not /src/lib). This avoids: Failed to resolve import "../lib/db"
import { db, callFunction } from "../api";

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

function defaultSportsUSADirectoryForSport(sportName) {
  const s = lc(sportName);

  // Keep this list tight and explicit (fail-closed).
  if (s === "football") return "https://www.footballcampsusa.com/";
  if (s === "baseball") return "https://www.baseballcampsusa.com/";
  if (s === "softball") return "https://www.softballcampsusa.com/";
  if (s === "soccer") return "https://www.soccersportsusa.com/";
  if (s === "volleyball") return "https://www.volleyballcampsusa.com/";

  return "";
}

function AdminImport() {
  // -------------------------
  // Sport selection (top-level)
  // -------------------------
  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState("");

  const selectedSport = useMemo(() => {
    for (let i = 0; i < sports.length; i++) {
      if (sports[i] && sports[i].id === selectedSportId) return sports[i];
    }
    return null;
  }, [sports, selectedSportId]);

  // -------------------------
  // Logs (per section)
  // -------------------------
  const [logSportsUSA, setLogSportsUSA] = useState("");
  const [logCamps, setLogCamps] = useState("");
  const [logPositions, setLogPositions] = useState("");
  const [logPromote, setLogPromote] = useState("");

  function appendLog(setter, line) {
    setter((prev) => (prev ? prev + "\n" : "") + line);
  }

  function clearAllLogs() {
    setLogSportsUSA("");
    setLogCamps("");
    setLogPositions("");
    setLogPromote("");
  }

  // -------------------------
  // Global controls
  // -------------------------
  const [dryRun, setDryRun] = useState(true);

  // -------------------------
  // SportsUSA Seed controls
  // -------------------------
  const [seedLimit, setSeedLimit] = useState(300);

  // ✅ NEW: SportsUSA directory URL input (replaces the empty-table problem)
  const [sportsUSADirectoryUrl, setSportsUSADirectoryUrl] = useState("");

  // -------------------------
  // Camps ingest controls
  // -------------------------
  const [maxSites, setMaxSites] = useState(5);
  const [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  const [maxEvents, setMaxEvents] = useState(25);

  // ✅ Supports your Harding test scenario
  const [testSiteUrl, setTestSiteUrl] = useState("");

  // -------------------------
  // Positions controls
  // -------------------------
  const [positionCode, setPositionCode] = useState("");
  const [positionName, setPositionName] = useState("");

  // -------------------------
  // Load Sports
  // -------------------------
  useEffect(() => {
    let mounted = true;

    async function loadSports() {
      try {
        const rows = await db.table("Sport").select("*").order("sport_name");
        if (!mounted) return;

        const list = rows || [];
        setSports(list);

        if (list.length && !selectedSportId) {
          setSelectedSportId(list[0].id);
        }
      } catch (e) {
        // If Sport load fails, dropdown will be empty.
      }
    }

    loadSports();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line
  }, []);

  // -------------------------
  // When sport changes, auto-fill SportsUSA directory URL (editable)
  // -------------------------
  useEffect(() => {
    if (!selectedSport) return;

    const suggested = defaultSportsUSADirectoryForSport(selectedSport.sport_name);
    // Only auto-fill when empty (do not overwrite user edits)
    if (!sportsUSADirectoryUrl) {
      setSportsUSADirectoryUrl(suggested);
    }
    // eslint-disable-next-line
  }, [selectedSportId]);

  // -------------------------
  // Action: SportsUSA Seed Schools (writes School + SchoolSportSite)
  // -------------------------
  async function runSportsUSASeed() {
    setLogSportsUSA("");

    if (!selectedSportId || !selectedSport) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: Select a sport first.`);
      return;
    }

    const sportName = safeString(selectedSport.sport_name).trim();
    const siteUrl = safeString(sportsUSADirectoryUrl).trim();

    appendLog(setLogSportsUSA, `[SportsUSA] Starting: SportsUSA School Seed (${sportName}) @ ${nowIso()}`);
    appendLog(setLogSportsUSA, `[SportsUSA] DryRun=${dryRun} | Limit=${seedLimit}`);

    if (!siteUrl) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: SportsUSA directory URL is blank.`);
      appendLog(setLogSportsUSA, `[SportsUSA] Fix: paste e.g. https://www.footballcampsusa.com/ for Football.`);
      return;
    }

    try {
      // Requires server function: /functions/sportsUSASeedSchools.js
      const payload = {
        sportId: selectedSportId,
        sportName: sportName,
        siteUrl: siteUrl,
        limit: Number(seedLimit || 300),
        dryRun: !!dryRun,
      };

      const resp = await callFunction("sportsUSASeedSchools", payload);

      if (!resp || !resp.stats) {
        appendLog(setLogSportsUSA, `[SportsUSA] ERROR: No response or missing stats.`);
        appendLog(setLogSportsUSA, JSON.stringify(resp || {}, null, 2));
        return;
      }

      appendLog(setLogSportsUSA, `[SportsUSA] SportsUSA fetched: schools_found=${resp.stats.schools_found} | http=${resp.stats.http}`);

      // Sample
      const sample = (resp.debug && resp.debug.sample) ? resp.debug.sample : [];
      if (sample && sample.length) {
        appendLog(setLogSportsUSA, `[SportsUSA] SportsUSA sample (first ${Math.min(sample.length, 3)}):`);
        for (let i = 0; i < Math.min(sample.length, 3); i++) {
          const s = sample[i] || {};
          appendLog(setLogSportsUSA, `- name="${safeString(s.school_name)}" | logo="${safeString(s.logo_url)}" | view="${safeString(s.view_site_url)}"`);
        }
      }

      // If dryRun, stop here
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
        const row = schools[i] || {};
        const schoolName = safeString(row.school_name).trim();
        const logoUrl = row.logo_url ? safeString(row.logo_url).trim() : null;
        const campSiteUrl = row.view_site_url ? safeString(row.view_site_url).trim() : null;

        if (!schoolName || !campSiteUrl) {
          skipped += 1;
          continue;
        }

        try {
          // 1) Upsert School (match by school_name for now)
          const existing = await db.table("School")
            .select("*")
            .eq("school_name", schoolName)
            .maybeSingle();

          let schoolId = "";

          if (!existing) {
            const created = await db.table("School")
              .insert({
                school_name: schoolName,
                logo_url: logoUrl,
                active: true,
                school_type: "College/University",
                source_platform: "sportsusa",
                source_school_url: campSiteUrl,
                source_key: row.source_key || null,
                needs_review: false,
                last_seen_at: nowIso(),
              })
              .single();

            schoolId = created && created.id ? created.id : "";
            schoolsCreated += 1;
          } else {
            schoolId = existing.id;

            await db.table("School")
              .update({
                // Keep existing logo if new is missing
                logo_url: logoUrl || existing.logo_url || null,
                // Preserve existing values if already set
                source_platform: existing.source_platform || "sportsusa",
                source_school_url: existing.source_school_url || campSiteUrl,
                last_seen_at: nowIso(),
              })
              .eq("id", schoolId);

            schoolsUpdated += 1;
          }

          if (!schoolId) {
            errors += 1;
            appendLog(setLogSportsUSA, `[SportsUSA] ERROR: No schoolId after upsert for "${schoolName}"`);
            continue;
          }

          // 2) Upsert SchoolSportSite by (school_id + sport_id)
          const existingSite = await db.table("SchoolSportSite")
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
            await db.table("SchoolSportSite")
              .update({
                camp_site_url: campSiteUrl,
                logo_url: logoUrl || existingSite.logo_url || null,
                source_platform: existingSite.source_platform || "sportsusa",
                source_key: existingSite.source_key || sourceKey,
                active: true,
                last_seen_at: nowIso(),
              })
              .eq("id", existingSite.id);

            sitesUpdated += 1;
          }

          // Progress log every 10
          if ((i + 1) % 10 === 0) {
            appendLog(
              setLogSportsUSA,
              `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`
            );
          }
        } catch (e) {
          errors += 1;
          appendLog(setLogSportsUSA, `[SportsUSA] ERROR row ${i + 1}: ${safeString((e && e.message) || e)}`);
        }
      }

      appendLog(
        setLogSportsUSA,
        `[SportsUSA] Writes done. Schools: created=${schoolsCreated} updated=${schoolsUpdated} | Sites: created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`
      );
    } catch (e) {
      appendLog(setLogSportsUSA, `[SportsUSA] ERROR: ${safeString((e && e.message) || e)}`);
      appendLog(setLogSportsUSA, `[SportsUSA] NOTE: Ensure you have a deployed backend function named "sportsUSASeedSchools".`);
    }
  }

  // -------------------------
  // Action: Camps ingest (SportsUSA -> site -> reg links -> CampDemo)
  // -------------------------
  async function runCampsIngest() {
    setLogCamps("");

    if (!selectedSportId || !selectedSport) {
      appendLog(setLogCamps, `[Camps] ERROR: Select a sport first.`);
      return;
    }

    const sportName = safeString(selectedSport.sport_name).trim();

    appendLog(setLogCamps, `[Camps] Starting: SportsUSA Camps Ingest (${sportName}) @ ${nowIso()}`);
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
        const u = sites[i] && sites[i].camp_site_url ? safeString(sites[i].camp_site_url).trim() : "";
        if (u) urls.push(u);
      }

      const trimmedTestUrl = safeString(testSiteUrl).trim();

      const payload = {
        sportId: selectedSportId,
        sportName: sportName,
        dryRun: !!dryRun,
        maxSites: Number(maxSites || 5),
        maxRegsPerSite: Number(maxRegsPerSite || 10),
        maxEvents: Number(maxEvents || 25),

        // If user provides a test URL, function should crawl only that site
        testSiteUrl: trimmedTestUrl ? trimmedTestUrl : null,

        // Otherwise pass the list (function will choose up to maxSites)
        siteUrls: trimmedTestUrl ? null : urls,
      };

      const resp = await callFunction("sportsUSAIngestCamps", payload);

      // Version (top-level)
      const fnVersion = resp && resp.version ? resp.version : "MISSING";
      appendLog(setLogCamps, `[Camps] Function version: ${fnVersion}`);

      // Stats
      if (resp && resp.stats) {
        appendLog(
          setLogCamps,
          `[Camps] Function stats: processedSites=${resp.stats.processedSites} processedRegs=${resp.stats.processedRegs} accepted=${resp.stats.accepted} rejected=${resp.stats.rejected} errors=${resp.stats.errors}`
        );
      } else {
        appendLog(setLogCamps, `[Camps] ERROR: Missing resp.stats`);
      }

      // Errors
      if (resp && resp.errors && resp.errors.length) {
        appendLog(setLogCamps, `[Camps] Function errors (first ${Math.min(resp.errors.length, 5)}):`);
        for (let i = 0; i < Math.min(resp.errors.length, 5); i++) {
          appendLog(setLogCamps, `- ${JSON.stringify(resp.errors[i])}`);
        }
      }

      // Site debug (first 1)
      if (resp && resp.debug && resp.debug.siteDebug && resp.debug.siteDebug.length) {
        const s0 = resp.debug.siteDebug[0] || {};
        appendLog(setLogCamps, `[Camps] Site debug (first 1):`);
        appendLog(
          setLogCamps,
          `- url=${safeString(s0.siteUrl)} http=${safeString(s0.http)} html=${safeString(s0.htmlType)} regLinks=${safeString(s0.regLinks)} sample=${safeString(s0.sample)} notes=${safeString(s0.notes)}`
        );
      }

      // HTML snippet (when diagnosing)
      if (resp && resp.debug && resp.debug.firstSiteHtmlSnippet) {
        appendLog(setLogCamps, `[Camps] First site HTML snippet (debug):`);
        appendLog(setLogCamps, safeString(resp.debug.firstSiteHtmlSnippet));
      }

      // Accepted sample
      if (resp && resp.accepted && resp.accepted.length) {
        appendLog(setLogCamps, `[Camps] Accepted events returned: ${resp.accepted.length}`);
        appendLog(setLogCamps, `[Camps] Sample (first 5):`);
        for (let i = 0; i < Math.min(resp.accepted.length, 5); i++) {
          const a = resp.accepted[i] || {};
          const ev = a.event || {};
          appendLog(
            setLogCamps,
            `- camp="${safeString(ev.camp_name)}" start=${safeString(ev.start_date) || "n/a"} end=${safeString(ev.end_date) || "n/a"} url=${safeString(ev.link_url)}`
          );
        }
      } else {
        // If nothing accepted, print rejects if provided
        if (resp && resp.rejected_samples && resp.rejected_samples.length) {
          appendLog(setLogCamps, `[Camps] No accepted events returned from function.`);
          appendLog(setLogCamps, `[Camps] Rejected samples (first ${Math.min(resp.rejected_samples.length, 10)}):`);
          for (let i = 0; i < Math.min(resp.rejected_samples.length, 10); i++) {
            const rj = resp.rejected_samples[i] || {};
            appendLog(
              setLogCamps,
              `- reason=${safeString(rj.reason)} title="${safeString(rj.title)}" url=${safeString(rj.registrationUrl)} datesLine="${safeString(rj.event_dates_line)}"`
            );
          }
        } else {
          appendLog(setLogCamps, `[Camps] No accepted events returned from function.`);
        }
      }

      if (dryRun) {
        appendLog(setLogCamps, `[Camps] DryRun=true: no CampDemo writes performed.`);
      }
    } catch (e) {
      appendLog(setLogCamps, `[Camps] ERROR: ${safeString((e && e.message) || e)}`);
      appendLog(setLogCamps, `[Camps] NOTE: Ensure you have a deployed backend function named "sportsUSAIngestCamps".`);
    }
  }

  // -------------------------
  // Positions: Auto-seed + Manual upsert
  // -------------------------
  async function autoSeedPositions() {
    setLogPositions("");
    appendLog(setLogPositions, `[Positions] Starting: auto-seed @ ${nowIso()}`);

    try {
      // If you already have a backend function for this, call it here instead.
      // For now: do nothing destructive, just log.
      appendLog(setLogPositions, `[Positions] NOTE: Hook this to your existing position seeding logic if you have one.`);
      appendLog(setLogPositions, `[Positions] Done.`);
    } catch (e) {
      appendLog(setLogPositions, `[Positions] ERROR: ${safeString((e && e.message) || e)}`);
    }
  }

  async function upsertPosition() {
    setLogPositions("");
    const code = safeString(positionCode).trim();
    const name = safeString(positionName).trim();

    if (!code || !name) {
      appendLog(setLogPositions, `[Positions] ERROR: Provide both code + name.`);
      return;
    }

    appendLog(setLogPositions, `[Positions] Upsert: ${code} / ${name} @ ${nowIso()}`);

    try {
      const existing = await db.table("Position").select("*").eq("code", code).maybeSingle();

      if (!existing) {
        await db.table("Position").insert({ code: code, name: name });
        appendLog(setLogPositions, `[Positions] Created: ${code}`);
      } else {
        await db.table("Position").update({ name: name }).eq("id", existing.id);
        appendLog(setLogPositions, `[Positions] Updated: ${code}`);
      }
    } catch (e) {
      appendLog(setLogPositions, `[Positions] ERROR: ${safeString((e && e.message) || e)}`);
    }
  }

  // -------------------------
  // Promote CampDemo -> Camp
  // -------------------------
  async function runPromote() {
    setLogPromote("");
    appendLog(setLogPromote, `[Promote] Starting: CampDemo -> Camp @ ${nowIso()}`);

    try {
      // If you already have a promote backend function, call it here:
      // const resp = await callFunction("promoteCampDemo", { dryRun: !!dryRun, sportId: selectedSportId });
      // appendLog(setLogPromote, JSON.stringify(resp, null, 2));

      appendLog(setLogPromote, `[Promote] NOTE: Wire this section to your existing promote logic (function or client-side upsert).`);
      appendLog(setLogPromote, `[Promote] Done.`);
    } catch (e) {
      appendLog(setLogPromote, `[Promote] ERROR: ${safeString((e && e.message) || e)}`);
    }
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Admin Import</h2>
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            Admin tools for seeding schools + sites, ingesting camps, and promotion.
          </div>
        </div>
        <button onClick={clearAllLogs} style={{ padding: "8px 12px" }}>
          Clear Logs
        </button>
      </div>

      {/* Selected Sport */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Selected Sport (drives all tools)</div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Sport</div>
            <select
              value={selectedSportId}
              onChange={(e) => setSelectedSportId(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              {(sports || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sport_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            <span>Dry Run</span>
          </div>
        </div>
      </div>

      {/* Seed Schools */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Seed Schools from SportsUSA directory</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
          Pulls the directory listing (e.g., footballcampsusa) and writes <b>School</b> + <b>SchoolSportSite</b>.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>SportsUSA directory URL (editable)</div>
            <input
              value={sportsUSADirectoryUrl}
              onChange={(e) => setSportsUSADirectoryUrl(e.target.value)}
              placeholder="https://www.footballcampsusa.com/"
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Write limit</div>
            <input
              value={seedLimit}
              onChange={(e) => setSeedLimit(e.target.value)}
              type="number"
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={runSportsUSASeed} style={{ width: "100%", padding: "10px 12px" }}>
              Run Seed ({dryRun ? "Dry Run" : "Write"})
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Log</div>
          <textarea value={logSportsUSA} readOnly rows={10} style={{ width: "100%", padding: 10 }} />
        </div>
      </div>

      {/* Camps ingest */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Camps ingest (SchoolSportSite → CampDemo)</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
          Crawls each school’s <b>camp_site_url</b>, discovers registration links, and stages results in <b>CampDemo</b>.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 160px", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Test Site URL (optional)</div>
            <input
              value={testSiteUrl}
              onChange={(e) => setTestSiteUrl(e.target.value)}
              placeholder="https://www.hardingfootballcamps.com/"
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Max sites</div>
            <input value={maxSites} onChange={(e) => setMaxSites(e.target.value)} type="number" style={{ width: "100%", padding: 8 }} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Max regs/site</div>
            <input
              value={maxRegsPerSite}
              onChange={(e) => setMaxRegsPerSite(e.target.value)}
              type="number"
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Max events</div>
            <input value={maxEvents} onChange={(e) => setMaxEvents(e.target.value)} type="number" style={{ width: "100%", padding: 8 }} />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <button onClick={runCampsIngest} style={{ padding: "10px 12px" }}>
            Run Camps Ingest ({dryRun ? "Dry Run" : "Write"})
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Log</div>
          <textarea value={logCamps} readOnly rows={10} style={{ width: "100%", padding: 10 }} />
        </div>
      </div>

      {/* Positions */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Manage Positions</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={autoSeedPositions} style={{ padding: "10px 12px" }}>
            Auto-seed positions
          </button>

          <button
            onClick={() => setLogPositions("")}
            style={{ padding: "10px 12px" }}
          >
            Clear log
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "140px 1fr 160px", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Code</div>
            <input value={positionCode} onChange={(e) => setPositionCode(e.target.value)} placeholder="QB" style={{ width: "100%", padding: 8 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Name</div>
            <input value={positionName} onChange={(e) => setPositionName(e.target.value)} placeholder="Quarterback" style={{ width: "100%", padding: 8 }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={upsertPosition} style={{ width: "100%", padding: "10px 12px" }}>
              Add / Upsert
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Log</div>
          <textarea value={logPositions} readOnly rows={8} style={{ width: "100%", padding: 10 }} />
        </div>
      </div>

      {/* Promote */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Promote CampDemo → Camp</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
          This should upsert stable events into <b>Camp</b> using your program_id/event_key rules.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={runPromote} style={{ padding: "10px 12px" }}>
            Run Promote
          </button>
          <button onClick={() => setLogPromote("")} style={{ padding: "10px 12px" }}>
            Clear log
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Log</div>
          <textarea value={logPromote} readOnly rows={8} style={{ width: "100%", padding: 10 }} />
        </div>
      </div>
    </div>
  );
}

export default AdminImport;
