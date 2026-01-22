// src/pages/Discover.jsx (STABLE: Gate + Safe Fetch, no base44.useQuery)
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { createPageUrl } from "../utils";
import { base44 as importedBase44 } from "../api/base44Client";
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

function safeString(x) {
  try {
    return typeof x === "string" ? x : JSON.stringify(x);
  } catch {
    return String(x);
  }
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

  // Choose which season to query
  const seasonYear = useMemo(() => {
    // Explicit demo can request any season (for testing)
    if (forceDemo) return requestedSeason || season?.demoYear || season?.seasonYear;

    // If a season is requested, use it (gate will enforce auth/entitlement)
    if (requestedSeason) return requestedSeason;

    // Default: whatever hook resolved
    return season?.seasonYear || season?.demoYear;
  }, [forceDemo, requestedSeason, season?.demoYear, season?.seasonYear]);

  const effectiveMode = useMemo(() => {
    if (forceDemo) return "demo";
    return season?.mode === "paid" ? "paid" : "demo";
  }, [forceDemo, season?.mode]);

  // ---- HARD GATE (Base44-safe) ----
  useEffect(() => {
    if (season?.isLoading) return;

    const demoYear = season?.demoYear;

    // explicit demo override wins
    if (forceDemo) return;

    // no season requested -> allow normal /Discover behavior
    if (!requestedSeason) return;

    // demo year allowed without auth
    if (demoYear && String(requestedSeason) === String(demoYear)) return;

    // non-demo season requested -> require auth
    if (!season?.accountId) {
      const target = createPageUrl("Home") + `?signin=1&next=${nextParam}`;
      window.location.replace(target);
      return;
    }

    // authed but not entitled -> subscribe for that season
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

  // ---- SAFE ERROR CAPTURE (so no more silent white pages) ----
  const [fatal, setFatal] = useState("");
  useEffect(() => {
    const onErr = (msg, src, line, col, err) => {
      const e = err ? (err.stack || err.message || safeString(err)) : "";
      setFatal(`window.onerror: ${safeString(msg)}\n${e}`);
      return false;
    };
    const onRej = (ev) => {
      const r = ev?.reason;
      const e = r ? (r.stack || r.message || safeString(r)) : "";
      setFatal(`unhandledrejection: ${e || safeString(r)}`);
    };

    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  // ---- LOAD CAMPS (NO base44.useQuery) ----
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr("");

      try {
        // Don’t fetch until the season hook resolves
        if (season?.isLoading) return;

        // If we’re requesting a non-demo season and we’re anon, the gate will redirect.
        // Avoid doing work in that window.
        if (!forceDemo && requestedSeason && !season?.accountId) return;

        // If seasonYear missing, stop
        if (!seasonYear) {
          if (alive) {
            setRows([]);
            setLoading(false);
          }
          return;
        }

        const client = importedBase44 || window.base44;
        if (!client || !client.entities || !client.entities.CampExpanded) {
          throw new Error("CampExpanded entity not available (client/entities missing).");
        }

        const data = await client.entities.CampExpanded.filter({ season_year: seasonYear });

        if (!alive) return;
        setRows(asArray(data));
      } catch (e) {
        if (!alive) return;
        setErr(String(e?.message || e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [
    season?.isLoading,
    season?.accountId,
    forceDemo,
    requestedSeason,
    seasonYear
  ]);

  // ---- UI ----
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
          <span><b>seasonYear:</b> {String(seasonYear ?? "null")}</span>
          <span><b>accountId:</b> {season?.accountId ? String(season.accountId) : "null"}</span>
          <span><b>entitled:</b> {String(!!season?.entitlement)}</span>
          <span><b>forceDemo(url):</b> {String(forceDemo)}</span>
          <span><b>requestedSeason:</b> {String(requestedSeason ?? "null")}</span>
        </div>
      </div>

      {/* Fatal crash capture */}
      {fatal ? (
        <div style={{ marginTop: 12, border: "1px solid #fecaca", background: "#fff1f2", color: "#9f1239", borderRadius: 8, padding: 10, fontSize: 12 }}>
          <b>Captured fatal error</b>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{fatal}</pre>
        </div>
      ) : null}

      {/* Data */}
      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading camps…</div>
        ) : err ? (
          <div style={{ color: "#b91c1c" }}>
            Error loading camps: {err}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Camps returned: <b>{rows.length}</b>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {rows.slice(0, 50).map((r, idx) => {
                const key = String(r?.id || r?.camp_id || idx);
                const name = r?.camp_name || r?.name || "Camp";
                const school = r?.school_name || "";
                const div = r?.division || "";
                const start = r?.start_date || "";
                const end = r?.end_date || "";
                const city = r?.school_city || "";
                const state = r?.school_state || "";
                const cost = r?.cost != null ? `$${r.cost}` : "";

                return (
                  <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
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
