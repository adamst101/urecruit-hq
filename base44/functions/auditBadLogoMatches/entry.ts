// functions/auditBadLogoMatches.js
//
// Scans School rows with athletic_logo_url set and flags/clears suspicious matches.
//
// Suspicious patterns:
//   - Logo URLs containing "conservation", "IUCN", "status", "range", "distribution"
//   - athletics_wikipedia_url pointing to animal/species/generic pages
//   - athletics_nickname containing temporal/taxonomic junk text
//
// POST {
//   "mode": "audit"  // audit = report only; "fix" = clear bad fields
//   "maxRows": 500,
//   "knownBadNames": ["University of Maine at Presque Isle"]  // always fixed
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function lc(x) { return String(x || "").toLowerCase().trim(); }
function safeStr(x) { if (x == null) return null; const s = String(x).trim(); return s || null; }

// ─── Suspicious logo filename patterns ───────────────────────────────────────
const BAD_LOGO_PATTERNS = [
  /conservation/i, /iucn/i, /status_iucn/i,
  /\brange\b/i, /distribution/i, /map/i,
  /flag_of/i, /coat_of_arms/i, /seal_of/i,
  /\bemblem\b/i, /\bshield\b/i, /\bcrest\b/i,
  /locator/i, /location/i, /in_[a-z]+\.svg/i,
  /taxonomy/i, /phylogeny/i, /cladogram/i,
  /stadium/i, /arena\b/i, /building/i, /campus/i,
];

function isSuspiciousLogoUrl(url) {
  if (!url) return false;
  const filename = lc(url.split("/").pop() || "");
  return BAD_LOGO_PATTERNS.some(p => p.test(filename));
}

// ─── Suspicious athletics_wikipedia_url patterns ─────────────────────────────
// Animal / species / generic pages that are NOT athletics programs

const ANIMAL_WORDS = new Set([
  "eagle", "eagles", "falcon", "falcons", "hawk", "hawks", "owl", "owls",
  "tiger", "tigers", "lion", "lions", "bear", "bears", "wolf", "wolves",
  "panther", "panthers", "cougar", "cougars", "jaguar", "jaguars",
  "mustang", "mustangs", "bronco", "broncos", "stallion", "stallions",
  "ram", "rams", "bull", "bulls", "bison", "buffalo", "buffaloes",
  "wildcat", "wildcats", "bobcat", "bobcats", "hornet", "hornets",
  "bee", "bees", "wasp", "wasps", "yellowjacket", "yellowjackets",
  "cardinal", "cardinals", "robin", "robins", "crow", "crows",
  "raven", "ravens", "jay", "jays", "osprey", "ospreys",
  "pelican", "pelicans", "penguin", "penguins", "flamingo", "flamingos",
  "dolphin", "dolphins", "shark", "sharks", "whale", "whales",
  "gator", "gators", "alligator", "alligators", "crocodile", "crocodiles",
  "cobra", "cobras", "viper", "vipers", "rattlesnake", "rattlesnakes",
  "scorpion", "scorpions", "spider", "spiders",
  "fox", "foxes", "coyote", "coyotes", "badger", "badgers",
  "otter", "otters", "beaver", "beavers", "raccoon", "raccoons",
  "rabbit", "rabbits", "hare", "hares", "jackrabbit", "jackrabbits",
  "deer", "moose", "elk", "caribou",
  "terrapin", "terrapins", "turtle", "turtles",
  "gopher", "gophers", "mole", "moles", "squirrel", "squirrels",
  "monkey", "ape", "gorilla", "chimpanzee",
  "parrot", "parrots", "macaw",
]);

const ADJECTIVE_ANIMAL_PATTERN = /^(snowy|golden|bald|gray|grey|red|blue|black|white|great|northern|southern|eastern|western|american|african|arctic|polar|mountain|timber|prairie|common)[_ ]/i;

