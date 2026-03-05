import React from "react";
import { UserPlus } from "lucide-react";

export default function SecondAthleteSection({
  addSecond, setAddSecond,
  athleteTwoName, setAthleteTwoName,
  athleteTwoGradYear, setAthleteTwoGradYear,
  addOnPrice,
}) {
  return (
    <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: "20px 24px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <UserPlus style={{ width: 16, height: 16, color: "#9ca3af" }} />
        <span style={{ fontSize: 15, color: "#d1d5db", fontWeight: 600 }}>Add a Second Athlete?</span>
      </div>

      <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12 }}>
        Add another player to your account for just ${addOnPrice} more this season.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={addSecond}
          onChange={(e) => setAddSecond(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "#e8a020" }}
        />
        <span style={{ fontSize: 15, color: "#f9fafb", fontWeight: 600 }}>
          Yes, add a second athlete (+${addOnPrice})
        </span>
      </label>

      {addSecond && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            value={athleteTwoName}
            onChange={(e) => setAthleteTwoName(e.target.value)}
            placeholder="Athlete name (required)"
            style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 15, color: "#f9fafb", outline: "none" }}
          />
          <input
            type="text"
            value={athleteTwoGradYear}
            onChange={(e) => setAthleteTwoGradYear(e.target.value)}
            placeholder="Grad year (e.g. 2028)"
            style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 15, color: "#f9fafb", outline: "none" }}
          />
        </div>
      )}
    </div>
  );
}