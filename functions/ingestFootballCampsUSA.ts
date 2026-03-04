// functions/ingestFootballCampsUSA.js
// Full pipeline: footballcampsusa.com → School matching → Camp extraction → Upsert
// Idempotent via source_key = "footballcampsusa:{ryzer_camp_id}"
//
// Usage:
//   Step 1 (school match only):  { "step": "matchSchools" }
//   Step 2 (dry run 5 schools):  { "dryRun": true, "maxSchools": 5, "startAt": 0, "sleepMs": 1000 }
//   Step 3 (live batch):         { "dryRun": false, "maxSchools": 20, "startAt": 0, "sleepMs": 1000 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

var VERSION = "ingestFootballCampsUSA_v2";
var FOOTBALL_SPORT_ID = "69407156fe19c3615944865f";
var MATCH_CONFIDENCE_THRESHOLD = 0.7;
var SOURCE_PLATFORM = "footballcampsusa";

// ─── helpers ────────────────────────────────────────────────────────────────

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); }

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x).trim();
}
function safeStrOrNull(x) { var s = safeStr(x); return s || null; }
function lc(x) { return safeStr(x).toLowerCase(); }

function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function normalizeName(name) {
  return lc(name).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function hashLite(s) {
  var str = String(s || "");
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

var STATE_ABBR_TO_FULL = {
  AL:"alabama",AK:"alaska",AZ:"arizona",AR:"arkansas",CA:"california",
  CO:"colorado",CT:"connecticut",DE:"delaware",FL:"florida",GA:"georgia",
  HI:"hawaii",ID:"idaho",IL:"illinois",IN:"indiana",IA:"iowa",
  KS:"kansas",KY:"kentucky",LA:"louisiana",ME:"maine",MD:"maryland",
  MA:"massachusetts",MI:"michigan",MN:"minnesota",MS:"mississippi",MO:"missouri",
  MT:"montana",NE:"nebraska",NV:"nevada",NH:"new hampshire",NJ:"new jersey",
  NM:"new mexico",NY:"new york",NC:"north carolina",ND:"north dakota",OH:"ohio",
  OK:"oklahoma",OR:"oregon",PA:"pennsylvania",RI:"rhode island",SC:"south carolina",
  SD:"south dakota",TN:"tennessee",TX:"texas",UT:"utah",VT:"vermont",
  VA:"virginia",WA:"washington",WV:"west virginia",WI:"wisconsin",WY:"wyoming",
  DC:"district of columbia",
};
function normalizeState(s) {
  var v = lc(s);
  if (!v) return "";
  var full = STATE_ABBR_TO_FULL[v.toUpperCase()];
  if (full) return full;
  return v;
}

async function fetchWithTimeout(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 15000);
  try {
    var resp = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, status: resp.status, html: "" };
    var html = await resp.text();
    return { ok: true, status: resp.status, html: html };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, html: "", error: String(e.message || e) };
  }
}

// ─── STEP 1: Fetch program list from footballcampsusa.com ───────────────────
// v2: Card-boundary parsing using <div class="listItem"> as delimiter.
// Each card contains: schoolLogo img, span.school, p (description), a.viewSite.

function parseFootballCampsUSADirectory(html) {
  var programs = [];
  if (!html) return programs;

  // Split on card boundaries
  var chunks = html.split('<div class="listItem"');
  var cardChunks = chunks.slice(1); // first chunk is pre-cards HTML

  for (var i = 0; i < cardChunks.length; i++) {
    var card = cardChunks[i];

    // Name from <span class="school">
    var nameMatch = /<span class="school">([^<]+)<\/span>/i.exec(card);
    var name = nameMatch ? nameMatch[1].trim() : null;

    // Logo from first <img> with Ryzer S3 src
    var logoMatch = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/i.exec(card);
    var logoUrl = logoMatch ? logoMatch[1] : null;

    // Fallback name from img alt
    if (!name) {
      var altMatch = /alt="([^"]+)"/i.exec(card);
      name = altMatch ? altMatch[1].trim() : "(unknown)";
    }

    // URL from "View Site" anchor
    var urlMatch = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site/i.exec(card);
    if (!urlMatch) urlMatch = /<a\s+href="([^"]+)"[^>]*class="viewSite"/i.exec(card);
    var url = urlMatch ? urlMatch[1].trim() : null;

    // Description from <p> inside extraInfo div
    var descMatch = /<p>([^<]+(?:<[^>]+>[^<]*)*)<\/p>/i.exec(card);
    var description = descMatch ? stripTags(descMatch[1]).trim() : null;

    // Extract school info from description
    var descExtracted = extractSchoolFromDescription(description);

    programs.push({
      name: name || "(unknown)",
      url: url || null,
      logo_url: logoUrl || null,
      description: description || null,
      desc_school: descExtracted.school || null,
      desc_city: descExtracted.city || null,
      desc_state: descExtracted.state || null,
      desc_nickname: descExtracted.nickname || null,
    });
  }

  // Dedupe by URL
  var seen = {};
  var deduped = [];
  for (var j = 0; j < programs.length; j++) {
    var key = lc(programs[j].url || programs[j].name || "").replace(/\/+$/, "");
    if (seen[key]) continue;
    seen[key] = true;
    deduped.push(programs[j]);
  }
  return deduped;
}

