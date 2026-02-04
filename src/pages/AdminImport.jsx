// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";

export default function AdminImport() {
  // -------------------------
  // State
  // -------------------------
  var [sportId, setSportId] = useState("");
  var [sportName, setSportName] = useState("Football");
  var [dryRun, setDryRun] = useState(true);

  var [maxSites, setMaxSites] = useState(1);
  var [maxRegsPerSite, setMaxRegsPerSite] = useState(10);
  var [maxEvents, setMaxEvents] = useState(25);

  var [testSiteUrl, setTestSiteUrl] = useState("https://www.hardingfootballcamps.com/");

  var [schoolSportSites, setSchoolSportSites] = useState([]);
  var [loadingSites, setLoadingSites] = useState(false);

  var [logs, setLogs] = useState([]);
  var [lastResponse, setLastResponse] = useState(null);

  // -------------------------
  // Small helpers (editor-safe)
  // -------------------------
  function addLog(line) {
    var s = String(line || "");
    setLogs(function (prev) {
      var next = prev.slice(0);
      next.push(s);
      return next;
    });
    // keep console available for deeper debugging without changing UI
    console.log(s);
  }

  function safeNum(v, fallback) {
    var n = Number(v);
    if (isNaN(n)) return fallback;
    return n;
  }

  function normalizeAcceptedItem(item) {
    // Supports both:
    // - { event:{...}, derived:{...}, debug:{...} }
    // - flat event {...}
    if (!item) return { ev: null, derived: null, dbg: null };
    return {
      ev: item.event ? item.event : item,
      derived: item.derived ? item.derived : null,
      dbg: item.debug ? item.debug : null,
    };
  }

  // -------------------------
  // Load SchoolSportSites (preserve your prior behavior if available)
  // -------------------------
  async function loadSchoolSportSites() {
    setLoadingSites(true);
    try {
      var rows = [];
      var ents = null;

      if (typeof window !== "undefined" && window && window.entities) {
        ents = window.entities;
      }

      // Try common Base44 entity access patterns without assuming one.
      // If none exist, we fall back to empty array (testSiteUrl mode still works).
      if (ents && ents.SchoolSportSite) {
        var api = ents.SchoolSportSite;

        // Pattern A: list()
        if (api.list && typeof api.list === "function") {
          rows = await api.list({ where: { active: true }, limit: 1000 }).catch(function () {
            return [];
          });
        }
        // Pattern B: findMany()
        else if (api.findMany && typeof api.findMany === "function") {
          rows = await api.findMany({ where: { active: true }, limit: 1000 }).catch(function () {
            return [];
          });
        }
        // Pattern C: query()
        else if (api.query && typeof api.query === "function") {
          rows = await api.query({ where: { active: true }, limit: 1000 }).catch(function () {
            return [];
          });
        }
        // Pattern D: find()
        else if (api.find && typeof api.find === "function") {
          rows = await api.find({ where: { active: true }, limit: 1000 }).catch(function () {
            return [];
          });
        }
      }

      if (!rows) rows = [];
      if (!Array.isArray(rows)) {
        // Some SDKs wrap results
        if (rows.items && Array.isArray(rows.items)) rows = rows.items;
        else rows = [];
      }

      setSchoolSportSites(rows);
      addLog("[Camps] Loaded SchoolSportSite rows: " + String(rows.length) + " (active)");
    } catch (e) {
      addLog("[Camps] ERROR loading SchoolSportSite rows: " + String((e && e.message) || e));
      setSchoolSportSites([]);
    } finally {
      setLoadingSites(false);
    }
  }

  useEffect(function () {
    // Don’t spam logs on initial mount if user immediately runs testSiteUrl mode,
    // but keep the existing behavior of loading if possible.
    loadSchoolSportSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // Build siteUrls from SchoolSportSites
  // -------------------------
  var siteUrls = useMemo(function () {
    var out = [];
    for (var i = 0; i < (schoolSportSites || []).length; i++) {
      var r = schoolSportSites[i];
      if (!r) continue;

      // Common field name variants (keep safe)
      var url =
        r.camp_site_url ||
        r.campSiteUrl ||
        r.camp_site ||
        r.site_url ||
        r.siteUrl ||
        r.url ||
        null;

      if (!url) continue;

      // Optional: filter by sportId if row has sport_id
      // (Only do it if both exist; prevents accidental filtering when schema differs)
      if (sportId && r.sport_id && String(r.sport_id) !== String(sportId)) {
        continue;
      }

      out.push(String(url));
    }

    // de-dupe
    var seen = {};
    var uniq = [];
    for (var j = 0; j < out.length; j++) {
      var u = out[j];
      if (!u) continue;
      if (seen[u]) continue;
      seen[u] = true;
      uniq.push(u);
    }

    return uniq;
  }, [schoolSportSites, sportId]);

  // -------------------------
  // Run ingest
  // -------------------------
  async function runCampsIngest() {
    setLogs([]);
    setLastResponse(null);

    var startedAt = new Date().toISOString();
    addLog("[Camps] Starting: SportsUSA Camps Ingest (" + sportName + ") @ " + startedAt);
    addLog(
      "[Camps] DryRun=" +
        String(!!dryRun) +
        " | MaxSites=" +
        String(maxSites) +
        " | MaxRegsPerSite=" +
        String(maxRegsPerSite) +
        " | MaxEvents=" +
        String(maxEvents)
    );

    if (!sportId) {
      addLog("[Camps] ERROR: SportID is required.");
      return;
    }

    var useTest = !!(testSiteUrl && String(testSiteUrl).trim());
    if (!useTest) {
      addLog("[Camps] Loaded SchoolSportSite rows: " + String((schoolSportSites || []).length) + " (active)");
    }

    var payload = {
      sportId: String(sportId).trim(),
      sportName: String(sportName || "").trim(),
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

      var version = json && json.version ? json.version : "(missing)";
      addLog("[Camps] Function version: " + version);

      var st = json && json.stats ? json.stats : {};
      addLog(
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

      // Optional KPI (if function provides it)
      var kpi = json && json.debug && json.debug.kpi ? json.debug.kpi : null;
      if (kpi) {
        addLog(
          "[Camps] Date KPI: listing=" +
            String(kpi.datesParsedFromListing || 0) +
            " ryzer=" +
            String(kpi.datesParsedFromRyzer || 0) +
            " missing=" +
            String(kpi.datesMissing || 0)
        );
      }

      var accepted = json && json.accepted ? json.accepted : [];
      addLog("[Camps] Accepted events returned: " + String(accepted.length));

      // Critical: prove the shape (console only; does not change UI)
      if (accepted && accepted.length) {
        console.log("[Camps] RAW accepted[0] =", JSON.stringify(accepted[0], null, 2));
      }

      addLog("[Camps] Sample (first 3):");
      for (var i = 0; i < accepted.length && i < 3; i++) {
        var norm = normalizeAcceptedItem(accepted[i]);
        var ev = norm.ev;

        var camp = ev && ev.camp_name ? ev.camp_name : "";
        var start = ev && ev.start_date ? ev.start_date : "n/a";
        var url = "";
        if (ev && ev.link_url) url = ev.link_url;
        else if (ev && ev.source_url) url = ev.source_url;

        addLog("- camp=\"" + camp + "\" start=" + start + " url=" + url);
      }

      if (dryRun) {
        addLog("[Camps] DryRun=true: no CampDemo writes performed.");
      }

      var rejects = json && json.rejected_samples ? json.rejected_samples : [];
      if (rejects && rejects.length) {
        addLog("[Camps] Rejected samples: " + String(rejects.length));
        for (var rj = 0; rj < rejects.length && rj < 5; rj++) {
          var rr = rejects[rj];
          addLog("  - " + String((rr && rr.reason) || "reject") + " " + String((rr && rr.registrationUrl) || ""));
        }
      }

      var errs = json && json.errors ? json.errors : [];
      if (errs && errs.length) {
        addLog("[Camps] Errors: " + String(errs.length));
        for (var ei = 0; ei < errs.length && ei < 5; ei++) {
          var er = errs[ei];
          addLog("  - " + String((er && er.error) || "error") + ": " + String((er && er.message) || ""));
        }
      }
    } catch (e) {
      addLog("[Camps] ERROR calling function: " + String((e && e.message) || e));
    }
  }

  // -------------------------
  // UI (kept simple + close to your existing AdminImport look)
  // -------------------------
  var fieldStyle = { width: 140, padding: 6, border: "1px solid #ddd", borderRadius: 4 };
  var labelStyle = { fontSize: 12, marginBottom: 4, color: "#444" };
  var rowStyle = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" };
  var boxStyle = { border: "1px solid #ddd", borderRadius: 6, padding: 10, background: "#fff" };
  var btnStyle = { padding: "8px 12px", border: "1px solid #bbb", borderRadius: 6, background: "#f7f7f7", cursor: "pointer" };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Admin Import</div>

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Sport ID (required)</div>
          <input
            style={{ ...fieldStyle, width: 220 }}
            value={sportId}
            onChange={function (e) { setSportId(e.target.value); }}
            placeholder="sportId"
          />
        </div>

        <div>
          <div style={labelStyle}>Sport Name</div>
          <input
            style={fieldStyle}
            value={sportName}
            onChange={function (e) { setSportName(e.target.value); }}
            placeholder="Football"
          />
        </div>

        <div>
          <div style={labelStyle}>Dry Run</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", height: 32 }}>
            <input
              type="checkbox"
              checked={!!dryRun}
              onChange={function (e) { setDryRun(!!e.target.checked); }}
            />
            <div style={{ fontSize: 12 }}>{dryRun ? "true" : "false"}</div>
          </div>
        </div>

        <div>
          <div style={labelStyle}>Max Sites</div>
          <input
            style={{ ...fieldStyle, width: 90 }}
            value={String(maxSites)}
            onChange={function (e) { setMaxSites(e.target.value); }}
          />
        </div>

        <div>
          <div style={labelStyle}>Max Regs / Site</div>
          <input
            style={{ ...fieldStyle, width: 110 }}
            value={String(maxRegsPerSite)}
            onChange={function (e) { setMaxRegsPerSite(e.target.value); }}
          />
        </div>

        <div>
          <div style={labelStyle}>Max Events</div>
          <input
            style={{ ...fieldStyle, width: 90 }}
            value={String(maxEvents)}
            onChange={function (e) { setMaxEvents(e.target.value); }}
          />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={labelStyle}>Test Site URL (optional, overrides site list)</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            style={{ ...fieldStyle, width: "100%", maxWidth: 980 }}
            value={testSiteUrl}
            onChange={function (e) { setTestSiteUrl(e.target.value); }}
            placeholder="https://www.hardingfootballcamps.com/"
          />
          <button style={btnStyle} onClick={runCampsIngest}>Run Camps Ingest</button>
          <button
            style={{ ...btnStyle, opacity: loadingSites ? 0.6 : 1 }}
            onClick={loadSchoolSportSites}
            disabled={loadingSites}
          >
            {loadingSites ? "Loading..." : "Reload SchoolSportSites"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ ...boxStyle, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Logs</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.35 }}>
            {logs && logs.length ? logs.join("\n") : "[Camps] Loaded SchoolSportSite rows: " + String((schoolSportSites || []).length) + " (active)"}
          </pre>
        </div>

        <div style={boxStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Last Response (JSON)</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.35, maxHeight: 360, overflow: "auto" }}>
            {lastResponse ? JSON.stringify(lastResponse, null, 2) : "No response yet."}
          </pre>
        </div>
      </div>
    </div>
  );
}
