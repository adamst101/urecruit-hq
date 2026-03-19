import React, { useEffect, useState } from "react";
import { base44 } from "../../api/base44Client";
import { ChevronDown, UserPlus, Check } from "lucide-react";
import { setActiveAthleteId } from "../../components/hooks/useActiveAthlete.jsx";

export default function AthleteSwitcher({ accountId, seasonYear, onAddAthlete }) {
  const [athletes, setAthletes] = useState([]);
  const [entitlements, setEntitlements] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(() => {
    try { return sessionStorage.getItem("activeAthleteId") || null; } catch { return null; }
  });

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const [athRows, entRows] = await Promise.all([
          base44.entities.AthleteProfile.filter({ account_id: accountId }),
          base44.entities.Entitlement.filter({ account_id: accountId, status: "active" }),
        ]);
        if (cancelled) return;
        const aList = Array.isArray(athRows) ? athRows : [];
        setAthletes(aList);
        setEntitlements(Array.isArray(entRows) ? entRows : []);
        // Default to primary athlete
        if (!activeId && aList.length > 0) {
          const primary = aList.find(a => a.is_primary) || aList[0];
          const id = primary.id || primary._id;
          setActiveId(id);
          setActiveAthleteId(id); // notifies all subscribers
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  if (athletes.length <= 1) return null;

  const hasEntitlement = (athleteId) => {
    return entitlements.some(e => e.athlete_id === athleteId && e.season_year === seasonYear);
  };

  const activeAthlete = athletes.find(a => (a.id || a._id) === activeId) || athletes[0];
  const displayName = activeAthlete?.athlete_name || activeAthlete?.display_name || activeAthlete?.first_name || "Athlete";

  function selectAthlete(a) {
    const id = a.id || a._id;
    setActiveId(id);
    setActiveAthleteId(id); // notifies all subscribers across the app
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "#111827", border: "1px solid #1f2937", borderRadius: 10,
          padding: "12px 18px", display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer", color: "#f9fafb", fontSize: 16, fontWeight: 600, width: "100%",
        }}
      >
        <span style={{ color: "#9ca3af", fontSize: 14 }}>Viewing:</span>
        <span>{displayName}</span>
        <ChevronDown style={{ width: 16, height: 16, color: "#9ca3af", marginLeft: "auto", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 50,
          background: "#111827", border: "1px solid #1f2937", borderRadius: 10, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {athletes.map(a => {
            const id = a.id || a._id;
            const name = a.athlete_name || a.display_name || a.first_name || "Athlete";
            const isActive = id === activeId;
            const entitled = hasEntitlement(id);
            return (
              <button
                key={id}
                onClick={() => selectAthlete(a)}
                style={{
                  width: "100%", background: isActive ? "rgba(232,160,32,0.08)" : "transparent",
                  border: "none", borderBottom: "1px solid #1f2937",
                  padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer", color: "#f9fafb", fontSize: 15, textAlign: "left",
                }}
              >
                {isActive && <Check style={{ width: 14, height: 14, color: "#e8a020" }} />}
                <span style={{ fontWeight: isActive ? 700 : 400 }}>{name}</span>
                {a.is_primary && <span style={{ fontSize: 11, color: "#9ca3af", background: "#1f2937", padding: "2px 6px", borderRadius: 4 }}>Primary</span>}
                {entitled && <span style={{ fontSize: 11, color: "#22c55e" }}>Season {seasonYear} ✓</span>}
              </button>
            );
          })}
          {onAddAthlete && (
            <button
              onClick={() => { setOpen(false); onAddAthlete(); }}
              style={{
                width: "100%", background: "transparent", border: "none",
                padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", color: "#e8a020", fontSize: 15, fontWeight: 600,
              }}
            >
              <UserPlus style={{ width: 16, height: 16 }} />
              Add Another Athlete ($39)
            </button>
          )}
        </div>
      )}
    </div>
  );
}