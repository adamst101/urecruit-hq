// src/api/entities.js
import { base44 } from "./base44Client";

/**
 * Entities: Single source of truth for Base44 tables used in this app.
 * Keep this file STRICT: export only tables that exist in Base44 for this project.
 *
 * Current Base44 entities (confirmed in UI):
 * Camp, UserCamp, Sport, Position, School, Favorite, Registration,
 * AthleteProfile, CampIntent, CampIntentHistory, TargetSchool
 */

// Helper: some Base44 projects use plural entity names (Camps, Sports, etc.)
function pickEntity(...names) {
  const e = base44 && base44.entities ? base44.entities : null;
  if (!e) return undefined;

  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (e[n]) return e[n];
  }
  return undefined;
}

// --- Entities (tables) ---
export const AthleteProfile = pickEntity("AthleteProfile", "AthleteProfiles");

export const Camp = pickEntity("Camp", "Camps");
export const CampIntent = pickEntity("CampIntent", "CampIntents");
export const CampIntentHistory = pickEntity("CampIntentHistory", "CampIntentHistories");

export const Favorite = pickEntity("Favorite", "Favorites");
export const Position = pickEntity("Position", "Positions");
export const Registration = pickEntity("Registration", "Registrations");

export const School = pickEntity("School", "Schools");
export const Sport = pickEntity("Sport", "Sports");

export const TargetSchool = pickEntity("TargetSchool", "TargetSchools");
export const UserCamp = pickEntity("UserCamp", "UserCamps");

// --- Auth SDK ---
export const User = base44 && base44.auth ? base44.auth : undefined;

// Optional: quick sanity check you can call from anywhere
export function _entitiesSanity() {
  return {
    hasBase44: !!base44,
    hasEntities: !!(base44 && base44.entities),
    entitiesFound: {
      AthleteProfile: !!AthleteProfile,
      Camp: !!Camp,
      CampIntent: !!CampIntent,
      CampIntentHistory: !!CampIntentHistory,
      Favorite: !!Favorite,
      Position: !!Position,
      Registration: !!Registration,
      School: !!School,
      Sport: !!Sport,
      TargetSchool: !!TargetSchool,
      UserCamp: !!UserCamp,
    },
  };
}
