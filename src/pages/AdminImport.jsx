// src/pages/AdminImport.jsx
//
// Admin ingest runner for SportsUSA/Ryzer camp sites
// Updated to send v12 runtime controls (fastMode/maxMs/timeouts/maxRegFetchTotal)
// so full ingest runs don’t 504.
//
// Assumptions (based on your project patterns):
// - You have `base44` client at src/api/base44Client
// - Entities exported from src/api/entities.js include `SchoolSportSite`
// - Backend function name is `sportsUSAIngestCamps`
// If your invoke method differs, update `invokeFunction()` only.

import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "../api/base44Client";
import { SchoolSportSite } from "../api/entities";

// ---------- helpers ----------
function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function safeStr(v) {
  const s = (v ?? "").toString().trim();
  return s || "";
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function invokeFunction(functionName, payload) {
  // Preferred: base44 function invoke (if your SDK supports it)
  if (base44?.functions?.invoke) {
    return await base44.functions.invoke(functionName, payload);
  }

  // Fallback: direct POST to /functions/<name> (adjust if your route differs)
  const res = await fetch(`/functions/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Base44 functions typically return JSON
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function listSchoolSportSites({ sport_id, onlyActive = true, limit = 1000 }) {
  // Try a few common Base44 entity APIs without you having to edit this file.
  // If your entity method name differs, change this function only.

  const filter = onlyActive
    ? { sport_id, is_active: true }
    : { sport_id };

  // 1) list({ filter, limit })
  if (SchoolSportSite?.list) {
    const rows = await SchoolSportSite.list({ filter, limit });
    return Array.isArray(rows) ? rows : rows?.data || [];
  }

  // 2) findMany({ where, limit })
  if (SchoolSportSite?.findMany) {
    const rows = await SchoolSportSite.findMany({ where: filter, limit });
    return Array.isArray(rows) ? rows : rows?.data || [];
  }

  // 3) query builder style
  if (SchoolSportSite?.query) {
    let q = SchoolSportSite.query();
    q = q.where(filter);
    q = q.limit(limit);
    const rows = await q.get();
    return Array.isArray(rows) ? rows : rows?.data || [];
  }

  throw new Error("SchoolSportSite entity does not support list/findMany/query in this project.");
}

// ---------- component ----------
export default function AdminImport() {
  // Sport selection (match your IDs/names)
  const sportOptions = useMemo(
    () => [
      { id: "football", name: "Football" },
      { id: "baseball", name: "Baseball" },
      { id: "softball", name: "Softball" },
      { id: "soccer", name: "Soccer" },
      { id: "volleyball", name: "Volleyball" },
    ],
    []
  );

  const [sportId, setSportId] = useState("football");
  const [sportName, setSportName] = useState("Football");

  // Query + run controls
  const [dryRun, setDryRun] = useState(true);
  const [onlyActive, setOnlyActive] = useState(true);

  const [maxSites, setMaxSites] = useState(300);
  const [maxRegsPerSite, setMaxRegsPerSite] = useState(20);
  const [maxEvents, setMaxEvents] = useState(6000);

  // v12 runtime controls (these prevent 504s)
  const [fastMode, setFastMode] = useState(true);
  const [maxMs, setMaxMs] = useState(45000);
  const [maxRegFetchTotal, setMaxRegFetchTotal] = useState(250);
  const [siteTimeoutMs, setSiteTimeoutMs] = useState(12000);
  const [regTimeoutMs, setRegTimeoutMs] = useState(12000);

  // Optional: test single site
  const [testMode, setTestMode] = useState(false);
  const [testSiteUrl, setTestSiteUrl] = useState("");
  const [testSchoolId, setTestSchoolId] = useState("");

  // State
  const [loadingSites, setLoadingSites] = useState(false);
  const [sitesCount, setSitesCount] = useState(0);

  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState("");

  // Load count so the operator sees what’s about to run
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError("");
      if (testMode) {
        setSitesCount(1);
        return;
      }

      setLoadingSites(true);
      try {
        const rows = await listSchoolSportSites({
          sport_id: sportId,
          onlyActive,
          limit: 2000,
        });

        if (cancelled) return;
        setSitesCount(rows.length);
      } catch (e) {
        if (cancelled) return;
        setSitesCount(0);
        setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoadingSites(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sportId, onlyActive, testMode]);

  function onSportChange(nextId) {
    setSportId(nextId);
    const match = sportOptions.find((s) => s.id === nextId);
    setSportName(match?.name || safeStr(nextId));
  }

  async function runIngest() {
    setRunning(true);
    setError("");
    setLastResult(null);

    try {
      // Clamp to sane bounds to keep runs predictable
      const payload = {
        sportId: safeStr(sportId),
        sportName: safeStr(sportName),
        dryRun: !!dryRun,

        // Existing knobs
        maxSites: clamp(safeNum(maxSites, 50), 1, 5000),
        maxRegsPerSite: clamp(safeNum(maxRegsPerSite, 10), 1, 200),
        maxEvents: clamp(safeNum(maxEvents, 500), 1, 500000),

        // v12 knobs (critical)
        fastMode: !!fastMode,
        maxMs: clamp(safeNum(maxMs, 45000), 5000, 120000),
        maxRegFetchTotal: clamp(safeNum(maxRegFetchTotal, 250), 0, 5000),
        siteTimeoutMs: clamp(safeNum(siteTimeoutMs, 12000), 3000, 60000),
        regTimeoutMs: clamp(safeNum(regTimeoutMs, 12000), 3000, 60000),
      };

      if (testMode) {
        payload.testSiteUrl = safeStr(testSiteUrl);
        payload.testSchoolId = safeStr(testSchoolId) || null;
      } else {
        // Pull the site list and pass it in explicitly (matches your function’s `sites[]` path)
        const rows = await listSchoolSportSites({
          sport_id: sportId,
          onlyActive,
          limit: payload.maxSites,
        });

        // Ensure shape matches your ingest function (camp_site_url + school_id)
        payload.sites = rows.map((r) => ({
          camp_site_url: r?.camp_site_url,
          school_id: r?.school_id || null,
        }));
      }

      const res = await invokeFunction("sportsUSAIngestCamps", payload);

      // Some SDKs return { data } wrappers
      const out = res?.data ?? res;
      setLastResult(out);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  const stats = lastResult?.stats || null;

  return (
    <div style={{ padding: 20, maxWidth: 1100 }}>
      <h2 style={{ margin: "0 0 6px 0" }}>Admin Import</h2>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        SportsUSA/Ryzer camp ingest runner (v12 runtime controls enabled)
      </div>

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Sport</label>
          <select
            value={sportId}
            onChange={(e) => onSportChange(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            disabled={running}
          >
            {sportOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={running}
            />
            DryRun
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              disabled={running || testMode}
            />
            Only Active Sites
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              disabled={running}
            />
            Test Single Site
          </label>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Sites loaded</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {loadingSites ? "…" : String(sitesCount)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {testMode ? "Test mode uses 1 site" : "Based on SchoolSportSite rows"}
          </div>
        </div>

        {/* Basic knobs */}
        <div>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Max Sites</label>
          <input
            value={maxSites}
            onChange={(e) => setMaxSites(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            disabled={running || testMode}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Max Regs / Site</label>
          <input
            value={maxRegsPerSite}
            onChange={(e) => setMaxRegsPerSite(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            disabled={running}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Max Events</label>
          <input
            value={maxEvents}
            onChange={(e) => setMaxEvents(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            disabled={running}
          />
        </div>

        {/* v12 runtime controls */}
        <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Runtime Controls (anti-504)</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={(e) => setFastMode(e.target.checked)}
                  disabled={running}
                />
                Fast Mode
              </label>
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Max Runtime (ms)</label>
              <input
                value={maxMs}
                onChange={(e) => setMaxMs(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={running}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Max Reg Fetch Total</label>
              <input
                value={maxRegFetchTotal}
                onChange={(e) => setMaxRegFetchTotal(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={running}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Site Timeout (ms)</label>
              <input
                value={siteTimeoutMs}
                onChange={(e) => setSiteTimeoutMs(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={running}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Reg Timeout (ms)</label>
              <input
                value={regTimeoutMs}
                onChange={(e) => setRegTimeoutMs(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={running}
              />
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
            Recommendation: start with fastMode=true, maxMs=45000, maxRegFetchTotal=250.
            When stable, run a second “deep” pass later with fastMode=false on smaller batches.
          </div>
        </div>

        {/* Test Mode inputs */}
        {testMode && (
          <>
            <div style={{ gridColumn: "1 / span 2" }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Test Site URL</label>
              <input
                value={testSiteUrl}
                onChange={(e) => setTestSiteUrl(e.target.value)}
                placeholder="https://www.montanafootballcamps.com/register.cfm"
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={running}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Test School ID (optional)</label>
              <input
                value={testSchoolId}
                onChange={(e) => setTestSchoolId(e.target.value)}
                placeholder="school_123..."
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={running}
              />
            </div>
          </>
        )}

        {/* Run */}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={runIngest}
            disabled={running || (testMode && !safeStr(testSiteUrl))}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: running ? "#f3f4f6" : "#111827",
              color: running ? "#111827" : "#fff",
              cursor: running ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {running ? "Running…" : "Run Ingest Camps"}
          </button>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {dryRun ? "DryRun ON (no writes)" : "DryRun OFF (writes enabled)"}
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div style={{ gridColumn: "1 / -1", color: "#b91c1c", background: "#fef2f2", padding: 10, borderRadius: 10 }}>
            <b>Error:</b> {error}
          </div>
        )}
      </div>

      {/* Results */}
      <div style={{ marginTop: 14 }}>
        <h3 style={{ margin: "14px 0 8px 0" }}>Last Result</h3>

        {!lastResult && <div style={{ opacity: 0.7 }}>No run yet.</div>}

        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            {[
              ["Sites", stats.processedSites],
              ["Regs", stats.processedRegs],
              ["Accepted", stats.accepted],
              ["Rejected", stats.rejected],
              ["Errors", stats.errors],
              ["% w/Start", stats.percentWithStartDate + "%"],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  padding: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75 }}>{k}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{String(v ?? "")}</div>
              </div>
            ))}
          </div>
        )}

        {lastResult && (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              maxHeight: 520,
              overflow: "auto",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
