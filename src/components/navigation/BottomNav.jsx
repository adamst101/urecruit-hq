// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Compass, Lock, User } from "lucide-react";

import { cn } from "../../lib/utils";
import { createPageUrl } from "../../utils";

import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { readDemoMode, getDemoDefaults } from "../hooks/demoMode.jsx";

/**
 * BottomNav (canonical)
 * - MUST respect demo override via:
 *    1) URL: ?mode=demo (& optional season=YYYY)
 *    2) localStorage demoMode (readDemoMode)
 * - MUST preserve demo params on navigation so users don't "fall back" into paid flows.
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const season = useSeasonAccess();

  const { effectiveMode, demoSeasonYear } = useMemo(() => {
    // 1) URL override
    let urlMode = null;
    let urlSeason = null;
    try {
      const sp = new URLSearchParams(location.search || "");
      urlMode = sp.get("mode");
      urlSeason = sp.get("season");
    } catch {}

    const urlForcesDemo = String(urlMode || "").toLowerCase() === "demo";

    // 2) local demo flag
    const local = readDemoMode();
    const defaults = getDemoDefaults();

    const localForcesDemo = local?.mode === "demo";

    const parsed = Number(urlSeason);
    const urlYear = Number.isFinite(parsed) ? parsed : null;

    const resolvedDemoYear =
      urlYear ||
      (Number.isFinite(Number(local?.seasonYear)) ? Number(local.seasonYear) : null) ||
      (Number.isFinite(Number(defaults?.demoSeasonYear)) ? Number(defaults.demoSeasonYear) : null) ||
      season.demoYear;

    const mode = urlForcesDemo || localForcesDemo ? "demo" : season.mode === "paid" ? "paid" : "demo";

    return { effectiveMode: mode, demoSeasonYear: resolvedDemoYear };
  }, [location.search, season.mode, season.demoYear]);

  const isDemo = effectiveMode === "demo";

  const withDemoParams = (url) => {
    if (!isDemo) return url;
    const base = String(url || "");
    const hasQ = base.includes("?");
    const join = hasQ ? "&" : "?";
    return `${base}${join}mode=demo&season=${encodeURIComponent(String(demoSeasonYear))}`;
  };

  const items = useMemo(() => {
    // Keep "next" pointing back to the current route (including demo params if present)
    const current = (location?.pathname || "") + (location?.search || "");
    const next = encodeURIComponent(current || createPageUrl("Discover"));

    if (!isDemo && season.mode === "paid") {
      return [
        { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
        { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
        { key: "MyCamps", label: "MyCamps", icon: Lock, to: createPageUrl("MyCamps") },
        { key: "Profile", label: "Profile", icon: User, to: createPageUrl("Profile") },
      ];
    }

    // Demo mode: never show MyCamps (paid workspace)
    return [
      { key: "Discover", label: "Discover", icon: Compass, to: withDemoParams(createPageUrl("Discover")) },
      { key: "Calendar", label: "Calendar", icon: CalendarDays, to: withDemoParams(createPageUrl("Calendar")) },
      {
        key: "Upgrade",
        label: "Upgrade",
        icon: Lock,
        to: createPageUrl("Subscribe") + `?source=bottom_nav_upgrade&next=${next}`,
      },
    ];
  }, [isDemo, season.mode, location?.pathname, location?.search, demoSeasonYear]);

  const pathname = location?.pathname || "";

  const isActive = (to) => {
    const cleanTo = String(to || "").split("?")[0];
    return pathname === cleanTo;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-md mx-auto bg-white border-t border-slate-200">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.to)}
                className={cn(
                  "py-3 flex flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-deep-navy" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Icon className={cn("w-5 h-5", active && "text-deep-navy")} />
                <span className={cn("text-xs font-medium", active && "text-deep-navy")}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
