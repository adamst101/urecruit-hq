// src/components/camps/CampCard.jsx
import React from "react";
import { Calendar, MapPin, DollarSign, Star } from "lucide-react";
import { format } from "date-fns";

import { cn } from "../../lib/utils";
import { Card } from "../ui/card";
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

export default function CampCard({
  camp,
  school,
  sport,
  positions,
  isFavorite,
  isRegistered,
  onFavoriteToggle,
  onClick,
  // optional flags for demo/paid UI (won’t break existing callers)
  mode, // "demo" | "paid" (optional)
  disabledFavorite, // optional: force-disable favorite button
}) {
  const division = school?.division || school?.school_division || null;
  const sportName = sport?.sport_name || sport?.name || null;

  const priceIsNumber = typeof camp?.price === "number" && !Number.isNaN(camp.price);
  const showPrice = priceIsNumber;

  const isDemo = mode === "demo";

  return (
    <Card
      className={cn(
        "p-4 border-[#1f2937] bg-[#111827] cursor-pointer hover:border-[#374151] transition",
        isRegistered ? "opacity-90" : ""
      )}
      role="button"
      tabIndex={0}
      onClick={() => onClick?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {division && (
              <Badge className="bg-[#0f172a] text-[#f9fafb] border border-[#374151] text-xs">{division}</Badge>
            )}

            {sportName && (
              <span className="text-xs text-[#9ca3af] font-medium">{sportName}</span>
            )}

            {isDemo && (
              <Badge variant="outline" className="text-xs border-[#374151] text-[#9ca3af]">
                Demo
              </Badge>
            )}

            {isRegistered && (
              <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>
            )}

            {!isRegistered && isFavorite && (
              <Badge className="bg-amber-500 text-white text-xs">★ Favorite</Badge>
            )}
          </div>

          <div className="text-lg font-semibold text-[#f9fafb] truncate">
            {school?.school_name || school?.name || "Unknown School"}
          </div>
          <div className="text-sm text-[#9ca3af] truncate">
            {camp?.camp_name || "Camp"}
          </div>
        </div>

        {/* Favorite */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!!disabledFavorite}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabledFavorite) return;
            onFavoriteToggle?.();
          }}
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          title={
            disabledFavorite
              ? "Favorites are disabled"
              : isFavorite
              ? "Remove favorite"
              : "Add favorite"
          }
        >
          <Star
            className={cn(
              "w-5 h-5",
              isFavorite ? "fill-amber-400 text-amber-400" : "text-[#9ca3af]"
            )}
          />
        </Button>
      </div>

      {/* Details */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[#9ca3af]">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#6b7280]" />
          <span>
            {safeFormatDate(camp?.start_date)}
            {camp?.end_date && camp?.end_date !== camp?.start_date
              ? `–${safeFormatDate(camp?.end_date)}`
              : ""}
          </span>
        </div>

        {(camp?.city || camp?.state) && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#6b7280]" />
            <span className="truncate">
              {[camp?.city, camp?.state].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        {showPrice && (
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#6b7280]" />
            <span>{camp.price > 0 ? `$${camp.price}` : "Free"}</span>
          </div>
        )}
      </div>

      {/* Positions */}
      {Array.isArray(positions) && positions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {positions.slice(0, 6).map((p, idx) => {
            const key = p?.position_id || p?.id || `${idx}`;
            const label = p?.position_code || p?.code || p?.position_name || "POS";
            return (
              <Badge key={key} variant="secondary" className="bg-[#0f172a] text-[#9ca3af] border border-[#1f2937]">
                {label}
              </Badge>
            );
          })}
          {positions.length > 6 && (
            <Badge variant="secondary" className="bg-[#0f172a] text-[#9ca3af] border border-[#1f2937]">
              +{positions.length - 6}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}