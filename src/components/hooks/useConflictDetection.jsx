// src/components/hooks/useConflictDetection.jsx
import { useMemo } from "react";
import { getCityCoords, haversine } from "./useCityCoords.jsx";

const DRIVE_MAX_MILES = 400;
const OVERNIGHT_BETWEEN_CAMPS_MILES = 200;
const FAR_FROM_HOME_MILES = 600;

function toDateStr(d) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return Infinity;
  const a = new Date(d1);
  const b = new Date(d2);
  if (isNaN(a) || isNaN(b)) return Infinity;
  return Math.abs(Math.round((b - a) / 86400000));
}

function campCoords(camp) {
  const city = camp?.city || camp?.school_city || null;
  const state = camp?.state || camp?.school_state || null;
  return getCityCoords(city, state);
}

function campLabel(camp) {
  return camp?.camp_name || camp?.school_name || "Camp";
}

function campCity(camp) {
  return [camp?.city, camp?.state].filter(Boolean).join(", ") || "unknown location";
}

export function detectConflicts({ camps, homeCity, homeState, homeLat, homeLng, isPaid }) {
  const warnings = [];
  if (!Array.isArray(camps) || camps.length === 0) return warnings;

  let homeCoords = null;
  if (isPaid) {
    if (homeLat != null && homeLng != null) {
      homeCoords = { lat: homeLat, lng: homeLng };
    } else if (homeCity || homeState) {
      homeCoords = getCityCoords(homeCity, homeState);
    }
  }

  // Check pairwise
  for (let i = 0; i < camps.length; i++) {
    for (let j = i + 1; j < camps.length; j++) {
      const a = camps[i];
      const b = camps[j];
      const dateA = toDateStr(a?.start_date);
      const dateB = toDateStr(b?.start_date);
      const gap = daysBetween(dateA, dateB);

      // TYPE 1: Same day conflict
      if (dateA && dateB && dateA === dateB) {
        const aName = a?.athleteName || null;
        const bName = b?.athleteName || null;
        const crossAthlete = aName && bName && aName !== bName;
        warnings.push({
          type: "same_day",
          severity: "error",
          campIds: [String(a?.id || ""), String(b?.id || "")],
          message: crossAthlete
            ? `⚠️ Family Conflict: ${aName}'s ${campLabel(a)} and ${bName}'s ${campLabel(b)} are both on ${dateA}.`
            : `⚠️ Date Conflict: ${campLabel(a)} and ${campLabel(b)} are both on ${dateA}. You can only attend one.`,
        });
      }

      // TYPE 2: Back-to-back + travel
      if (gap <= 2 && dateA !== dateB) {
        const coordsA = campCoords(a);
        const coordsB = campCoords(b);
        if (coordsA && coordsB) {
          const dist = Math.round(haversine(coordsA.lat, coordsA.lng, coordsB.lat, coordsB.lng));
          if (dist > OVERNIGHT_BETWEEN_CAMPS_MILES) {
            const isFlight = dist > DRIVE_MAX_MILES;
            warnings.push({
              type: "back_to_back_travel",
              severity: "warning",
              campIds: [String(a?.id || ""), String(b?.id || "")],
              distance: dist,
              message: isFlight
                ? `✈️ Travel Alert: ${campLabel(a)} (${campCity(a)}) and ${campLabel(b)} (${campCity(b)}) are ${gap} day${gap !== 1 ? "s" : ""} apart but ${dist} miles away. This likely requires a flight and hotel.`
                : `🚗 Travel Alert: ${campLabel(a)} (${campCity(a)}) and ${campLabel(b)} (${campCity(b)}) are ${gap} day${gap !== 1 ? "s" : ""} apart but ${dist} miles away. You may need a hotel stay between camps.`,
            });
          }
        }
      }
    }
  }

  // TYPE 3: Far from home (paid only)
  if (isPaid && homeCoords) {
    for (const camp of camps) {
      const cc = campCoords(camp);
      if (!cc) continue;
      const dist = Math.round(haversine(homeCoords.lat, homeCoords.lng, cc.lat, cc.lng));
      if (dist > FAR_FROM_HOME_MILES) {
        warnings.push({
          type: "far_from_home",
          severity: "info",
          campIds: [String(camp?.id || "")],
          distance: dist,
          message: `🏨 Travel Note: ${campLabel(camp)} is ~${dist} miles from ${homeCity || homeState}. You may want to plan for a hotel stay.`,
        });
      }
    }
  }

  return warnings;
}

export function useConflictDetection({ favoritedCamps, registeredCamps, additionalCamps = [], homeCity, homeState, homeLat, homeLng, isPaid }) {
  const warnings = useMemo(() => {
    const allCamps = [...(favoritedCamps || []), ...(registeredCamps || [])];
    // Dedupe current athlete's camps by id
    const seen = new Set();
    const unique = [];
    for (const c of allCamps) {
      const id = String(c?.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(c);
    }
    // Append other athletes' camps (exclude any already present)
    const extra = (additionalCamps || []).filter((c) => !seen.has(String(c?.id || "")));
    return detectConflicts({ camps: [...unique, ...extra], homeCity, homeState, homeLat, homeLng, isPaid });
  }, [favoritedCamps, registeredCamps, additionalCamps, homeCity, homeState, homeLat, homeLng, isPaid]);

  const getWarningsForCamp = useMemo(() => {
    return (campId) => {
      const id = String(campId || "");
      return warnings.filter((w) => w.campIds?.includes(id));
    };
  }, [warnings]);

  return { warnings, getWarningsForCamp };
}