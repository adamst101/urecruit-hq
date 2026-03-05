import React, { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";

export default function MonthOverview({ currentMonth, setCurrentMonth, campsByDate, conflictDates, schoolMap, onCampClick }) {
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
        const conflictCount = camps.filter((c) => {
          const dk = String(c?.start_date || "").slice(0, 10);
          return conflictDates.has(dk);
        }).length;
        return { date: d, key, camps, conflictCount };
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
        <div style={{ textAlign: "center", color: "#6b7280", fontSize: 16, padding: 40 }}>
          No camps scheduled for {format(currentMonth, "MMMM")}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {daysWithCamps.map(({ date, camps, conflictCount }, blockIdx) => (
            <div key={format(date, "yyyy-MM-dd")} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #1f2937" }}>
              {/* Day header */}
              <div style={{
                background: "#1f2937",
                padding: "10px 16px",
                borderLeft: "3px solid #e8a020",
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
                      background: "#7f1d1d", color: "#fca5a5",
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
                const isConflict = conflictDates.has(dateKey);
                const isReg = st === "registered" || st === "completed";
                const isFav = st === "favorite";
                const school = schoolMap?.[campId] || { school_name: c?.school_name };
                const schoolName = school?.school_name || "Camp";
                const division = school?.division || c?.school_division || null;
                const city = [c?.city, c?.state].filter(Boolean).join(", ");
                const isLast = idx === camps.length - 1;

                let barColor = "#e8a020";
                if (isConflict) barColor = "#ef4444";
                else if (isReg) barColor = "#10b981";

                let badgeBg, badgeColor, badgeText;
                if (isConflict) { badgeBg = "#7f1d1d"; badgeColor = "#fca5a5"; badgeText = "⚠ Conflict"; }
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

                    {/* Right */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {badgeText && (
                        <span style={{
                          background: badgeBg, color: badgeColor,
                          fontSize: 12, fontWeight: 700, padding: "4px 10px",
                          borderRadius: 12, whiteSpace: "nowrap",
                        }}>
                          {badgeText}
                        </span>
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