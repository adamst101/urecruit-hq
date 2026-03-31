// src/lib/demoCampData.js
// Curated static demo camp dataset for Discover demo mode.
//
// Both demo coach Discover and demo user Discover share this dataset.
// Role-specific UI differences are handled downstream in SchoolGroupCard
// via isCoach / isCoachDemo props — this file is UI-agnostic.
//
// School IDs are resolved at runtime by name-searching the real School entity,
// so logos, divisions, lat/lng, and location metadata all come from live School
// entity records. If a school is not found, the camp falls back to host_org for
// display and still renders correctly (just without a logo).

import { ensureSchoolMap, schoolMapFind } from "../components/hooks/useSchoolIdentity.jsx";
import { base44 } from "../api/base44Client";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

// ── Demo school definitions ───────────────────────────────────────────────────
// searchTerms: tried in order for exact-then-partial match against School entity
// fallback.school_name: used as host_org if the school lookup fails
// fallback division/subdivision: keeps division sort and filter working without
//   a successful School entity lookup
const DEMO_SCHOOLS = [
  // ── Power 4 FBS ──────────────────────────────────────────────────────────
  {
    key: "alabama",
    searchTerms: ["University of Alabama"],
    fallback: { school_name: "Alabama", division: "Division I", subdivision: "FBS", city: "Tuscaloosa", state: "AL" },
  },
  {
    key: "georgia",
    searchTerms: ["University of Georgia"],
    fallback: { school_name: "Georgia", division: "Division I", subdivision: "FBS", city: "Athens", state: "GA" },
  },
  {
    key: "michigan",
    searchTerms: ["University of Michigan"],
    fallback: { school_name: "Michigan", division: "Division I", subdivision: "FBS", city: "Ann Arbor", state: "MI" },
  },
  {
    key: "ohio_state",
    searchTerms: ["Ohio State University"],
    fallback: { school_name: "Ohio State", division: "Division I", subdivision: "FBS", city: "Columbus", state: "OH" },
  },
  {
    key: "penn_state",
    searchTerms: ["Pennsylvania State University", "Penn State University"],
    fallback: { school_name: "Penn State", division: "Division I", subdivision: "FBS", city: "State College", state: "PA" },
  },
  {
    key: "lsu",
    searchTerms: ["Louisiana State University"],
    fallback: { school_name: "LSU", division: "Division I", subdivision: "FBS", city: "Baton Rouge", state: "LA" },
  },
  // ── Other D1 FBS (SEC / G5) ───────────────────────────────────────────────
  {
    key: "tennessee",
    searchTerms: ["University of Tennessee"],
    fallback: { school_name: "Tennessee", division: "Division I", subdivision: "FBS", city: "Knoxville", state: "TN" },
  },
  {
    key: "auburn",
    searchTerms: ["Auburn University"],
    fallback: { school_name: "Auburn", division: "Division I", subdivision: "FBS", city: "Auburn", state: "AL" },
  },
  {
    key: "florida",
    searchTerms: ["University of Florida"],
    fallback: { school_name: "Florida", division: "Division I", subdivision: "FBS", city: "Gainesville", state: "FL" },
  },
  {
    key: "western_kentucky",
    searchTerms: ["Western Kentucky University"],
    fallback: { school_name: "Western Kentucky", division: "Division I", subdivision: "FBS", city: "Bowling Green", state: "KY" },
  },
  {
    key: "louisiana_tech",
    searchTerms: ["Louisiana Tech University"],
    fallback: { school_name: "Louisiana Tech", division: "Division I", subdivision: "FBS", city: "Ruston", state: "LA" },
  },
  {
    key: "south_alabama",
    searchTerms: ["University of South Alabama"],
    fallback: { school_name: "South Alabama", division: "Division I", subdivision: "FBS", city: "Mobile", state: "AL" },
  },
  // ── Division I FCS ────────────────────────────────────────────────────────
  {
    key: "fordham",
    searchTerms: ["Fordham University"],
    fallback: { school_name: "Fordham", division: "Division I", subdivision: "FCS", city: "Bronx", state: "NY" },
  },
  {
    key: "delaware",
    searchTerms: ["University of Delaware"],
    fallback: { school_name: "Delaware", division: "Division I", subdivision: "FCS", city: "Newark", state: "DE" },
  },
  {
    key: "ndsu",
    searchTerms: ["North Dakota State University"],
    fallback: { school_name: "North Dakota State", division: "Division I", subdivision: "FCS", city: "Fargo", state: "ND" },
  },
  // ── Division II ───────────────────────────────────────────────────────────
  {
    key: "slippery_rock",
    searchTerms: ["Slippery Rock University of Pennsylvania", "Slippery Rock University"],
    fallback: { school_name: "Slippery Rock", division: "Division II", subdivision: null, city: "Slippery Rock", state: "PA" },
  },
  {
    key: "valdosta_state",
    searchTerms: ["Valdosta State University"],
    fallback: { school_name: "Valdosta State", division: "Division II", subdivision: null, city: "Valdosta", state: "GA" },
  },
  // ── Division III ──────────────────────────────────────────────────────────
  {
    key: "mount_union",
    searchTerms: ["University of Mount Union", "Mount Union"],
    fallback: { school_name: "Mount Union", division: "Division III", subdivision: null, city: "Alliance", state: "OH" },
  },
];

