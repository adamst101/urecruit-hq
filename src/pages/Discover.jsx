// src/pages/Discover.jsx (STABLE: Gate + Probe Entity + Safe Fetch)
import React, { useEffect, useMemo, useState } from "react";
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

function safeMsg(e) {
  return String(e?.message || e || "unknown");
}

/**
 * Because Base44 entities can’t be enumerated reliably, we probe likely names.
 * Add/remove candidates as needed.
 */
const ENTITY_CANDIDATES = [
  "Camp",
  "Camps",
  "CampEvent",
  "CampEvents",
  "CampListing",
  "CampListings",
  "Event",
  "Events"
];

async function probeEntityName(client) {
  for (const name of ENTITY_CANDIDATES) {
    const ent = client?.entities?.[name];
    if (!ent?.filter) continue;

    // Try the lightest possible call to confirm it exists
    try {
      await ent.filter({}, undefined, 1);
      return name;
    } catch {
      // Some entities require specific filters; still counts as “exists”.
      // We’ll treat “filter exists but query failed” as usable.
      return name;
    }
  }
  return null;
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

  // Choose season year
  const seasonYear = useMemo(() => {
    if (forceDemo) return requestedSeason || season?.demoYear || season?.seasonYear;
    if (requestedSeason) return requestedSeason;
    return season?.seasonYear || season?.demoYear;
  }, [forceDemo, requestedSeason, season?.demoYear, season?.seasonYear]);

  const effectiveMode = useMemo(() => {
    if (forceDemo) return "demo";
    return season?.mode === "paid" ? "paid" : "demo";
  }, [forceDemo, season?.mode]);

  // Hard gate: non-demo season requires auth + entitlement
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

  // Debug “logout” button for testing
  useEffect(() => {
    if (!debug) return;
    // Optionally expose the imported client for console testing
    try {
      window.base44 = base44;
    } catch {}
  }, [debug]);

  // Data loading (safe, no base44.useQuery)
  const [entityName, setEntityName] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr("");
      setRows([]);

      try {
        if (season?.isLoading) return;
        if (!seasonYear) throw new Error("No seasonYear resolved.");

        // If anon and requesting non-demo season, gate will redirect; avoid work
        if (!forceDemo && requestedSeason && !season?.accountId) return;

        const name = await probeEntityName(base44);
        if (!name) {
          throw new Error(
            `No known camp entity found. Tried: ${ENTITY_CANDIDATES.join(", ")}`
          );
        }

        if (!alive) return;
        setEntityName(name);

        const ent = base44.entities[name];

        // Try filtering by season_year first; if that field doesn’t exist, fallback to unfiltered.
        let data;
        try {
          data = await ent.filter({ season_year: seasonYear });
        } catch {
          data = await ent.filter({});
        }

        if (!alive) return;
        setRows(asArray(data));
      } catch (e) {
        if (!alive) return;
        setErr(safeMsg(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [season?.isLoading, season?.accountId, forceDemo, requestedSeason, seasonYear]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Discover</h1>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {effectiveMode === "paid" ? "Paid workspace" : `Demo season: ${seasonYear || ""}`}
          </div>
        </div>

        {debug ? (
          <button
            onClick={() => {
              try { base44?.auth?.logout?.(); } catch {}
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

      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "white", fontSize: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
          <span><b>URL:</b> {currentPath}</span>
          <span><b>effectiveMode:</b> {effectiveMode}</span>
          <span><b>seasonYear:</b> {String(seasonYear ?? "null")}</span>
          <span><b>accountId:</b> {season?.accountId ? String(season.accountId) : "null"}</span>
          <span><b>entitled:</b> {String(!!season?.entitlement)}</span>
          <span><b>requestedSeason:</b> {String(requestedSeason ?? "null")}</span>
          <span><b>entity:</b> {entityName || "(probing…)"}</span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading…</div>
        ) : err ? (
          <div style={{ color: "#b91c1c" }}>Error loading camps: {err}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Rows returned: <b>{rows.length}</b> (entity: <b>{entityName}</b>)
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {rows.slice(0, 20).map((r, idx) => (
                <div key={String(r?.id || idx)} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>
                    {JSON.stringify(r, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