function isSuspiciousAthleticsUrl(url) {
  if (!url) return { suspicious: false, reason: null };
  
  const path = url.replace(/.*\/wiki\//, "");
  const rawTitle = decodeURIComponent(path).replace(/_/g, " ").trim();
  
  // Check for parenthetical qualifiers indicating non-athletics
  if (/\((animal|bird|mammal|reptile|fish|insect|plant|species|genus|disambiguation|mythology|creature)\)/i.test(rawTitle)) {
    return { suspicious: true, reason: `parenthetical_qualifier: ${rawTitle}` };
  }
  
  // Check for taxonomy/species keywords in title
  if (/\b(conservation|taxonomy|species|subspecies|genus)\b/i.test(rawTitle)) {
    return { suspicious: true, reason: `taxonomy_keyword: ${rawTitle}` };
  }
  
  // Single word that is an animal name
  const words = rawTitle.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 1 && ANIMAL_WORDS.has(lc(words[0]))) {
    return { suspicious: true, reason: `single_animal_word: ${rawTitle}` };
  }
  
  // Adjective + Animal pattern without school prefix (e.g. "Snowy owl", "Golden eagle")
  // But allow known school/location prefixes like "American Eagles", "Boston Terriers"
  const KNOWN_SCHOOL_PREFIXES = new Set([
    "american", "boston", "coastal", "central", "eastern", "western", "northern",
    "southern", "pacific", "atlantic", "liberty", "national", "royal", "imperial",
    "auburn", "stanford", "harvard", "yale", "duke", "rice", "temple", "navy",
    "army", "air force", "tulane", "gonzaga", "villanova", "marquette", "creighton",
    "xavier", "dayton", "butler", "depaul", "drake", "bradley", "loyola", "fordham",
    "cornell", "brown", "dartmouth", "columbia", "princeton", "penn",
  ]);
  if (words.length === 2 && ADJECTIVE_ANIMAL_PATTERN.test(rawTitle)) {
    const firstWord = lc(words[0]);
    const lastWord = lc(words[words.length - 1]);
    // Only flag if the first word is NOT a known school/location name
    if (!KNOWN_SCHOOL_PREFIXES.has(firstWord) && (ANIMAL_WORDS.has(lastWord) || ANIMAL_WORDS.has(lastWord + "s"))) {
      return { suspicious: true, reason: `adjective_animal: ${rawTitle}` };
    }
  }
  
  // Generic mascot terms without school prefix
  const GENERIC_MASCOT = /^(yellow[_ ]?jacket|blue[_ ]?jay|blue[_ ]?devil|red[_ ]?hawk|red[_ ]?fox|gray[_ ]?wolf|golden[_ ]?eagle|bald[_ ]?eagle|black[_ ]?bear|grizzly[_ ]?bear|timber[_ ]?wolf|jack[_ ]?rabbit|road[_ ]?runner|horned[_ ]?frog|mountain[_ ]?lion|wild[_ ]?cat|sea[_ ]?wolf)s?$/i;
  if (GENERIC_MASCOT.test(rawTitle)) {
    return { suspicious: true, reason: `generic_mascot: ${rawTitle}` };
  }
  
  return { suspicious: false, reason: null };
}

function isSuspiciousNickname(nickname) {
  if (!nickname) return false;
  const n = lc(nickname);
  // Temporal range junk from Wikipedia species infoboxes
  if (n.includes("temporal range") || n.includes("pleistocene") || n.includes("holocene")) return true;
  if (/preꞓ|&#91;|&#93;|&#8595;/.test(nickname)) return true;
  if (n.length > 80) return true;
  return false;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== "admin") return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "audit"; // "audit" or "fix"
  const maxRows = Math.max(1, Number(body.maxRows || 500));
  const knownBadNames = body.knownBadNames || ["University of Maine at Presque Isle"];

  const stats = {
    scanned: 0,
    suspicious: 0,
    badLogoUrl: 0,
    badAthleticsUrl: 0,
    badNickname: 0,
    knownBadFixed: 0,
    fixed: 0,
    errors: 0,
    totalWithLogo: 0,
  };
  const flagged = [];

  const School = base44.entities.School;
  
  // Fetch all schools — we need to check both logo and athletics URL
  const allSchools = await School.filter({}, "school_name", maxRows);
  stats.scanned = allSchools.length;

  for (const row of allSchools) {
    const schoolId = row.id;
    const name = safeStr(row.school_name);
    const logoUrl = safeStr(row.athletic_logo_url);
    const athUrl = safeStr(row.athletics_wikipedia_url);
    const nickname = safeStr(row.athletics_nickname);

    if (logoUrl) stats.totalWithLogo++;

    let isBad = false;
    const reasons = [];

    // Check known bad names
    if (knownBadNames.some(n => lc(n) === lc(name))) {
      isBad = true;
      reasons.push("known_bad_name");
      stats.knownBadFixed++;
    }

    // Check logo URL
    if (logoUrl && isSuspiciousLogoUrl(logoUrl)) {
      isBad = true;
      reasons.push(`bad_logo: ${logoUrl}`);
      stats.badLogoUrl++;
    }

    // Check athletics URL
    if (athUrl) {
      const check = isSuspiciousAthleticsUrl(athUrl);
      if (check.suspicious) {
        isBad = true;
        reasons.push(`bad_ath_url: ${check.reason}`);
        stats.badAthleticsUrl++;
      }
    }

    // Check nickname
    if (nickname && isSuspiciousNickname(nickname)) {
      isBad = true;
      reasons.push(`bad_nickname: ${nickname.substring(0, 60)}`);
      stats.badNickname++;
    }

    if (isBad) {
      stats.suspicious++;
      flagged.push({
        schoolId,
        name,
        reasons,
        currentLogoUrl: logoUrl,
        currentAthUrl: athUrl,
        currentNickname: nickname ? nickname.substring(0, 60) : null,
      });

      if (mode === "fix") {
        const clearFields = {
          athletics_wikipedia_url: null,
          athletic_logo_url: null,
          athletic_logo_source: null,
          athletic_logo_confidence: null,
          athletic_logo_updated_at: null,
          athletics_nickname: null,
          athletics_audit_status: "needs_review",
        };
        try {
          await School.update(schoolId, clearFields);
          stats.fixed++;
        } catch (e) {
          stats.errors++;
        }
      }
    }
  }

  return json({
    ok: true,
    mode,
    stats,
    flagged: flagged.slice(0, 100),
  });
});