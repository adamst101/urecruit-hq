// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, CalendarDays, User, LayoutGrid, Heart, UserPlus } from "lucide-react";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

const ROUTES = {
  Workspace: "/Workspace",
  CoachDashboard: "/CoachDashboard",
  Discover: "/Discover",
  Calendar: "/Calendar",
  MyCamps: "/MyCamps",
  Profile: "/Profile",
  CoachProfile: "/CoachProfile",
  CoachSignup: "/CoachSignup",
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

  const sp = new URLSearchParams(loc?.search || "");
  const demoParam = sp.get("demo");
  const isCoachDemo = demoParam === "coach";
  const isUserDemo  = demoParam === "user";

  // During guided tour (?tour=<key>), navigation is locked so the
  // sequence stays controlled. handleNav becomes a no-op.
  const isTourMode = sp.get("tour") !== null;

  const hqRoute      = isCoach ? ROUTES.CoachDashboard : ROUTES.Workspace;
  const profileRoute = isCoach ? ROUTES.CoachProfile   : ROUTES.Profile;

  const items = useMemo(() => {
    if (isCoachDemo) {
      return [
        { label: "Coach HQ",  to: "/CoachDashboard?demo=coach", Icon: LayoutGrid },
        { label: "Discover",  to: "/Discover?demo=coach",       Icon: Search },
        { label: "Sign Up",   to: ROUTES.CoachSignup,           Icon: UserPlus },
      ];
    }
    if (isUserDemo) {
      // Full 5-item nav matching the actual Marcus journey pages.
      // Calendar is included so parents see the complete tool set.
      return [
        { label: "HQ",       to: "/Workspace?demo=user",  Icon: LayoutGrid },
        { label: "Discover", to: "/Discover?demo=user",   Icon: Search },
        { label: "Calendar", to: "/Calendar?demo=user",   Icon: CalendarDays },
        { label: "My Camps", to: "/MyCamps?demo=user",    Icon: Heart },
        { label: "Profile",  to: "/Profile?demo=user",    Icon: User },
      ];
    }
    return [
      { label: "HQ",       to: hqRoute,        Icon: LayoutGrid },
      { label: "Discover", to: ROUTES.Discover, Icon: Search },
      { label: "Calendar", to: ROUTES.Calendar, Icon: CalendarDays },
      { label: "My Camps", to: ROUTES.MyCamps,  Icon: Heart },
      { label: "Profile",  to: profileRoute,    Icon: User },
    ];
  }, [isCoachDemo, isUserDemo, hqRoute, profileRoute]);

  function handleNav(to) {
    // Lock navigation during the guided tour sequence
    if (isTourMode) return;
    // Don't re-navigate if already on the target route
    if (isActivePath(loc.pathname, to.split("?")[0])) return;
    nav(to);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-ur-page border-t border-ur-shell-border">
      <div className="max-w-5xl mx-auto px-4">
        <div className="h-16 flex items-center justify-around">
          {items.map(({ label, to, Icon }) => {
            const active = isActivePath(loc.pathname, to.split("?")[0]);
            const locked = isTourMode && !active;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleNav(to)}
                className={`flex flex-col items-center justify-center gap-1 text-xs px-3 py-2 rounded-lg transition-colors ${
                  active ? "text-ur-amber" : "text-ur-secondary"
                }`}
                style={{
                  opacity: locked ? 0.35 : 1,
                  cursor: isTourMode ? "default" : "pointer",
                  pointerEvents: isTourMode && !active ? "none" : undefined,
                }}
                aria-current={active ? "page" : undefined}
                aria-disabled={locked ? "true" : undefined}
                tabIndex={locked ? -1 : 0}
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
