// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * AdminImport.jsx (updated)
 *
 * Key fixes included:
 * 1) Correctly reads returned events from sportsUSAIngestCamps:
 *    - supports both shapes: { event:{...} } OR flat {...}
 *    - sample log now prints real camp_name/start_date/url
 * 2) Adds a raw debug log for accepted[0] to quickly prove dates exist
 * 3) Adds Date Coverage KPI display (listing vs ryzer vs missing)
 *
 * NOTE:
 * - This file assumes you already have a way to load SchoolSportSite rows client-side.
 * - If your project uses a specific Base44 entity client, wire it in inside loadSchoolSportSites().
 * - This code is editor-safe (no optional chaining).
 */

export default function AdminImport() {
  // -------------------------
  // UI State
  // -------------------------
  var [sportId, setSportId] = useState(""); // e.g. football sport id in your Sport table
  var [sportName, setSportName] = useState("Football");
  var [dryRun, setDryRun] = useState(true);

  var [maxSites, setMaxSites] = useState(1);
  var [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  var [maxEvents, setMaxEvents] = useState(25);

  var [testSiteUrl, setTestSiteUrl] = useState("https://www.hardingfootballcamps.com/");

  var [schoolSportSites, setSchoolSportSites] = useState([]);
  var [loadingSites, setLoadingSites] = useState(false);

  var [lastResponse, setLastResponse] = useState(null);
  var [logs, setLogs] = useState([]);

  function logLine(msg) {
    var line = String(msg || "");
    setLogs(function (prev) {
      var next = prev.slice(0);
      next.push(line);
      return next;
    });
    // Also console for devtools
    console.log(line);
  }

  function safeNum(x, fallback) {
    var n = Number(x);
    if (isNaN(n)) return fallback;
    return n;
  }

  function normalizeAcceptedItem(item) {
    // Supports both:
    // - { event:{...}, derived:{...}, debug:{...} }
    // - { ...flat event... }
    if (!item) return { ev: null, derived: null, debug: null };
    var ev = item.event ? item.event : item;
    var derived = item.derived ? item.derived : null;
    var dbg = item.debug ? item.debug : null;
    return { ev: ev, derived: derived, debug: dbg };
  }

  // -------------------------
  // Load SchoolSportSite rows (client-side)
  // -------------------------
  async function loadSchoolSportSites() {
    // IMPORTANT:
    // Replace this with your actual Base44 entity query.
    // Your prior log shows you already load 311 active rows, so wire that logic here.
    //
    // Example patterns you might have in your app:
    // - window.entities.SchoolSportSite.find(...)
    // - api.entities.SchoolSportSite.list(...)
    // - base44.entities.SchoolSportSite.list(...)
    //
    // For now, this function keeps the page working even if you use testSiteUrl mode.
    setLoadingSites(true);
    try {
      // If you already have your loader elsewhere, call it and setSchoolSportSites(rows).
      // Placeholder:
      var rows = [];
      setSchoolSportSites(rows);
      logLine("[Camps] Loaded SchoolSportSite rows: " + rows.length + " (active)");
    } catch (e) {
      logLine("[Camps] ERROR loading SchoolSportSite rows: " + String((e && e.message) || e));
    } finally {
      setLoadingSites(false);
    }
  }

  useEffect(function () {
    loadSchoolSportSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // Build siteUrls list from active SchoolSportSite rows
  // -------------------------
  var siteUrls = useMemo(function () {
    var out = [];
    for (var i = 0; i < (schoolSportSites || []).length; i++) {
      var r = schoolSportSites[i];
      if (!r) continue;

      // Adjust field name if your schema differs
      var url = r.camp_site_url || r.campSiteUrl || r.site_url || r.siteUrl || null;
      if (!url) continue;

      // Optionally filter by sportId if rows contain sport_id
      // If you want strict filtering, uncomment:
      // if (sportId && r.sport_id && r.sport_id !== sportId) continue;

      out.push(url);
    }

    // de-dupe
    var seen = {};
    var uniq = [];
    for (var j = 0; j < out.length; j++) {
      var u = String(out[j]);
      if (seen[u]) continue;
      seen[u] = true;
      uniq.push(u);
    }

    return uniq;
  }, [schoolSportSites, sportId]);

  // -------------------------
  // Call Function: sportsUSAIngestCamps
  // -------------------------
  async function runIngestCamps() {
    setLastResponse(null);
    setLogs([]);

    var startedAt = new Date().toISOString();
    logLine("[Camps] Starting: SportsUSA Camps Ingest (" + sportName + ") @ " + startedAt);
    logLine(
      "[Camps] DryRun=" +
        String(!!dryRun) +
        " | MaxSites=" +
        String(maxSites) +
        " | MaxRegsPerSite=" +
        String(maxRegsPerSite) +
        " | MaxEvents=" +
        String(maxEvents)
    );

    // If testSiteUrl is present, we’ll run in test mode. Otherwise, pass siteUrls.
    var useTest = !!(testSiteUrl && String(testSiteUrl).trim());

    if (!sportId) {
      logLine("[Camps] ERROR: sportId is required. Set sportId in the UI.");
      return;
    }

    if (!useTest) {
      logLine("[Camps] Loaded SchoolSportSite rows: " + (schoolSportSites ? schoolSportSites.length : 0) + " (active)");
    }

    var payload = {
      sportId: sportId,
      sportName: sportName,
      dryRun: !!dryRun,
      maxSites: safeNum(maxSites, 1),
      maxRegsPerSite: safeNum(maxRegsPerSite, 10),
      maxEvents: safeNum(maxEvents, 25),
      testSiteUrl: useTest ? String(testSiteUrl).trim() : null,
      siteUrls: useTest ? null : (siteUrls || []).slice(0, safeNum(maxSites, 1)),
    };

    try {
      var resp = await fetch("/functions/sportsUSAIngestCamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      var json = await resp.json().catch(function () {
        return null;
      });

      setLastResponse(json);

      var version = (json && json.version) ? json.version : "(missing)";
      logLine("[Camps] Function version: " + version);

      var st = json && json.stats ? json.stats : {};
      logLine(
        "[Camps] Function stats: processedSites=" +
          String(st.processedSites || 0) +
          " processedRegs=" +
          String(st.processedRegs || 0) +
          " accepted=" +
          String(st.accepted || 0) +
          " rejected=" +
          String(st.rejected || 0) +
          " errors=" +
          String(st.errors || 0)
      );

      // KPI (if present)
      var kpi = (json && json.debug && json.debug.kpi) ? json.debug.kpi : null;
      if (kpi) {
        logLine(
          "[Camps] Date KPI: listing=" +
            String(kpi.datesParsedFromListing || 0) +
            " ryzer=" +
            String(kpi.datesParsedFromRyzer || 0) +
            " missing=" +
            String(kpi.datesMissing || 0)
        );
      }

      var accepted = (json && json.accepted) ? json.accepted : [];
      logLine("[Camps] Accepted events returned: " + String(accepted.length));

      // ---- CRITICAL DEBUG: show raw accepted[0] shape ----
      var a0 = accepted && accepted.length ? accepted[0] : null;
      console.log("[Camps] RAW accepted[0] =", JSON.stringify(a0, null, 2));

      // Print sample (first 3) using normalized mapping
      logLine("[Camps] Sample (first 3):");
      for (var i = 0; i < accepted.length && i < 3; i++) {
        var item = accepted[i];
        var norm = normalizeAcceptedItem(item);
        var ev = norm.ev;

        var camp = (ev && ev.camp_name) ? ev.camp_name : "";
        var start = (ev && ev.start_date) ? ev.start_date : "n/a";
        var url = "";
        if (ev && ev.link_url) url = ev.link_url;
        else if (ev && ev.source_url) url = ev.source_url;

        logLine("- camp=\"" + camp + "\" start=" + start + " url=" + url);
      }

      // If DryRun=false, you likely write CampDemo somewhere else.
      // Keep your existing write flow. This page now correctly reads the returned shape.
      if (dryRun) {
        logLine("[Camps] DryRun=true: no CampDemo writes performed.");
      } else {
        logLine("[Camps] DryRun=false: (write logic not included in this file; keep your existing CampDemo write flow)");
      }

      // Show rejects (if any)
      var rejects = (json && json.rejected_samples) ? json.rejected_samples : [];
      if (rejects && rejects.length) {
        logLine("[Camps] Rejected samples: " + String(rejects.length));
        // Print first few reasons
        for (var rj = 0; rj < rejects.length && rj < 5; rj++) {
          var rr = rejects[rj];
          var reason = rr && rr.reason ? rr.reason : "(no reason)";
          var reg = rr && rr.registrationUrl ? rr.registrationUrl : "";
          logLine("  - " + reason + " " + reg);
        }
      }

      // Show errors (if any)
      var errs = (json && json.errors) ? json.errors : [];
      if (errs && errs.length) {
        logLine("[Camps] Errors: " + String(errs.length));
        for (var ei = 0; ei < errs.length && ei < 5; ei++) {
          var er = errs[ei];
          logLine("  - " + String(er && er.error ? er.error : "error") + ": " + String(er && er.message ? er.message : ""));
        }
      }
    } catch (e) {
      logLine("[Camps] ERROR calling function: " + String((e && e.message) || e));
    }
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Admin Import</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Sport ID (required)</div>
          <input
            value={sportId}
            onChange={function (e) { setSportId(e.target.value); }}
            placeholder="sportId"
            style={{ width: 280, padding: 8 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Sport Name</div>
          <input
            value={sportName}
            onChange={function (e) { setSportName(e.target.value); }}
            placeholder="Football"
            style={{ width: 180, padding: 8 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Dry Run</div>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingTop: 6 }}>
            <input
              type="checkbox"
              checked={!!dryRun}
              onChange={function (e) { setDryRun(!!e.target.checked); }}
            />
            <span>{dryRun ? "true" : "false"}</span>
          </label>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Max Sites</div>
          <input
            value={String(maxSites)}
            onChange={function (e) { setMaxSites(e.target.value); }}
            style={{ width: 90, padding: 8 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Max Regs / Site</div>
          <input
            value={String(maxRegsPerSite)}
            onChange={function (e) { setMaxRegsPerSite(e.target.value); }}
            style={{ width: 120, padding: 8 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Max Events</div>
          <input
            value={String(maxEvents)}
            onChange={function (e) { setMaxEvents(e.target.value); }}
            style={{ width: 110, padding: 8 }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ flex: "1 1 520px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Test Site URL (optional, overrides site list)</div>
          <input
            value={testSiteUrl}
            onChange={function (e) { setTestSiteUrl(e.target.value); }}
            placeholder="https://www.hardingfootballcamps.com/"
            style={{ width: "100%", padding: 8 }}
          />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            If provided, AdminImport will call the ingest function in test mode (no SchoolSportSite required).
          </div>
        </div>

        <button
          onClick={runIngestCamps}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
          Run Camps Ingest
        </button>

        <button
          onClick={loadSchoolSportSites}
          disabled={loadingSites}
          style={{ padding: "10px 14px", cursor: loadingSites ? "not-allowed" : "pointer" }}
        >
          {loadingSites ? "Loading Sites..." : "Reload SchoolSportSites"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Logs</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.35 }}>
            {logs.join("\n")}
          </pre>
        </div>

        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Last Response (JSON)</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.35 }}>
            {lastResponse ? JSON.stringify(lastResponse, null, 2) : "No response yet."}
          </pre>
        </div>
      </div>
    </div>
  );
}