// Extract school name, city, state, and nickname from description text
function extractSchoolFromDescription(desc) {
  var result = { school: null, city: null, state: null, nickname: null };
  if (!desc) return result;

  // Extract city, state: "in City, ST" or "in City, State"
  var csMatch = /\bin\s+([A-Z][A-Za-z\s.'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(desc);
  if (csMatch) {
    result.city = csMatch[1].trim();
    result.state = csMatch[2].trim();
  }

  // Extract nickname from "led by the [Nickname] (football|coaching) staff"
  var nickMatch = /led by (?:the |its )?(.+?)\s+(?:Football\s+)?(?:coaching\s+)?staff/i.exec(desc);
  if (nickMatch && nickMatch[1]) {
    var nick = nickMatch[1].trim()
      .replace(/^Head Coach\s+\w+\s+and the\s+/i, "")
      .replace(/^Head Coach\s+and the\s+/i, "")
      .replace(/^its\s+/i, "")
      .replace(/\s+Football$/i, "");
    if (nick.length >= 3 && nick.length < 50) {
      result.nickname = nick;
    }
  }

  // Try patterns in priority order to extract school name:

  // 1. "campus of [School Name]"
  var m = /campus of\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  // 2. "on the [School Name] campus"
  m = /on the\s+(.+?)\s+campus/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  // 3. "held at [Venue] at [School]" — look for university/college within it
  m = /held at\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) {
    var uniInVenue = /((?:University of [A-Za-z\s.&'-]+|[A-Za-z\s.&'-]+ University|[A-Za-z\s.&'-]+ College|[A-Za-z\s.&'-]+ Institute))/i.exec(m[1]);
    if (uniInVenue) {
      result.school = cleanSchoolName(uniInVenue[1]);
      if (result.school) return result;
    }
  }

  // 4. "led by the [School] football/coaching staff"
  m = /led by the\s+(.+?)\s+(?:football|coaching)\s+staff/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  // 5. General: find "University of X" or "X University" or "X College" anywhere
  m = /(University of [A-Za-z\s.&'-]+|[A-Z][A-Za-z\s.&'-]+ University|[A-Z][A-Za-z\s.&'-]+ College(?!\s+Football))/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  return result;
}

function cleanSchoolName(raw) {
  if (!raw) return null;
  var s = raw.trim();
  s = s.replace(/\s+Football.*$/i, "");
  s = s.replace(/\s+(campus|staff|coaching|camp|camps|stadium).*$/i, "");
  s = s.replace(/^the\s+/i, "");
  s = s.replace(/[.,;:!]+$/, "").trim();
  if (s.length < 3) return null;
  return s;
}

// ─── STEP 2: School matching ────────────────────────────────────────────────

function buildSchoolIndex(schools) {
  var byNormName = {};
  var byNicknameState = {};
  var byLogoUrl = {};
  var byNickname = {}; // nickname alone (no state)
  var byCityState = {}; // "city|state" → [schools]
  var byNicknameAlone = {}; // just the nickname word(s) from athletics_nickname, e.g. "wildcats"

  for (var i = 0; i < schools.length; i++) {
    var s = schools[i];
    var sid = safeStr(s.id);
    if (!sid) continue;

    var nn = lc(s.normalized_name || s.school_name || "");
    if (nn) {
      if (!byNormName[nn]) byNormName[nn] = [];
      byNormName[nn].push({ id: sid, school: s });
    }

    var nick = lc(s.athletics_nickname || "");
    var st = normalizeState(s.state);
    if (nick && st) {
      var nk = nick + "|" + st;
      if (!byNicknameState[nk]) byNicknameState[nk] = [];
      byNicknameState[nk].push({ id: sid, school: s });
    }
    if (nick) {
      if (!byNickname[nick]) byNickname[nick] = [];
      byNickname[nick].push({ id: sid, school: s });

      // Extract just the mascot/team name portion (last word(s) after school name)
      // e.g. "Alabama Crimson Tide" → "crimson tide", "Iowa Western Reivers" → "reivers"
      var nickWords = nick.split(/\s+/);
      // Try last 2 words, then last 1 word as mascot keys
      if (nickWords.length >= 2) {
        var last2 = nickWords.slice(-2).join(" ");
        if (!byNicknameAlone[last2]) byNicknameAlone[last2] = [];
        byNicknameAlone[last2].push({ id: sid, school: s });
      }
      if (nickWords.length >= 1) {
        var last1 = nickWords[nickWords.length - 1];
        if (last1.length >= 4) { // skip very short like "owls" could be ambiguous — actually keep all
          if (!byNicknameAlone[last1]) byNicknameAlone[last1] = [];
          byNicknameAlone[last1].push({ id: sid, school: s });
        }
      }
      // Also index the full nickname string
      if (!byNicknameAlone[nick]) byNicknameAlone[nick] = [];
      // avoid dupe
      var already = byNicknameAlone[nick].some(function(e) { return e.id === sid; });
      if (!already) byNicknameAlone[nick].push({ id: sid, school: s });
    }

    // City+State index
    var city = lc(s.city || "");
    if (city && st) {
      var csKey = city + "|" + st;
      if (!byCityState[csKey]) byCityState[csKey] = [];
      byCityState[csKey].push({ id: sid, school: s });
    }

    // Logo URLs (both fields)
    var logos = [s.logo_url, s.athletic_logo_url];
    for (var li = 0; li < logos.length; li++) {
      var lu = safeStrOrNull(logos[li]);
      if (lu) {
        var luKey = lc(lu);
        if (!byLogoUrl[luKey]) byLogoUrl[luKey] = [];
        byLogoUrl[luKey].push({ id: sid, school: s });
      }
    }
  }

  return {
    byNormName: byNormName,
    byNicknameState: byNicknameState,
    byLogoUrl: byLogoUrl,
    byNickname: byNickname,
    byNicknameAlone: byNicknameAlone,
    byCityState: byCityState,
  };
}

// Strip football camp noise from program name to get the school portion
function extractSchoolFromProgramName(programName) {
  var n = safeStr(programName);
  // Strip common suffixes
  n = n.replace(/\s*-\s*Football$/i, "");
  n = n.replace(/\s+Football\s+Camps?$/i, "");
  n = n.replace(/\s+Football\s+Clinics?$/i, "");
  n = n.replace(/\s+Football\s+Prospect\s+Camps?$/i, "");
  n = n.replace(/\s+Football$/i, "");
  n = n.replace(/\s+Camps?$/i, "");
  n = n.replace(/\s+Camp$/i, "");
  n = n.replace(/\s+LLC$/i, "");
  n = n.replace(/\s+@\s+\w+$/i, ""); // "Mark Nofri Football Camp @ SHU"
  return n.trim();
}

// Extract subdomain school name from ryzerevents URL
function extractSchoolFromSubdomain(url) {
  if (!url) return null;
  try {
    var hostname = new URL(url).hostname.toLowerCase();
    // e.g. "alabamafootballcamps.ryzerevents.com" → "alabama"
    // e.g. "wesleyanfootballcamps.ryzerevents.com" → "wesleyan"
    if (!hostname.includes("ryzerevents.com")) return null;
    var sub = hostname.split(".")[0];
    sub = sub.replace(/footballcamps?/gi, "");
    sub = sub.replace(/footballclinics?/gi, "");
    sub = sub.replace(/football/gi, "");
    sub = sub.replace(/camps?$/gi, "");
    sub = sub.replace(/prospectcamp/gi, "");
    sub = sub.replace(/-/g, " ");
    return sub.trim() || null;
  } catch (e) {
    return null;
  }
}

function fuzzyNameScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.85;

  var aw = a.split(" ").filter(function(w) { return w.length > 2; });
  var bw = b.split(" ").filter(function(w) { return w.length > 2; });
  if (aw.length === 0 || bw.length === 0) return 0;

  var overlap = 0;
  for (var i = 0; i < aw.length; i++) {
    for (var j = 0; j < bw.length; j++) {
      if (aw[i] === bw[j]) { overlap++; break; }
    }
  }
  var maxLen = Math.max(aw.length, bw.length);
  var ratio = overlap / maxLen;
  return ratio >= 0.5 ? ratio : 0;
}

// Build additional name candidates from abbreviations/acronyms
function expandAbbreviations(name) {
  var ABBREVS = {
    "usc": "university of southern california",
    "ucf": "university of central florida",
    "unc": "university of north carolina",
    "msu": "michigan state university",
    "osu": "ohio state university",
    "lsu": "louisiana state university",
    "fau": "florida atlantic university",
    "fiu": "florida international university",
    "utep": "university of texas el paso",
    "utsa": "university of texas san antonio",
    "sdsu": "san diego state university",
    "sjsu": "san jose state university",
    "bgsu": "bowling green state university",
    "cmu": "central michigan university",
    "emu": "eastern michigan university",
    "wmu": "western michigan university",
    "niu": "northern illinois university",
    "smu": "southern methodist university",
    "tcu": "texas christian university",
    "byu": "brigham young university",
    "uab": "university of alabama birmingham",
    "unlv": "university of nevada las vegas",
    "shu": "sacred heart university",
    "etsu": "east tennessee state university",
    "mtsu": "middle tennessee state university",
    "apsu": "austin peay state university",
    "siu": "southern illinois university",
    "wku": "western kentucky university",
    "ecu": "east carolina university",
    "umass": "university of massachusetts",
    "uconn": "university of connecticut",
    "ole miss": "university of mississippi",
  };
  var n = lc(name);
  return ABBREVS[n] || null;
}

// Additional school name extraction patterns
function generateExtraCandidates(programName, programUrl) {
  var extra = [];

  // Handle "University of X" patterns in program name
  var uofMatch = /University\s+of\s+([\w\s]+?)(?:\s*[-–]\s*Football|\s+Football|\s+Camps?)/i.exec(programName);
  if (uofMatch) extra.push("University of " + uofMatch[1].trim());

  // Handle "X State" or "X State University" 
  var stateMatch = /([\w\s]+State)\s+(?:University\s+)?(?:Football|Camps?)/i.exec(programName);
  if (stateMatch) {
    extra.push(stateMatch[1].trim());
    extra.push(stateMatch[1].trim() + " University");
  }

  // Handle abbreviated forms like "Univ." or "U." 
  var n = programName.replace(/\bUniv\.?\b/gi, "University").replace(/\bU\.\s/g, "University ");

  // Handle "The X" prefix (e.g. "The Citadel")
  if (/^The\s+/i.test(programName)) {
    extra.push(programName.replace(/^The\s+/i, "").replace(/\s*[-–]\s*Football.*$/i, "").replace(/\s+Football.*$/i, "").trim());
  }

  // Expand abbreviation from the stripped name
  var stripped = extractSchoolFromProgramName(programName);
  var expanded = expandAbbreviations(stripped);
  if (expanded) extra.push(expanded);

  // Expand from subdomain
  var sub = extractSchoolFromSubdomain(programUrl);
  if (sub) {
    var expSub = expandAbbreviations(sub);
    if (expSub) extra.push(expSub);
  }

  return extra;
}

// Hardcoded mappings for programs with unusual naming
var HARDCODED_PROGRAM_TO_SCHOOL = {
  "alabama crimson tide football camps": "university of alabama",
  "floridagatorscamps": "university of florida",
  "levi camps": "purdue university",
  "brent key football camps": "georgia institute of technology",
  "marcus freeman football camps": "university of notre dame",
  "rick stockstill football camps": "middle tennessee state university",
  "tony elliott football camps": "university of virginia",
  "mark nofri football camp @ shu": "sacred heart university",
  "ut martin football": "university of tennessee at martin",
  "drake football": "drake university",
  "coyote football camps": "university of south dakota",
  "panther football camps": "prairie view a&m university",
  "arizona christian university football": "arizona christian university",
};
// Programs where the description says a specific school but parsing can't get it
var HARDCODED_DESCRIPTION_SCHOOL = {
  "andy mccollum football camps": "university of the south",  // Sewanee
};

function matchProgramToSchool(idx, program) {
  var programName = program.name;
  var programUrl = program.url;
  var logoUrl = program.logo_url;
  var descSchool = program.desc_school || null;
  var descCity = program.desc_city || null;
  var descState = program.desc_state || null;
  var descNickname = program.desc_nickname || null;

  // METHOD 0: Hardcoded overrides → confidence 1.0
  var hardKey = lc(programName);
  if (HARDCODED_PROGRAM_TO_SCHOOL[hardKey]) {
    var hardNN = normalizeName(HARDCODED_PROGRAM_TO_SCHOOL[hardKey]);
    var hardMatch = idx.byNormName[hardNN];
    if (hardMatch && hardMatch.length === 1) {
      return { school_id: hardMatch[0].id, school_name: hardMatch[0].school.school_name, method: "hardcoded", confidence: 1.0 };
    }
  }
  if (HARDCODED_DESCRIPTION_SCHOOL[hardKey]) {
    var hardNN2 = normalizeName(HARDCODED_DESCRIPTION_SCHOOL[hardKey]);
    var hardMatch2 = idx.byNormName[hardNN2];
    if (hardMatch2 && hardMatch2.length === 1) {
      return { school_id: hardMatch2[0].id, school_name: hardMatch2[0].school.school_name, method: "hardcoded", confidence: 1.0 };
    }
  }

  // METHOD 1: Logo URL match → confidence 1.0
  if (logoUrl) {
    var luKey = lc(logoUrl);
    var logoMatches = idx.byLogoUrl[luKey];
    if (logoMatches && logoMatches.length === 1) {
      return { school_id: logoMatches[0].id, school_name: logoMatches[0].school.school_name, method: "logo", confidence: 1.0 };
    }
  }

  // METHOD 5: Description-extracted school name → confidence 0.95
  if (descSchool) {
    var descNN = normalizeName(descSchool);
    if (descNN) {
      var descExact = idx.byNormName[descNN];
      if (descExact && descExact.length === 1) {
        return { school_id: descExact[0].id, school_name: descExact[0].school.school_name, method: "desc_school", confidence: 0.95 };
      }
      // Try common variations
      var descVars = [
        descNN.replace(/ university$/, "").replace(/ college$/, ""),
        descNN + " university", descNN + " college",
        descNN.replace(/^university of /, ""), "university of " + descNN,
        "the " + descNN, descNN.replace(/^the /, ""),
      ];
      for (var dvi = 0; dvi < descVars.length; dvi++) {
        var dvn = descVars[dvi].trim();
        if (dvn && dvn !== descNN) {
          var dvMatch = idx.byNormName[dvn];
          if (dvMatch && dvMatch.length === 1) {
            return { school_id: dvMatch[0].id, school_name: dvMatch[0].school.school_name, method: "desc_school", confidence: 0.9 };
          }
        }
      }
    }
  }

  // METHOD 6: Nickname from description ("led by the [Nickname] coaching staff") → confidence 0.9
  if (descNickname) {
    var nickLower = lc(descNickname);
    // Try full nickname match
    var nickAloneMatches = idx.byNicknameAlone[nickLower];
    if (nickAloneMatches && nickAloneMatches.length === 1) {
      return { school_id: nickAloneMatches[0].id, school_name: nickAloneMatches[0].school.school_name, method: "desc_nickname", confidence: 0.9 };
    }
    // Try full nickname in byNickname
    var fullNickMatches = idx.byNickname[nickLower];
    if (fullNickMatches && fullNickMatches.length === 1) {
      return { school_id: fullNickMatches[0].id, school_name: fullNickMatches[0].school.school_name, method: "desc_nickname", confidence: 0.9 };
    }
    // If multiple matches but we have city+state, narrow down
    var nickCandidates = nickAloneMatches || fullNickMatches;
    if (nickCandidates && nickCandidates.length > 1 && descCity && descState) {
      var nst = normalizeState(descState);
      var nci = lc(descCity);
      for (var nfi = 0; nfi < nickCandidates.length; nfi++) {
        var ns = nickCandidates[nfi].school;
        if (lc(ns.city || "") === nci && normalizeState(ns.state) === nst) {
          return { school_id: nickCandidates[nfi].id, school_name: ns.school_name, method: "desc_nickname_city", confidence: 0.9 };
        }
      }
    }
  }

  // METHOD 7: City+State from description → confidence 0.85
  if (descCity && descState) {
    var csKey = lc(descCity) + "|" + normalizeState(descState);
    var csMatches = idx.byCityState[csKey];
    if (csMatches && csMatches.length === 1) {
      return { school_id: csMatches[0].id, school_name: csMatches[0].school.school_name, method: "desc_city_state", confidence: 0.85 };
    }
    // Multiple schools in same city — try to narrow with program name words
    if (csMatches && csMatches.length > 1) {
      var pnWords = lc(programName).split(/[\s\-]+/).filter(function(w) { return w.length > 2; });
      for (var csi = 0; csi < csMatches.length; csi++) {
        var csSchool = csMatches[csi].school;
        var csNN = lc(csSchool.normalized_name || csSchool.school_name || "");
        for (var pwi = 0; pwi < pnWords.length; pwi++) {
          if (csNN.indexOf(pnWords[pwi]) >= 0) {
            return { school_id: csMatches[csi].id, school_name: csSchool.school_name, method: "desc_city_state_name", confidence: 0.85 };
          }
        }
      }
    }
  }

  // Build candidate names to try (from program name)
  var schoolPortion = extractSchoolFromProgramName(programName);
  var subdomainPortion = extractSchoolFromSubdomain(programUrl);
  var extraCandidates = generateExtraCandidates(programName, programUrl);

  var candidates = [];
  if (descSchool) candidates.push(descSchool); // description school as candidate too
  if (schoolPortion) candidates.push(schoolPortion);
  if (subdomainPortion) candidates.push(subdomainPortion);
  candidates.push(programName);
  for (var ei = 0; ei < extraCandidates.length; ei++) {
    if (extraCandidates[ei]) candidates.push(extraCandidates[ei]);
  }

  // METHOD 8: Aggressive program name stripping for no-description cases → confidence 0.8
  if (!program.description) {
    var stripped = stripProgramNameHard(programName);
    if (stripped) candidates.push(stripped);
  }

  // METHOD 2: Exact normalized name match → confidence 0.95
  for (var ci = 0; ci < candidates.length; ci++) {
    var nn = normalizeName(candidates[ci]);
    if (!nn) continue;

    var exact = idx.byNormName[nn];
    if (exact && exact.length === 1) {
      return { school_id: exact[0].id, school_name: exact[0].school.school_name, method: "exact_name", confidence: 0.95 };
    }

    // Common variations
    var variations = [
      nn.replace(/ university$/, "").replace(/ college$/, ""),
      nn + " university",
      nn + " college",
      nn.replace(/^university of /, ""),
      "university of " + nn,
      nn.replace(/^univ /, "university of "),
      nn.replace(/ univ$/, " university"),
      nn.replace(/ st$/, " state"),
      nn.replace(/ state university$/, " state"),
      nn.replace(/ state$/, " state university"),
      "the " + nn,
      nn.replace(/^the /, ""),
      nn.replace(/ at /, " "),
      nn + " at " + nn.split(" ")[nn.split(" ").length - 1],
    ];
    for (var vi = 0; vi < variations.length; vi++) {
      var vn = variations[vi].trim();
      if (vn && vn !== nn) {
        var vMatch = idx.byNormName[vn];
        if (vMatch && vMatch.length === 1) {
          return { school_id: vMatch[0].id, school_name: vMatch[0].school.school_name, method: "exact_name", confidence: 0.9 };
        }
      }
    }
  }

  // METHOD 3: Nickname match → confidence 0.85
  for (var ni = 0; ni < candidates.length; ni++) {
    var nickLc = lc(candidates[ni]);
    if (!nickLc) continue;
    var nickMatches = idx.byNickname[nickLc];
    if (nickMatches && nickMatches.length === 1) {
      return { school_id: nickMatches[0].id, school_name: nickMatches[0].school.school_name, method: "nickname", confidence: 0.85 };
    }
  }

  // METHOD 3b: Check if program name contains a known nickname
  var allNicknames = Object.keys(idx.byNickname);
  for (var nki = 0; nki < allNicknames.length; nki++) {
    var nick2 = allNicknames[nki];
    if (nick2.length < 4) continue;
    var nickEntries = idx.byNickname[nick2];
    if (!nickEntries || nickEntries.length !== 1) continue;
    var pnLc = lc(programName);
    if (pnLc.indexOf(nick2) >= 0) {
      return { school_id: nickEntries[0].id, school_name: nickEntries[0].school.school_name, method: "nickname_contains", confidence: 0.8 };
    }
  }

  // METHOD 4: Fuzzy name match
  var bestFuzzy = null;
  var bestScore = 0;
  var allNormNames = Object.keys(idx.byNormName);

  for (var fi = 0; fi < candidates.length; fi++) {
    var candNorm = normalizeName(candidates[fi]);
    if (!candNorm || candNorm.length < 3) continue;

    for (var si = 0; si < allNormNames.length; si++) {
      var schoolNN = allNormNames[si];
      var entries = idx.byNormName[schoolNN];
      if (!entries || entries.length !== 1) continue;
      var score = fuzzyNameScore(candNorm, schoolNN);
      if (score > bestScore) {
        bestScore = score;
        bestFuzzy = entries[0];
      }
    }
  }
  if (bestFuzzy && bestScore >= 0.6) {
    var conf = Math.min(0.85, bestScore * 0.85 + 0.1);
    conf = Math.round(conf * 100) / 100;
    return { school_id: bestFuzzy.id, school_name: bestFuzzy.school.school_name, method: "fuzzy_name", confidence: conf };
  }

  return { school_id: null, school_name: null, method: null, confidence: 0 };
}

// Aggressive stripping for programs with no description
function stripProgramNameHard(name) {
  if (!name) return null;
  var s = safeStr(name);
  // Remove common noise words
  var noise = ["Football", "Camps", "Camp", "LLC", "Sports", "Elite", "FCA", "East", "TN", "FC", "NC", "Prospect", "-"];
  for (var i = 0; i < noise.length; i++) {
    var re = new RegExp("\\b" + noise[i] + "\\b", "gi");
    s = s.replace(re, " ");
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 2) return null;
  return s;
}

// ─── STEP 3: Extract camps from a program's Ryzer site ──────────────────────

function parseMDY(s) {
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  var mm = m[1].length === 1 ? "0" + m[1] : m[1];
  var dd = m[2].length === 1 ? "0" + m[2] : m[2];
  return m[3] + "-" + mm + "-" + dd;
}

function extractCampsFromProgramSiteHtml(html, siteUrl) {
  // Parse the events table / camp listings from a Ryzer-powered site
  // These sites have tables or card listings with:
  //   Event name | Dates | Grades | Cost | Register link
  var camps = [];
  if (!html) return camps;

  // Strategy: Find all registration links (register.ryzer.com/camp.cfm?id=XXXXX)
  var regLinks = [];
  var seen = {};

  // Find camp.cfm links with IDs
  var reLink = /href=["']([^"']*camp\.cfm[^"']*)["']/gi;
  var lm;
  while ((lm = reLink.exec(html)) !== null) {
    var href = lm[1];
    // Normalize
    if (href.startsWith("//")) href = "https:" + href;
    else if (!href.startsWith("http")) {
      try { href = new URL(href, siteUrl).toString(); } catch(e) { continue; }
    }
    href = href.replace(/&amp;/g, "&").split("#")[0];

    var idM = /[?&]id=(\d+)/i.exec(href);
    if (!idM) continue;
    var ryzerId = idM[1];
    if (seen[ryzerId]) continue;
    seen[ryzerId] = true;

    // Try to extract the camp name and date from the surrounding HTML
    var linkIdx = html.indexOf(lm[0]);
    var windowStart = Math.max(0, linkIdx - 1500);
    var windowEnd = Math.min(html.length, linkIdx + 500);
    var windowHtml = html.slice(windowStart, windowEnd);
    var windowText = stripTags(windowHtml);

    // Find camp name: look for text in a table row or heading near the link
    var campName = null;

    // Try table row: <td>Camp Name</td><td>date</td>...<td><a href="...camp.cfm?id=XXX">
    // The camp name is typically the first substantial text in the same row
    // Strategy: find the nearest heading or strong text before the link
    var namePatterns = [
      /<h[1-5][^>]*>([\s\S]{4,200}?)<\/h[1-5]>/gi,
      /<strong>([\s\S]{4,200}?)<\/strong>/gi,
      /<td[^>]*>([\s\S]{4,200}?)<\/td>/gi,
    ];
    for (var pi = 0; pi < namePatterns.length; pi++) {
      var np = namePatterns[pi];
      var nm;
      var lastGood = null;
      while ((nm = np.exec(windowHtml)) !== null) {
        var t = stripTags(nm[1]);
        // Skip if it looks like date, grade, cost, or "Register"
        if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) continue;
        if (/^(register|see prices|grades?|cost|\$)/i.test(t)) continue;
        if (/^\d+(st|nd|rd|th)\s/i.test(t)) continue;
        if (t.length < 4) continue;
        lastGood = t;
      }
      if (lastGood) { campName = lastGood; break; }
    }

    // Extract dates from the window text
    var startDate = null;
    var endDate = null;

    // Try date range: MM/DD/YYYY - MM/DD/YYYY
    var dateRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(windowText);
    if (dateRange) {
      startDate = parseMDY(dateRange[1]);
      endDate = parseMDY(dateRange[2]);
    } else {
      // Single date
      var singleDate = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(windowText);
      if (singleDate) startDate = parseMDY(singleDate[1]);
    }

    // Also try "Month Day" format
    if (!startDate) {
      var monthNames = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
      var reMonth = new RegExp("(" + monthNames + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?", "i");
      var mm2 = reMonth.exec(windowText);
      if (mm2) {
        var monthMap = {
          january:1,jan:1,february:2,feb:2,march:3,mar:3,april:4,apr:4,may:5,
          june:6,jun:6,july:7,jul:7,august:8,aug:8,september:9,sep:9,
          october:10,oct:10,november:11,nov:11,december:12,dec:12
        };
        var mon = monthMap[mm2[1].toLowerCase()];
        var day = parseInt(mm2[2]);
        var year = mm2[3] ? parseInt(mm2[3]) : new Date().getFullYear();
        if (mon && day) {
          var monStr = mon < 10 ? "0" + mon : String(mon);
          var dayStr = day < 10 ? "0" + day : String(day);
          startDate = year + "-" + monStr + "-" + dayStr;
        }
      }
    }

    regLinks.push({
      ryzer_camp_id: ryzerId,
      reg_url: href,
      camp_name_from_listing: campName,
      start_date: startDate,
      end_date: endDate,
    });
  }

  return regLinks;
}

function extractRyzerCampDetails(html, regUrl) {
  if (!html) return null;
  var text = stripTags(html);

  // ── Camp name: first <h1> inside .campDetailsContent ──
  var campName = null;
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1]) {
    campName = stripTags(h1[1])
      .replace(/\s*\|\s*Event Registration.*$/i, "")
      .replace(/\s*-\s*Registration.*$/i, "")
      .replace(/\s*-\s*Event Registration.*$/i, "")
      .trim();
  }
  if (!campName || campName.length < 4) {
    var titleM = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (titleM && titleM[1]) {
      campName = stripNonAscii(titleM[1])
        .replace(/\s*\|\s*Event Registration.*$/i, "")
        .replace(/\s*-\s*Registration.*$/i, "")
        .trim();
    }
  }

  // ── Host organization from .campDetailsCustomer ──
  var hostOrg = null;
  var hostMatch = /<div class="campDetailsCustomer">([^<]+)<\/div>/i.exec(html);
  if (hostMatch && hostMatch[1]) {
    hostOrg = stripNonAscii(hostMatch[1]).trim() || null;
  }

  // ── Structured fields from .campDetailsTable spans ──
  // Each span block: <span>Location</span>\n Value  OR  <span>Event Date(s)</span>\n Value
  var locationRaw = null;
  var eventDateRaw = null;
  var gradesRaw = null;

  var detailsBlock = html.match(/<div class="row campDetailsTable">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  if (detailsBlock) {
    var block = detailsBlock[1];
    // Extract labeled sections: look for <span>Label</span> followed by value text
    var spanSections = block.split(/<span>\s*<div class="leftflt campDetailsIcon">/i);
    for (var si2 = 0; si2 < spanSections.length; si2++) {
      var sec = spanSections[si2];
      var labelMatch = /<span>([^<]+)<\/span>/i.exec(sec);
      if (!labelMatch) continue;
      var label = lc(labelMatch[1]);
      // Value is the text after the closing </span> but before next <span> or end
      var afterLabel = sec.substring(sec.indexOf(labelMatch[0]) + labelMatch[0].length);
      var val2 = stripTags(afterLabel).trim();

      if (label.indexOf("location") >= 0 && val2) locationRaw = val2;
      else if (label.indexOf("event date") >= 0 && val2) eventDateRaw = val2;
      else if (label.indexOf("grade") >= 0 && val2) gradesRaw = val2;
    }
  }

  // ── City, State from structured location ──
  var city = null;
  var state = null;
  if (locationRaw) {
    var csMatch = /([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/.exec(locationRaw);
    if (csMatch) { city = csMatch[1].trim(); state = csMatch[2].trim(); }
  }
  // Fallback: parse from full text
  if (!city) {
    var locFallback = /Location\s+(.{0,140}?)(?:Event Date|Grades|Register By|Select a price|We Accept|$)/i.exec(text);
    if (locFallback && locFallback[1]) {
      var seg = locFallback[1].indexOf("|") >= 0 ? locFallback[1].split("|").pop().trim() : locFallback[1].trim();
      var csMatch2 = /([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/.exec(seg);
      if (csMatch2) { city = csMatch2[1].trim(); state = csMatch2[2].trim(); }
    }
  }

  // ── Venue name and address from description HTML ──
  var venueName = null;
  var venueAddress = null;
  // Look for address patterns: street number + street name + city, state zip
  var addrLinkMatch = /<a[^>]*href="https:\/\/maps[^"]*"[^>]*(?:title="([^"]*)")?[^>]*>([^<]+)<\/a>/i.exec(html);
  if (addrLinkMatch) {
    venueAddress = stripNonAscii(addrLinkMatch[2]).trim() || null;
    if (addrLinkMatch[1]) venueName = stripNonAscii(addrLinkMatch[1]).trim() || null;
  }
  // Also look for venue name before the address link — often in preceding div
  if (!venueName) {
    var venueDiv = /<h3[^>]*>\s*<strong>\s*Location:?\s*<\/strong>\s*<\/h3>\s*(?:<div[^>]*>)?\s*([^<]+)/i.exec(html);
    if (venueDiv && venueDiv[1]) venueName = stripNonAscii(venueDiv[1]).trim() || null;
  }

  // ── Dates from structured field, then fallback to text scan ──
  var startDate = null;
  var endDate = null;

  // Parse structured eventDateRaw like "Jun 3, 2026" or "Jun 3, 2026 - Jun 5, 2026"
  if (eventDateRaw) {
    var parsed = parseFlexibleDates(eventDateRaw);
    if (parsed.start) startDate = parsed.start;
    if (parsed.end) endDate = parsed.end;
  }
  // Fallback: MM/DD/YYYY range in full text
  if (!startDate) {
    var dateRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
    if (dateRange) {
      startDate = parseMDY(dateRange[1]);
      endDate = parseMDY(dateRange[2]);
    } else {
      var singleDate = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
      if (singleDate) startDate = parseMDY(singleDate[1]);
    }
  }

  // ── Description from .CampInfo div (rich text), fallback to meta ──
  var desc = null;
  var campInfoMatch = /<div class="CampInfo">([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i.exec(html);
  if (campInfoMatch && campInfoMatch[1]) {
    desc = stripTags(campInfoMatch[1]).trim();
    if (desc.length > 500) desc = desc.substring(0, 497) + "...";
  }
  if (!desc || desc.length < 10) {
    var metaDesc = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
    if (metaDesc && metaDesc[1]) {
      desc = stripNonAscii(metaDesc[1]);
      if (desc.length > 500) desc = desc.substring(0, 497) + "...";
    }
  }

  // ── Price from description text ──
  var prices = [];
  var rePrice = /\$\s*(\d{1,5})(?:\.(\d{2}))?/g;
  var pm;
  while ((pm = rePrice.exec(text)) !== null) {
    var pval = parseFloat(pm[1] + (pm[2] ? "." + pm[2] : ""));
    if (pval > 0 && pval < 20000) prices.push(pval);
    if (prices.length >= 10) break;
  }
  var price = prices.length ? Math.max.apply(null, prices) : null;

  // ── Grades / age group ──
  var grades = gradesRaw || null;

  return {
    camp_name: campName || null,
    host_org: hostOrg,
    description: desc,
    start_date: startDate,
    end_date: endDate,
    price: price,
    city: city,
    state: state,
    venue_name: venueName,
    venue_address: venueAddress,
    grades: grades,
  };
}

// Parse flexible date strings like "Jun 3, 2026", "Jun 3 - Jun 5, 2026", "6/3/2026"
function parseFlexibleDates(s) {
  var result = { start: null, end: null };
  if (!s) return result;

  var MONTHS = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,
    jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,
    oct:10,october:10,nov:11,november:11,dec:12,december:12
  };

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  // Try "Month Day, Year - Month Day, Year"
  var rangeM = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\s*[-–]\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (rangeM) {
    var m1 = MONTHS[lc(rangeM[1])];
    var d1 = parseInt(rangeM[2]);
    var y1 = rangeM[3] ? parseInt(rangeM[3]) : null;
    var m2 = MONTHS[lc(rangeM[4])];
    var d2 = parseInt(rangeM[5]);
    var y2 = rangeM[6] ? parseInt(rangeM[6]) : null;
    var year = y2 || y1 || new Date().getFullYear();
    if (!y1) y1 = year;
    if (m1 && d1) result.start = y1 + "-" + pad(m1) + "-" + pad(d1);
    if (m2 && d2) result.end = year + "-" + pad(m2) + "-" + pad(d2);
    return result;
  }

  // Try "Month Day - Day, Year" (same month)
  var sameMonthRange = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (sameMonthRange) {
    var sm = MONTHS[lc(sameMonthRange[1])];
    var sd1 = parseInt(sameMonthRange[2]);
    var sd2 = parseInt(sameMonthRange[3]);
    var sy = sameMonthRange[4] ? parseInt(sameMonthRange[4]) : new Date().getFullYear();
    if (sm && sd1) result.start = sy + "-" + pad(sm) + "-" + pad(sd1);
    if (sm && sd2) result.end = sy + "-" + pad(sm) + "-" + pad(sd2);
    return result;
  }

  // Try "Month Day, Year" (single date)
  var singleM = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (singleM) {
    var sm2 = MONTHS[lc(singleM[1])];
    var sd = parseInt(singleM[2]);
    var sy2 = singleM[3] ? parseInt(singleM[3]) : new Date().getFullYear();
    if (sm2 && sd) result.start = sy2 + "-" + pad(sm2) + "-" + pad(sd);
    return result;
  }

  // Try MM/DD/YYYY range
  var mdyRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s);
  if (mdyRange) {
    result.start = parseMDY(mdyRange[1]);
    result.end = parseMDY(mdyRange[2]);
    return result;
  }

  // Try single MM/DD/YYYY
  var mdySingle = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s);
  if (mdySingle) {
    result.start = parseMDY(mdySingle[1]);
  }

  return result;
}

// ─── STEP 4: Upsert logic ──────────────────────────────────────────────────

function campFieldsChanged(existing, incoming) {
  var fields = ["camp_name", "start_date", "end_date", "city", "state", "price",
    "link_url", "source_url", "ryzer_camp_id", "season_year"];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (safeStr(existing[f]) !== safeStr(incoming[f])) return true;
  }
  return false;
}

async function upsertCamp(Camp, payload, existingBySourceKey, dryRun, runIso) {
  var sourceKey = payload.source_key;
  var existing = existingBySourceKey[sourceKey] || null;

  if (existing) {
    if (existing.school_manually_verified) {
      payload.school_id = existing.school_id || payload.school_id;
      payload.school_match_method = existing.school_match_method || payload.school_match_method;
      payload.school_match_confidence = existing.school_match_confidence || payload.school_match_confidence;
      payload.school_manually_verified = true;
    }

    if (!campFieldsChanged(existing, payload) &&
        safeStr(existing.school_id) === safeStr(payload.school_id)) {
      if (!dryRun) {
        await Camp.update(String(existing.id), { last_seen_at: runIso, last_ingested_at: runIso });
      }
      return "skipped";
    }
    if (!dryRun) {
      await Camp.update(String(existing.id), payload);
    }
    return "updated";
  } else {
    if (!dryRun) {
      await Camp.create(payload);
    }
    return "inserted";
  }
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────

Deno.serve(async function(req) {
  var t0 = Date.now();
  var runIso = new Date().toISOString();
  var todayIso = runIso.substring(0, 10);

  if (req.method !== "POST") return json({ error: "POST only", version: VERSION }, 405);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return json({ error: "Forbidden: Admin access required" }, 403);
  }

  var step = lc(body.step || "ingest"); // "matchSchools" or "ingest" (default)
  // matchOnly is an alias for step=matchSchools
  if (body.matchOnly) step = "matchschools";
  var dryRun = body.dryRun !== false && body.dryRun !== "false";
  var maxSchools = Math.max(1, Number(body.maxSchools || 259));
  var startAt = Math.max(0, Number(body.startAt || 0));
  var sleepMs = Math.max(500, Number(body.sleepMs || 1000));
  var timeBudgetMs = Math.max(10000, Number(body.timeBudgetMs || 55000));
  var skipDetailFetch = !!(body.skipDetailFetch); // skip fetching individual camp pages

  var elapsed = function() { return Date.now() - t0; };

  // ── 1. Fetch footballcampsusa.com directory ──
  var dirResult = await fetchWithTimeout("https://www.footballcampsusa.com/", 20000);
  if (!dirResult.ok) {
    return json({ error: "Failed to fetch footballcampsusa.com: HTTP " + dirResult.status, version: VERSION });
  }

  var programs = parseFootballCampsUSADirectory(dirResult.html);
  if (programs.length === 0) {
    return json({ error: "No programs found on footballcampsusa.com", htmlLength: dirResult.html.length, version: VERSION });
  }

  // ── 2. Load all schools and build index ──
  var allSchools = await base44.entities.School.filter({}, "school_name", 99999);
  var schoolIdx = buildSchoolIndex(allSchools);

  // ── 3. Match ALL programs to schools ──
  var matched = [];
  var unmatched = [];
  var ambiguous = [];
  var matchByMethod = {};

  for (var pi = 0; pi < programs.length; pi++) {
    var prog = programs[pi];
    var match = matchProgramToSchool(schoolIdx, prog);
    prog._match = match;

    if (match.school_id && match.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
      matched.push({
        program_name: prog.name,
        url: prog.url,
        school_id: match.school_id,
        school_name: match.school_name,
        method: match.method,
        confidence: match.confidence,
      });
      matchByMethod[match.method] = (matchByMethod[match.method] || 0) + 1;
    } else if (match.confidence > 0 && match.confidence < MATCH_CONFIDENCE_THRESHOLD) {
      ambiguous.push({
        program_name: prog.name,
        url: prog.url,
        best_school: match.school_name,
        method: match.method,
        confidence: match.confidence,
      });
    } else {
      unmatched.push({
        program_name: prog.name,
        url: prog.url,
        extracted_school_name: extractSchoolFromProgramName(prog.name),
        subdomain_name: extractSchoolFromSubdomain(prog.url),
      });
    }
  }

  // ── If step = matchSchools, return early ──
  if (step === "matchschools") {
    var responseObj = {
      ok: true,
      version: VERSION,
      step: "matchSchools",
      totalPrograms: programs.length,
      totalMatched: matched.length,
      totalUnmatched: unmatched.length,
      totalAmbiguous: ambiguous.length,
      matchRate: Math.round((matched.length / programs.length) * 1000) / 10,
      matchByMethod: matchByMethod,
      unmatched: unmatched,
      ambiguous: ambiguous,
      elapsedMs: elapsed(),
    };
    // Only include matched list if not compact mode
    if (!body.compact) {
      responseObj.matched = matched;
    }
    return json(responseObj);
  }

  // ── 4. INGEST: Process schools slice ──
  var Camp = base44.entities.Camp;
  var LastIngestRun = base44.entities.LastIngestRun;

  // Load existing camps for idempotency
  var allCamps = await Camp.filter({}, "source_key", 99999);
  var existingBySourceKey = {};
  for (var ci = 0; ci < allCamps.length; ci++) {
    var sk = safeStr(allCamps[ci].source_key);
    if (sk) existingBySourceKey[sk] = allCamps[ci];
  }

  var slice = programs.slice(startAt, startAt + maxSchools);
  var stats = { schoolsProcessed: 0, schoolsWithCamps: 0, schoolsNoCamps: 0, schoolsFetchError: 0,
    campsInserted: 0, campsUpdated: 0, campsSkipped: 0, campsErrors: 0, campsPastSkipped: 0,
    schoolsMatched: 0, schoolsUnmatched: 0 };
  var sampleCamps = [];
  var sampleErrors = [];
  var schoolResults = [];

  for (var si = 0; si < slice.length; si++) {
    if (elapsed() >= timeBudgetMs) {
      stats.stoppedEarly = true;
      break;
    }

    var prog2 = slice[si];
    var match2 = prog2._match;
    stats.schoolsProcessed++;

    if (match2.school_id && match2.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
      stats.schoolsMatched++;
    } else {
      stats.schoolsUnmatched++;
    }

    var schoolResult = {
      program_name: prog2.name,
      url: prog2.url,
      school_id: match2.school_id,
      school_name: match2.school_name,
      match_method: match2.method,
      match_confidence: match2.confidence,
      camps_found: 0,
      camps_ingested: 0,
      error: null,
    };

    // Fetch the program's Ryzer site
    var siteResult = await fetchWithTimeout(prog2.url, 15000);
    if (!siteResult.ok) {
      stats.schoolsFetchError++;
      schoolResult.error = "HTTP " + siteResult.status;
      schoolResults.push(schoolResult);
      await sleep(sleepMs);
      continue;
    }

    // Extract camp listings from the site
    var campListings = extractCampsFromProgramSiteHtml(siteResult.html, prog2.url);
    schoolResult.camps_found = campListings.length;

    if (campListings.length === 0) {
      stats.schoolsNoCamps++;
      schoolResults.push(schoolResult);
      await sleep(sleepMs);
      continue;
    }

    stats.schoolsWithCamps++;

    // Process each camp
    for (var cli = 0; cli < campListings.length; cli++) {
      if (elapsed() >= timeBudgetMs) { stats.stoppedEarly = true; break; }

      var listing = campListings[cli];
      var ryzerId = listing.ryzer_camp_id;
      var regUrl = listing.reg_url;
      var sourceKey = SOURCE_PLATFORM + ":" + ryzerId;

      // Fetch individual camp detail page for authoritative data
      var campName = listing.camp_name_from_listing;
      var startDate = listing.start_date;
      var endDate = listing.end_date;
      var price = null;
      var city = null;
      var state2 = null;
      var notes = null;

      var venueName = null;
      var venueAddress = null;
      var grades = null;
      var hostOrg = null;

      if (!skipDetailFetch) {
        var detailResult = await fetchWithTimeout(regUrl, 12000);
        if (detailResult.ok) {
          var details = extractRyzerCampDetails(detailResult.html, regUrl);
          if (details) {
            if (details.camp_name) campName = details.camp_name;
            if (details.start_date) startDate = details.start_date;
            if (details.end_date) endDate = details.end_date;
            if (details.price) price = details.price;
            if (details.city) city = details.city;
            if (details.state) state2 = details.state;
            if (details.description) notes = details.description;
            if (details.venue_name) venueName = details.venue_name;
            if (details.venue_address) venueAddress = details.venue_address;
            if (details.grades) grades = details.grades;
            if (details.host_org) hostOrg = details.host_org;
          }
        }
        await sleep(Math.max(300, sleepMs / 2));
      }

      if (!startDate) {
        // No date available — skip
        stats.campsErrors++;
        if (sampleErrors.length < 10) {
          sampleErrors.push({ source_key: sourceKey, reason: "no_start_date", camp_name: campName, reg_url: regUrl });
        }
        continue;
      }

      // Skip past camps
      if (startDate < todayIso) {
        stats.campsPastSkipped++;
        continue;
      }

      if (!campName) campName = prog2.name + " Camp";

      var seasonYear = parseInt(startDate.substring(0, 4));

      var payload = {
        camp_name: campName,
        sport_id: FOOTBALL_SPORT_ID,
        start_date: startDate,
        end_date: endDate || null,
        city: city || null,
        state: state2 || null,
        price: price || null,
        link_url: regUrl,
        source_url: regUrl,
        source_platform: SOURCE_PLATFORM,
        source_key: sourceKey,
        ryzer_camp_id: ryzerId,
        season_year: seasonYear,
        active: true,
        last_seen_at: runIso,
        last_ingested_at: runIso,
        ingestion_status: "active",
        position_ids: [],
        notes: notes || null,
        school_id: (match2.school_id && match2.confidence >= MATCH_CONFIDENCE_THRESHOLD) ? match2.school_id : null,
        school_match_method: match2.method || null,
        school_match_confidence: match2.confidence || 0,
        school_manually_verified: false,
      };

      if (!payload.school_id) {
        payload.ingestion_status = "needs_review";
      }

      try {
        var result = await upsertCamp(Camp, payload, existingBySourceKey, dryRun, runIso);
        if (result === "inserted") {
          stats.campsInserted++;
          schoolResult.camps_ingested++;
          // Also add to existing index for idempotency within this run
          existingBySourceKey[sourceKey] = payload;
        } else if (result === "updated") {
          stats.campsUpdated++;
          schoolResult.camps_ingested++;
        } else {
          stats.campsSkipped++;
        }

        if (sampleCamps.length < 15) {
          sampleCamps.push({
            source_key: sourceKey,
            camp_name: campName,
            start_date: startDate,
            end_date: endDate,
            price: price,
            city: city,
            state: state2,
            school_id: payload.school_id,
            school_name: match2.school_name,
            match_method: match2.method,
            result: result,
          });
        }
      } catch (e) {
        stats.campsErrors++;
        if (sampleErrors.length < 10) {
          sampleErrors.push({ source_key: sourceKey, camp_name: campName, error: String(e.message || e) });
        }
      }
    }

    schoolResults.push(schoolResult);
    await sleep(sleepMs);
  }

  // Record run history
  if (!dryRun) {
    try {
      var totalCamps = stats.campsInserted + stats.campsUpdated + stats.campsSkipped;
      var campMatchRate = totalCamps > 0 ? Math.round((stats.schoolsMatched / stats.schoolsProcessed) * 1000) / 10 : 0;
      await LastIngestRun.create({
        sport: "football",
        source: SOURCE_PLATFORM,
        run_at: runIso,
        camps_inserted: stats.campsInserted,
        camps_updated: stats.campsUpdated,
        camps_skipped: stats.campsSkipped,
        camps_errors: stats.campsErrors,
        match_rate: campMatchRate,
        dry_run: false,
        duration_ms: elapsed(),
        notes: "Programs " + startAt + "-" + (startAt + stats.schoolsProcessed) + " of " + programs.length +
          ". Inserted=" + stats.campsInserted + " Updated=" + stats.campsUpdated + " Skipped=" + stats.campsSkipped,
      });
    } catch (e) { /* ignore history error */ }
  }

  var nextStartAt = startAt + stats.schoolsProcessed;
  var done = nextStartAt >= programs.length;

  return json({
    ok: true,
    version: VERSION,
    dryRun: dryRun,
    totalProgramsOnSite: programs.length,
    matchSummary: {
      totalMatched: matched.length,
      totalUnmatched: unmatched.length,
      totalAmbiguous: ambiguous.length,
      matchRate: Math.round((matched.length / programs.length) * 1000) / 10,
      matchByMethod: matchByMethod,
    },
    stats: stats,
    pagination: {
      startAt: startAt,
      processed: stats.schoolsProcessed,
      nextStartAt: nextStartAt,
      done: done,
    },
    sampleCamps: sampleCamps,
    sampleErrors: sampleErrors,
    schoolResults: schoolResults,
    unmatchedPrograms: unmatched.slice(0, 30),
    ambiguousPrograms: ambiguous.slice(0, 20),
    elapsedMs: elapsed(),
  });
});