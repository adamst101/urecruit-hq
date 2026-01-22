// src/pages/AdminBackfillCamps.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Football rule: Feb 1 rollover (UTC)
function computeSeasonYearFootballFromISODate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1 UTC
  return d >= feb1 ? y : y - 1;
}

// Simple stable hash without crypto (good enough for change detection MVP)
function simpleHash(input) {
  const str = String(input || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}

export default function AdminBackfillCamps() {
  const season = useSeasonAccess();
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState([]);

  const canRun = useMemo(() => !!season?.accountId && !season?.isLoading, [season?.accountId, season?.isLoading]);
  const push = (m) => setLog((x) => [...x, m]);

  const run = async () => {
    setWorking(true);
    setLog([]);

    try {
      push("Loading camps…");
      const all = await base44.entities.Camp.filter({}, "-start_date", 5000);
      const rows = Array.isArray(all) ? all : [];
      push(`Found ${rows.length} camps`);

      let updated = 0;
      let skipped = 0;

      for (const c of rows) {
        const id = c?.id;
        if (!id) { skipped++; continue; }

        const schoolId = c?.school_id || "";
        const sportId = c?.sport_id || "";
        const name = c?.camp_name || "camp";
        const startDate = c?.start_date || null;
        const endDate = c?.end_date || null;
        const linkUrl = c?.link_url || "";
        const sourceUrl = c?.source_url || linkUrl || "";
        const sourcePlatform = c?.source_platform || "seed";

        // For now: only football rule is defined.
        // If this camp is football, compute season_year; otherwise leave null (or set default).
        // If you want a default now, set `const seasonYear = computeSeasonYearFootballFromISODate(startDate);`
        const seasonYear = computeSeasonYearFootballFromISODate(startDate);

        // Program_id for seeded rows (deterministic)
        const programId = c?.program_id || `seed:${schoolId}:${slugify(name)}`;

        // Occurrence key (unique per occurrence)
        const eventKey =
          c?.event_key ||
          `${sourcePlatform}:${programId}:${startDate || "na"}:${linkUrl || sourceUrl || "na"}`;

        const lastSeenAt = new Date().toISOString();

        // Hash stable fields that matter for change detection
        const hashInput = JSON.stringify({
          schoolId,
          sportId,
          name,
          startDate,
          endDate,
          linkUrl,
          city: c?.city || "",
          state: c?.state || "",
          positions: c?.position_ids || [],
          price: c?.price ?? null,
          notes: c?.notes || ""
        });
        const contentHash = c?.content_hash || simpleHash(hashInput);

        // Only update if missing anything important
        const patch = {};
        if (!c?.program_id) patch.program_id = programId;
        if (!c?.event_key) patch.event_key = eventKey;
        if (!c?.source_platform) patch.source_platform = sourcePlatform;
        if (!c?.source_url) patch.source_url = sourceUrl;
        if (!c?.last_seen_at) patch.last_seen_at = lastSeenAt;
        if (!c?.content_hash) patch.content_hash = contentHash;

        // Only set season_year if missing
        if (c?.season_year == null && seasonYear != null) patch.season_year = seasonYear;

        const needsUpdate = Object.keys(patch).length > 0;
        if (!needsUpdate) { skipped++; continue; }

        try {
          await base44.entities.Camp.update(id, patch);
          updated += 1;
        } catch (e) {
          push(`Update failed for Camp ${id}: ${String(e?.message || e)}`);
        }
      }

      push(`✅ Updated ${updated} camps`);
      push(`↩️ Skipped ${skipped} camps (already complete)`);
      push("Now test: /Discover?season=2026 (logged out) should gate; demo should show 2025.");
    } catch (e) {
      push(`❌ Backfill failed: ${String(e?.message || e)}`);
    } finally {
      setWorking(false);
    }
  };

  if (!canRun) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <h2>Admin Backfill Camps</h2>
        <div>Please sign in first.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h2>Admin Backfill: Camp Occurrences</h2>
      <button
        onClick={run}
        disabled={working}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: working ? "#9ca3af" : "#111827",
          color: "white",
          cursor: working ? "not-allowed" : "pointer"
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
