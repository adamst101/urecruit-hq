// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Compass, Lock, User } from "lucide-react";

import { cn } from "../../lib/utils";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { readDemoMode } from "../hooks/demoMode";

/**
 * BottomNav
 * - Paid users: Discover, Calendar, MyCamps, Profile
 * - Demo users: Discover, Calendar, Upgrade (Subscribe)
 *
 * IMPORTANT:
 * - Honor demo override via URL ?mode=demo
 * - Honor local demo mode stored by setDemoMode/readDemoMode
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const season = useSeasonAccess();

  // URL override: ?mode=demo always wins
  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(location?.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [location?.search]);

  // Local demo mode
  const localDemo = useMemo(() => readDemoMode(), []);

  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const items = useMemo(() => {
    if (effectiveMode === "paid") {
      return [
        { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
        { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
        { key: "MyCamps", label: "MyCamps", icon: Lock, to: createPageUrl("MyCamps") },
        { key: "Profile", label: "Profile", icon: User, to: createPageUrl("Profile") },
      ];
    }

    // Demo mode: Upgrade goes to Subscribe and carries user back to Discover
    const upgradeUrl =
      createPageUrl("Subscribe") +
      `?source=bottom_nav_upgrade&next=${encodeURIComponent(createPageUrl("Discover"))}`;

    return [
      { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
      { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
      { key: "Upgrade", label: "Upgrade", icon: Lock, to: upgradeUrl },
    ];
  }, [effectiveMode]);

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
