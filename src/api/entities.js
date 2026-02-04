// src/api/entities.js
import { base44 } from "./base44Client";

// Helper: some Base44 projects use plural entity names (Camps, Sports, etc.)
function pickEntity(...names) {
  const e = base44?.entities;
  for (const n of names) {
    if (e && e[n]) return e[n];
  }
  return undefined;
}

// --- Entities (tables) ---
export const AthleteProfile = pickEntity("AthleteProfile");
export const BudgetConstraint = pickEntity("BudgetConstraint");
export const CalendarConstraint = pickEntity("CalendarConstraint");

export const Camp = pickEntity("Camp", "Camps");
export const CampDecisionScore = pickEntity("CampDecisionScore", "CampDecisionScores");
export const CampDemo = pickEntity("CampDemo", "CampDemos");
export const CampIntent = pickEntity("CampIntent", "CampIntents");
export const CampIntentHistory = pickEntity("CampIntentHistory", "CampIntentHistories");

export const Entitlement = pickEntity("Entitlement", "Entitlements");
export const Event = pickEntity("Event", "Events");

export const Favorite = pickEntity("Favorite", "Favorites");
export const Position = pickEntity("Position", "Positions");
export const Registration = pickEntity("Registration", "Registrations");

export const Scenario = pickEntity("Scenario", "Scenarios");
export const ScenarioCamp = pickEntity("ScenarioCamp", "ScenarioCamps");

export const School = pickEntity("School", "Schools");
export const SchoolSportSite = pickEntity("SchoolSportSite", "SchoolSportSites");
export const Sport = pickEntity("Sport", "Sports");

export const TargetSchool = pickEntity("TargetSchool", "TargetSchools");
export const TargetSchoolHistory = pickEntity("TargetSchoolHistory", "TargetSchoolHistories");

export const TravelConstraint = pickEntity("TravelConstraint", "TravelConstraints");
export const UserCamp = pickEntity("UserCamp", "UserCamps");

// Optional: keep Query if you’re using it
export const Query = pickEntity("Query");

// --- Auth SDK ---
export const User = base44?.auth;

// Optional: quick sanity check you can call from anywhere
export function _entitiesSanity() {
  return {
    hasBase44: !!base44,
    hasEntities: !!base44?.entities,
    hasCampExport: typeof Camp !== "undefined",
    hasSportExport: typeof Sport !== "undefined",
  };
}
