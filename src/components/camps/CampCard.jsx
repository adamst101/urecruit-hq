// src/components/camps/CampCard.jsx
import React, { useState } from "react";
import { Star } from "lucide-react";
import { format } from "date-fns";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useDemoHint, DemoHintPopup } from "../demo/DemoHintPopup.jsx";

function safeFormatDate(d) {
  try {
    if (!d) return "TBD";
    return format(new Date(d), "MMM d");
  } catch {
    return "TBD";
  }
}

// base44 image fields can return either a plain URL string or an object like { url: "..." }
function extractUrl(v) {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") return v.url || v.src || v.href || null;
  return null;
}

function LogoAvatar({ schoolName, logoUrl }) {
  const [imgErr, setImgErr] = useState(false);
  const resolvedUrl = extractUrl(logoUrl);
  const showImg = !!resolvedUrl && !imgErr;
  const letter = (String(schoolName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();

  return (
    <div className="w-11 h-11 rounded-lg bg-ur-page border border-ur-border overflow-hidden flex items-center justify-center flex-shrink-0">
      {showImg ? (
        <img
          src={resolvedUrl}
          alt={`${schoolName} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="text-sm font-semibold text-ur-secondary">{letter}</div>
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
  onRegisteredToggle,
  onClick,
  mode,
  disabledFavorite,
  warningBadge,
  onRegisterClick,
  isUserDemo,
}) {
  const division = school?.division || school?.school_division || null;
  const schoolName = school?.school_name || school?.name || "Unknown School";
  const logoUrl = school?.logo_url || school?.athletic_logo_url || null;
  const sportName = sport?.sport_name || sport?.name || null;
  const isDemo = mode === "demo";

  const { demoHint, showDemoHint, clearDemoHint } = useDemoHint();

  const startLabel = safeFormatDate(camp?.start_date);
  const endLabel = camp?.end_date && camp?.end_date !== camp?.start_date ? safeFormatDate(camp?.end_date) : null;
  const city = [camp?.city, camp?.state].filter(Boolean).join(", ");
  const priceLabel = typeof camp?.price === "number" && camp.price > 0 ? `$${camp.price}` : null;

  // Card border/background color based on status
  const borderLeftColor = isRegistered ? "#10b981" : isFavorite ? "#e8a020" : "#1f2937";
  const cardBg = isRegistered ? "#052e16" : "#111827";

  return (
    <>
    <DemoHintPopup demoHint={demoHint} onDismiss={clearDemoHint} />
    <div
      className="rounded-xl border border-ur-border transition-colors overflow-hidden"
      style={{ background: cardBg }}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Status accent bar */}
        <div className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: borderLeftColor }} />

        <LogoAvatar schoolName={schoolName} logoUrl={logoUrl} />

        <div className="min-w-0 flex-1">
          {/* Row 1: School name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-ur-primary sm:truncate">{schoolName}</span>
            {warningBadge}
            {division && (
              <Badge className="bg-ur-page text-ur-primary border border-ur-border-input text-[10px] px-1.5 py-0">{division}</Badge>
            )}
            {sportName && (
              <span className="text-[10px] text-ur-secondary font-medium">{sportName}</span>
            )}
            {isDemo && (
              <Badge variant="outline" className="text-[10px] border-ur-border-input text-ur-secondary px-1.5 py-0">Demo</Badge>
            )}
          </div>

          {/* Row 2: Camp name */}
          <div className="text-sm text-ur-secondary sm:truncate mt-0.5">
            {camp?.camp_name || "Camp"}
          </div>

          {/* Row 3: Date · City · Price */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ur-secondary">
            <span className="flex items-center gap-1">
              <span className="text-ur-muted">📅</span>
              {startLabel}{endLabel ? ` — ${endLabel}` : ""}
            </span>
            {city && (
              <span className="flex items-center gap-1">
                <span className="text-ur-muted">📍</span>
                {city}
              </span>
            )}
            {priceLabel && (
              <span className="flex items-center gap-1">
                <span className="text-ur-muted">💰</span>
                {priceLabel}
              </span>
            )}
          </div>
        </div>

        {/* Action icons + register button */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0 sm:flex-row sm:items-center sm:gap-1.5">
          {/* Star — favorite toggle */}
          <button
            type="button"
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            disabled={!!disabledFavorite}
            className="h-8 w-8 p-0 flex items-center justify-center rounded-md hover:bg-ur-border transition-colors"
            style={{ background: "none", border: "none", cursor: disabledFavorite ? "default" : "pointer" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isUserDemo) { showDemoHint(e, "favorite"); return; }
              console.log("[CampCard] onFavoriteToggle fired, prop:", typeof onFavoriteToggle, "disabled:", !!disabledFavorite);
              if (disabledFavorite) return;
              onFavoriteToggle?.();
            }}
          >
            <Star
              className={cn(
                "w-5 h-5 transition-colors",
                isFavorite ? "fill-ur-amber text-ur-amber" : "text-ur-muted hover:text-ur-amber"
              )}
            />
          </button>

          {/* Checkmark — registered toggle */}
          {onRegisteredToggle && (
            <button
              type="button"
              title={isRegistered ? "Remove registered status" : "Mark as registered"}
              className="h-8 w-8 p-0 flex items-center justify-center rounded-md hover:bg-ur-border transition-colors"
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 18, lineHeight: 1,
                fontWeight: isRegistered ? 700 : 300,
                color: isRegistered ? "#10b981" : "#6b7280",
                opacity: isRegistered ? 1 : 0.6,
                transition: "color 0.15s ease, opacity 0.15s ease",
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isUserDemo) { showDemoHint(e, "registered"); return; }
                console.log("[CampCard] onRegisteredToggle fired, prop:", typeof onRegisteredToggle);
                onRegisteredToggle();
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#10b981"; e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => {
                if (!isRegistered) { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.opacity = "0.6"; }
                else { e.currentTarget.style.color = "#10b981"; e.currentTarget.style.opacity = "1"; }
              }}
            >
              ✓
            </button>
          )}

          {/* Register button — opens Ryzer URL */}
          {onRegisterClick && (
            <button
              type="button"
              className="text-xs h-7 px-3 rounded-md font-medium bg-ur-amber text-ur-page hover:bg-ur-amber-hover transition-colors"
              style={{ pointerEvents: "auto", cursor: "pointer", position: "relative", zIndex: 10 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isUserDemo) { showDemoHint(e, "register"); return; }
                onRegisterClick();
              }}
            >
              Register →
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}