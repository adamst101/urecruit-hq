// src/components/camps/SchoolGroupCard.jsx
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

function safeShortDate(d) {
  try {
    if (!d) return null;
    return format(new Date(d), "MMM d");
  } catch {
    return null;
  }
}

function toISODate(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim()))
    return dateInput.trim();
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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

export default function SchoolGroupCard({
  group,
  isExpanded,
  onToggle,
  isPaid,
  isCampFavorite,
  onFavoriteToggle,
  onRegisterClick,
  onCampClick,
}) {
  const { school_name, school_logo_url, division, camps } = group;
  const isSingle = camps.length === 1;
  const expanded = isSingle || isExpanded;

  // Aggregate stats
  const dates = camps
    .map((c) => toISODate(c.start_date))
    .filter(Boolean)
    .sort();
  const dateMin = dates[0] || null;
  const dateMax = dates[dates.length - 1] || null;

  const prices = camps
    .map((c) => (typeof c.price === "number" && c.price > 0 ? c.price : null))
    .filter(Boolean);
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;

  // Most common city
  const cityCount = {};
  camps.forEach((c) => {
    const loc = [c.city, c.state].filter(Boolean).join(", ");
    if (loc) cityCount[loc] = (cityCount[loc] || 0) + 1;
  });
  const primaryCity = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Date pills (up to 4 upcoming)
  const datePills = dates.slice(0, 4);
  const moreCount = dates.length > 4 ? dates.length - 4 : 0;

  // Grades
  const allGrades = [...new Set(camps.map((c) => c.grades).filter(Boolean))];
  const gradesLabel = allGrades.length === 1 ? allGrades[0] : allGrades.length > 1 ? allGrades.join(", ") : null;

  return (
    <div
      className={
        "rounded-xl border transition-colors " +
        (expanded ? "border-[#e8a020]/40 " : "border-[#1f2937] hover:border-[#e8a020]/60 ") +
        "bg-[#111827] overflow-hidden"
      }
    >
      {/* Header — always visible, clickable */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => !isSingle && onToggle?.()}
        role="button"
        tabIndex={0}
      >
        {/* Amber accent bar */}
        <div
          className={
            "w-[3px] self-stretch rounded-full transition-colors flex-shrink-0 " +
            (expanded ? "bg-[#e8a020]" : "bg-transparent group-hover:bg-[#e8a020]")
          }
        />

        <LogoAvatar schoolName={school_name} logoUrl={school_logo_url} />

        <div className="min-w-0 flex-1">
          {/* Row 1: name + division + camp count */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-[#f9fafb] truncate">{school_name}</span>
            {division && (
              <Badge className="bg-[#0f172a] text-[#f9fafb] border border-[#374151] text-[10px] px-1.5 py-0">{division}</Badge>
            )}
            <Badge className="bg-[#e8a020]/15 text-[#e8a020] border border-[#e8a020]/30 text-[10px] px-1.5 py-0">
              {camps.length} camp{camps.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {/* Row 2: date range · city · price */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9ca3af]">
            {dateMin && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">📅</span>
                {safeShortDate(dateMin)}
                {dateMax && dateMax !== dateMin ? ` — ${safeShortDate(dateMax)}` : ""}
              </span>
            )}
            {primaryCity && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">📍</span>
                {primaryCity}
              </span>
            )}
            {priceMin != null && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">💰</span>
                ${priceMin}{priceMax != null && priceMax !== priceMin ? ` — $${priceMax}` : ""}
              </span>
            )}
            {gradesLabel && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">🎓</span>
                {gradesLabel}
              </span>
            )}
          </div>

          {/* Row 3: date pills */}
          {datePills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {datePills.map((d) => (
                <span
                  key={d}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-[#e8a020]/30 text-[#e8a020]/80 bg-[#e8a020]/5"
                >
                  {safeShortDate(d)}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#374151] text-[#9ca3af]">
                  +{moreCount} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chevron */}
        {!isSingle && (
          <ChevronDown
            className={
              "w-5 h-5 text-[#9ca3af] flex-shrink-0 transition-transform duration-200 " +
              (expanded ? "rotate-180" : "")
            }
          />
        )}
      </div>

      {/* Expanded: individual camps */}
      {expanded && (
        <div className="border-t border-[#1f2937]">
          {camps.map((camp, idx) => {
            const campId = String(camp?.id ?? "");
            const isFav = isCampFavorite(campId);
            const startLabel = safeShortDate(camp.start_date) || "TBD";
            const city = [camp.city, camp.state].filter(Boolean).join(", ");
            const priceLabel = typeof camp.price === "number" && camp.price > 0 ? `$${camp.price}` : null;

            return (
              <div
                key={campId}
                className={
                  "flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[#1a2235] transition " +
                  (idx % 2 === 1 ? "bg-[#0f172a]/40" : "")
                }
                onClick={() => onCampClick?.(campId)}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#f9fafb] truncate">
                    {camp.camp_name || "Camp"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#9ca3af]">
                    <span>{startLabel}</span>
                    {city && <span>{city}</span>}
                    {priceLabel && <span className="text-[#e8a020]">{priceLabel}</span>}
                    {camp.grades && <span>{camp.grades}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFavoriteToggle?.(campId);
                    }}
                    aria-label={isFav ? "Remove favorite" : "Add favorite"}
                  >
                    <span className={(isFav ? "text-amber-500" : "text-[#9ca3af]") + " text-lg leading-none"}>
                      {isFav ? "★" : "☆"}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f] text-xs h-7 px-3"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRegisterClick?.(camp);
                    }}
                  >
                    Register
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}