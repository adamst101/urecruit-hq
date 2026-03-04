// functions/ingestCampsUSA.js
// Generic multi-sport ingest: reads SportIngestConfig, then runs the same
// directory → school-match → Ryzer-crawl → upsert pipeline.
//
// v2: Stealth mode — realistic headers, randomized delays, rate limiting,
//     skip-already-ingested, consecutive error circuit breaker.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

var VERSION = "ingestCampsUSA_v2";
var MATCH_CONFIDENCE_THRESHOLD = 0.7;

// ─── helpers ────────────────────────────────────────────────────────────────

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x).trim();
}
function safeStrOrNull(x) { var s = safeStr(x); return s || null; }
function lc(x) { return safeStr(x).toLowerCase(); }
function lcn(x) { return normalizeUnicode(lc(x)); }

function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/&ndash;/gi, "\u2013").replace(/&mdash;/gi, "\u2014")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&rsquo;/gi, "\u2019").replace(/&lsquo;/gi, "\u2018")
    .replace(/&rdquo;/gi, "\u201D").replace(/&ldquo;/gi, "\u201C")
    .replace(/&bull;/gi, "\u2022").replace(/&hellip;/gi, "\u2026")
    .replace(/&#(\d+);/gi, function(_, n) { return String.fromCharCode(parseInt(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
}

