// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";

// Base44 project structure (per your screenshot):
// src/api/base44Client.js
// src/api/entities.js
import { base44 } from "../api/base44Client";
import { Sport, School, SchoolSportSite, Position, CampDemo, Camp } from "../api/entities";

const VERSION = "AdminImport_2026-02-03_v1_remove_db_table_use_entities";

// -----------------------------
// small helpers (editor-safe)
// -----------------------------
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

function append(setter, line) {
  setter((prev) => (prev ? prev + "\n" : "") + line);
}

// Best-effort function invoker (Base44 versions vary slightly)
async function invokeFn(functionName, payload) {
  // Try a few known shapes without guessing too hard.
  // 1) base44.functions.invoke(name, payload)
  if (base44 && base44.functions && typeof base44.functions.invoke === "function") {
    return await base44.functions.invoke(functionName, payload);
  }
  // 2) base44.invokeFunction(name, payload)
  if (base44 && typeof base44.invokeFunction === "function") {
    return await base44.invokeFunction(functionName, payload);
  }
  // 3) base44.functions.call(name, payload)
  if (base44 && base44.functions && typeof base44.functions.call === "function") {
    return await base44.functions.call(functionName, payload);
  }

  throw new Error(
    'Cannot find a Base44 function invoker. Expected base44.functions.invoke (or invokeFunction / functions.call). Check src/api/base44Client.js exports.'
  );
}

// SportsUSA site mapping by sport name (you can extend anytime)
function sportsUSASiteForSportName(sportName) {
  const s = lc(sportName);
  if (s === "football") return "https://www.footballcampsusa.com/";
  if (s === "baseball") return "https://www.baseballcampsusa.com/";
  if (s === "softball") return "https://www.softballcampsusa.com/";
  if (s === "soccer") return "https://www.soccersportsusa.com/";
  if (s === "volleyball") return "https://www.volleyballcampsusa.com/";
  return "";
}

