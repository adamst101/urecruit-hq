// src/api/entities.js
import { base44 } from "./base44Client";

// Robust entity picker: prefer exact match, then common pluralization.
function pickEntity(...names) {
  const e = base44?.entities;
  if (!e) return undefined;

  for (const n of names) {
    if (e[n]) return e[n];
  }

  // Extra safety: common pluralization fallbacks
  for (const n of names) {
    const plural = `${n}s`;
    if (e[plural]) return e[plural];
  }

  return undefined;
}

// --- Entities (tables) ---
export const AthleteProfile = pickEntity("AthleteProfile", "AthleteProfiles");
export const Camp = pickEntity("Camp", "Camps");
export const CampDecisionScore = pickEntity("CampDecisionScore", "CampDecisionScores");
export const CampDemo = pickEntity("CampDemo", "CampDemos");
export const CampIntent = pickEntity("CampIntent", "CampIntents");

export const Entitlement = pickEntity("Entitlement", "Entitlements");
export const Event = pickEntity("Event", "Events");

export const Position = pickEntity("Position", "Positions");
export const Registration = pickEntity("Registration", "Registrations");

// IMPORTANT: ensure School resolves correctly
export const School = pickEntity("School", "Schools");
export const SchoolSportSite = pickEntity("SchoolSportSite", "SchoolSportSites");
export const Sport = pickEntity("Sport", "Sports");

// --- Athletics enrichment layer ---
export const AthleticsMembership = pickEntity("AthleticsMembership", "AthleticsMemberships");
export const SchoolSport = pickEntity("SchoolSport", "SchoolSports");
export const UnmatchedAthleticsRow = pickEntity("UnmatchedAthleticsRow", "UnmatchedAthleticsRows");
export const AthleticsMatchOverride = pickEntity("AthleticsMatchOverride", "AthleticsMatchOverrides");

// Optional: keep Query if you’re using it
export const MonthlyAgendaContent = pickEntity("MonthlyAgendaContent", "MonthlyAgendaContents");
export const EmailPreferences = pickEntity("EmailPreferences", "EmailPreferences");
export const RoadmapItem = pickEntity("RoadmapItem", "RoadmapItems");

export const Query = pickEntity("Query", "Queries");

// --- Auth SDK ---
export const User = base44?.auth;

// Debug helper: quickly verify key bindings from anywhere
export function _entitiesSanity() {
  const keys = Object.keys(base44?.entities || {});
  return {
    hasBase44: !!base44,
    hasEntities: !!base44?.entities,
    entityKeysCount: keys.length,
    hasSchool: !!(base44?.entities?.School || base44?.entities?.Schools),
    hasEvent: !!(base44?.entities?.Event || base44?.entities?.Events),
    picked: {
      School: !!School,
      Event: !!Event,
      Camp: !!Camp,
      CampDemo: !!CampDemo,
      SchoolSportSite: !!SchoolSportSite,
      AthleticsMembership: !!AthleticsMembership,
      SchoolSport: !!SchoolSport,
      UnmatchedAthleticsRow: !!UnmatchedAthleticsRow,
    },
  };
}
