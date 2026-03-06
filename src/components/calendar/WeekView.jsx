import React, { useState, useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";

const DAY_ABBRS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function CampMiniCard({ camp, school, status, isConflict, onClick, onRegister, onFavoriteToggle, onRegisteredToggle }) {
  const schoolName = school?.school_name || "Camp";
  const price = typeof camp?.price === "number" && camp.price > 0 ? `$${camp.price}` : null;

  let bg, borderColor;
  if (isConflict) { bg = "#1c0505"; borderColor = "#ef4444"; }
  else if (status === "registered" || status === "completed") { bg = "#052e16"; borderColor = "#10b981"; }
  else { bg = "#1c1003"; borderColor = "#e8a020"; }

  return (
    <div
      onClick={onClick}
      style={{
        width: "100%",
        padding: 10,
        borderRadius: 8,
        background: bg,
        borderLeft: `4px solid ${borderColor}`,
        cursor: "pointer",
        transition: "filter 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.2)"; e.currentTarget.style.transform = "scale(1.01)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {isConflict ? "⚠ " : ""}{schoolName}
      </div>
      {/* Star + Checkmark row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
        {onFavoriteToggle && (
          <button
            type="button"
            title={status === "favorite" ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => { e.stopPropagation(); onFavoriteToggle(); }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 2,
              color: status === "favorite" ? "#e8a020" : "#6b7280", fontSize: 16, lineHeight: 1,
            }}
          >
            {status === "favorite" ? "★" : "☆"}
          </button>
        )}
        {onRegisteredToggle && (
          <button
            type="button"
            title={(status === "registered" || status === "completed") ? "Remove registered status" : "Mark as registered"}
            onClick={(e) => { e.stopPropagation(); onRegisteredToggle(); }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 2,
              color: (status === "registered" || status === "completed") ? "#10b981" : "#6b7280",
              display: "flex", alignItems: "center",
            }}
          >
            {(status === "registered" || status === "completed") ? <CheckCircle2 size={16} /> : <Circle size={16} />}
          </button>
        )}
        {isConflict && <span style={{ color: "#fca5a5", fontSize: 10 }}>⚠</span>}
      </div>
      {price && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{price}</div>}
      {onRegister && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRegister(); }}
          className="text-xs h-6 px-2 rounded font-medium w-full mt-1.5 bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]"
          style={{ pointerEvents: "auto", cursor: "pointer" }}
        >
          Register →
        </button>
      )}
    </div>
  );
}

export default function WeekView({ currentWeek, setCurrentWeek, campsByDate, conflictDates, schoolMap, onCampClick, onJumpToDate, onRegister }) {
  const today = new Date();

  // Mobile: show single day
  const [mobileDay, setMobileDay] = useState(0);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeek);
      d.setDate(currentWeek.getDate() + i);
      return d;
    });
  }, [currentWeek]);

  function prevWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d);
  }
  function nextWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d);
  }
  function prevDay() {
    setMobileDay((p) => {
      if (p <= 0) { prevWeek(); return 6; }
      return p - 1;
    });
  }
  function nextDay() {
    setMobileDay((p) => {
      if (p >= 6) { nextWeek(); return 0; }
      return p + 1;
    });
  }

  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const navBtnStyle = {
    background: "transparent", color: "#e8a020", border: "none",
    fontSize: 16, fontWeight: 700, cursor: "pointer", padding: "6px 12px",
  };

  function renderDayColumn(day, idx) {
    const key = format(day, "yyyy-MM-dd");
    const camps = campsByDate[key] || [];
    const isToday = isSameDay(day, today);
    const hasCamps = camps.length > 0;

    return (
      <div key={idx} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{
          background: "#1f2937", padding: "10px 8px", textAlign: "center",
          borderRight: idx < 6 ? "1px solid #111827" : "none",
        }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: "#6b7280" }}>
            {DAY_ABBRS[day.getDay()]}
          </div>
          <div style={{ position: "relative", display: "inline-block", marginTop: 2 }}>
            {isToday && (
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 32, height: 32, borderRadius: "50%",
                background: "#e8a020", opacity: 0.3,
              }} />
            )}
            <div style={{
              fontSize: 28, fontWeight: 700,
              color: isToday ? "#e8a020" : "#f9fafb",
              position: "relative", zIndex: 1,
            }}>
              {day.getDate()}
            </div>
          </div>
          {hasCamps && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8a020", margin: "4px auto 0" }} />
          )}
        </div>

        {/* Body */}
        <div style={{
          background: "#0f172a",
          borderRight: idx < 6 ? "1px solid #1f2937" : "none",
          padding: "8px 6px",
          flex: 1,
          minHeight: 300,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          {camps.length === 0 ? (
            <div style={{ color: "#374151", textAlign: "center", marginTop: 40, fontSize: 14 }}>—</div>
          ) : (
            camps.map((c) => {
              const campId = String(c?.camp_id || c?.id || "");
              const dateKey = String(c?.start_date || "").slice(0, 10);
              const isConflict = conflictDates.has(dateKey);
              const st = String(c?.intent_status || "").toLowerCase();
              const school = schoolMap?.[campId] || { school_name: c?.school_name };
              return (
                <CampMiniCard
                  key={campId}
                  camp={c}
                  school={school}
                  status={st}
                  isConflict={isConflict}
                  onClick={() => onCampClick(c)}
                  onRegister={onRegister ? () => onRegister(c) : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Desktop: week nav */}
      <div className="hidden md:flex" style={{ justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <button onClick={prevWeek} style={navBtnStyle}>← Prev Week</button>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#f9fafb" }}>
          {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </div>
        <button onClick={nextWeek} style={navBtnStyle}>Next Week →</button>
      </div>

      {/* Desktop: 7 columns */}
      <div className="hidden md:flex" style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1f2937" }}>
        {weekDays.map((d, i) => renderDayColumn(d, i))}
      </div>

      {/* Mobile: single day */}
      <div className="md:hidden">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={prevDay} style={navBtnStyle}>←</button>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#f9fafb" }}>
            {DAY_ABBRS[weekDays[mobileDay]?.getDay()]} {format(weekDays[mobileDay], "MMM d")}
          </div>
          <button onClick={nextDay} style={navBtnStyle}>→</button>
        </div>
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1f2937" }}>
          {renderDayColumn(weekDays[mobileDay], mobileDay)}
        </div>
      </div>
    </div>
  );
}