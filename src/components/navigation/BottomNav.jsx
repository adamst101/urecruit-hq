// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Compass, Lock, User } from "lucide-react";

import { cn } from "../../lib/utils";
import { createPageUrl } from "../../utils";
import { useAccessContext } from "../hooks/useAccessContext";

/**
 * BottomNav (final)
 * - Paid: Discover, Calendar, MyCamps, Profile
 * - Demo: Discover, Calendar, Upgrade
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const access = useAccessContext();

  const items = useMemo(() => {
    if (access.isPaid) {
      return [
        { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
        { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
        { key: "MyCamps", label: "MyCamps", icon: Lock, to: createPageUrl("MyCamps") },
        { key: "Profile", label: "Profile", icon: User, to: createPageUrl("Profile") },
      ];
    }

    const upgradeUrl =
      createPageUrl("Subscribe") +
      `?source=bottom_nav_upgrade&next=${encodeURIComponent(createPageUrl("Discover"))}`;

    return [
      { key: "Discover", label: "Discover", icon: Compass, to: createPageUrl("Discover") },
      { key: "Calendar", label: "Calendar", icon: CalendarDays, to: createPageUrl("Calendar") },
      { key: "Upgrade", label: "Upgrade", icon: Lock, to: upgradeUrl },
    ];
  }, [access.isPaid]);

  const pathname = location?.pathname || "";
  const isActive = (to) => String(to || "").split("?")[0] === pathname;

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
