// src/pages/Discover.jsx (GATE-ONLY / STABLE)
import React, { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { createPageUrl } from "../utils";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = String(sp.get("mode") || "").toLowerCase();
    const season = sp.get("season");
    return {
      forceDemo: mode === "demo",
      requestedSeason: season && Number.isFinite(Number(season)) ? Number(season) : null
    };
  } catch {
    return { forceDemo: false, requestedSeason: null };
  }
}

export default function Discover() {
  const loc = useLocation();
  const season = useSeasonAccess();

  const { forceDemo, requestedSeason } = useMemo(
    () => getUrlParams(loc.search),
    [loc.search]
  );

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // HARD GATE (Base44-safe): Never show demo data for a non-demo season request.
  useEffect(() => {
    if (season?.isLoading) return;

    const demoYear = season?.demoYear;

    // Explicit demo override (URL only) always allowed
    if (forceDemo) return;

    // If no specific season requested, allow normal /Discover behavior
    if (!requestedSeason) return;

    // Requesting demo year is allowed without auth
    if (demoYear && String(requestedSeason) === String(demoYear)) return;

    // Non-demo season requested -> require auth
    if (!season?.accountId) {
      const target = createPageUrl("Home") + `?signin=1&next=${nextParam}`;
      window.location.replace(target);
      return;
    }

    // Authed but not entitled -> subscribe for that season
    if (!season?.hasAccess) {
      const target =
        createPageUrl("Subscribe") +
        `?season=${encodeURIComponent(requestedSeason)}` +
        `&source=${encodeURIComponent("discover_season_gate")}` +
        `&next=${nextParam}`;

      window.location.replace(target);
      return;
    }
  }, [
    season?.isLoading,
    season?.accountId,
    season?.hasAccess,
    season?.demoYear,
    forceDemo,
    requestedSeason,
    nextParam
  ]);

  // Render something simple and guaranteed (prevents “white screen with no clues”)
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Discover</h1>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 12,
          background: "white",
          fontSize: 12
        }}
      >
        <div><b>URL:</b> {currentPath}</div>
        <div><b>forceDemo(url):</b> {String(forceDemo)}</div>
        <div><b>requestedSeason:</b> {String(requestedSeason ?? "null")}</div>

        <div style={{ marginTop: 10 }}>
          <b>useSeasonAccess():</b>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
            {JSON.stringify(season, null, 2)}
          </pre>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
        This is the stable “gate-only” Discover. Once this works reliably (no blank page),
        we’ll re-add the camp list + filters one dependency at a time.
      </div>
    </div>
  );
}