function stripTags(html) {
  if (!html) return "";
  return decodeHtmlEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function cleanTextField(s) {
  if (!s) return null;
  var v = decodeHtmlEntities(String(s)).replace(/\s+/g, " ").trim();
  return v || null;
}

function normalizeUnicode(s) {
  return s.replace(/[\u2011\u2012\u2013\u2014\u2015\u2212\u2010]/g, " ").replace(/\u00a0/g, " ");
}

function normalizeName(name) {
  var s = normalizeUnicode(lc(name));
  return s.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
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

// ─── Stealth fetch infrastructure ───────────────────────────────────────────

var BROWSER_HEADERS_BASE = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

// Global rate-limiting state for this run
var _rateState = {
  ryzerTotal: 0,           // total ryzer requests this run
  registerTotal: 0,        // total register.ryzer.com requests this run
  hourStart: Date.now(),
  ryzerThisHour: 0,
  registerThisHour: 0,
  consecutiveErrors: 0,    // consecutive ryzer errors
  fetchedUrls: {},         // dedup: never fetch same URL twice per run
  totalRequests: 0,        // overall request counter for "every Nth" pauses
  circuitBroken: false,    // true if we hit 3 consecutive errors
  circuitBrokenReason: "",
};

var RYZER_HOURLY_LIMIT = 120;
var REGISTER_HOURLY_LIMIT = 30;
var CONSECUTIVE_ERROR_LIMIT = 3;

function isRyzerUrl(url) {
  return /ryzer\.com/i.test(url || "");
}
function isRegisterRyzerUrl(url) {
  return /register\.ryzer\.com/i.test(url || "");
}

function resetHourlyCountersIfNeeded() {
  var now = Date.now();
  if (now - _rateState.hourStart >= 3600000) {
    _rateState.hourStart = now;
    _rateState.ryzerThisHour = 0;
    _rateState.registerThisHour = 0;
  }
}

// Adaptive delay: if approaching rate limits, slow down
function getRateLimitDelay() {
  resetHourlyCountersIfNeeded();
  var delay = 0;
  if (_rateState.ryzerThisHour >= RYZER_HOURLY_LIMIT * 0.8) {
    delay = Math.max(delay, 15000 + rand(0, 10000)); // 15-25s
  } else if (_rateState.ryzerThisHour >= RYZER_HOURLY_LIMIT * 0.6) {
    delay = Math.max(delay, 5000 + rand(0, 5000)); // 5-10s
  }
  if (_rateState.registerThisHour >= REGISTER_HOURLY_LIMIT * 0.8) {
    delay = Math.max(delay, 20000 + rand(0, 15000)); // 20-35s
  } else if (_rateState.registerThisHour >= REGISTER_HOURLY_LIMIT * 0.6) {
    delay = Math.max(delay, 8000 + rand(0, 7000)); // 8-15s
  }
  return delay;
}

async function stealthFetch(url, timeoutMs, refererUrl) {
  if (_rateState.circuitBroken) {
    return { ok: false, status: 0, html: "", error: "Circuit broken: " + _rateState.circuitBrokenReason, circuitBroken: true };
  }

  // Dedup: never fetch same URL twice in one run
  var urlKey = (url || "").split("#")[0].split("?").sort().join("?");
  if (_rateState.fetchedUrls[urlKey]) {
    return { ok: false, status: 0, html: "", error: "Already fetched this URL in this run", skippedDupe: true };
  }

  // Rate limit check — wait if approaching limits
  var rateLimitDelay = getRateLimitDelay();
  if (rateLimitDelay > 0) {
    await sleep(rateLimitDelay);
  }

  // Build headers
  var headers = Object.assign({}, BROWSER_HEADERS_BASE);
  if (refererUrl) {
    headers["Referer"] = refererUrl;
  }

  // Track
  _rateState.fetchedUrls[urlKey] = true;
  _rateState.totalRequests++;
  if (isRyzerUrl(url)) {
    _rateState.ryzerTotal++;
    _rateState.ryzerThisHour++;
    resetHourlyCountersIfNeeded();
  }
  if (isRegisterRyzerUrl(url)) {
    _rateState.registerTotal++;
    _rateState.registerThisHour++;
  }

  // Every 10th request: long "human reading" pause
  if (_rateState.totalRequests > 1 && _rateState.totalRequests % 10 === 0) {
    await sleep(8000 + rand(0, 7000)); // 8-15s
  }

  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 15000);
  try {
    var resp = await fetch(url, {
      method: "GET",
      headers: headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    var status = resp.status;

    // Handle Ryzer-specific error codes
    if (isRyzerUrl(url)) {
      if (status === 403) {
        // Blocked — stop immediately
        _rateState.circuitBroken = true;
        _rateState.circuitBrokenReason = "403 Forbidden from Ryzer — possible IP block";
        return { ok: false, status: 403, html: "", error: "403 Forbidden — stopped", blocked: true };
      }
      if (status === 429) {
        // Rate limited — back off 10 min, retry once
        _rateState.consecutiveErrors++;
        if (_rateState.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
          _rateState.circuitBroken = true;
          _rateState.circuitBrokenReason = "Stopping: possible IP block or Ryzer outage (" + CONSECUTIVE_ERROR_LIMIT + " consecutive errors)";
          return { ok: false, status: 429, html: "", error: _rateState.circuitBrokenReason };
        }
        await sleep(600000); // 10 minutes
        // Retry once
        delete _rateState.fetchedUrls[urlKey]; // allow re-fetch
        var retry = await stealthFetch(url, timeoutMs, refererUrl);
        return retry;
      }
      if (status === 503) {
        // Overloaded — back off 5 min, retry once
        _rateState.consecutiveErrors++;
        if (_rateState.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
          _rateState.circuitBroken = true;
          _rateState.circuitBrokenReason = "Stopping: possible IP block or Ryzer outage (" + CONSECUTIVE_ERROR_LIMIT + " consecutive errors)";
          return { ok: false, status: 503, html: "", error: _rateState.circuitBrokenReason };
        }
        await sleep(300000); // 5 minutes
        delete _rateState.fetchedUrls[urlKey];
        var retry2 = await stealthFetch(url, timeoutMs, refererUrl);
        return retry2;
      }
    }

    if (!resp.ok) {
      if (isRyzerUrl(url)) {
        _rateState.consecutiveErrors++;
        if (_rateState.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
          _rateState.circuitBroken = true;
          _rateState.circuitBrokenReason = "Stopping: possible IP block or Ryzer outage (" + CONSECUTIVE_ERROR_LIMIT + " consecutive errors)";
        }
      }
      return { ok: false, status: status, html: "" };
    }

    // Success — reset consecutive error counter
    if (isRyzerUrl(url)) {
      _rateState.consecutiveErrors = 0;
    }

    var html = await resp.text();
    return { ok: true, status: status, html: html };
  } catch (e) {
    clearTimeout(timer);
    if (isRyzerUrl(url)) {
      _rateState.consecutiveErrors++;
      if (_rateState.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
        _rateState.circuitBroken = true;
        _rateState.circuitBrokenReason = "Stopping: possible IP block or Ryzer outage (" + CONSECUTIVE_ERROR_LIMIT + " consecutive errors)";
      }
    }
    return { ok: false, status: 0, html: "", error: String(e.message || e) };
  }
}

// ─── Normalize host_org key (sport-aware) ───────────────────────────────────

function normalizeHostOrgKey(raw, sportKey) {
  if (!raw) return "";
  var s = normalizeUnicode(lc(raw));
  var sportRe = sportKey || "football";
  s = s.replace(new RegExp("\\s*-\\s*" + sportRe + "\\s*$", "i"), "");
  s = s.replace(new RegExp("\\s+" + sportRe + "\\s+camps?\\s*$", "i"), "");
  s = s.replace(new RegExp("\\s+" + sportRe + "\\s*$", "i"), "");
  s = s.replace(/\s+camps?\s*$/i, "");
  return s.replace(/\s+/g, " ").trim();
}

// ─── containsKeyword ────────────────────────────────────────────────────────

function containsKeyword(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return null;
  var t = lc(text);
  for (var i = 0; i < keywords.length; i++) {
    if (t.indexOf(keywords[i]) >= 0) return keywords[i];
  }
  return null;
}

// ─── Gender detection for shared directories ───────────────────────────────

var MENS_INDICATORS = ["men's", "mens", "men\u2019s", "boys", "male"];
var WOMENS_INDICATORS = ["women's", "womens", "women\u2019s", "girls", "female", "lady"];

function detectCardGender(cardText) {
  if (!cardText) return null;
  var t = lc(cardText);
  var hasMens = false;
  var hasWomens = false;
  for (var i = 0; i < WOMENS_INDICATORS.length; i++) {
    if (t.indexOf(WOMENS_INDICATORS[i]) >= 0) { hasWomens = true; break; }
  }
  if (!hasWomens) {
    for (var j = 0; j < MENS_INDICATORS.length; j++) {
      if (t.indexOf(MENS_INDICATORS[j]) >= 0) { hasMens = true; break; }
    }
  }
  if (hasWomens) return "womens";
  if (hasMens) return "mens";
  return null;
}

// ─── Directory parser (same HTML structure across all *campsusa.com) ────────

function parseDirectoryHtml(html, genderFilter) {
  var programs = [];
  if (!html) return programs;

  var chunks = html.split('<div class="listItem"');
  var cardChunks = chunks.slice(1);

  for (var i = 0; i < cardChunks.length; i++) {
    var card = cardChunks[i];

    if (genderFilter && genderFilter !== "both") {
      var cardGender = detectCardGender(stripTags(card));
      if (cardGender && cardGender !== genderFilter) continue;
    }

    var nameMatch = /<span class="school">([^<]+)<\/span>/i.exec(card);
    var name = nameMatch ? nameMatch[1].trim() : null;

    var logoMatch = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/i.exec(card);
    var logoUrl = logoMatch ? logoMatch[1] : null;

    if (!name) {
      var altMatch = /alt="([^"]+)"/i.exec(card);
      name = altMatch ? altMatch[1].trim() : "(unknown)";
    }

    var urlMatch = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site/i.exec(card);
    if (!urlMatch) urlMatch = /<a\s+href="([^"]+)"[^>]*class="viewSite"/i.exec(card);
    var url = urlMatch ? urlMatch[1].trim() : null;

    var descMatch = /<p>([^<]+(?:<[^>]+>[^<]*)*)<\/p>/i.exec(card);
    var description = descMatch ? stripTags(descMatch[1]).trim() : null;

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

function extractSchoolFromDescription(desc) {
  var result = { school: null, city: null, state: null, nickname: null };
  if (!desc) return result;

  var csMatch = /\bin\s+([A-Z][A-Za-z\s.'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(desc);
  if (csMatch) {
    result.city = csMatch[1].trim();
    result.state = csMatch[2].trim();
  }

  var nickMatch = /led by (?:the |its )?(.+?)\s+(?:\w+\s+)?(?:coaching\s+)?staff/i.exec(desc);
  if (nickMatch && nickMatch[1]) {
    var nick = nickMatch[1].trim()
      .replace(/^Head Coach\s+\w+\s+and the\s+/i, "")
      .replace(/^Head Coach\s+and the\s+/i, "")
      .replace(/^its\s+/i, "")
      .replace(/\s+(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis)$/i, "");
    if (nick.length >= 3 && nick.length < 50) {
      result.nickname = nick;
    }
  }

  var m = /campus of\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  m = /on the\s+(.+?)\s+campus/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  m = /held at\s+(?:the\s+)?(.+?)(?:\s+in\s|\s*[,.])/i.exec(desc);
  if (m && m[1]) {
    var uniInVenue = /((?:University of [A-Za-z\s.&'-]+|[A-Za-z\s.&'-]+ University|[A-Za-z\s.&'-]+ College|[A-Za-z\s.&'-]+ Institute))/i.exec(m[1]);
    if (uniInVenue) {
      result.school = cleanSchoolName(uniInVenue[1]);
      if (result.school) return result;
    }
  }

  m = /led by the\s+(.+?)\s+(?:football|basketball|baseball|softball|soccer|volleyball|lacrosse|wrestling|tennis|coaching)\s+staff/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  m = /(University of [A-Za-z\s.&'-]+|[A-Z][A-Za-z\s.&'-]+ University|[A-Z][A-Za-z\s.&'-]+ College(?!\s+(?:Football|Basketball|Baseball)))/i.exec(desc);
  if (m && m[1]) { result.school = cleanSchoolName(m[1]); if (result.school) return result; }

  return result;
}

function cleanSchoolName(raw) {
  if (!raw) return null;
  var s = raw.trim();
  s = s.replace(/\s+(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis).*$/i, "");
  s = s.replace(/\s+(campus|staff|coaching|camp|camps|stadium).*$/i, "");
  s = s.replace(/^the\s+/i, "");
  s = s.replace(/[.,;:!]+$/, "").trim();
  if (s.length < 3) return null;
  return s;
}

// ─── School matching ────────────────────────────────────────────────────────

function buildSchoolIndex(schools) {
  var byNormName = {};
  var byNicknameState = {};
  var byLogoUrl = {};
  var byNickname = {};
  var byCityState = {};
  var byNicknameAlone = {};

  for (var i = 0; i < schools.length; i++) {
    var s = schools[i];
    var sid = safeStr(s.id);
    if (!sid) continue;

    var nn = normalizeName(s.normalized_name || s.school_name || "");
    if (nn) {
      if (!byNormName[nn]) byNormName[nn] = [];
      byNormName[nn].push({ id: sid, school: s });
    }

    var nick = lcn(s.athletics_nickname || "");
    var st = normalizeState(s.state);
    if (nick && st) {
      var nk = nick + "|" + st;
      if (!byNicknameState[nk]) byNicknameState[nk] = [];
      byNicknameState[nk].push({ id: sid, school: s });
    }
    if (nick) {
      if (!byNickname[nick]) byNickname[nick] = [];
      byNickname[nick].push({ id: sid, school: s });

      var nickWords = nick.split(/\s+/);
      if (nickWords.length >= 2) {
        var last2 = nickWords.slice(-2).join(" ");
        if (!byNicknameAlone[last2]) byNicknameAlone[last2] = [];
        byNicknameAlone[last2].push({ id: sid, school: s });
      }
      if (nickWords.length >= 1) {
        var last1 = nickWords[nickWords.length - 1];
        if (last1.length >= 4) {
          if (!byNicknameAlone[last1]) byNicknameAlone[last1] = [];
          byNicknameAlone[last1].push({ id: sid, school: s });
        }
      }
      if (!byNicknameAlone[nick]) byNicknameAlone[nick] = [];
      var already = byNicknameAlone[nick].some(function(e) { return e.id === sid; });
      if (!already) byNicknameAlone[nick].push({ id: sid, school: s });
    }

    var city = lc(s.city || "");
    if (city && st) {
      var csKey = city + "|" + st;
      if (!byCityState[csKey]) byCityState[csKey] = [];
      byCityState[csKey].push({ id: sid, school: s });
    }

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

  return { byNormName: byNormName, byNicknameState: byNicknameState, byLogoUrl: byLogoUrl, byNickname: byNickname, byNicknameAlone: byNicknameAlone, byCityState: byCityState };
}

function extractSchoolFromProgramName(programName) {
  var n = safeStr(programName);
  n = n.replace(/\s*-\s*(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis)$/i, "");
  n = n.replace(/\s+(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis)\s+(?:Camps?|Clinics?|Prospect\s+Camps?)$/i, "");
  n = n.replace(/\s+(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis)$/i, "");
  n = n.replace(/\s+Camps?$/i, "");
  n = n.replace(/\s+Camp$/i, "");
  n = n.replace(/\s+LLC$/i, "");
  n = n.replace(/\s+@\s+\w+$/i, "");
  return n.trim();
}

function extractSchoolFromSubdomain(url) {
  if (!url) return null;
  try {
    var hostname = new URL(url).hostname.toLowerCase();
    if (!hostname.includes("ryzerevents.com")) return null;
    var sub = hostname.split(".")[0];
    sub = sub.replace(/(?:football|basketball|baseball|softball|soccer|volleyball|lacrosse|wrestling|tennis)camps?/gi, "");
    sub = sub.replace(/(?:football|basketball|baseball|softball|soccer|volleyball|lacrosse|wrestling|tennis)clinics?/gi, "");
    sub = sub.replace(/(?:football|basketball|baseball|softball|soccer|volleyball|lacrosse|wrestling|tennis)/gi, "");
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

function expandAbbreviations(name) {
  var ABBREVS = {
    "usc":"university of southern california","ucf":"university of central florida",
    "unc":"university of north carolina","msu":"michigan state university",
    "osu":"ohio state university","lsu":"louisiana state university",
    "fau":"florida atlantic university","fiu":"florida international university",
    "utep":"university of texas el paso","utsa":"university of texas san antonio",
    "sdsu":"san diego state university","sjsu":"san jose state university",
    "bgsu":"bowling green state university","cmu":"central michigan university",
    "emu":"eastern michigan university","wmu":"western michigan university",
    "niu":"northern illinois university","smu":"southern methodist university",
    "tcu":"texas christian university","byu":"brigham young university",
    "uab":"university of alabama birmingham","unlv":"university of nevada las vegas",
    "shu":"sacred heart university","etsu":"east tennessee state university",
    "mtsu":"middle tennessee state university","apsu":"austin peay state university",
    "siu":"southern illinois university","wku":"western kentucky university",
    "ecu":"east carolina university","umass":"university of massachusetts",
    "uconn":"university of connecticut","ole miss":"university of mississippi",
  };
  return ABBREVS[lc(name)] || null;
}

function generateExtraCandidates(programName, programUrl) {
  var extra = [];
  var uofMatch = /University\s+of\s+([\w\s]+?)(?:\s*[-\u2013]\s*\w+|\s+(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis)|\s+Camps?)/i.exec(programName);
  if (uofMatch) extra.push("University of " + uofMatch[1].trim());
  var stateMatch = /([\w\s]+State)\s+(?:University\s+)?(?:Football|Basketball|Baseball|Softball|Soccer|Volleyball|Lacrosse|Wrestling|Tennis|Camps?)/i.exec(programName);
  if (stateMatch) {
    extra.push(stateMatch[1].trim());
    extra.push(stateMatch[1].trim() + " University");
  }
  if (/^The\s+/i.test(programName)) {
    extra.push(programName.replace(/^The\s+/i, "").replace(/\s*[-\u2013]\s*\w+.*$/i, "").replace(/\s+(?:Football|Basketball|Baseball).*$/i, "").trim());
  }
  var stripped = extractSchoolFromProgramName(programName);
  var expanded = expandAbbreviations(stripped);
  if (expanded) extra.push(expanded);
  var sub = extractSchoolFromSubdomain(programUrl);
  if (sub) {
    var expSub = expandAbbreviations(sub);
    if (expSub) extra.push(expSub);
  }
  return extra;
}

function matchProgramToSchool(idx, program, hardcodedMap, hardcodedDescMap) {
  var programName = program.name;
  var programUrl = program.url;
  var logoUrl = program.logo_url;
  var descSchool = program.desc_school || null;
  var descCity = program.desc_city || null;
  var descState = program.desc_state || null;
  var descNickname = program.desc_nickname || null;

  var hardKey = lc(programName);
  if (hardcodedMap[hardKey]) {
    var hardNN = normalizeName(hardcodedMap[hardKey]);
    var hardMatch = idx.byNormName[hardNN];
    if (hardMatch && hardMatch.length === 1) {
      return { school_id: hardMatch[0].id, school_name: hardMatch[0].school.school_name, method: "hardcoded", confidence: 1.0 };
    }
  }
  if (hardcodedDescMap[hardKey]) {
    var hardNN2 = normalizeName(hardcodedDescMap[hardKey]);
    var hardMatch2 = idx.byNormName[hardNN2];
    if (hardMatch2 && hardMatch2.length === 1) {
      return { school_id: hardMatch2[0].id, school_name: hardMatch2[0].school.school_name, method: "hardcoded", confidence: 1.0 };
    }
  }

  if (logoUrl) {
    var luKey = lc(logoUrl);
    var logoMatches = idx.byLogoUrl[luKey];
    if (logoMatches && logoMatches.length === 1) {
      return { school_id: logoMatches[0].id, school_name: logoMatches[0].school.school_name, method: "logo", confidence: 1.0 };
    }
  }

  if (descSchool) {
    var descNN = normalizeName(descSchool);
    if (descNN) {
      var descExact = idx.byNormName[descNN];
      if (descExact && descExact.length === 1) {
        return { school_id: descExact[0].id, school_name: descExact[0].school.school_name, method: "desc_school", confidence: 0.95 };
      }
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

  if (descNickname) {
    var nickLower = lc(descNickname);
    var nickAloneMatches = idx.byNicknameAlone[nickLower];
    if (nickAloneMatches && nickAloneMatches.length === 1) {
      return { school_id: nickAloneMatches[0].id, school_name: nickAloneMatches[0].school.school_name, method: "desc_nickname", confidence: 0.9 };
    }
    var fullNickMatches = idx.byNickname[nickLower];
    if (fullNickMatches && fullNickMatches.length === 1) {
      return { school_id: fullNickMatches[0].id, school_name: fullNickMatches[0].school.school_name, method: "desc_nickname", confidence: 0.9 };
    }
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

  if (descCity && descState) {
    var csKey2 = lc(descCity) + "|" + normalizeState(descState);
    var csMatches = idx.byCityState[csKey2];
    if (csMatches && csMatches.length === 1) {
      return { school_id: csMatches[0].id, school_name: csMatches[0].school.school_name, method: "desc_city_state", confidence: 0.85 };
    }
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

  var schoolPortion = extractSchoolFromProgramName(programName);
  var subdomainPortion = extractSchoolFromSubdomain(programUrl);
  var extraCandidates = generateExtraCandidates(programName, programUrl);

  var candidates = [];
  if (descSchool) candidates.push(descSchool);
  if (schoolPortion) candidates.push(schoolPortion);
  if (subdomainPortion) candidates.push(subdomainPortion);
  candidates.push(programName);
  for (var ei = 0; ei < extraCandidates.length; ei++) {
    if (extraCandidates[ei]) candidates.push(extraCandidates[ei]);
  }

  if (!program.description) {
    var stripped2 = stripProgramNameHard(programName);
    if (stripped2) candidates.push(stripped2);
  }

  for (var ci = 0; ci < candidates.length; ci++) {
    var nn2 = normalizeName(candidates[ci]);
    if (!nn2) continue;
    var exact = idx.byNormName[nn2];
    if (exact && exact.length === 1) {
      return { school_id: exact[0].id, school_name: exact[0].school.school_name, method: "exact_name", confidence: 0.95 };
    }
    var variations = [
      nn2.replace(/ university$/, "").replace(/ college$/, ""),
      nn2 + " university", nn2 + " college",
      nn2.replace(/^university of /, ""), "university of " + nn2,
      nn2.replace(/^univ /, "university of "),
      nn2.replace(/ univ$/, " university"),
      nn2.replace(/ st$/, " state"),
      nn2.replace(/ state university$/, " state"),
      nn2.replace(/ state$/, " state university"),
      "the " + nn2, nn2.replace(/^the /, ""),
      nn2.replace(/ at /, " "),
      nn2 + " at " + nn2.split(" ")[nn2.split(" ").length - 1],
    ];
    for (var vi = 0; vi < variations.length; vi++) {
      var vn = variations[vi].trim();
      if (vn && vn !== nn2) {
        var vMatch = idx.byNormName[vn];
        if (vMatch && vMatch.length === 1) {
          return { school_id: vMatch[0].id, school_name: vMatch[0].school.school_name, method: "exact_name", confidence: 0.9 };
        }
      }
    }
  }

  for (var ni = 0; ni < candidates.length; ni++) {
    var nickLc = lc(candidates[ni]);
    if (!nickLc) continue;
    var nickMatches = idx.byNickname[nickLc];
    if (nickMatches && nickMatches.length === 1) {
      return { school_id: nickMatches[0].id, school_name: nickMatches[0].school.school_name, method: "nickname", confidence: 0.85 };
    }
  }

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
      if (score > bestScore) { bestScore = score; bestFuzzy = entries[0]; }
    }
  }
  if (bestFuzzy && bestScore >= 0.6) {
    var conf = Math.min(0.85, bestScore * 0.85 + 0.1);
    conf = Math.round(conf * 100) / 100;
    return { school_id: bestFuzzy.id, school_name: bestFuzzy.school.school_name, method: "fuzzy_name", confidence: conf };
  }

  return { school_id: null, school_name: null, method: null, confidence: 0 };
}

function stripProgramNameHard(name) {
  if (!name) return null;
  var s = safeStr(name);
  var noise = ["Football","Basketball","Baseball","Softball","Soccer","Volleyball","Lacrosse","Wrestling","Tennis","Camps","Camp","LLC","Sports","Elite","FCA","East","TN","FC","NC","Prospect","-"];
  for (var i = 0; i < noise.length; i++) {
    var re = new RegExp("\\b" + noise[i] + "\\b", "gi");
    s = s.replace(re, " ");
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 2) return null;
  return s;
}

// ─── Ryzer camp extraction ──────────────────────────────────────────────────

function parseMDY(s) {
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  var mm = m[1].length === 1 ? "0" + m[1] : m[1];
  var dd = m[2].length === 1 ? "0" + m[2] : m[2];
  return m[3] + "-" + mm + "-" + dd;
}

function extractCampsFromProgramSiteHtml(html, siteUrl) {
  if (!html) return [];
  var regLinks = [];
  var seen = {};
  var reLink = /href=["']([^"']*camp\.cfm[^"']*)["']/gi;
  var lm;
  while ((lm = reLink.exec(html)) !== null) {
    var href = lm[1];
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

    var linkIdx = html.indexOf(lm[0]);
    var windowStart = Math.max(0, linkIdx - 1500);
    var windowEnd = Math.min(html.length, linkIdx + 500);
    var windowHtml = html.slice(windowStart, windowEnd);
    var windowText = stripTags(windowHtml);

    var campName = null;
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
        if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) continue;
        if (/^(register|see prices|grades?|cost|\$)/i.test(t)) continue;
        if (/^\d+(st|nd|rd|th)\s/i.test(t)) continue;
        if (t.length < 4) continue;
        lastGood = t;
      }
      if (lastGood) { campName = lastGood; break; }
    }

    var startDate = null;
    var endDate = null;
    var dateRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-\u2013]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(windowText);
    if (dateRange) { startDate = parseMDY(dateRange[1]); endDate = parseMDY(dateRange[2]); }
    else {
      var singleDate = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(windowText);
      if (singleDate) startDate = parseMDY(singleDate[1]);
    }
    if (!startDate) {
      var monthNames = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
      var reMonth = new RegExp("(" + monthNames + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?", "i");
      var mm2 = reMonth.exec(windowText);
      if (mm2) {
        var monthMap = { january:1,jan:1,february:2,feb:2,march:3,mar:3,april:4,apr:4,may:5, june:6,jun:6,july:7,jul:7,august:8,aug:8,september:9,sep:9, october:10,oct:10,november:11,nov:11,december:12,dec:12 };
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
    regLinks.push({ ryzer_camp_id: ryzerId, reg_url: href, camp_name_from_listing: campName, start_date: startDate, end_date: endDate });
  }
  return regLinks;
}

function extractRyzerCampDetails(html, regUrl) {
  if (!html) return null;
  var text = stripTags(html);

  var campName = null;
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1]) {
    campName = stripTags(h1[1]).replace(/\s*\|\s*Event Registration.*$/i, "").replace(/\s*-\s*Registration.*$/i, "").replace(/\s*-\s*Event Registration.*$/i, "").trim();
  }
  if (!campName || campName.length < 4) {
    var titleM = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (titleM && titleM[1]) {
      campName = stripNonAscii(titleM[1]).replace(/\s*\|\s*Event Registration.*$/i, "").replace(/\s*-\s*Registration.*$/i, "").trim();
    }
  }

  var hostOrg = null;
  var hostMatch = /<div class="campDetailsCustomer">([^<]+)<\/div>/i.exec(html);
  if (hostMatch && hostMatch[1]) hostOrg = stripNonAscii(hostMatch[1]).trim() || null;

  var ryzerProgramName = null;
  var viewMoreMatch = /View More Events by\s+([^<]+)/i.exec(html);
  if (viewMoreMatch && viewMoreMatch[1]) ryzerProgramName = stripNonAscii(viewMoreMatch[1]).trim() || null;
  if (!ryzerProgramName) {
    var progNameMatch = /<div[^>]*class="[^"]*programName[^"]*"[^>]*>([^<]+)<\/div>/i.exec(html);
    if (progNameMatch && progNameMatch[1]) ryzerProgramName = stripNonAscii(progNameMatch[1]).trim() || null;
  }
  if (!ryzerProgramName) {
    var headerAreaMatch = /<div[^>]*class="[^"]*campDetailsHeader[^"]*"[^>]*>([\s\S]*?)<h1/i.exec(html);
    if (headerAreaMatch && headerAreaMatch[1]) {
      var headerText = stripTags(headerAreaMatch[1]).trim();
      if (headerText && headerText.length > 2 && headerText.length < 120) ryzerProgramName = headerText;
    }
  }

  var locationRaw = null;
  var eventDateRaw = null;
  var gradesRaw = null;
  var detailsBlock = html.match(/<div class="row campDetailsTable">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  if (detailsBlock) {
    var block = detailsBlock[1];
    var spanSections = block.split(/<span>\s*<div class="leftflt campDetailsIcon">/i);
    for (var si2 = 0; si2 < spanSections.length; si2++) {
      var sec = spanSections[si2];
      var labelMatch = /<span>([^<]+)<\/span>/i.exec(sec);
      if (!labelMatch) continue;
      var label = lc(labelMatch[1]);
      var afterLabel = sec.substring(sec.indexOf(labelMatch[0]) + labelMatch[0].length);
      var val2 = stripTags(afterLabel).trim();
      if (label.indexOf("location") >= 0 && val2) locationRaw = val2;
      else if (label.indexOf("event date") >= 0 && val2) eventDateRaw = val2;
      else if (label.indexOf("grade") >= 0 && val2) gradesRaw = val2;
    }
  }

  var city = null;
  var state = null;
  if (locationRaw) {
    var csMatch = /([A-Za-z .'-]{2,}),+\s*([A-Z]{2})\b/.exec(locationRaw);
    if (csMatch) { city = csMatch[1].replace(/,+$/, "").trim(); state = csMatch[2].trim(); }
  }
  if (!city) {
    var locFallback = /Location\s+(.{0,140}?)(?:Event Date|Grades|Register By|Select a price|We Accept|$)/i.exec(text);
    if (locFallback && locFallback[1]) {
      var seg = locFallback[1].indexOf("|") >= 0 ? locFallback[1].split("|").pop().trim() : locFallback[1].trim();
      var csMatch2 = /([A-Za-z .'-]{2,}),+\s*([A-Z]{2})\b/.exec(seg);
      if (csMatch2) { city = csMatch2[1].replace(/,+$/, "").trim(); state = csMatch2[2].trim(); }
    }
  }

  var venueName = null;
  var venueAddress = null;
  var addrLinkMatch = /<a[^>]*href="https:\/\/maps[^"]*"[^>]*(?:title="([^"]*)")?[^>]*>([^<]+)<\/a>/i.exec(html);
  if (addrLinkMatch) { venueAddress = stripNonAscii(addrLinkMatch[2]).trim() || null; if (addrLinkMatch[1]) venueName = stripNonAscii(addrLinkMatch[1]).trim() || null; }
  if (!venueName) {
    var venueDiv = /<h3[^>]*>\s*<strong>\s*Location:?\s*<\/strong>\s*<\/h3>\s*(?:<div[^>]*>)?\s*([^<]+)/i.exec(html);
    if (venueDiv && venueDiv[1]) venueName = stripNonAscii(venueDiv[1]).trim() || null;
  }
  if (!venueName) {
    var campInfoHtml = "";
    var campInfoBlock = /<div class="CampInfo">([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i.exec(html);
    if (campInfoBlock) campInfoHtml = campInfoBlock[1];
    if (campInfoHtml) {
      var inlineLocMatch = /<strong>\s*LOCATION\s*<\/strong>\s*:?\s*<\/span>([^<]*)/i.exec(campInfoHtml);
      if (!inlineLocMatch) inlineLocMatch = /<strong>\s*Location\s*<\/strong>\s*:?\s*<\/span>\s*(?:&nbsp;|\s)*([^<]+)/i.exec(campInfoHtml);
      if (inlineLocMatch && inlineLocMatch[1]) {
        var inlineVal = stripNonAscii(inlineLocMatch[1]).trim();
        if (inlineVal && inlineVal.length >= 3 && inlineVal.length < 200) {
          if (/^\d/.test(inlineVal)) venueAddress = inlineVal; else venueName = inlineVal;
        }
      }
      if (!venueName && !venueAddress) {
        var locBlockMatch = /<(?:p|div)[^>]*>\s*(?:<[^>]*>)*\s*LOCATION\s*(?:<[^>]*>)*\s*<\/(?:p|div)>\s*<(?:p|div)[^>]*>([\s\S]*?)<\/(?:p|div)>/i.exec(campInfoHtml);
        if (locBlockMatch && locBlockMatch[1]) {
          var locLines = locBlockMatch[1].split(/<br\s*\/?>/i).map(function(l) { return stripTags(l).replace(/&nbsp;/gi, " ").trim(); }).filter(function(l) { return l.length > 0 && !/^[.,;:!]+$/.test(l); });
          if (locLines.length >= 1) { if (/^\d/.test(locLines[0])) venueAddress = locLines[0]; else venueName = locLines[0]; }
          if (locLines.length >= 2 && !venueAddress) venueAddress = locLines[1];
        }
      }
      if (!venueName && !venueAddress) {
        var samePMatch = /<(?:p|div)[^>]*>\s*<strong>\s*Location\s*<\/strong>\s*<br\s*\/?>([\s\S]*?)<\/(?:p|div)>/i.exec(campInfoHtml);
        if (samePMatch && samePMatch[1]) {
          var spLines = samePMatch[1].split(/<br\s*\/?>/i).map(function(l) { return stripTags(l).replace(/&nbsp;/gi, " ").trim(); }).filter(function(l) { return l.length > 0 && !/^[.,;:!]+$/.test(l); });
          if (spLines.length >= 1) { if (/^\d/.test(spLines[0])) venueAddress = spLines[0]; else venueName = spLines[0]; }
          if (spLines.length >= 2 && !venueAddress) venueAddress = spLines[1];
        }
      }
    }
  }
  if ((!city || !state) && venueAddress) {
    var vaCsMatch = /([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/.exec(venueAddress);
    if (vaCsMatch) { if (!city) city = vaCsMatch[1].replace(/,+$/, "").trim(); if (!state) state = vaCsMatch[2].trim(); }
  }

  var startDate = null;
  var endDate = null;
  if (eventDateRaw) { var parsed = parseFlexibleDates(eventDateRaw); if (parsed.start) startDate = parsed.start; if (parsed.end) endDate = parsed.end; }
  if (!startDate) {
    var dateRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-\u2013]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
    if (dateRange) { startDate = parseMDY(dateRange[1]); endDate = parseMDY(dateRange[2]); }
    else { var singleDate = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text); if (singleDate) startDate = parseMDY(singleDate[1]); }
  }

  var desc = null;
  var campInfoDescMatch = /<div class="CampInfo">([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i.exec(html);
  if (campInfoDescMatch && campInfoDescMatch[1]) { desc = stripTags(campInfoDescMatch[1]).trim(); if (desc.length > 500) desc = desc.substring(0, 497) + "..."; }
  if (!desc || desc.length < 10) {
    var metaDesc = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
    if (metaDesc && metaDesc[1]) { desc = decodeHtmlEntities(stripTags(metaDesc[1])).trim(); if (desc.length > 500) desc = desc.substring(0, 497) + "..."; }
  }

  var priceOptions = extractPriceOptions(html);
  var price = null;
  if (priceOptions.length > 0) {
    var allPrices = priceOptions.map(function(o) { return o.price; }).filter(function(p) { return p > 0; });
    price = allPrices.length > 0 ? Math.min.apply(null, allPrices) : null;
  }

  return { camp_name: cleanTextField(campName), host_org: cleanTextField(hostOrg), ryzer_program_name: cleanTextField(ryzerProgramName), description: desc, start_date: startDate, end_date: endDate, price: price, price_options: priceOptions, city: city, state: state, venue_name: cleanTextField(venueName), venue_address: cleanTextField(venueAddress), grades: cleanTextField(gradesRaw) };
}

function extractPriceOptions(html) {
  if (!html) return [];
  var options = [];
  var seen = {};
  var optionBlocks = html.match(/<(?:div|label|li|tr)[^>]*class="[^"]*(?:price|option|campPrice)[^"]*"[^>]*>[\s\S]*?<\/(?:div|label|li|tr)>/gi);
  if (optionBlocks) {
    for (var i = 0; i < optionBlocks.length; i++) {
      var blockText = stripTags(optionBlocks[i]);
      var priceM = /\$\s*(\d{1,5})(?:\.(\d{2}))?/.exec(blockText);
      if (priceM) {
        var pval = parseFloat(priceM[1] + (priceM[2] ? "." + priceM[2] : ""));
        var label = blockText.replace(/\$\s*\d+(?:\.\d{2})?/, "").replace(/\s+/g, " ").trim();
        if (!label || label.length < 2) label = "Registration";
        label = label.substring(0, 100);
        var key = pval + "|" + label;
        if (!seen[key] && pval > 0 && pval < 20000) { seen[key] = true; options.push({ label: cleanTextField(label), price: pval }); }
      }
    }
  }
  var campInfoMatch = /<div class="CampInfo">([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i.exec(html);
  if (campInfoMatch) {
    var tds = (campInfoMatch[1] || "").match(/<t[dr][^>]*>[\s\S]*?<\/t[dr]>/gi) || [];
    for (var ti = 0; ti < tds.length; ti++) {
      var tdText = stripTags(tds[ti]);
      var tdPriceM = /\$\s*(\d{1,5})(?:\.(\d{2}))?/.exec(tdText);
      if (tdPriceM) {
        var tpval = parseFloat(tdPriceM[1] + (tdPriceM[2] ? "." + tdPriceM[2] : ""));
        var tlabel = tdText.replace(/\$\s*\d+(?:\.\d{2})?/g, "").replace(/\(\$?\d+[^)]*\)/g, "").replace(/\s+/g, " ").trim();
        if (!tlabel || tlabel.length < 2) tlabel = "Registration";
        tlabel = tlabel.substring(0, 100);
        var tkey = tpval + "|" + tlabel;
        if (!seen[tkey] && tpval > 0 && tpval < 20000) { seen[tkey] = true; options.push({ label: cleanTextField(tlabel), price: tpval }); }
      }
    }
  }
  if (options.length === 0) {
    var text = stripTags(html);
    var reFallback = /([A-Za-z][^$]{0,60}?)\$\s*(\d{1,5})(?:\.(\d{2}))?/g;
    var fm;
    while ((fm = reFallback.exec(text)) !== null && options.length < 10) {
      var fpval = parseFloat(fm[2] + (fm[3] ? "." + fm[3] : ""));
      if (fpval <= 0 || fpval >= 20000) continue;
      var fctx = fm[1].trim();
      var flabel = fctx.split(/[.!?;]/).pop().trim();
      if (!flabel || flabel.length < 2) flabel = "Registration";
      if (/^(we accept|copyright|terms|privacy)/i.test(flabel)) continue;
      flabel = flabel.substring(0, 100);
      var fkey = fpval + "";
      if (!seen[fkey]) { seen[fkey] = true; options.push({ label: cleanTextField(flabel), price: fpval }); }
    }
  }
  return options;
}

function parseFlexibleDates(s) {
  var result = { start: null, end: null };
  if (!s) return result;
  var MONTHS = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5, jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9, oct:10,october:10,nov:11,november:11,dec:12,december:12 };
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  var rangeM = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\s*[-\u2013]\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (rangeM) {
    var m1 = MONTHS[lc(rangeM[1])]; var d1 = parseInt(rangeM[2]); var y1 = rangeM[3] ? parseInt(rangeM[3]) : null;
    var m2 = MONTHS[lc(rangeM[4])]; var d2 = parseInt(rangeM[5]); var y2 = rangeM[6] ? parseInt(rangeM[6]) : null;
    var year = y2 || y1 || new Date().getFullYear(); if (!y1) y1 = year;
    if (m1 && d1) result.start = y1 + "-" + pad(m1) + "-" + pad(d1);
    if (m2 && d2) result.end = year + "-" + pad(m2) + "-" + pad(d2);
    return result;
  }
  var sameMonthRange = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-\u2013]\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (sameMonthRange) {
    var sm = MONTHS[lc(sameMonthRange[1])]; var sd1 = parseInt(sameMonthRange[2]); var sd2 = parseInt(sameMonthRange[3]);
    var sy = sameMonthRange[4] ? parseInt(sameMonthRange[4]) : new Date().getFullYear();
    if (sm && sd1) result.start = sy + "-" + pad(sm) + "-" + pad(sd1);
    if (sm && sd2) result.end = sy + "-" + pad(sm) + "-" + pad(sd2);
    return result;
  }
  var singleM = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (singleM) {
    var sm2 = MONTHS[lc(singleM[1])]; var sd = parseInt(singleM[2]); var sy2 = singleM[3] ? parseInt(singleM[3]) : new Date().getFullYear();
    if (sm2 && sd) result.start = sy2 + "-" + pad(sm2) + "-" + pad(sd);
    return result;
  }
  var mdyRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-\u2013]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s);
  if (mdyRange) { result.start = parseMDY(mdyRange[1]); result.end = parseMDY(mdyRange[2]); return result; }
  var mdySingle = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s);
  if (mdySingle) result.start = parseMDY(mdySingle[1]);
  return result;
}

// ─── Junk camp name detection ───────────────────────────────────────────────

var JUNK_NAME_PATTERNS = [
  /^upcoming\b/i,
  /^20\d{2}\s+events?\s*$/i,
  /^events?\s*$/i,
  /^camps?\s*$/i,
  /^camp\s*$/i,
];

function isJunkCampName(name) {
  if (!name) return true;
  var n = safeStr(name);
  if (!n) return true;
  for (var i = 0; i < JUNK_NAME_PATTERNS.length; i++) {
    if (JUNK_NAME_PATTERNS[i].test(n)) return true;
  }
  return false;
}

// Returns true if existing camp has good enough data to skip detail fetch
function existingCampIsComplete(camp) {
  if (!camp) return false;
  if (isJunkCampName(camp.camp_name)) return false;
  if (camp.price == null) return false;
  if (!camp.city) return false;
  return true;
}

// ─── Upsert logic ───────────────────────────────────────────────────────────

var PROTECTED_FIELDS = [
  "camp_name", "price", "price_options", "city", "state",
  "venue_name", "venue_address", "host_org", "grades",
  "notes", "ryzer_program_name"
];

function normalizeForCompare(s) {
  return safeStr(s).replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizePriceOptions(po) {
  if (!po || !Array.isArray(po) || po.length === 0) return "[]";
  var prices = po.map(function(o) { return o.price || 0; }).sort(function(a,b) { return a - b; });
  return JSON.stringify(prices);
}

function buildSafeUpdatePayload(existing, incoming) {
  // Start with fields that should always update
  var update = {
    last_seen_at: incoming.last_seen_at,
    last_ingested_at: incoming.last_ingested_at,
    active: incoming.active,
    source_url: incoming.source_url || existing.source_url,
    link_url: incoming.link_url || existing.link_url,
    sport_id: incoming.sport_id || existing.sport_id,
    position_ids: incoming.position_ids || existing.position_ids || [],
    season_year: incoming.season_year || existing.season_year,
    ryzer_camp_id: incoming.ryzer_camp_id || existing.ryzer_camp_id,
    source_platform: incoming.source_platform || existing.source_platform,
    source_key: incoming.source_key,
  };

  // Dates: update if incoming has a value
  if (incoming.start_date) update.start_date = incoming.start_date;
  else update.start_date = existing.start_date;
  if (incoming.end_date) update.end_date = incoming.end_date;
  else update.end_date = existing.end_date;

  // School fields: preserve if manually verified
  if (existing.school_manually_verified) {
    update.school_id = existing.school_id;
    update.school_match_method = existing.school_match_method;
    update.school_match_confidence = existing.school_match_confidence;
    update.school_manually_verified = true;
  } else {
    // Only update school if incoming has a better or equal match
    if (incoming.school_id) {
      update.school_id = incoming.school_id;
      update.school_match_method = incoming.school_match_method;
      update.school_match_confidence = incoming.school_match_confidence;
    } else {
      update.school_id = existing.school_id;
      update.school_match_method = existing.school_match_method;
      update.school_match_confidence = existing.school_match_confidence;
    }
    update.school_manually_verified = false;
  }

  // Ingestion status: don't downgrade from "active"
  if (existing.ingestion_status === "active") {
    update.ingestion_status = "active";
  } else {
    update.ingestion_status = incoming.ingestion_status || existing.ingestion_status;
  }

  // Protected fields: NEVER overwrite non-null with null or junk
  for (var i = 0; i < PROTECTED_FIELDS.length; i++) {
    var field = PROTECTED_FIELDS[i];
    var newVal = incoming[field];
    var oldVal = existing[field];

    if (field === "camp_name") {
      // Camp name: NEVER overwrite with junk; only update if incoming is non-junk
      var newNameStr = safeStr(newVal);
      if (newNameStr && !isJunkCampName(newNameStr)) {
        update.camp_name = newVal;
      } else {
        update.camp_name = oldVal || newVal || null;
      }
    } else if (field === "price") {
      // Price: only update if incoming is non-null
      update.price = (newVal != null) ? newVal : oldVal;
    } else if (field === "price_options") {
      // Price options: only update if incoming is non-empty array
      update.price_options = (Array.isArray(newVal) && newVal.length > 0) ? newVal : (oldVal || []);
    } else {
      // String fields: only update if incoming is non-null and non-empty
      var newStr = safeStr(newVal);
      if (newStr) {
        update[field] = newVal;
      } else {
        update[field] = oldVal || null;
      }
    }
  }

  return update;
}

function campFieldsChanged(existing, update) {
  var exactFields = ["camp_name","start_date","end_date","city","state","link_url","source_url","ryzer_camp_id","season_year"];
  for (var i = 0; i < exactFields.length; i++) { if (safeStr(existing[exactFields[i]]) !== safeStr(update[exactFields[i]])) return true; }
  var ep = existing.price != null ? Number(existing.price) : null;
  var ip = update.price != null ? Number(update.price) : null;
  if (ep !== ip) return true;
  var normFields = ["venue_name","venue_address","grades","host_org"];
  for (var j = 0; j < normFields.length; j++) { if (normalizeForCompare(existing[normFields[j]]) !== normalizeForCompare(update[normFields[j]])) return true; }
  if (normalizePriceOptions(existing.price_options) !== normalizePriceOptions(update.price_options)) return true;
  if (normalizeForCompare(existing.notes).substring(0,200) !== normalizeForCompare(update.notes).substring(0,200)) return true;
  if (safeStr(existing.school_id) !== safeStr(update.school_id)) return true;
  return false;
}

async function upsertCamp(Camp, payload, existingBySourceKey, dryRun) {
  var sourceKey = payload.source_key;
  var existing = existingBySourceKey[sourceKey] || null;
  if (existing) {
    // Build a safe update payload that never overwrites good data with null
    var update = buildSafeUpdatePayload(existing, payload);
    var changed = campFieldsChanged(existing, update);
    if (!changed) return { result: "skipped", writtenPayload: update };
    if (!dryRun) await Camp.update(String(existing.id), update);
    return { result: "updated", writtenPayload: update };
  } else {
    if (!dryRun) await Camp.create(payload);
    return { result: "inserted", writtenPayload: payload };
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
  if (!user || user.role !== "admin") return json({ error: "Forbidden: Admin access required" }, 403);

  var sportKey = safeStr(body.sport_key);
  if (!sportKey) return json({ error: "sport_key is required" }, 400);

  // ── Load SportIngestConfig ──
  var configs = await base44.entities.SportIngestConfig.filter({ sport_key: sportKey }, "sport_key", 1);
  if (!configs || configs.length === 0) return json({ error: "No SportIngestConfig found for sport_key=" + sportKey }, 404);
  var config = configs[0];

  var SPORT_ID = config.sport_id || null;
  var SOURCE_PLATFORM = config.source_platform || sportKey + "campsusa";
  var DIRECTORY_URL = config.directory_url;
  var NON_SPORT_KEYWORDS = config.non_sport_keywords || [];
  var PROGRAM_BLOCKLIST = config.program_blocklist || [];

  var hardcodedMap = {};
  var hardcodedDescMap = {};
  if (config.hardcoded_mappings && Array.isArray(config.hardcoded_mappings)) {
    for (var hi = 0; hi < config.hardcoded_mappings.length; hi++) {
      var hm = config.hardcoded_mappings[hi];
      if (hm.program_name && hm.school_name) hardcodedMap[lc(hm.program_name)] = hm.school_name;
    }
  }
  if (config.hardcoded_desc_mappings && Array.isArray(config.hardcoded_desc_mappings)) {
    for (var hdi = 0; hdi < config.hardcoded_desc_mappings.length; hdi++) {
      var hdm = config.hardcoded_desc_mappings[hdi];
      if (hdm.program_name && hdm.school_name) hardcodedDescMap[lc(hdm.program_name)] = hdm.school_name;
    }
  }

  var step = lc(body.step || "ingest");
  if (body.matchOnly) step = "matchschools";
  var dryRun = body.dryRun !== false && body.dryRun !== "false";
  var maxSchools = Math.max(1, Number(body.maxSchools || 999));
  var startAt = Math.max(0, Number(body.startAt || 0));
  var timeBudgetMs = Math.max(10000, Number(body.timeBudgetMs || 55000));
  var skipDetailFetch = !!(body.skipDetailFetch);
  var elapsed = function() { return Date.now() - t0; };

  // ── Reset per-invocation state (module globals persist across requests in same isolate) ──
  _rateState.fetchedUrls = {};
  _rateState.circuitBroken = false;
  _rateState.circuitBrokenReason = "";
  _rateState.consecutiveErrors = 0;
  _rateState.totalRequests = 0;
  _rateState.ryzerTotal = 0;
  _rateState.registerTotal = 0;
  _rateState.ryzerThisHour = 0;
  _rateState.registerThisHour = 0;
  _rateState.hourStart = Date.now();

  // ── 1. Fetch directory (non-Ryzer site, still use stealth headers) ──
  var dirResult = await stealthFetch(DIRECTORY_URL, 20000, "https://www.google.com/");
  if (!dirResult.ok) return json({ error: "Failed to fetch " + DIRECTORY_URL + ": HTTP " + dirResult.status, version: VERSION, sport_key: sportKey });

  var genderFilter = config.gender || "both";
  var programs = parseDirectoryHtml(dirResult.html, genderFilter);
  if (programs.length === 0) return json({ error: "No programs found on " + DIRECTORY_URL, htmlLength: dirResult.html.length, version: VERSION, sport_key: sportKey, genderFilter: genderFilter });

  // ── 2. Load schools + build index ──
  var allSchools = await base44.entities.School.filter({}, "school_name", 99999);
  var schoolIdx = buildSchoolIndex(allSchools);

  // ── 3. Match ALL programs ──
  var matched = [];
  var unmatched = [];
  var ambiguous = [];
  var matchByMethod = {};

  for (var pi = 0; pi < programs.length; pi++) {
    var prog = programs[pi];
    var match = matchProgramToSchool(schoolIdx, prog, hardcodedMap, hardcodedDescMap);
    prog._match = match;

    if (match.school_id && match.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
      matched.push({ program_name: prog.name, url: prog.url, school_id: match.school_id, school_name: match.school_name, method: match.method, confidence: match.confidence });
      matchByMethod[match.method] = (matchByMethod[match.method] || 0) + 1;
    } else if (match.confidence > 0 && match.confidence < MATCH_CONFIDENCE_THRESHOLD) {
      ambiguous.push({ program_name: prog.name, url: prog.url, best_school: match.school_name, method: match.method, confidence: match.confidence });
    } else {
      unmatched.push({ program_name: prog.name, url: prog.url, extracted_school_name: extractSchoolFromProgramName(prog.name), subdomain_name: extractSchoolFromSubdomain(prog.url) });
    }
  }

  if (step === "matchschools") {
    var responseObj = {
      ok: true, version: VERSION, sport_key: sportKey, step: "matchSchools",
      totalPrograms: programs.length, totalMatched: matched.length, totalUnmatched: unmatched.length, totalAmbiguous: ambiguous.length,
      matchRate: Math.round((matched.length / programs.length) * 1000) / 10, matchByMethod: matchByMethod,
      unmatched: unmatched, ambiguous: ambiguous, elapsedMs: elapsed(),
    };
    if (!body.compact) responseObj.matched = matched;
    return json(responseObj);
  }

  // ── 4. INGEST ──
  var Camp = base44.entities.Camp;
  var LastIngestRun = base44.entities.LastIngestRun;

  var blockedKeys = {};
  try {
    var blockRows = await base44.entities.CampBlockList.filter({}, "source_key", 99999);
    for (var bi = 0; bi < (blockRows || []).length; bi++) {
      var bk = safeStr((blockRows[bi] || {}).source_key);
      if (bk) blockedKeys[bk] = true;
    }
  } catch (e) { /* ignore */ }

  var hostOrgMappingByKey = {};
  try {
    var mapRows = await base44.entities.HostOrgMapping.filter({}, "lookup_key", 99999);
    for (var mi = 0; mi < (mapRows || []).length; mi++) {
      var mr = mapRows[mi] || {};
      var mk = safeStr(mr.lookup_key);
      if (mk && mr.school_id) hostOrgMappingByKey[mk] = { school_id: mr.school_id, school_name: mr.school_name || null, verified: !!mr.verified };
    }
  } catch (e) { /* ignore */ }

  var allCamps = await Camp.filter({}, "source_key", 99999);
  var existingBySourceKey = {};
  for (var ci = 0; ci < allCamps.length; ci++) { var sk = safeStr(allCamps[ci].source_key); if (sk) existingBySourceKey[sk] = allCamps[ci]; }

  var slice = programs.slice(startAt, startAt + maxSchools);
  var stats = { schoolsProcessed:0, schoolsWithCamps:0, schoolsNoCamps:0, schoolsFetchError:0,
    campsInserted:0, campsUpdated:0, campsSkipped:0, campsErrors:0, campsPastSkipped:0,
    schoolsMatched:0, schoolsUnmatched:0, blocked:0, skippedWrongSport:0,
    detailFetchesSkipped: 0, detailFetchesMade: 0 };
  var sampleCamps = [];
  var sampleErrors = [];
  var schoolResults = [];

  for (var sli = 0; sli < slice.length; sli++) {
    if (elapsed() >= timeBudgetMs) { stats.stoppedEarly = true; break; }
    if (_rateState.circuitBroken) { stats.circuitBroken = true; stats.circuitBrokenReason = _rateState.circuitBrokenReason; break; }

    var prog2 = slice[sli];
    var match2 = prog2._match;
    stats.schoolsProcessed++;

    if (PROGRAM_BLOCKLIST.indexOf(lc(prog2.name)) >= 0) {
      stats.programBlocked = (stats.programBlocked || 0) + 1;
      schoolResults.push({ program_name: prog2.name, url: prog2.url, school_id: null, school_name: null, match_method: null, match_confidence: 0, camps_found: 0, camps_ingested: 0, error: "program_blocklist" });
      continue;
    }

    if (match2.school_id && match2.confidence >= MATCH_CONFIDENCE_THRESHOLD) stats.schoolsMatched++;
    else stats.schoolsUnmatched++;

    var schoolResult = { program_name: prog2.name, url: prog2.url, school_id: match2.school_id, school_name: match2.school_name, match_method: match2.method, match_confidence: match2.confidence, camps_found: 0, camps_ingested: 0, error: null };

    // PAGE 2 fetch: school program site
    var siteResult = await stealthFetch(prog2.url, 15000, DIRECTORY_URL);
    if (!siteResult.ok) {
      if (siteResult.circuitBroken) { stats.circuitBroken = true; stats.circuitBrokenReason = _rateState.circuitBrokenReason; break; }
      stats.schoolsFetchError++;
      schoolResult.error = "HTTP " + siteResult.status;
      schoolResults.push(schoolResult);
      // Randomized delay between school sites: 2-4s
      await sleep(2000 + rand(0, 2000));
      continue;
    }

    var campListings = extractCampsFromProgramSiteHtml(siteResult.html, prog2.url);
    schoolResult.camps_found = campListings.length;
    if (campListings.length === 0) { stats.schoolsNoCamps++; schoolResults.push(schoolResult); await sleep(2000 + rand(0, 2000)); continue; }
    stats.schoolsWithCamps++;

    for (var cli = 0; cli < campListings.length; cli++) {
      if (elapsed() >= timeBudgetMs) { stats.stoppedEarly = true; break; }
      if (_rateState.circuitBroken) { stats.circuitBroken = true; stats.circuitBrokenReason = _rateState.circuitBrokenReason; break; }

      var listing = campListings[cli];
      var ryzerId = listing.ryzer_camp_id;
      var regUrl = listing.reg_url;
      var sourceKey = SOURCE_PLATFORM + ":" + ryzerId;

      if (blockedKeys[sourceKey]) { stats.blocked++; continue; }

      // SMART SKIP: Only skip detail fetch if existing camp has complete data
      // If camp exists but has junk name, missing price, or missing city → re-fetch
      var existingCamp = existingBySourceKey[sourceKey] || null;
      var skipDetail = existingCamp && existingCampIsComplete(existingCamp);

      var campName = listing.camp_name_from_listing;
      var startDate = listing.start_date;
      var endDate = listing.end_date;
      var price = null; var city2 = null; var state2 = null; var notes = null;
      var venueName = null; var venueAddress = null; var grades = null; var hostOrg = null; var ryzerProgramName = null; var priceOptions = [];

      if (!skipDetailFetch && !skipDetail) {
        // PAGE 3 fetch: Ryzer registration page (only for NEW camps)
        var detailResult = await stealthFetch(regUrl, 12000, prog2.url);
        if (detailResult.ok) {
          stats.detailFetchesMade++;
          var details = extractRyzerCampDetails(detailResult.html, regUrl);
          if (details) {
            if (details.camp_name) campName = details.camp_name;
            if (details.start_date) startDate = details.start_date;
            if (details.end_date) endDate = details.end_date;
            if (details.price != null) price = details.price;
            if (details.city) city2 = details.city;
            if (details.state) state2 = details.state;
            if (details.description) notes = details.description;
            if (details.venue_name) venueName = details.venue_name;
            if (details.venue_address) venueAddress = details.venue_address;
            if (details.grades) grades = details.grades;
            if (details.host_org) hostOrg = details.host_org;
            if (details.ryzer_program_name) ryzerProgramName = details.ryzer_program_name;
            if (details.price_options) priceOptions = details.price_options;
          }
        } else if (detailResult.circuitBroken) {
          stats.circuitBroken = true; stats.circuitBrokenReason = _rateState.circuitBrokenReason; break;
        }
        // Randomized delay between camp pages: 1.5-3s
        await sleep(1500 + rand(0, 1500));
      } else if (skipDetail) {
        stats.detailFetchesSkipped++;
      } else if (existingCamp && !existingCampIsComplete(existingCamp)) {
        // Existing camp has junk data but detail fetch was skipped due to skipDetailFetch flag
        stats.detailFetchesSkipped++;
      }

      if (!startDate) { stats.campsErrors++; if (sampleErrors.length < 10) sampleErrors.push({ source_key: sourceKey, reason: "no_start_date", camp_name: campName, reg_url: regUrl }); continue; }
      if (startDate < todayIso) { stats.campsPastSkipped++; continue; }
      if (!campName) campName = prog2.name + " Camp";

      if (campName && /^Family\s*\|/i.test(campName)) { stats.skippedWrongSport++; if (sampleErrors.length < 10) sampleErrors.push({ source_key: sourceKey, reason: "family_prefix", camp_name: campName }); continue; }

      var badKeyword = containsKeyword(campName, NON_SPORT_KEYWORDS) || containsKeyword(hostOrg, NON_SPORT_KEYWORDS) || containsKeyword(notes, NON_SPORT_KEYWORDS);
      if (badKeyword) { stats.skippedWrongSport++; if (sampleErrors.length < 10) sampleErrors.push({ source_key: sourceKey, reason: "wrong_sport", camp_name: campName, keyword: badKeyword }); continue; }

      var seasonYear = parseInt(startDate.substring(0, 4));
      var payload = {
        camp_name: campName, sport_id: SPORT_ID, start_date: startDate, end_date: endDate || null,
        city: city2 || null, state: state2 || null, price: price || null, price_options: priceOptions || [],
        link_url: regUrl, source_url: regUrl, source_platform: SOURCE_PLATFORM, source_key: sourceKey,
        ryzer_camp_id: ryzerId, season_year: seasonYear, active: true, last_seen_at: runIso, last_ingested_at: runIso,
        ingestion_status: "active", position_ids: [], notes: notes || null,
        venue_name: venueName || null, venue_address: venueAddress || null, grades: grades || null,
        host_org: hostOrg || null, ryzer_program_name: ryzerProgramName || null,
        school_id: (match2.school_id && match2.confidence >= MATCH_CONFIDENCE_THRESHOLD) ? match2.school_id : null,
        school_match_method: match2.method || null, school_match_confidence: match2.confidence || 0,
        school_manually_verified: false,
      };

      if (!payload.school_id) {
        var rpnKey = normalizeHostOrgKey(ryzerProgramName, sportKey);
        var hoKey = normalizeHostOrgKey(hostOrg, sportKey);
        var mappingHit = (rpnKey && hostOrgMappingByKey[rpnKey]) || (hoKey && hostOrgMappingByKey[hoKey]) || null;
        if (mappingHit && mappingHit.school_id) {
          payload.school_id = mappingHit.school_id;
          payload.school_match_method = "host_org_mapping";
          payload.school_match_confidence = mappingHit.verified ? 1.0 : 0.9;
          payload.ingestion_status = "active";
          stats.hostOrgMapped = (stats.hostOrgMapped || 0) + 1;
        }
      }
      if (!payload.school_id) payload.ingestion_status = "needs_review";

      try {
        var upsertResult = await upsertCamp(Camp, payload, existingBySourceKey, dryRun);
        if (upsertResult.result === "inserted") { stats.campsInserted++; schoolResult.camps_ingested++; existingBySourceKey[sourceKey] = payload; }
        else if (upsertResult.result === "updated") { stats.campsUpdated++; schoolResult.camps_ingested++; }
        else stats.campsSkipped++;

        if (sampleCamps.length < 15) {
          // Show what was ACTUALLY written (or would be written), not raw incoming data
          var actualData = upsertResult.writtenPayload || payload;
          sampleCamps.push({ source_key: sourceKey, camp_name: actualData.camp_name, start_date: actualData.start_date, end_date: actualData.end_date, price: actualData.price, city: actualData.city, state: actualData.state, venue_name: actualData.venue_name, host_org: actualData.host_org, ryzer_camp_id: ryzerId, link_url: regUrl, sport_id: SPORT_ID, school_id: actualData.school_id, school_name: match2.school_name, match_method: match2.method, active: true, result: upsertResult.result, detailFetched: !skipDetail && !skipDetailFetch });
        }
      } catch (e) {
        stats.campsErrors++;
        if (sampleErrors.length < 10) sampleErrors.push({ source_key: sourceKey, camp_name: campName, error: String(e.message || e) });
      }
    }
    schoolResults.push(schoolResult);
    // Randomized delay between school sites: 2-4s
    await sleep(2000 + rand(0, 2000));
  }

  // Record run history + update config last_run_at
  if (!dryRun) {
    try {
      var totalCamps = stats.campsInserted + stats.campsUpdated + stats.campsSkipped;
      var campMatchRate = totalCamps > 0 ? Math.round((stats.schoolsMatched / stats.schoolsProcessed) * 1000) / 10 : 0;
      await LastIngestRun.create({
        sport: sportKey, source: SOURCE_PLATFORM, run_at: runIso,
        camps_inserted: stats.campsInserted, camps_updated: stats.campsUpdated,
        camps_skipped: stats.campsSkipped, camps_errors: stats.campsErrors,
        match_rate: campMatchRate, dry_run: false, duration_ms: elapsed(),
        notes: "Programs " + startAt + "-" + (startAt + stats.schoolsProcessed) + " of " + programs.length + ". Inserted=" + stats.campsInserted + " Updated=" + stats.campsUpdated + " Skipped=" + stats.campsSkipped + " DetailFetches=" + stats.detailFetchesMade + " DetailSkipped=" + stats.detailFetchesSkipped,
      });
    } catch (e) { /* ignore */ }
    try {
      await base44.asServiceRole.entities.SportIngestConfig.update(String(config.id), { last_run_at: runIso });
    } catch (e) { /* ignore */ }
  }

  var nextStartAt = startAt + stats.schoolsProcessed;
  return json({
    ok: true, version: VERSION, sport_key: sportKey, dryRun: dryRun,
    totalProgramsOnSite: programs.length,
    matchSummary: { totalMatched: matched.length, totalUnmatched: unmatched.length, totalAmbiguous: ambiguous.length, matchRate: Math.round((matched.length / programs.length) * 1000) / 10, matchByMethod: matchByMethod },
    stats: stats,
    stealth: { ryzerRequestsTotal: _rateState.ryzerTotal, registerRequestsTotal: _rateState.registerTotal, circuitBroken: _rateState.circuitBroken, circuitBrokenReason: _rateState.circuitBrokenReason || null },
    pagination: { startAt: startAt, processed: stats.schoolsProcessed, nextStartAt: nextStartAt, done: nextStartAt >= programs.length },
    sampleCamps: sampleCamps, sampleErrors: sampleErrors, schoolResults: schoolResults,
    unmatchedPrograms: unmatched.slice(0, 30), ambiguousPrograms: ambiguous.slice(0, 20), elapsedMs: elapsed(),
  });
});