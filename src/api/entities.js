// src/api/entities.js
import { base44 } from "./base44Client";

// --- Entities (tables) ---
// Export ONLY what you use. Add more as needed.
export const AthleteProfile = base44.entities.AthleteProfile;
export const BudgetConstraint = base44.entities.BudgetConstraint;
export const CalendarConstraint = base44.entities.CalendarConstraint;

export const Camp = base44.entities.Camp;
export const CampDecisionScore = base44.entities.CampDecisionScore;
export const CampDemo = base44.entities.CampDemo;
export const CampIntent = base44.entities.CampIntent;
export const CampIntentHistory = base44.entities.CampIntentHistory;

export const Entitlement = base44.entities.Entitlement;
export const Event = base44.entities.Event;

export const Favorite = base44.entities.Favorite;
export const Position = base44.entities.Position;
export const Registration = base44.entities.Registration;

export const Scenario = base44.entities.Scenario;
export const ScenarioCamp = base44.entities.ScenarioCamp;

export const School = base44.entities.School;
export const SchoolSportSite = base44.entities.SchoolSportSite;
export const Sport = base44.entities.Sport;

export const TargetSchool = base44.entities.TargetSchool;
export const TargetSchoolHistory = base44.entities.TargetSchoolHistory;

export const TravelConstraint = base44.entities.TravelConstraint;
export const UserCamp = base44.entities.UserCamp;

// Optional: keep Query if you’re using it
export const Query = base44.entities.Query;

// --- Auth SDK ---
export const User = base44.auth;
