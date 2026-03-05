import React from "react";
import { format } from "date-fns";

function safeFormat(d, fmt) {
  try {
    if (!d) return "TBD";
    return format(new Date(d), fmt);
  } catch {
    return "TBD";
  }
}

export default function CampDetailPanel({ camp, school, status, isConflict, conflictWith, onClose, onFavorite, onRegister, onUnregister, onUnfavorite }) {
  if (!camp) return null;

  const isFav = status === "favorite";
  const isReg = status === "registered" || status === "completed";
  const schoolName = school?.school_name || "Unknown School";
  const division = school?.division || null;
  const letter = (schoolName.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();
  const city = [camp?.city, camp?.state].filter(Boolean).join(", ");
  const price = typeof camp?.price === "number" && camp.price > 0 ? `$${camp.price}` : null;

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
          left: 0,
          right: 0,
          maxHeight: "70vh",
          background: "#111827",
          borderTop: "3px solid #e8a020",
          borderRadius: "20px 20px 0 0",
          padding: 24,
          zIndex: 100,
          overflowY: "auto",
          transform: "translateY(0)",
          transition: "transform 0.3s ease",
        }}
        className="md:max-h-[70vh] max-h-[85vh]"
      >
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
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
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
          <div>
            <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: 20 }}>{schoolName}</div>
            {division && (
              <span style={{
                background: "#e8a020", color: "#0a0e1a",
                fontSize: 11, fontWeight: 700, padding: "2px 8px",
                borderRadius: 12, marginTop: 2, display: "inline-block",
              }}>
                {division}
              </span>
            )}
          </div>
        </div>

        {/* Detail rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 15, color: "#9ca3af" }}>📅 {safeFormat(camp?.start_date, "MMM d, yyyy")}</div>
          {city && <div style={{ fontSize: 15, color: "#9ca3af" }}>📍 {city}</div>}
          {price && <div style={{ fontSize: 15, color: "#9ca3af" }}>💰 {price}</div>}
          {camp?.grades && <div style={{ fontSize: 15, color: "#9ca3af" }}>🎓 {camp.grades}</div>}
        </div>

        {/* Status badge */}
        {isReg && (
          <div style={{
            background: "#065f46", color: "#6ee7b7",
            padding: "8px 16px", borderRadius: 12, fontSize: 15,
            fontWeight: 700, textAlign: "center", marginBottom: 16,
          }}>
            ✓ Registered
          </div>
        )}
        {isFav && !isReg && (
          <div style={{
            background: "#92400e", color: "#fcd34d",
            padding: "8px 16px", borderRadius: 12, fontSize: 15,
            fontWeight: 700, textAlign: "center", marginBottom: 16,
          }}>
            ★ Favorited
          </div>
        )}

        {/* Conflict warning */}
        {isConflict && (
          <div style={{
            background: "#7f1d1d", border: "1px solid #ef4444",
            borderRadius: 10, padding: 14, marginBottom: 16,
            color: "#fca5a5", fontSize: 14,
          }}>
            ⚠ This camp conflicts with {conflictWith || "another camp"} — same date.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!isFav && !isReg && onFavorite && (
            <button
              onClick={onFavorite}
              style={{
                background: "transparent", color: "#e8a020",
                border: "2px solid #e8a020", borderRadius: 10,
                padding: "12px 0", fontSize: 16, fontWeight: 700,
                cursor: "pointer", width: "100%",
              }}
            >
              ★ Add to Favorites
            </button>
          )}
          {isFav && !isReg && (
            <>
              <button
                onClick={onUnfavorite}
                style={{
                  background: "#e8a020", color: "#0a0e1a",
                  border: "none", borderRadius: 10,
                  padding: "12px 0", fontSize: 16, fontWeight: 700,
                  cursor: "pointer", width: "100%",
                }}
              >
                ★ Favorited
              </button>
              {onRegister && (
                <button
                  onClick={onRegister}
                  style={{
                    background: "#e8a020", color: "#0a0e1a",
                    border: "none", borderRadius: 10,
                    padding: "12px 0", fontSize: 16, fontWeight: 700,
                    cursor: "pointer", width: "100%",
                  }}
                >
                  Register →
                </button>
              )}
            </>
          )}
          {isReg && (
            <>
              <button
                disabled
                style={{
                  background: "#065f46", color: "#6ee7b7",
                  border: "none", borderRadius: 10,
                  padding: "12px 0", fontSize: 16, fontWeight: 700,
                  cursor: "default", width: "100%", opacity: 0.8,
                }}
              >
                ✓ Registered
              </button>
              {onUnregister && (
                <button
                  onClick={onUnregister}
                  style={{
                    background: "transparent", color: "#fca5a5",
                    border: "none", fontSize: 13, cursor: "pointer",
                    textDecoration: "underline", textUnderlineOffset: 2,
                    padding: "6px 0",
                  }}
                >
                  Remove registration
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}