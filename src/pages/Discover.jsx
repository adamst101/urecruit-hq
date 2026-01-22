// src/pages/Discover.jsx (DISCOVER v1: Gate + Simple Camp List)
import React, { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = String(sp.get("mode") || "").toLowerCase();
    const season = sp.get("season");
    const debug = sp.get("debug") === "1";
    return {
      forceDemo: mode === "demo",
      requestedSeason: season && Number.isFinite(Number(season)) ? Number(season) : null,
      debug
    };
  } catch {
    return { forceDemo: false, requestedSeason: null, debug: false };
  }
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export default function Discover() {
  const loc = useLocation();
  const season = useSeasonAccess();

  const { forceDemo, requestedSeason, debug } = useMemo(
    () => getUrlParams(loc.search),
    [loc.search]
  );

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // Determine seasonYear to query
  const seasonYear = useMemo(() => {
    // Explicit demo can request any season (for testing)
    if (forceDemo) return requestedSeason || season.demoYear || season.seasonYear;

    // If a season is requested, use it (gating will enforce auth/entitlement)
    if (requestedSeason) return requestedSeason;

    // Default: demo year when anonymous; paid year when entitled; whatever hook resolved
    return season.seasonYear || season.demoYear;
  }, [forceDemo, requestedSeason, season.demoYear, season.seasonYear]);

  // HARD GATE for non-demo season requests
  useEffect(() => {
    if (season?.isLoading) return;

    const demoYear = season?.demoYear;

    if (forceDemo) return;
    if (!requestedSeason) return;
    if (demoYear && String(requestedSeason) === String(demoYear)) return;

    if (!season?.accountId) {
      const target = createPageUrl("Home") + `?signin=1&next=${nextParam}`;
      window.location.replace(target);
      return;
    }

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

  const effectiveMode = useMemo(() => {
    if (forceDemo) return "demo";
    return season?.mode === "paid" ? "paid" : "demo";
  }, [forceDemo, season?.mode]);

  // Query camps (no dependencies)
  const campsQuery = base44.useQuery(
    `discover_v1_${effectiveMode}_${seasonYear}`,
    async () => {
      const rows = await base44.entities.CampExpanded.filter({ season_year: seasonYear });
      return asArray(rows);
    },
    {
      enabled: !season?.isLoading && !!seasonYear && (effectiveMode === "demo" || effectiveMode === "paid")
    }
  );

  const loading = season?.isLoading || campsQuery.isLoading;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Discover</h1>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {effectiveMode === "paid" ? "Paid workspace" : `Demo season: ${seasonYear}`}
          </div>
        </div>

        {debug ? (
          <button
            onClick={() => {
              try { window.base44?.auth?.logout?.(); } catch {}
              try { localStorage.clear(); sessionStorage.clear(); } catch {}
              window.location.reload();
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              fontSize: 12
            }}
          >
            Debug: Logout + Clear
          </button>
        ) : null}
      </div>

      {/* Truth banner */}
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "white", fontSize: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
          <span><b>URL:</b> {currentPath}</span>
          <span><b>effectiveMode:</b> {effectiveMode}</span>
          <span><b>seasonYear:</b> {String(seasonYear)}</span>
          <span><b>accountId:</b> {season?.accountId ? String(season.accountId) : "null"}</span>
          <span><b>entitled:</b> {String(!!season?.entitlement)}</span>
          <span><b>forceDemo(url):</b> {String(forceDemo)}</span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading camps…</div>
        ) : campsQuery.isError ? (
          <div style={{ color: "#b91c1c" }}>
            Error loading camps: {String(campsQuery.error?.message || campsQuery.error || "unknown")}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Camps returned: <b>{asArray(campsQuery.data).length}</b>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {asArray(campsQuery.data).slice(0, 50).map((r, idx) => {
                const name = r?.camp_name || r?.name || "Camp";
                const school = r?.school_name || "";
                const div = r?.division || "";
                const start = r?.start_date || "";
                const end = r?.end_date || "";
                const city = r?.school_city || "";
                const state = r?.school_state || "";
                const cost = r?.cost != null ? `$${r.cost}` : "";

                return (
                  <div key={String(r?.id || r?.camp_id || idx)} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#374151" }}>
                      <b>{school}</b> {div ? `• ${div}` : ""}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      {start || end ? `${start}${end ? ` → ${end}` : ""}` : ""}{" "}
                      {(city || state) ? `• ${city}${city && state ? ", " : ""}${state}` : ""}
                      {cost ? ` • ${cost}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
