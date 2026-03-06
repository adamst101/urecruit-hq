import React, { useState, useEffect } from "react";
import { format } from "date-fns";

function safeFormat(d, fmt) {
  try {
    if (!d) return "TBD";
    return format(new Date(d), fmt);
  } catch {
    return "TBD";
  }
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handle = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [breakpoint]);
  return mobile;
}

export default function CampDetailPanel({ camp, school, status, isConflict, conflictWith, onClose, onFavorite, onRegister, onUnregister, onUnfavorite }) {
  const isMobile = useIsMobile();

  if (!camp) return null;

  const isFav = status === "favorite";
  const isReg = status === "registered" || status === "completed";
  const schoolName = school?.school_name || "Unknown School";
  const division = school?.division || null;
  const letter = (schoolName.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();
  const city = [camp?.city, camp?.state].filter(Boolean).join(", ");
  const price = typeof camp?.price === "number" && camp.price > 0 ? `$${camp.price}` : null;

  // Status badge config
  const statusColors = isReg
    ? { bg: "#052e1622", text: "#6ee7b7", border: "#10b981", label: "✓ Registered" }
    : isFav
      ? { bg: "#92400e22", text: "#fcd34d", border: "#d97706", label: "★ Favorited" }
      : null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 99,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: isMobile ? 0 : "50%",
          right: isMobile ? 0 : "auto",
          transform: isMobile ? "translateY(0)" : "translateX(-50%) translateY(0)",
          width: "100%",
          maxWidth: isMobile ? "100%" : 560,
          maxHeight: isMobile ? "85vh" : "70vh",
          background: "#111827",
          borderTop: "3px solid #e8a020",
          borderRadius: "20px 20px 0 0",
          padding: 24,
          zIndex: 100,
          overflowY: "auto",
          transition: "transform 0.3s ease",
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: "#374151", borderRadius: 2, margin: "0 auto 20px" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#e8a020" }}>
            {safeFormat(camp?.start_date, "EEEE, MMMM d, yyyy")}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* School row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          {school?.logo_url ? (
            <img
              src={school.logo_url}
              alt={schoolName}
              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "contain", background: "#0f172a" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg, #e8a020, #c4841d)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#fff",
            }}>
              {letter}
            </div>
          )}
          <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: 20 }}>{schoolName}</div>
        </div>

        {/* Status badge — single instance */}
        {statusColors && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: statusColors.bg,
            color: statusColors.text,
            border: `1px solid ${statusColors.border}`,
            borderRadius: 20,
            padding: "5px 14px",
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 16,
          }}>
            {statusColors.label}
          </div>
        )}

        {/* Detail rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 15, color: "#9ca3af" }}>📅 {safeFormat(camp?.start_date, "MMM d, yyyy")}</div>
          {city && <div style={{ fontSize: 15, color: "#9ca3af" }}>📍 {city}</div>}
          {price && <div style={{ fontSize: 15, color: "#9ca3af" }}>💰 {price}</div>}
          {division && <div style={{ fontSize: 15, color: "#9ca3af" }}>🏈 {division}</div>}
          {camp?.grades && <div style={{ fontSize: 15, color: "#9ca3af" }}>🎓 {camp.grades}</div>}
        </div>

        {/* Conflict warning — above action buttons */}
        {isConflict && (
          <div style={{
            background: "#1c0505",
            border: "1px solid #ef4444",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 13,
            color: "#fca5a5",
          }}>
            ⚠ This camp conflicts with {conflictWith || "another camp"} on your calendar. You can still register — just be aware of the overlap.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isReg && (
            <>
              <div style={{
                background: "#052e16",
                color: "#6ee7b7",
                border: "1px solid #10b981",
                borderRadius: 10,
                padding: 14,
                fontSize: 16,
                fontWeight: 700,
                textAlign: "center",
              }}>
                ✓ Registered
              </div>
              {onUnregister && (
                <button
                  onClick={() => { onUnregister(); onClose(); }}
                  style={{
                    background: "none", border: "none",
                    color: "#6b7280", fontSize: 13, cursor: "pointer",
                    textDecoration: "underline", textUnderlineOffset: 2,
                    padding: "6px 0", textAlign: "center",
                  }}
                >
                  Remove registration
                </button>
              )}
            </>
          )}

          {isFav && !isReg && (
            <>
              {onRegister && (
                <button
                  onClick={() => { onRegister(); onClose(); }}
                  style={{
                    background: "#e8a020", color: "#0a0e1a",
                    border: "none", borderRadius: 10,
                    padding: 14, fontSize: 16, fontWeight: 700,
                    cursor: "pointer", width: "100%",
                  }}
                >
                  Register for this camp →
                </button>
              )}
              {onUnfavorite && (
                <button
                  onClick={() => { onUnfavorite(); onClose(); }}
                  style={{
                    background: "transparent", color: "#6b7280",
                    border: "1px solid #374151", borderRadius: 10,
                    padding: 12, fontSize: 14,
                    cursor: "pointer", width: "100%",
                  }}
                >
                  ★ Remove from favorites
                </button>
              )}
            </>
          )}

          {!isFav && !isReg && onFavorite && (
            <button
              onClick={() => { onFavorite(); onClose(); }}
              style={{
                background: "transparent", color: "#e8a020",
                border: "2px solid #e8a020", borderRadius: 10,
                padding: 14, fontSize: 16, fontWeight: 700,
                cursor: "pointer", width: "100%",
              }}
            >
              ★ Add to Favorites
            </button>
          )}
        </div>
      </div>
    </>
  );
}