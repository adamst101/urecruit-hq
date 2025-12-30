import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Compass, Lock, User } from "lucide-react";

import { cn } from "../../lib/utils";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";

/**
 * BottomNav
 * - Paid users: Discover, Calendar, MyCamps, Profile
 * - Demo users: Discover, Calendar, Upgrade
 *
 * Goal: prevent demo users from navigating to pages that require identity/camp intents (MyCamps).
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useSeasonAccess();

  const items = useMemo(() => {
    if (mode === "paid") {
      return [
        { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
        { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
        { key: "MyCamps", label: "MyCamps", icon: Lock, to: createPageUrl("MyCamps") },
        { key: "Profile", label: "Profile", icon: User, to: createPageUrl("Profile") }
      ];
    }

    // Demo mode
    return [
      { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
      { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
      { key: "Onboarding", label: "Upgrade", icon: Lock, to: createPageUrl("Onboarding") }
    ];
  }, [mode]);

  const pathname = location?.pathname || "";

  const isActive = (to) => {
    // Base44 convention routes look like "/Discover", "/Calendar", etc.
    // We treat exact match as active.
    // Also handle query params by splitting at "?"
    const cleanTo = String(to || "").split("?")[0];
    return pathname === cleanTo;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-md mx-auto bg-white border-t border-slate-200">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);

            return (
              <button
                key={item.key}
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