function buildSourceKey(sportName, campSiteUrl) {
  const host = lc(campSiteUrl).replace(/^https?:\/\//, "").split("/")[0];
  return "sportsusa:" + lc(sportName) + ":" + host;
}

export default function AdminImport() {
  // -------------------------
  // Sport selection (top-level)
  // -------------------------
  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState("");

  const selectedSport = useMemo(() => {
    for (let i = 0; i < sports.length; i++) {
      if (sports[i].id === selectedSportId) return sports[i];
    }
    return null;
  }, [sports, selectedSportId]);

  // -------------------------
  // shared controls
  // -------------------------
  const [dryRun, setDryRun] = useState(true);

  // -------------------------
  // section: SportsUSA seed schools
  // -------------------------
  const [seedLimit, setSeedLimit] = useState(300);
  const [logSeed, setLogSeed] = useState("");

  // -------------------------
  // section: camps ingest
  // -------------------------
  const [maxSites, setMaxSites] = useState(5);
  const [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  const [maxEvents, setMaxEvents] = useState(25);
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [logCamps, setLogCamps] = useState("");

  // -------------------------
  // section: positions
  // -------------------------
  const [logPositions, setLogPositions] = useState("");
  const [posCode, setPosCode] = useState("");
  const [posName, setPosName] = useState("");

  // -------------------------
  // section: promote
  // -------------------------
  const [logPromote, setLogPromote] = useState("");

  // -------------------------
  // load sports once
  // -------------------------
  useEffect(() => {
    let mounted = true;

    async function loadSports() {
      try {
        // Base44 entity list pattern (common)
        // If your entities.js uses a different method, adjust here only.
        const rows = await Sport.list({ orderBy: "sport_name" });
        if (!mounted) return;
        setSports(rows || []);
        if (!selectedSportId && rows && rows.length) {
          setSelectedSportId(rows[0].id);
        }
      } catch (e) {
        // If this fails, your entity API is shaped differently.
        // But this file will still compile; you’ll just see an empty dropdown.
        // The fix would be in src/api/entities.js usage.
      }
    }

    loadSports();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // action: seed schools from SportsUSA
  // -------------------------
  async function runSeedSchools() {
    setLogSeed("");
    if (!selectedSport || !selectedSportId) {
      append(setLogSeed, "[SportsUSA] ERROR: Select a sport first.");
      return;
    }

    append(setLogSeed, `[SportsUSA] AdminImport version: ${VERSION}`);
    append(setLogSeed, `[SportsUSA] Starting: SportsUSA School Seed (${selectedSport.sport_name}) @ ${nowIso()}`);
    append(setLogSeed, `[SportsUSA] DryRun=${dryRun} | Limit=${seedLimit}`);

    const siteUrl = sportsUSASiteForSportName(selectedSport.sport_name);
    if (!siteUrl) {
      append(setLogSeed, `[SportsUSA] ERROR: No SportsUSA site mapping for sport "${selectedSport.sport_name}".`);
      append(setLogSeed, `[SportsUSA] Fix: add mapping in sportsUSASiteForSportName().`);
      return;
    }

    let resp;
    try {
      resp = await invokeFn("sportsUSASeedSchools", {
        sportId: selectedSportId,
        sportName: selectedSport.sport_name,
        siteUrl: siteUrl,
        limit: Number(seedLimit || 300),
        dryRun: true, // function only collects; DB writes happen here
      });
    } catch (e) {
      append(setLogSeed, `[SportsUSA] ERROR invoking function: ${safeString(e && e.message ? e.message : e)}`);
      append(setLogSeed, `[SportsUSA] NOTE: Confirm /functions/sportsUSASeedSchools.js exists and is named exactly.`);
      return;
    }

    const stats = resp && resp.stats ? resp.stats : null;
    if (!stats) {
      append(setLogSeed, "[SportsUSA] ERROR: Missing stats in function response.");
      append(setLogSeed, JSON.stringify(resp || {}, null, 2));
      return;
    }

    append(setLogSeed, `[SportsUSA] SportsUSA fetched: schools_found=${stats.schools_found} | http=${stats.http}`);

    const sample = resp && resp.debug && resp.debug.sample ? resp.debug.sample : [];
    if (sample && sample.length) {
      append(setLogSeed, `[SportsUSA] Sample (first ${Math.min(3, sample.length)}):`);
      for (let i = 0; i < Math.min(3, sample.length); i++) {
        append(
          setLogSeed,
          `- name="${sample[i].school_name}" | logo="${sample[i].logo_url}" | view="${sample[i].view_site_url}"`
        );
      }
    }

    if (dryRun) {
      append(setLogSeed, "[SportsUSA] DryRun=true: no School / SchoolSportSite writes performed.");
      return;
    }

    const schools = resp && resp.schools ? resp.schools : [];
    append(setLogSeed, `[SportsUSA] Writing ${schools.length} rows to School + SchoolSportSite…`);

    let schoolsCreated = 0;
    let schoolsUpdated = 0;
    let sitesCreated = 0;
    let sitesUpdated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < schools.length; i++) {
      const row = schools[i] || {};
      const schoolName = safeString(row.school_name).trim();
      const logoUrl = safeString(row.logo_url).trim() || null;
      const campSiteUrl = safeString(row.view_site_url).trim() || null;

      if (!schoolName || !campSiteUrl) {
        skipped += 1;
        continue;
      }

      try {
        // 1) Upsert School by school_name (simple + reliable)
        let existingSchool = null;
        try {
          existingSchool = await School.findOne({ school_name: schoolName });
        } catch {
          existingSchool = null;
        }

        let schoolId = "";
        if (!existingSchool) {
          const created = await School.create({
            school_name: schoolName,
            school_type: "College/University",
            active: true,
            logo_url: logoUrl,
            source_platform: "sportsusa",
            source_school_url: campSiteUrl,
            source_key: row.source_key || null,
            needs_review: false,
            last_seen_at: nowIso(),
          });
          schoolId = created && created.id ? created.id : "";
          schoolsCreated += 1;
        } else {
          schoolId = existingSchool.id;
          await School.update(existingSchool.id, {
            active: true,
            logo_url: logoUrl || existingSchool.logo_url || null,
            last_seen_at: nowIso(),
          });
          schoolsUpdated += 1;
        }

        if (!schoolId) {
          errors += 1;
          append(setLogSeed, `[SportsUSA] ERROR: Missing schoolId after upsert for "${schoolName}"`);
          continue;
        }

        // 2) Upsert SchoolSportSite by (school_id + sport_id)
        let existingSite = null;
        try {
          existingSite = await SchoolSportSite.findOne({ school_id: schoolId, sport_id: selectedSportId });
        } catch {
          existingSite = null;
        }

        const sourceKey = row.source_key || buildSourceKey(selectedSport.sport_name, campSiteUrl);

        if (!existingSite) {
          await SchoolSportSite.create({
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
          await SchoolSportSite.update(existingSite.id, {
            camp_site_url: campSiteUrl,
            logo_url: logoUrl || existingSite.logo_url || null,
            active: true,
            last_seen_at: nowIso(),
          });
          sitesUpdated += 1;
        }

        if ((i + 1) % 10 === 0) {
          append(
            setLogSeed,
            `[SportsUSA] Progress ${i + 1}/${schools.length} | Schools c/u=${schoolsCreated}/${schoolsUpdated} | Sites c/u=${sitesCreated}/${sitesUpdated} | skipped=${skipped} errors=${errors}`
          );
        }
      } catch (e) {
        errors += 1;
        append(setLogSeed, `[SportsUSA] ERROR row ${i + 1}: ${safeString(e && e.message ? e.message : e)}`);
      }
    }

    append(
      setLogSeed,
      `[SportsUSA] Writes done. Schools: created=${schoolsCreated} updated=${schoolsUpdated} | Sites: created=${sitesCreated} updated=${sitesUpdated} | skipped=${skipped} errors=${errors}`
    );
  }

  // -------------------------
  // action: ingest camps -> CampDemo (from SchoolSportSite)
  // -------------------------
  async function runIngestCamps() {
    setLogCamps("");
    if (!selectedSport || !selectedSportId) {
      append(setLogCamps, "[Camps] ERROR: Select a sport first.");
      return;
    }

    append(setLogCamps, `[Camps] AdminImport version: ${VERSION}`);
    append(setLogCamps, `[Camps] Starting: SportsUSA Camps Ingest (${selectedSport.sport_name}) @ ${nowIso()}`);
    append(
      setLogCamps,
      `[Camps] DryRun=${dryRun} | MaxSites=${maxSites} | MaxRegsPerSite=${maxRegsPerSite} | MaxEvents=${maxEvents}`
    );

    // Pull active SchoolSportSite rows for this sport unless a testSiteUrl is provided
    let siteUrls = [];
    if (!safeString(testSiteUrl).trim()) {
      try {
        const rows = await SchoolSportSite.list({ sport_id: selectedSportId, active: true });
        append(setLogCamps, `[Camps] Loaded SchoolSportSite rows: ${(rows || []).length} (active)`);

        for (let i = 0; i < (rows || []).length; i++) {
          const u = rows[i] && rows[i].camp_site_url ? rows[i].camp_site_url : "";
          if (u) siteUrls.push(u);
        }
      } catch (e) {
        append(setLogCamps, `[Camps] ERROR loading SchoolSportSite: ${safeString(e && e.message ? e.message : e)}`);
        return;
      }
    } else {
      append(setLogCamps, `[Camps] Using Test Site URL: ${safeString(testSiteUrl).trim()}`);
    }

    let resp;
    try {
      resp = await invokeFn("sportsUSAIngestCamps", {
        sportId: selectedSportId,
        sportName: selectedSport.sport_name,
        dryRun: true, // function returns normalized; we do DB writes here
        maxSites: Number(maxSites || 5),
        maxRegsPerSite: Number(maxRegsPerSite || 10),
        maxEvents: Number(maxEvents || 25),
        testSiteUrl: safeString(testSiteUrl).trim() ? safeString(testSiteUrl).trim() : null,
        siteUrls: safeString(testSiteUrl).trim() ? null : siteUrls,
      });
    } catch (e) {
      append(setLogCamps, `[Camps] ERROR invoking function: ${safeString(e && e.message ? e.message : e)}`);
      append(setLogCamps, `[Camps] NOTE: Confirm /functions/sportsUSAIngestCamps.js exists and is named exactly.`);
      return;
    }

    const fnVersion = (resp && resp.version) || (resp && resp.debug && resp.debug.version) || "MISSING";
    append(setLogCamps, `[Camps] Function version: ${fnVersion}`);

    const stats = resp && resp.stats ? resp.stats : null;
    if (!stats) {
      append(setLogCamps, "[Camps] ERROR: Missing stats in function response.");
      append(setLogCamps, JSON.stringify(resp || {}, null, 2));
      return;
    }

    append(
      setLogCamps,
      `[Camps] Function stats: processedSites=${stats.processedSites} processedRegs=${stats.processedRegs} accepted=${stats.accepted} rejected=${stats.rejected} errors=${stats.errors}`
    );

    if (resp && resp.errors && resp.errors.length) {
      append(setLogCamps, `[Camps] Errors (first ${Math.min(3, resp.errors.length)}):`);
      for (let i = 0; i < Math.min(3, resp.errors.length); i++) {
        append(setLogCamps, `- ${JSON.stringify(resp.errors[i])}`);
      }
    }

    if (resp && resp.debug && resp.debug.siteDebug && resp.debug.siteDebug.length) {
      const s0 = resp.debug.siteDebug[0];
      append(setLogCamps, "[Camps] Site debug (first 1):");
      append(
        setLogCamps,
        `- url=${s0.siteUrl || ""} http=${s0.http || ""} htmlType=${s0.htmlType || ""} regLinks=${s0.regLinks || 0} sample=${s0.sample || ""} notes=${s0.notes || ""}`
      );
    }

    // Show accepted sample
    const accepted = resp && resp.accepted ? resp.accepted : [];
    if (!accepted.length) {
      if (resp && resp.rejected_samples && resp.rejected_samples.length) {
        append(setLogCamps, `[Camps] Rejected samples (first ${Math.min(5, resp.rejected_samples.length)}):`);
        for (let i = 0; i < Math.min(5, resp.rejected_samples.length); i++) {
          const rj = resp.rejected_samples[i] || {};
          append(
            setLogCamps,
            `- reason=${rj.reason || ""} title="${rj.title || ""}" url=${rj.registrationUrl || ""} datesLine=${rj.event_dates_line || ""}`
          );
        }
      }
      append(setLogCamps, "[Camps] No accepted events returned from function.");
      return;
    }

    append(setLogCamps, `[Camps] Accepted events returned: ${accepted.length}`);
    append(setLogCamps, "[Camps] Sample (first 3):");
    for (let i = 0; i < Math.min(3, accepted.length); i++) {
      const ev = accepted[i] && accepted[i].event ? accepted[i].event : {};
      append(setLogCamps, `- camp="${ev.camp_name || ""}" start=${ev.start_date || "n/a"} url=${ev.link_url || ""}`);
    }

    if (dryRun) {
      append(setLogCamps, "[Camps] DryRun=true: no CampDemo writes performed.");
      return;
    }

    // Write CampDemo (upsert by event_key)
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < accepted.length; i++) {
      const ev = accepted[i] && accepted[i].event ? accepted[i].event : null;
      if (!ev || !ev.event_key) {
        skipped += 1;
        continue;
      }

      try {
        let existing = null;
        try {
          existing = await CampDemo.findOne({ event_key: ev.event_key });
        } catch {
          existing = null;
        }

        if (!existing) {
          await CampDemo.create(ev);
          created += 1;
        } else {
          await CampDemo.update(existing.id, ev);
          updated += 1;
        }
      } catch (e) {
        errors += 1;
        append(setLogCamps, `[Camps] ERROR write row ${i + 1}: ${safeString(e && e.message ? e.message : e)}`);
      }
    }

    append(setLogCamps, `[Camps] CampDemo writes done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
  }

  // -------------------------
  // action: auto-seed positions (simple)
  // -------------------------
  async function autoSeedPositions() {
    setLogPositions("");
    append(setLogPositions, `[Positions] Starting @ ${nowIso()}`);

    // Minimal defaults (football-biased). You can expand per sport later.
    const defaults = [
      { code: "QB", name: "Quarterback" },
      { code: "RB", name: "Running Back" },
      { code: "WR", name: "Wide Receiver" },
      { code: "TE", name: "Tight End" },
      { code: "OL", name: "Offensive Line" },
      { code: "DL", name: "Defensive Line" },
      { code: "LB", name: "Linebacker" },
      { code: "DB", name: "Defensive Back" },
      { code: "K", name: "Kicker" },
      { code: "P", name: "Punter" },
      { code: "LS", name: "Long Snapper" },
    ];

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < defaults.length; i++) {
      const d = defaults[i];
      try {
        let existing = null;
        try {
          existing = await Position.findOne({ code: d.code });
        } catch {
          existing = null;
        }

        if (!existing) {
          await Position.create({ code: d.code, name: d.name });
          created += 1;
        } else {
          await Position.update(existing.id, { name: d.name });
          updated += 1;
        }
      } catch (e) {
        errors += 1;
        append(setLogPositions, `[Positions] ERROR ${d.code}: ${safeString(e && e.message ? e.message : e)}`);
      }
    }

    append(setLogPositions, `[Positions] Done. created=${created} updated=${updated} errors=${errors}`);
  }

  async function upsertPosition() {
    setLogPositions("");
    const code = safeString(posCode).trim().toUpperCase();
    const name = safeString(posName).trim();
    if (!code || !name) {
      append(setLogPositions, "[Positions] ERROR: Provide code and name.");
      return;
    }

    append(setLogPositions, `[Positions] Upsert ${code} @ ${nowIso()}`);
    try {
      let existing = null;
      try {
        existing = await Position.findOne({ code: code });
      } catch {
        existing = null;
      }

      if (!existing) {
        await Position.create({ code, name });
        append(setLogPositions, "[Positions] Created.");
      } else {
        await Position.update(existing.id, { name });
        append(setLogPositions, "[Positions] Updated.");
      }
    } catch (e) {
      append(setLogPositions, `[Positions] ERROR: ${safeString(e && e.message ? e.message : e)}`);
    }
  }

  // -------------------------
  // action: promote CampDemo -> Camp (placeholder)
  // -------------------------
  async function runPromote() {
    setLogPromote("");
    append(setLogPromote, `[Promote] Starting @ ${nowIso()}`);
    append(setLogPromote, "[Promote] NOTE: This is intentionally conservative. It promotes by event_key.");

    let rows = [];
    try {
      rows = await CampDemo.list({ limit: 5000 });
    } catch (e) {
      append(setLogPromote, `[Promote] ERROR loading CampDemo: ${safeString(e && e.message ? e.message : e)}`);
      return;
    }

    append(setLogPromote, `[Promote] CampDemo rows loaded: ${rows.length}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.event_key) {
        skipped += 1;
        continue;
      }

      try {
        let existing = null;
        try {
          existing = await Camp.findOne({ event_key: r.event_key });
        } catch {
          existing = null;
        }

        if (!existing) {
          await Camp.create(r);
          created += 1;
        } else {
          await Camp.update(existing.id, r);
          updated += 1;
        }
      } catch (e) {
        errors += 1;
        append(setLogPromote, `[Promote] ERROR row ${i + 1}: ${safeString(e && e.message ? e.message : e)}`);
      }
    }

    append(setLogPromote, `[Promote] Done. created=${created} updated=${updated} skipped=${skipped} errors=${errors}`);
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h2 style={{ margin: 0 }}>Admin Import</h2>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Admin tools for seeding schools + positions + ingestion + promotion.</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>UI version: {VERSION}</div>
        </div>
      </div>

      {/* Selected sport drives everything */}
      <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Selected Sport (drives all tools)</div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Sport</div>
            <select
              value={selectedSportId}
              onChange={(e) => setSelectedSportId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
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
        </div>
      </div>

      {/* Seed Schools */}
      <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Seed Schools from SportsUSA site</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          Uses SportsUSA directory for the selected sport. Writes School + SchoolSportSite.
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 160 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Write limit</div>
            <input
              value={seedLimit}
              onChange={(e) => setSeedLimit(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </div>

          <button onClick={runSeedSchools} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111" }}>
            Run Seed ({dryRun ? "Dry Run" : "Write"})
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Log</div>
          <textarea value={logSeed} readOnly rows={10} style={{ width: "100%", padding: 10, borderRadius: 8 }} />
        </div>
      </div>

      {/* Camps ingest */}
      <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Camps ingest (SportsUSA → CampDemo)</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          Crawls SchoolSportSite camp_site_url pages for the selected sport. Extracts Ryzer registration links and normalizes into CampDemo.
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 140 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Max sites</div>
            <input
              value={maxSites}
              onChange={(e) => setMaxSites(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </div>

          <div style={{ width: 160 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Max regs/site</div>
            <input
              value={maxRegsPerSite}
              onChange={(e) => setMaxRegsPerSite(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </div>

          <div style={{ width: 160 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Max events</div>
            <input
              value={maxEvents}
              onChange={(e) => setMaxEvents(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </div>

          <button onClick={runIngestCamps} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111" }}>
            Run Ingest ({dryRun ? "Dry Run" : "Write"})
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>
            Test Site URL (optional, overrides SchoolSportSite list)
          </div>
          <input
            value={testSiteUrl}
            onChange={(e) => setTestSiteUrl(e.target.value)}
            placeholder="e.g., https://www.hardingfootballcamps.com/"
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Log</div>
          <textarea value={logCamps} readOnly rows={12} style={{ width: "100%", padding: 10, borderRadius: 8 }} />
        </div>
      </div>

      {/* Positions */}
      <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Manage Positions</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={autoSeedPositions} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111" }}>
            Auto-seed positions
          </button>

          <input
            value={posCode}
            onChange={(e) => setPosCode(e.target.value)}
            placeholder="e.g., QB"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", width: 120 }}
          />
          <input
            value={posName}
            onChange={(e) => setPosName(e.target.value)}
            placeholder="e.g., Quarterback"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", width: 260 }}
          />
          <button onClick={upsertPosition} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111" }}>
            Add / Upsert
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Log</div>
          <textarea value={logPositions} readOnly rows={8} style={{ width: "100%", padding: 10, borderRadius: 8 }} />
        </div>
      </div>

      {/* Promote */}
      <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Promote CampDemo → Camp</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={runPromote} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111" }}>
            Run Promotion
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Log</div>
          <textarea value={logPromote} readOnly rows={10} style={{ width: "100%", padding: 10, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}
