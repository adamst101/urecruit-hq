// Returns ONLY the unmatched + ambiguous programs from footballcampsusa.com matching
import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function safeStr(x) { return x == null ? "" : String(x).trim(); }
function lc(x) { return safeStr(x).toLowerCase(); }

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
  return full || v;
}

// ─── Parse directory ─────
function parseDirectory(html) {
  var programs = [];
  var viewSitePattern = /<a[^>]*href="([^"]*)"[^>]*>\s*View Site\s*<\/a>/gi;
  var vsMatch;
  var entries = [];
  while ((vsMatch = viewSitePattern.exec(html)) !== null) {
    entries.push({ href: vsMatch[1], index: vsMatch.index, full: vsMatch[0] });
  }
  for (var i = 0; i < entries.length; i++) {
    var vs = entries[i];
    var ws = Math.max(0, vs.index - 2000);
    var w = html.slice(ws, vs.index + vs.full.length);
    var name = null;
    var reH = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/gi;
    var hm; var headings = [];
    while ((hm = reH.exec(w)) !== null) { var t = stripTags(hm[1]); if (t && t.length > 2 && t.length < 200) headings.push(t); }
    if (headings.length) name = headings[headings.length - 1];
    if (!name) { var reSt = /<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi; var sm; while ((sm = reSt.exec(w)) !== null) { var t2 = stripTags(sm[1]); if (t2 && t2.length > 4 && t2.length < 200) name = t2; } }
    if (!name) { var reImg = /<img[^>]*(?:alt|title)="([^"]+)"[^>]*>/gi; var im; while ((im = reImg.exec(w)) !== null) { var t3 = (im[1]||"").trim(); if (t3 && t3.length > 3 && t3.length < 200) name = t3; } }
    var url = vs.href;
    if (url && !url.startsWith("http")) { if (url.startsWith("//")) url = "https:" + url; else url = "https://www.footballcampsusa.com/" + url.replace(/^\//, ""); }
    var logoUrl = null;
    var reLogo = /<img[^>]*src="(https:\/\/s3\.amazonaws\.com\/images\.ryzer\.com\/[^"]+)"[^>]*>/gi;
    var lm; while ((lm = reLogo.exec(w)) !== null) { logoUrl = lm[1]; }
    programs.push({ name: name || "(unknown)", url: url || null, logo_url: logoUrl || null });
  }
  var seen = {}; var deduped = [];
  for (var j = 0; j < programs.length; j++) {
    var key = lc(programs[j].url || "").replace(/\/+$/, "");
    if (!key || seen[key]) continue;
    seen[key] = true; deduped.push(programs[j]);
  }
  return deduped;
}

// ─── Build school index ─────
function buildSchoolIndex(schools) {
  var byNormName = {};
  var byNicknameState = {};
  var byLogoUrl = {};
  var byNickname = {};
  for (var i = 0; i < schools.length; i++) {
    var s = schools[i]; var sid = safeStr(s.id); if (!sid) continue;
    var nn = lc(s.normalized_name || s.school_name || "");
    if (nn) { if (!byNormName[nn]) byNormName[nn] = []; byNormName[nn].push({ id: sid, school: s }); }
    var nick = lc(s.athletics_nickname || "");
    var st = normalizeState(s.state);
    if (nick && st) { var nk = nick + "|" + st; if (!byNicknameState[nk]) byNicknameState[nk] = []; byNicknameState[nk].push({ id: sid, school: s }); }
    if (nick) { if (!byNickname[nick]) byNickname[nick] = []; byNickname[nick].push({ id: sid, school: s }); }
    var logos = [s.logo_url, s.athletic_logo_url];
    for (var li = 0; li < logos.length; li++) { var lu = lc(logos[li] || ""); if (lu) { if (!byLogoUrl[lu]) byLogoUrl[lu] = []; byLogoUrl[lu].push({ id: sid, school: s }); } }
  }
  return { byNormName, byNicknameState, byLogoUrl, byNickname };
}

function extractSchoolFromProgramName(name) {
  var n = safeStr(name);
  n = n.replace(/\s*-\s*Football$/i, "").replace(/\s+Football\s+Camps?$/i, "").replace(/\s+Football\s+Clinics?$/i, "");
  n = n.replace(/\s+Football\s+Prospect\s+Camps?$/i, "").replace(/\s+Football$/i, "").replace(/\s+Camps?$/i, "");
  n = n.replace(/\s+LLC$/i, "").replace(/\s+@\s+\w+$/i, "");
  return n.trim();
}

function extractSchoolFromSubdomain(url) {
  if (!url) return null;
  try {
    var h = new URL(url).hostname.toLowerCase();
    if (!h.includes("ryzerevents.com")) return null;
    var sub = h.split(".")[0];
    sub = sub.replace(/footballcamps?/gi, "").replace(/footballclinics?/gi, "").replace(/football/gi, "");
    sub = sub.replace(/camps?$/gi, "").replace(/prospectcamp/gi, "").replace(/-/g, " ");
    return sub.trim() || null;
  } catch (e) { return null; }
}

function fuzzyNameScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.85;
  var aw = a.split(" ").filter(function(w){return w.length>2;});
  var bw = b.split(" ").filter(function(w){return w.length>2;});
  if (!aw.length || !bw.length) return 0;
  var overlap = 0;
  for (var i = 0; i < aw.length; i++) for (var j = 0; j < bw.length; j++) if (aw[i]===bw[j]) { overlap++; break; }
  var ratio = overlap / Math.max(aw.length, bw.length);
  return ratio >= 0.5 ? ratio : 0;
}

var THRESHOLD = 0.7;

function matchProgram(idx, prog) {
  var pName = prog.name; var pUrl = prog.url; var logoUrl = prog.logo_url;
  if (logoUrl) { var luKey = lc(logoUrl); var lm = idx.byLogoUrl[luKey]; if (lm && lm.length === 1) return { school_id: lm[0].id, school_name: lm[0].school.school_name, method: "logo", confidence: 1.0 }; }
  var sp = extractSchoolFromProgramName(pName);
  var sd = extractSchoolFromSubdomain(pUrl);
  var cands = []; if (sp) cands.push(sp); if (sd) cands.push(sd); cands.push(pName);
  for (var ci = 0; ci < cands.length; ci++) {
    var nn = normalizeName(cands[ci]); if (!nn) continue;
    var ex = idx.byNormName[nn]; if (ex && ex.length===1) return { school_id: ex[0].id, school_name: ex[0].school.school_name, method: "exact_name", confidence: 0.95 };
    var vars = [nn.replace(/ university$/,"").replace(/ college$/,""), nn+" university", nn+" college", nn.replace(/^university of /,""), "university of "+nn, nn.replace(/ st$/," state"), nn.replace(/ state university$/," state"), nn.replace(/ state$/," state university"), "the "+nn, nn.replace(/^the /,"")];
    for (var vi = 0; vi < vars.length; vi++) { var vn = vars[vi].trim(); if (vn && vn !== nn) { var vm = idx.byNormName[vn]; if (vm && vm.length===1) return { school_id: vm[0].id, school_name: vm[0].school.school_name, method: "exact_name", confidence: 0.9 }; } }
  }
  for (var ni = 0; ni < cands.length; ni++) { var nk = lc(cands[ni]); if (!nk) continue; var nm = idx.byNickname[nk]; if (nm && nm.length===1) return { school_id: nm[0].id, school_name: nm[0].school.school_name, method: "nickname", confidence: 0.85 }; }
  var bestF = null; var bestS = 0; var allNN = Object.keys(idx.byNormName);
  for (var fi = 0; fi < cands.length; fi++) { var cn = normalizeName(cands[fi]); if (!cn||cn.length<3) continue; for (var si = 0; si < allNN.length; si++) { var snn = allNN[si]; var ent = idx.byNormName[snn]; if (!ent||ent.length!==1) continue; var sc = fuzzyNameScore(cn, snn); if (sc>bestS) { bestS=sc; bestF=ent[0]; } } }
  if (bestF && bestS >= 0.6) { var conf = Math.min(0.85, bestS*0.85+0.1); return { school_id: bestF.id, school_name: bestF.school.school_name, method: "fuzzy_name", confidence: Math.round(conf*100)/100 }; }
  return { school_id: null, school_name: null, method: null, confidence: 0 };
}

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden" }, 403);

  var dirResp = await fetch("https://www.footballcampsusa.com/", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
    redirect: "follow",
  });
  if (!dirResp.ok) return json({ error: "Failed to fetch directory: " + dirResp.status });
  var html = await dirResp.text();
  var programs = parseDirectory(html);

  var allSchools = await base44.entities.School.filter({}, "school_name", 99999);
  var idx = buildSchoolIndex(allSchools);

  var unmatched = [];
  var ambiguous = [];
  var matchedCount = 0;
  var byMethod = {};

  for (var i = 0; i < programs.length; i++) {
    var m = matchProgram(idx, programs[i]);
    if (m.school_id && m.confidence >= THRESHOLD) {
      matchedCount++;
      byMethod[m.method] = (byMethod[m.method]||0) + 1;
    } else if (m.confidence > 0 && m.confidence < THRESHOLD) {
      ambiguous.push({ idx: i+1, name: programs[i].name, url: programs[i].url, best: m.school_name, method: m.method, conf: m.confidence, extracted: extractSchoolFromProgramName(programs[i].name), subdomain: extractSchoolFromSubdomain(programs[i].url) });
    } else {
      unmatched.push({ idx: i+1, name: programs[i].name, url: programs[i].url, extracted: extractSchoolFromProgramName(programs[i].name), subdomain: extractSchoolFromSubdomain(programs[i].url) });
    }
  }

  return json({
    totalPrograms: programs.length,
    matched: matchedCount,
    unmatched_count: unmatched.length,
    ambiguous_count: ambiguous.length,
    matchRate: Math.round((matchedCount / programs.length) * 1000) / 10,
    byMethod: byMethod,
    unmatched: unmatched,
    ambiguous: ambiguous,
  });
});