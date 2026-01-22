// src/pages/AdminBackfill.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { createPageUrl } from "../utils";

function computeSeasonYearFromDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1 UTC
  return d >= feb1 ? y : y - 1;
}

export default function AdminBackfill() {
  const season = useSeasonAccess();
  const [log, setLog] = useState([]);
  const [working, setWorking] = useState(false);

  const canRun = useMemo(() => !!season?.accountId && !season?.isLoading, [season?.accountId, season?.isLoading]);

  const push = (m) => setLog((x) => [...x, m]);

  const run = async () => {
    setWorking(true);
    setLog([]);
    try {
      push("Loading Events missing season_year…");

      // Try the common "blank" patterns
      const candidates = [];
      try {
        const a = await base44.entities.Event.filter({ season_year: null });
        candidates.push(...(Array.isArray(a) ? a : []));
      } catch {}
      try {
        const b = await base44.entities.Event.filter({ season_year: "" });
        candidates.push(...(Array.isArray(b) ? b : []));
      } catch {}

      // If filters above don't work, fallback: pull a chunk and compute missing.
      let rows = candidates;
      if (!rows.length) {
        const all = await base44.entities.Event.filter({}, "-start_date", 5000);
        rows = (Array.isArray(all) ? all : []).filter((r) => r?.season_year == null || r?.season_year === "");
      }

      push(`Found ${rows.length} Events to backfill`);

      let updated = 0;
      for (const r of rows) {
        const start = r?.start_date || r?.start || r?.date || r?.starts_at;
        const sy = computeSeasonYearFromDate(start);
        if (!sy) continue;

        try {
          await base44.entities.Event.update(r.id, { season_year: sy });
          updated += 1;
        } catch (e) {
          push(`Update failed for Event ${r?.id}: ${String(e?.message || e)}`);
        }
      }

      push(`✅ Updated ${updated} Events with season_year`);
      push("Now go test /Discover?season=2026");
    } catch (e) {
      push(`❌ Backfill failed: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  if (!canRun) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <h2>Admin Backfill</h2>
        <div>Please sign in first.</div>
        <div style={{ marginTop: 10 }}>
          Go to {createPageUrl("Home")} and log in.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h2>Admin Backfill: Event.season_year</h2>
      <button
        onClick={run}
        disabled={working}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: working ? "#9ca3af" : "#111827",
          color: "white",
          cursor: working ? "not-allowed" : "pointer",
        }}
      >
        {working ? "Working…" : "Run Backfill"}
      </button>

      <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}