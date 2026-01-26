// src/components/navigation/BottomNav.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, CalendarDays, User } from "lucide-react";

const ROUTES = {
  Discover: "/Discover",
  Calendar: "/Calendar",
  Profile: "/Profile",
};

function isActivePath(pathname, target) {
  // basic exact/startsWith match
  if (!pathname) return false;
  if (pathname === target) return true;
  return pathname.startsWith(target + "/");
}

export default function BottomNav() {
  const nav = useNavigate();
  const loc = useLocation();

  const items = useMemo(
    () => [
      { label: "Discover", to: ROUTES.Discover, Icon: Search },
      { label: "Calendar", to: ROUTES.Calendar, Icon: CalendarDays },
      { label: "Profile", to: ROUTES.Profile, Icon: User }, // ✅ Setup renamed to Profile
    ],
    []
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200">
      <div className="max-w-5xl mx-auto px-4">
        <div className="h-16 flex items-center justify-around">
          {items.map(({ label, to, Icon }) => {
            const active = isActivePath(loc.pathname, to);
            return (
              <button
                key={label}
                type="button"
                onClick={() => nav(to)}
                className={`flex flex-col items-center justify-center gap-1 text-xs px-3 py-2 rounded-lg ${
                  active ? "text-brand" : "text-slate-500"
                }`}
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
