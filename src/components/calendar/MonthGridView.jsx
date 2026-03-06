import React, { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";

function CampPill({ camp, school, status, isConflict, onClick }) {
  const name = school?.school_name || camp?.school_name || "Camp";

  let bg, color, borderColor;
  if (isConflict) { bg = "#1c0505"; color = "#fca5a5"; borderColor = "#ef4444"; }
  else if (status === "registered" || status === "completed") { bg = "#064e3b"; color = "#6ee7b7"; borderColor = "#10b981"; }
  else { bg = "#1c1003"; color = "#fcd34d"; borderColor = "#e8a020"; }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: "100%",
        padding: "3px 6px",
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        marginBottom: 2,
        cursor: "pointer",
        background: bg,
        color,
        borderLeft: `3px solid ${borderColor}`,
        transition: "filter 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = ""; }}
    >
      {name}
    </div>
  );
}

function CampDot({ status, isConflict }) {
  let bg;
  if (isConflict) bg = "#ef4444";
  else if (status === "registered" || status === "completed") bg = "#10b981";
  else bg = "#e8a020";

  return <div style={{ width: 8, height: 8, borderRadius: "50%", background: bg, flexShrink: 0 }} />;
}

export default function MonthGridView({ currentMonth, setCurrentMonth, campsByDate, conflictDates, schoolMap, onCampClick, onJumpToDate }) {
  const today = new Date();

  const [daySheetDate, setDaySheetDate] = useState(null);

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

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Group into rows of 7
  const weeks = useMemo(() => {
    const rows = [];
    for (let i = 0; i < allDays.length; i += 7) {
      rows.push(allDays.slice(i, i + 7));
    }
    return rows;
  }, [allDays]);

  const navBtnStyle = {
    background: "transparent", color: "#e8a020", border: "none",
    fontSize: 18, fontWeight: 700, cursor: "pointer", padding: "6px 12px",
  };

  const dayHeaders = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  // Day sheet camps
  const daySheetCamps = daySheetDate ? (campsByDate[format(daySheetDate, "yyyy-MM-dd")] || []) : [];

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <button onClick={prevMonth} style={navBtnStyle}>←</button>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f9fafb" }}>
          {format(currentMonth, "MMMM yyyy")}
        </div>
        <button onClick={nextMonth} style={navBtnStyle}>→</button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #1f2937" }}>
        {dayHeaders.map((d) => (
          <div key={d} style={{
            background: "#1f2937", textAlign: "center", padding: "8px 0",
            fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid rows - DESKTOP */}
      <div className="hidden md:block">
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {week.map((day, di) => {
              const key = format(day, "yyyy-MM-dd");
              const camps = campsByDate[key] || [];
              const inMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const show3 = camps.slice(0, 3);
              const extra = camps.length - 3;

              return (
                <div
                  key={di}
                  style={{
                    minHeight: 120,
                    background: inMonth ? "#111827" : "#0d1117",
                    border: "1px solid #1f2937",
                    padding: 6,
                    verticalAlign: "top",
                    overflow: "hidden",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (camps.length) e.currentTarget.style.background = inMonth ? "#1a2234" : "#131820"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = inMonth ? "#111827" : "#0d1117"; }}
                >
                  {/* Day number */}
                  <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontSize: 14,
                      fontWeight: isToday ? 700 : 400,
                      color: !inMonth ? "#374151" : isToday ? "#e8a020" : "#f9fafb",
                      background: isToday ? "rgba(232,160,32,0.2)" : "transparent",
                      borderRadius: isToday ? "50%" : 0,
                      width: isToday ? 24 : "auto",
                      height: isToday ? 24 : "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Camp pills */}
                  {show3.map((c) => {
                    const campId = String(c?.camp_id || c?.id || "");
                    const st = String(c?.intent_status || "").toLowerCase();
                    const isConflict = conflictDates.has(key);
                    const school = schoolMap?.[campId] || { school_name: c?.school_name };
                    return (
                      <CampPill
                        key={campId}
                        camp={c}
                        school={school}
                        status={st}
                        isConflict={isConflict}
                        onClick={() => onCampClick(c)}
                      />
                    );
                  })}
                  {extra > 0 && (
                    <div
                      onClick={() => setDaySheetDate(day)}
                      style={{
                        width: "100%", padding: "3px 6px", borderRadius: 3,
                        fontSize: 11, fontWeight: 600, background: "#1f2937",
                        color: "#9ca3af", cursor: "pointer", textAlign: "center",
                      }}
                    >
                      +{extra} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Grid rows - MOBILE (dots) */}
      <div className="md:hidden">
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {week.map((day, di) => {
              const key = format(day, "yyyy-MM-dd");
              const camps = campsByDate[key] || [];
              const inMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const show3 = camps.slice(0, 3);
              const extra = camps.length - 3;

              return (
                <div
                  key={di}
                  onClick={() => { if (camps.length) setDaySheetDate(day); }}
                  style={{
                    minHeight: 60,
                    background: inMonth ? "#111827" : "#0d1117",
                    border: "1px solid #1f2937",
                    padding: 4,
                    cursor: camps.length ? "pointer" : "default",
                  }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: isToday ? 700 : 400,
                    color: !inMonth ? "#374151" : isToday ? "#e8a020" : "#f9fafb",
                    marginBottom: 4,
                    textAlign: "center",
                  }}>
                    {day.getDate()}
                  </div>
                  <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                    {show3.map((c) => {
                      const st = String(c?.intent_status || "").toLowerCase();
                      const isConflict = conflictDates.has(key);
                      return <CampDot key={String(c?.camp_id || c?.id)} status={st} isConflict={isConflict} />;
                    })}
                    {extra > 0 && (
                      <span style={{ fontSize: 9, color: "#6b7280" }}>+{extra}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Day detail bottom sheet (when +more or mobile tap) */}
      {daySheetDate && daySheetCamps.length > 0 && (
        <>
          <div
            onClick={() => setDaySheetDate(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99 }}
          />
          <div
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              maxHeight: "70vh", background: "#111827",
              borderTop: "3px solid #e8a020", borderRadius: "20px 20px 0 0",
              padding: 24, zIndex: 100, overflowY: "auto",
            }}
            className="md:max-h-[70vh] max-h-[85vh]"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#e8a020" }}>
                {format(daySheetDate, "EEEE, MMMM d, yyyy")}
              </div>
              <button
                onClick={() => setDaySheetDate(null)}
                style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}
              >✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {daySheetCamps.map((c) => {
                const campId = String(c?.camp_id || c?.id || "");
                const st = String(c?.intent_status || "").toLowerCase();
                const dateKey = format(daySheetDate, "yyyy-MM-dd");
                const isConflict = conflictDates.has(dateKey);
                const isReg = st === "registered" || st === "completed";
                const isFav = st === "favorite";
                const school = schoolMap?.[campId] || { school_name: c?.school_name };
                const schoolName = school?.school_name || "Camp";
                const city = [c?.city, c?.state].filter(Boolean).join(", ");

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
                    onClick={() => { setDaySheetDate(null); onCampClick(c); }}
                    style={{
                      background: "#0f172a", padding: "12px 14px",
                      borderRadius: 8, display: "flex", alignItems: "center",
                      gap: 12, cursor: "pointer", borderLeft: `4px solid ${barColor}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: 15 }}>{schoolName}</div>
                      {city && <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>📍 {city}</div>}
                    </div>
                    {badgeText && (
                      <span style={{
                        background: badgeBg, color: badgeColor,
                        fontSize: 11, fontWeight: 700, padding: "3px 8px",
                        borderRadius: 12, whiteSpace: "nowrap",
                      }}>
                        {badgeText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}