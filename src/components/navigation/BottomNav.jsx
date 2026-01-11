// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Compass, Lock, User } from "lucide-react";

import { cn } from "../../lib/utils";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { readDemoMode } from "../hooks/demoMode.jsx";

/**
 * BottomNav
 * - Paid users: Discover, Calendar, MyCamps, Profile
 * - Demo users: Discover, Calendar, Upgrade (Subscribe)
 *
 * Critical behavior:
 * - If user is in demo (URL ?mode=demo OR local demoMode), preserve demo query params
 *   on all demo navigation so the app doesn't snap back to paid behavior.
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const season = useSeasonAccess();

  const { effectiveMode, demoSeasonYear, demoQuery } = useMemo(() => {
    let urlMode = null;
    let urlSeason = null;

    try {
      const sp = new URLSearchParams(location?.search || "");
      urlMode = sp.get("mode");
      const s = sp.get("season");
      urlSeason = s && Number.isFinite(Number(s)) ? Number(s) : null;
    } catch {}

    const local = readDemoMode(); // { mode, seasonYear }
    const localIsDemo = local?.mode === "demo";
    const localSeason =
      local && Number.isFinite(Number(local.seasonYear))
        ? Number(local.seasonYear)
        : null;

    // Demo wins if URL says demo OR local storage says demo
    const isDemo = urlMode === "demo" || localIsDemo;

    const resolvedDemoSeason =
      urlSeason || localSeason || season?.demoYear || new Date().getFullYear() - 1;

    const q = isDemo
      ? `?mode=demo&season=${encodeURIComponent(String(resolvedDemoSeason))}`
      : "";

    return {
      effectiveMode: isDemo ? "demo" : season?.mode === "paid" ? "paid" : "demo",
      demoSeasonYear: resolvedDemoSeason,
      demoQuery: q
    };
  }, [location?.search, season?.mode, season?.demoYear]);

  const items = useMemo(() => {
    if (effectiveMode === "paid") {
      return [
        { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
        { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
        { key: "MyCamps", label: "MyCamps", icon: Lock, to: createPageUrl("MyCamps") },
        { key: "Profile", label: "Profile", icon: User, to: createPageUrl("Profile") }
      ];
    }

    // Demo mode: preserve demo query string everywhere
    const discover = createPageUrl("Discover") + demoQuery;
    const calendar = createPageUrl("Calendar") + demoQuery;

    // Upgrade returns user back into demo Discover context (keeps season)
    const upgradeUrl =
      createPageUrl("Subscribe") +
      `?source=bottom_nav_upgrade&next=${encodeURIComponent(discover)}&demo_season=${encodeURIComponent(
        String(demoSeasonYear)
      )}`;

    return [
      { key: "Discover", label: "Discover", icon: Compass, to: discover },
      { key: "Calendar", label: "Calendar", icon: CalendarDays, to: calendar },
      { key: "Upgrade", label: "Upgrade", icon: Lock, to: upgradeUrl }
    ];
  }, [effectiveMode, demoQuery, demoSeasonYear]);

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
