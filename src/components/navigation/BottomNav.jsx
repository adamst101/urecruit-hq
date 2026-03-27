// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, CalendarDays, User, LayoutGrid, Heart } from "lucide-react";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

const ROUTES = {
  Workspace: "/Workspace",
  CoachDashboard: "/CoachDashboard",
  Discover: "/Discover",
  Calendar: "/Calendar",
  MyCamps: "/MyCamps",
  Profile: "/Profile",
};

function isActivePath(pathname, target) {
  if (!pathname) return false;
  if (pathname === target) return true;
  return pathname.startsWith(target + "/");
}

export default function BottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const season = useSeasonAccess();
  const isCoach = season?.mode === "coach" || season?.mode === "coach_pending";

  const hqRoute = isCoach ? ROUTES.CoachDashboard : ROUTES.Workspace;

  const items = useMemo(
    () => [
      { label: "HQ", to: hqRoute, Icon: LayoutGrid },
      { label: "Discover", to: ROUTES.Discover, Icon: Search },
      { label: "Calendar", to: ROUTES.Calendar, Icon: CalendarDays },
      { label: "My Camps", to: ROUTES.MyCamps, Icon: Heart },
      { label: "Profile", to: ROUTES.Profile, Icon: User },
    ],
    [hqRoute]
  );

  function handleNav(to) {
    // Don't re-navigate if already on the target route
    if (isActivePath(loc.pathname, to)) return;
    nav(to);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0e1a] border-t border-[#1f2937]">
      <div className="max-w-5xl mx-auto px-4">
        <div className="h-16 flex items-center justify-around">
          {items.map(({ label, to, Icon }) => {
            const active = isActivePath(loc.pathname, to);
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleNav(to)}
                className={`flex flex-col items-center justify-center gap-1 text-xs px-3 py-2 rounded-lg ${
                  active ? "text-[#e8a020]" : "text-[#9ca3af]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}