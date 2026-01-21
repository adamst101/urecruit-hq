// src/pages/Discover.jsx (SAFE MODE - diagnostic)
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
  const nav = useNavigate();
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

  // Season-aware gate (same logic you want for MVP)
  useEffect(() => {
    if (season?.isLoading) return;

    const demoYear = season?.demoYear;

    // Explicit demo always wins
    if (forceDemo) return;

    // No season requested → allow
    if (!requestedSeason) return;

    // Requesting demoYear is allowed
    if (demoYear && String(requestedSeason) === String(demoYear)) return;

    // Non-demo season requested → gate
    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    if (!season?.hasAccess) {
      nav(
        createPageUrl("Subscribe") +
          `?season=${encodeURIComponent(requestedSeason)}` +
          `&source=${encodeURIComponent("discover_season_gate")}` +
          `&next=${nextParam}`,
        { replace: true }
      );
    }
  }, [
    season?.isLoading,
    season?.accountId,
    season?.hasAccess,
    season?.demoYear,
    forceDemo,
    requestedSeason,
    nextParam,
    nav
  ]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Discover (Safe Mode)</h1>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 12,
          background: "white",
          marginBottom: 12,
          fontSize: 12
        }}
      >
        <div><b>URL:</b> {currentPath}</div>
        <div><b>forceDemo(url):</b> {String(forceDemo)}</div>
        <div><b>requestedSeason:</b> {String(requestedSeason ?? "null")}</div>
        <div style={{ marginTop: 8 }}>
          <b>useSeasonAccess():</b>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
            {JSON.stringify(season, null, 2)}
          </pre>
        </div>
      </div>

      <div style={{ fontSize: 14, color: "#374151" }}>
        If you can see this page, Discover is rendering and the blank-page issue is caused by one of the removed imports
        (BottomNav / FilterSheet / CampCard / queries / filters).
      </div>
    </div>
  );
}

