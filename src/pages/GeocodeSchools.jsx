// src/pages/GeocodeSchools.jsx — Admin tool to backfill lat/lng on School records
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import AdminRoute from "../components/auth/AdminRoute";
import { geocodeCity } from "../components/hooks/useGeocode.jsx";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export default function GeocodeSchools() {
  const nav = useNavigate();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState(null);
  const stopRef = useRef(false);

  function stop() {
    stopRef.current = true;
  }

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setStatus("Loading schools...");
    setResults(null);

    try {
      const School = base44?.entities?.School;
      if (!School?.list) { setStatus("School entity not available."); setRunning(false); return; }

      // Fetch all schools (up to 5000)
      let allSchools = [];
      try {
        allSchools = await School.list("-created_date", 5000);
      } catch {
        allSchools = await School.filter({}, "-created_date", 5000);
      }
      if (!Array.isArray(allSchools)) allSchools = [];

      const missing = allSchools.filter((s) => {
        const lat = s?.lat;
        const lng = s?.lng;
        return lat == null || lng == null || lat === 0 || lng === 0;
      });

      setStatus(`Found ${missing.length} schools missing coordinates (of ${allSchools.length} total). Geocoding...`);

      let done = 0;
      let failed = 0;
      let skipped = 0;

      for (const school of missing) {
        if (stopRef.current) {
          setStatus(`Stopped. ${done} geocoded, ${failed} failed, ${skipped} skipped of ${missing.length} total.`);
          setResults({ done, failed, skipped, total: missing.length, stopped: true });
          return;
        }

        const city = school?.city || null;
        const state = school?.state || null;

        if (!city && !state) {
          skipped++;
          continue;
        }

        // Rate limit: 1100ms — Nominatim requires max 1 req/sec per usage policy
        await sleep(1100);

        // Check again after the sleep in case stop was clicked during the wait
        if (stopRef.current) {
          setStatus(`Stopped. ${done} geocoded, ${failed} failed, ${skipped} skipped of ${missing.length} total.`);
          setResults({ done, failed, skipped, total: missing.length, stopped: true });
          return;
        }

        const coords = await geocodeCity(city, state);
        if (coords) {
          await School.update(school.id, { lat: coords.lat, lng: coords.lng });
          done++;
        } else {
          failed++;
          console.warn(`Geocode failed: ${city}, ${state} (${school.school_name})`);
        }

        if ((done + failed + skipped) % 10 === 0 || done + failed + skipped === missing.length) {
          setStatus(`Progress: ${done} geocoded, ${failed} failed, ${skipped} skipped of ${missing.length}`);
        }
      }

      setResults({ done, failed, skipped, total: missing.length, stopped: false });
      setStatus(`Complete: ${done} geocoded, ${failed} failed, ${skipped} skipped.`);
    } catch (err) {
      setStatus(`Error: ${err?.message || err}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <AdminRoute>
      <div style={{ background: "#F3F4F6", minHeight: "100vh", padding: "28px 32px", fontFamily: "Inter, system-ui, sans-serif" }}>
        <button onClick={() => nav("/AdminOps")} style={{ background: "none", border: "none", color: "#e8a020", cursor: "pointer", fontSize: 14, marginBottom: 16 }}>← Back to Admin</button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0B1F3B", marginBottom: 8 }}>Geocode Missing Schools</h1>
        <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
          Backfill lat/lng coordinates on School records using Nominatim (OpenStreetMap). Schools with existing coordinates are skipped.
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button
            onClick={run}
            disabled={running}
            style={{
              background: running ? "#6B7280" : "#0B1F3B",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 700,
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "Geocoding..." : "Start Geocoding"}
          </button>

          {running && (
            <button
              onClick={stop}
              style={{
                background: "#DC2626",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Stop
            </button>
          )}
        </div>

        {status && (
          <div style={{
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            fontSize: 14,
            color: "#111827",
          }}>
            {status}
          </div>
        )}

        {results && (
          <div style={{
            background: results.stopped ? "#FFFBEB" : results.done > 0 ? "#ECFDF5" : "#FEF2F2",
            border: `1px solid ${results.stopped ? "#D97706" : results.done > 0 ? "#059669" : "#DC2626"}`,
            borderRadius: 8,
            padding: 16,
            fontSize: 14,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{results.stopped ? "Stopped Early" : "Results"}</div>
            <div>✅ Geocoded: {results.done}</div>
            <div>❌ Failed: {results.failed}</div>
            <div>⏭ Skipped (no city/state): {results.skipped}</div>
            <div style={{ marginTop: 8, color: "#6B7280" }}>Total processed: {results.done + results.failed + results.skipped} of {results.total}</div>
            {results.stopped && (
              <div style={{ marginTop: 8, color: "#D97706" }}>Run again to resume — already-geocoded schools will be skipped.</div>
            )}
          </div>
        )}
      </div>
    </AdminRoute>
  );
}