// ── Demo camp templates ───────────────────────────────────────────────────────
// id:           stable string IDs — will not collide with real Camp UUIDs
// _school_key:  references DEMO_SCHOOLS[].key — replaced with real school_id at load time
// host_org:     fallback school display name if school_id lookup fails
// link_url:     demo-safe placeholder (non-null so coach message templates render a real URL)
// sport_id:     null — demo camps appear regardless of sport filter default state
const DEMO_CAMP_TEMPLATES = [
  // ─── Alabama ──────────────────────────────────────────────────────────────
  {
    id: "dc-alabama-001",
    _school_key: "alabama",
    host_org: "Alabama",
    camp_name: "Elite Skills Camp",
    start_date: "2025-06-14",
    end_date: "2025-06-14",
    city: "Tuscaloosa",
    state: "AL",
    price: 400,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-alabama-002",
    _school_key: "alabama",
    host_org: "Alabama",
    camp_name: "Crimson Tide WR & DB Camp",
    start_date: "2025-08-02",
    end_date: "2025-08-02",
    city: "Tuscaloosa",
    state: "AL",
    price: 350,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Georgia ──────────────────────────────────────────────────────────────
  {
    id: "dc-georgia-001",
    _school_key: "georgia",
    host_org: "Georgia",
    camp_name: "Bulldog Quarterback Academy",
    start_date: "2025-06-21",
    end_date: "2025-06-21",
    city: "Athens",
    state: "GA",
    price: 375,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-georgia-002",
    _school_key: "georgia",
    host_org: "Georgia",
    camp_name: "Georgia Skills Showcase",
    start_date: "2025-07-26",
    end_date: "2025-07-26",
    city: "Athens",
    state: "GA",
    price: 300,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Michigan ─────────────────────────────────────────────────────────────
  {
    id: "dc-michigan-001",
    _school_key: "michigan",
    host_org: "Michigan",
    camp_name: "Michigan Prospect Showcase",
    start_date: "2025-05-25",
    end_date: "2025-05-25",
    city: "Ann Arbor",
    state: "MI",
    price: 350,
    grades: "10-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-michigan-002",
    _school_key: "michigan",
    host_org: "Michigan",
    camp_name: "Wolverine Skills Camp",
    start_date: "2025-07-19",
    end_date: "2025-07-20",
    city: "Ann Arbor",
    state: "MI",
    price: 325,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Ohio State ───────────────────────────────────────────────────────────
  {
    id: "dc-ohiostate-001",
    _school_key: "ohio_state",
    host_org: "Ohio State",
    camp_name: "Buckeye Elite Prospect Camp",
    start_date: "2025-06-07",
    end_date: "2025-06-07",
    city: "Columbus",
    state: "OH",
    price: 450,
    grades: "10-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-ohiostate-002",
    _school_key: "ohio_state",
    host_org: "Ohio State",
    camp_name: "Lineman Challenge",
    start_date: "2025-07-26",
    end_date: "2025-07-27",
    city: "Columbus",
    state: "OH",
    price: 375,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Penn State ───────────────────────────────────────────────────────────
  {
    id: "dc-pennstate-001",
    _school_key: "penn_state",
    host_org: "Penn State",
    camp_name: "Nittany Lion Skills Camp",
    start_date: "2025-06-28",
    end_date: "2025-06-28",
    city: "State College",
    state: "PA",
    price: 350,
    grades: "10-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-pennstate-002",
    _school_key: "penn_state",
    host_org: "Penn State",
    camp_name: "Quarterback Prospect Day",
    start_date: "2025-08-09",
    end_date: "2025-08-09",
    city: "State College",
    state: "PA",
    price: 325,
    grades: "10-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── LSU ──────────────────────────────────────────────────────────────────
  {
    id: "dc-lsu-001",
    _school_key: "lsu",
    host_org: "LSU",
    camp_name: "Tiger Offensive Skills Camp",
    start_date: "2025-07-12",
    end_date: "2025-07-12",
    city: "Baton Rouge",
    state: "LA",
    price: 375,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-lsu-002",
    _school_key: "lsu",
    host_org: "LSU",
    camp_name: "Defensive Back Academy",
    start_date: "2025-08-02",
    end_date: "2025-08-02",
    city: "Baton Rouge",
    state: "LA",
    price: 350,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Tennessee ────────────────────────────────────────────────────────────
  {
    id: "dc-tennessee-001",
    _school_key: "tennessee",
    host_org: "Tennessee",
    camp_name: "Volunteer Football Camp",
    start_date: "2025-05-17",
    end_date: "2025-05-17",
    city: "Knoxville",
    state: "TN",
    price: 275,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-tennessee-002",
    _school_key: "tennessee",
    host_org: "Tennessee",
    camp_name: "Rocky Top Prospect Day",
    start_date: "2025-07-19",
    end_date: "2025-07-19",
    city: "Knoxville",
    state: "TN",
    price: 250,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Auburn ───────────────────────────────────────────────────────────────
  {
    id: "dc-auburn-001",
    _school_key: "auburn",
    host_org: "Auburn",
    camp_name: "War Eagle Skills Camp",
    start_date: "2025-06-07",
    end_date: "2025-06-07",
    city: "Auburn",
    state: "AL",
    price: 275,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-auburn-002",
    _school_key: "auburn",
    host_org: "Auburn",
    camp_name: "Auburn Lineman Camp",
    start_date: "2025-07-12",
    end_date: "2025-07-13",
    city: "Auburn",
    state: "AL",
    price: 250,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Florida ──────────────────────────────────────────────────────────────
  {
    id: "dc-florida-001",
    _school_key: "florida",
    host_org: "Florida",
    camp_name: "Gator Offensive Skills Camp",
    start_date: "2025-06-21",
    end_date: "2025-06-21",
    city: "Gainesville",
    state: "FL",
    price: 300,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-florida-002",
    _school_key: "florida",
    host_org: "Florida",
    camp_name: "Florida Prospect Showcase",
    start_date: "2025-08-02",
    end_date: "2025-08-02",
    city: "Gainesville",
    state: "FL",
    price: 275,
    grades: "10-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Western Kentucky ─────────────────────────────────────────────────────
  {
    id: "dc-wku-001",
    _school_key: "western_kentucky",
    host_org: "Western Kentucky",
    camp_name: "Hilltopper Saturday Camp",
    start_date: "2025-05-10",
    end_date: "2025-05-10",
    city: "Bowling Green",
    state: "KY",
    price: 175,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-wku-002",
    _school_key: "western_kentucky",
    host_org: "Western Kentucky",
    camp_name: "WKU Prospect Day",
    start_date: "2025-06-14",
    end_date: "2025-06-14",
    city: "Bowling Green",
    state: "KY",
    price: 200,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Louisiana Tech ───────────────────────────────────────────────────────
  {
    id: "dc-latech-001",
    _school_key: "louisiana_tech",
    host_org: "Louisiana Tech",
    camp_name: "Bulldog Skills Camp",
    start_date: "2025-05-03",
    end_date: "2025-05-03",
    city: "Ruston",
    state: "LA",
    price: 175,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-latech-002",
    _school_key: "louisiana_tech",
    host_org: "Louisiana Tech",
    camp_name: "Louisiana Tech Lineman Camp",
    start_date: "2025-06-28",
    end_date: "2025-06-29",
    city: "Ruston",
    state: "LA",
    price: 200,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── South Alabama ────────────────────────────────────────────────────────
  {
    id: "dc-southalabama-001",
    _school_key: "south_alabama",
    host_org: "South Alabama",
    camp_name: "Jaguars Recruiting Showcase",
    start_date: "2025-05-24",
    end_date: "2025-05-24",
    city: "Mobile",
    state: "AL",
    price: 225,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },
  {
    id: "dc-southalabama-002",
    _school_key: "south_alabama",
    host_org: "South Alabama",
    camp_name: "South Alabama Summer Camp",
    start_date: "2025-08-09",
    end_date: "2025-08-09",
    city: "Mobile",
    state: "AL",
    price: 175,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FBS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Fordham (FCS) ────────────────────────────────────────────────────────
  {
    id: "dc-fordham-001",
    _school_key: "fordham",
    host_org: "Fordham",
    camp_name: "Ram Spring Showcase",
    start_date: "2025-04-12",
    end_date: "2025-04-12",
    city: "Bronx",
    state: "NY",
    price: 125,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FCS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Delaware (FCS) ───────────────────────────────────────────────────────
  {
    id: "dc-delaware-001",
    _school_key: "delaware",
    host_org: "Delaware",
    camp_name: "Blue Hen Prospect Camp",
    start_date: "2025-04-26",
    end_date: "2025-04-26",
    city: "Newark",
    state: "DE",
    price: 150,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FCS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── North Dakota State (FCS) ─────────────────────────────────────────────
  {
    id: "dc-ndsu-001",
    _school_key: "ndsu",
    host_org: "North Dakota State",
    camp_name: "Bison Prospect Clinic",
    start_date: "2025-05-24",
    end_date: "2025-05-24",
    city: "Fargo",
    state: "ND",
    price: 175,
    grades: "9-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division I",
    school_division: "Division I",
    subdivision: "FCS",
    active: true,
    demo_season_year: 2025,
  },

  // ─── Slippery Rock (D2) ───────────────────────────────────────────────────
  {
    id: "dc-slipperyrock-001",
    _school_key: "slippery_rock",
    host_org: "Slippery Rock",
    camp_name: "Rock Football Camp",
    start_date: "2025-05-31",
    end_date: "2025-05-31",
    city: "Slippery Rock",
    state: "PA",
    price: 125,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division II",
    school_division: "Division II",
    subdivision: null,
    active: true,
    demo_season_year: 2025,
  },

  // ─── Valdosta State (D2) ──────────────────────────────────────────────────
  {
    id: "dc-valdosta-001",
    _school_key: "valdosta_state",
    host_org: "Valdosta State",
    camp_name: "Blazer Skills Camp",
    start_date: "2025-06-14",
    end_date: "2025-06-14",
    city: "Valdosta",
    state: "GA",
    price: 125,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division II",
    school_division: "Division II",
    subdivision: null,
    active: true,
    demo_season_year: 2025,
  },

  // ─── Mount Union (D3) ─────────────────────────────────────────────────────
  {
    id: "dc-mountunion-001",
    _school_key: "mount_union",
    host_org: "Mount Union",
    camp_name: "Purple Raiders Saturday Camp",
    start_date: "2025-04-19",
    end_date: "2025-04-19",
    city: "Alliance",
    state: "OH",
    price: 100,
    grades: "8-12",
    sport_id: null,
    link_url: "https://www.urecruithq.com/demo",
    source_url: null,
    division: "Division III",
    school_division: "Division III",
    subdivision: null,
    active: true,
    demo_season_year: 2025,
  },
];

// ── Runtime school ID resolver ────────────────────────────────────────────────
let _demoCampsCache = null;

/**
 * Returns the curated static demo camp dataset with real school_id values
 * resolved from the live School entity. Falls back to host_org for display
 * if a school cannot be matched.
 *
 * Reuses the module-level school map from useSchoolIdentity — no duplicate
 * School entity fetches when called alongside normal Discover school loading.
 *
 * Result is cached for the lifetime of the page session.
 */
export async function loadDemoCamps() {
  if (_demoCampsCache) return _demoCampsCache;

  // Populate the shared school map (no-op if already loaded)
  const School = base44?.entities?.School;
  if (School) {
    try {
      await ensureSchoolMap(School);
    } catch {
      // School map load failed — camps will render via host_org fallback without logos
    }
  }

  // Resolve a school entity ID for each demo school definition
  const resolvedIds = {};
  for (const ds of DEMO_SCHOOLS) {
    let found = null;
    for (const term of ds.searchTerms) {
      found = schoolMapFind(term);
      if (found) break;
    }
    resolvedIds[ds.key] = found ? normId(found) : null;
  }

  // Build final camp records: strip internal _school_key, inject resolved school_id
  _demoCampsCache = DEMO_CAMP_TEMPLATES.map(({ _school_key, ...rest }) => ({
    ...rest,
    school_id: resolvedIds[_school_key] || null,
  }));

  return _demoCampsCache;
}

/** Clear the demo camp cache — useful in dev/testing to force a reload. */
export function clearDemoCampsCache() {
  _demoCampsCache = null;
}
