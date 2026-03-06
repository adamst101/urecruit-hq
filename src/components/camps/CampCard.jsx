// src/components/camps/CampCard.jsx
import React, { useState } from "react";
import { Star } from "lucide-react";
import { format } from "date-fns";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

function safeFormatDate(d) {
  try {
    if (!d) return "TBD";
    return format(new Date(d), "MMM d");
  } catch {
    return "TBD";
  }
}

function LogoAvatar({ schoolName, logoUrl }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!logoUrl && !imgErr;
  const letter = (String(schoolName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();

  return (
    <div className="w-11 h-11 rounded-lg bg-[#0f172a] border border-[#1f2937] overflow-hidden flex items-center justify-center flex-shrink-0">
      {showImg ? (
        <img
          src={logoUrl}
          alt={`${schoolName} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="text-sm font-semibold text-[#9ca3af]">{letter}</div>
      )}
    </div>
  );
}

export default function CampCard({
  camp,
  school,
  sport,
  positions,
  isFavorite,
  isRegistered,
  onFavoriteToggle,
  onClick,
  mode,
  disabledFavorite,
  warningBadge,
  onRegisterClick,
}) {
  const division = school?.division || school?.school_division || null;
  const schoolName = school?.school_name || school?.name || "Unknown School";
  const logoUrl = school?.logo_url || school?.athletic_logo_url || null;
  const sportName = sport?.sport_name || sport?.name || null;
  const isDemo = mode === "demo";

  const startLabel = safeFormatDate(camp?.start_date);
  const endLabel = camp?.end_date && camp?.end_date !== camp?.start_date ? safeFormatDate(camp?.end_date) : null;
  const city = [camp?.city, camp?.state].filter(Boolean).join(", ");
  const priceLabel = typeof camp?.price === "number" && camp.price > 0 ? `$${camp.price}` : null;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors border-[#1f2937] bg-[#111827] overflow-hidden",
        isRegistered ? "opacity-90" : ""
      )}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Amber accent bar */}
        <div className="w-[3px] self-stretch rounded-full bg-[#e8a020] flex-shrink-0" />

        <LogoAvatar schoolName={schoolName} logoUrl={logoUrl} />

        <div className="min-w-0 flex-1">
          {/* Row 1: School name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-[#f9fafb] truncate">{schoolName}</span>
            {warningBadge}
            {division && (
              <Badge className="bg-[#0f172a] text-[#f9fafb] border border-[#374151] text-[10px] px-1.5 py-0">{division}</Badge>
            )}
            {sportName && (
              <span className="text-[10px] text-[#9ca3af] font-medium">{sportName}</span>
            )}
            {isDemo && (
              <Badge variant="outline" className="text-[10px] border-[#374151] text-[#9ca3af] px-1.5 py-0">Demo</Badge>
            )}
            {isRegistered && (
              <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">Registered</Badge>
            )}
            {!isRegistered && isFavorite && (
              <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">★ Favorite</Badge>
            )}
          </div>

          {/* Row 2: Camp name */}
          <div className="text-sm text-[#9ca3af] truncate mt-0.5">
            {camp?.camp_name || "Camp"}
          </div>

          {/* Row 3: Date · City · Price */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9ca3af]">
            <span className="flex items-center gap-1">
              <span className="text-[#6b7280]">📅</span>
              {startLabel}{endLabel ? ` — ${endLabel}` : ""}
            </span>
            {city && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">📍</span>
                {city}
              </span>
            )}
            {priceLabel && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">💰</span>
                {priceLabel}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            disabled={!!disabledFavorite}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (disabledFavorite) return;
              onFavoriteToggle?.();
            }}
            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          >
            <Star
              className={cn(
                "w-5 h-5",
                isFavorite ? "fill-amber-400 text-amber-400" : "text-[#9ca3af]"
              )}
            />
          </Button>
          {onRegisterClick && (
            <button
              type="button"
              className={cn(
                "text-xs h-7 px-3 rounded-md font-medium",
                isRegistered
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]"
              )}
              style={{ pointerEvents: "auto", cursor: "pointer", position: "relative", zIndex: 10 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRegisterClick();
              }}
            >
              {isRegistered ? "✓ Registered" : "Register"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}