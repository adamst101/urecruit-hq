import React, { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
// icons removed — using plain text ✓ for checkmark

export default function MonthOverview({ currentMonth, setCurrentMonth, campsByDate, conflictDates, athleteColor = "#e8a020", schoolMap, onCampClick, onJumpToDate, onRegister, onFavoriteToggle, onRegisteredToggle }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  function prevMonth() {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(d);
  }
  function nextMonth() {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(d);
  }

  // Only days with camps
  const daysWithCamps = useMemo(() => {
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return allDays
      .map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const camps = campsByDate[key] || [];
        if (camps.length === 0) return null;
        const conflictSeverities = camps.map((c) => {
          const dk = String(c?.start_date || "").slice(0, 10);
          return conflictDates.get(dk) || null;
        }).filter(Boolean);
        const conflictCount = conflictSeverities.length;
        const worstConflictSeverity = conflictSeverities.includes("error") ? "error"
          : conflictSeverities.length > 0 ? "warning" : null;
        return { date: d, key, camps, conflictCount, worstConflictSeverity };
      })
      .filter(Boolean);
  }, [monthStart, monthEnd, campsByDate, conflictDates]);

  const navBtnStyle = {
    background: "transparent", color: "#e8a020", border: "none",
    fontSize: 18, fontWeight: 700, cursor: "pointer", padding: "6px 12px",
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button onClick={prevMonth} style={navBtnStyle}>←</button>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f9fafb" }}>
          {format(currentMonth, "MMMM yyyy")}
        </div>
        <button onClick={nextMonth} style={navBtnStyle}>→</button>
      </div>

      {daysWithCamps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 40 }}>📅</div>
          <div style={{ color: "#9ca3af", marginTop: 12, fontSize: 16, fontWeight: 600 }}>
            No camps in {format(currentMonth, "MMMM")}.
          </div>
          <div style={{ color: "#6b7280", fontSize: 14, marginTop: 6, marginBottom: 20 }}>
            Use the arrows to navigate to a month with camps.
          </div>
          {onJumpToDate && Object.keys(campsByDate).length > 0 && (
            <button
              onClick={() => {
                const keys = Object.keys(campsByDate).sort();
                if (keys.length > 0) {
                  const d = new Date(keys[0] + "T00:00:00");
                  if (!isNaN(d.getTime())) onJumpToDate(d);
                }
              }}
              style={{ background: "none", border: "none", color: "#e8a020", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Jump to first camp →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {daysWithCamps.map(({ date, camps, conflictCount, worstConflictSeverity }, blockIdx) => (
            <div key={format(date, "yyyy-MM-dd")} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #1f2937" }}>
              {/* Day header */}
              <div style={{
                background: "#1f2937",
                padding: "10px 16px",
                borderLeft: `3px solid ${worstConflictSeverity === "error" ? "#ef4444" : worstConflictSeverity === "warning" ? "#f97316" : athleteColor}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#f9fafb" }}>
                  {format(date, "EEEE · MMMM d").toUpperCase()}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{
                    background: "#92400e", color: "#fcd34d",
                    fontSize: 12, fontWeight: 700, padding: "3px 10px",
                    borderRadius: 12,
                  }}>
                    {camps.length} camp{camps.length > 1 ? "s" : ""}
                  </span>
                  {conflictCount > 0 && (
                    <span style={{
                      background: worstConflictSeverity === "error" ? "#7f1d1d" : "#431407",
                      color: worstConflictSeverity === "error" ? "#fca5a5" : "#fed7aa",
                      fontSize: 12, fontWeight: 700, padding: "3px 10px",
                      borderRadius: 12,
                    }}>
                      ⚠ {conflictCount} conflict
                    </span>
                  )}
                </div>
              </div>

              {/* Camp rows */}
              {camps.map((c, idx) => {
                const campId = String(c?.camp_id || c?.id || "");
                const st = String(c?.intent_status || "").toLowerCase();
                const dateKey = String(c?.start_date || "").slice(0, 10);
                const conflictSeverity = conflictDates.get(dateKey) || null;
                const isReg = st === "registered" || st === "completed";
                const isFav = st === "favorite";
                const school = schoolMap?.[campId] || { school_name: c?.school_name };
                const schoolName = school?.school_name || "Camp";
                const division = school?.division || c?.school_division || null;
                const city = [c?.city, c?.state].filter(Boolean).join(", ");
                const isLast = idx === camps.length - 1;

                let barColor = athleteColor;
                if (conflictSeverity === "error") barColor = "#ef4444";
                else if (conflictSeverity === "warning") barColor = "#f97316";
                else if (isReg) barColor = "#10b981";

                let badgeBg, badgeColor, badgeText;
                if (conflictSeverity === "error") { badgeBg = "#7f1d1d"; badgeColor = "#fca5a5"; badgeText = "⚠ Conflict"; }
                else if (conflictSeverity === "warning") { badgeBg = "#431407"; badgeColor = "#fed7aa"; badgeText = "⚠ Family"; }
                else if (isReg) { badgeBg = "#065f46"; badgeColor = "#6ee7b7"; badgeText = "✓ Registered"; }
                else if (isFav) { badgeBg = "#92400e"; badgeColor = "#fcd34d"; badgeText = "★ Favorited"; }

                return (
                  <div
                    key={campId}
                    onClick={() => onCampClick(c)}
                    style={{
                      background: "#111827",
                      padding: "14px 16px",
                      borderBottom: isLast ? "none" : "1px solid #1f2937",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      cursor: "pointer",
                      transition: "background 0.15s",
                      borderRadius: isLast ? "0 0 8px 8px" : 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#1a2234"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#111827"; }}
                  >
                    {/* Status bar */}
                    <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: barColor, flexShrink: 0 }} />

                    {/* Center */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: 16 }}>{schoolName}</span>
                        {division && (
                          <span style={{
                            background: "#e8a020", color: "#0a0e1a",
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 12,
                          }}>
                            {division}
                          </span>
                        )}
                      </div>
                      {city && <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>📍 {city}</div>}
                    </div>

                    {/* Right: star + checkmark + register */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {/* Star */}
                      {onFavoriteToggle && (
                        <button
                          type="button"
                          title={isFav ? "Remove from favorites" : "Add to favorites"}
                          onClick={(e) => { e.stopPropagation(); onFavoriteToggle(c); }}
                          style={{
                            background: "none", border: "none", cursor: "pointer", padding: 4,
                            color: isFav ? "#e8a020" : "#6b7280", fontSize: 18, lineHeight: 1,
                            transition: "color 0.15s",
                          }}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                      )}
                      {/* Checkmark */}
                      {onRegisteredToggle && (
                        <button
                          type="button"
                          title={isReg ? "Remove registered status" : "Mark as registered"}
                          onClick={(e) => { e.stopPropagation(); onRegisteredToggle(campId); }}
                          style={{
                            background: "none", border: "none", cursor: "pointer", padding: 4,
                            fontSize: 18, lineHeight: 1,
                            fontWeight: isReg ? 700 : 300,
                            color: isReg ? "#10b981" : "#6b7280",
                            opacity: isReg ? 1 : 0.6,
                            transition: "color 0.15s ease, opacity 0.15s ease",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#10b981"; e.currentTarget.style.opacity = "1"; }}
                          onMouseLeave={(e) => {
                            if (!isReg) { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.opacity = "0.6"; }
                            else { e.currentTarget.style.color = "#10b981"; e.currentTarget.style.opacity = "1"; }
                          }}
                        >
                          ✓
                        </button>
                      )}
                      {/* Register → opens URL */}
                      {onRegister && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRegister(c); }}
                          className="text-xs h-7 px-3 rounded-md font-medium bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]"
                          style={{ pointerEvents: "auto", cursor: "pointer", position: "relative", zIndex: 10 }}
                        >
                          Register →
                        </button>
                      )}
                      <span style={{ color: "#374151", fontSize: 16 }}>›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}