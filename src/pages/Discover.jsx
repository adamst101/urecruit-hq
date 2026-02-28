// src/pages/Discover.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";

import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampFilters } from "../components/filters/useCampFilters.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

import {
  matchesDivision,
  matchesSport,
  matchesPositions,
  matchesState,
  matchesDateRange,
} from "../components/filters/filterUtils.jsx";

/* -------------------------
   Rate-limit hardened helpers
------------------------- */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate limited") ||
    msg.includes("429") ||
    msg.includes("too many")
  );
}

async function safeFilter(entity, where, sort, limit, { retries = 2, baseDelayMs = 350 } = {}) {
  if (!entity?.filter) return [];
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await entity.filter(where || {}, sort, limit);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === retries) break;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }

  throw lastErr;
}

function chunk(arr, size) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Number(size) || 50);
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
}

function isBadLogoUrl(url) {
  const u = String(url || "").trim();
  if (!u) return true;
  const lu = u.toLowerCase();

  if (lu.includes("ryzer")) return true;
  if (lu.includes("sportsusa")) return true;
  if (lu.includes("sportscamps")) return true;
  if (lu.includes("placeholder")) return true;

  return false;
}

function pickBestLogoUrl(...candidates) {
  for (const c of candidates) {
    const u = String(c || "").trim();
    if (!u) continue;
    if (isBadLogoUrl(u)) continue;
    return u;
  }
  return null;
}

function initialBadge(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const ch = s.replace(/[^A-Za-z0-9]/g, "").slice(0, 1);
  return (ch || "?").toUpperCase();
}

function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = String(mdy[1]).padStart(2, "0");
      const dd = String(mdy[2]).padStart(2, "0");
      const yyyy = String(mdy[3]);
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function footballSeasonYearForDate(d = new Date()) {
  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      requestedSeason: safeNumber(season),
    };
  } catch {
    return { mode: null, requestedSeason: null };
  }
}

function chipLabel(key, nf) {
  if (!nf) return "";
  if (key === "state") return nf.state ? String(nf.state).toUpperCase() : "State";
  if (key === "dates") {
    if (!nf.startDate && !nf.endDate) return "Dates";
    if (nf.startDate && !nf.endDate) return `From ${nf.startDate}`;
    if (!nf.startDate && nf.endDate) return `Until ${nf.endDate}`;
    return `${nf.startDate} → ${nf.endDate}`;
  }
  return "";
}

function hasActiveFilters(nf, isPaid) {
  if (!nf) return false;
  const divOn = Array.isArray(nf.divisions) && nf.divisions.length > 0;
  const posOn = Array.isArray(nf.positions) && nf.positions.length > 0;
  const stateOn = !!nf.state;
  const dateOn = !!nf.startDate || !!nf.endDate;
  const sportOn = !isPaid && Array.isArray(nf.sports) && nf.sports.length > 0;
  return divOn || posOn || stateOn || dateOn || sportOn;
}

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const iso = new Date().toISOString();
    const day = iso.slice(0, 10);

    const eventName = payload?.event_name || payload?.event_type || "event";
    const sourcePlatform = payload?.source_platform || "web";
    const title = payload?.title || String(eventName);
    const sourceKey = payload?.source_key || `${String(sourcePlatform)}:${String(eventName)}`;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: payload?.start_date || day,
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {
    // ignore
  }
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  // ✅ FIX: readDemoMode() can be null in some runtimes (Base44 console, or provider timing).
  const demo = readDemoMode() || { isDemoMode: false };
  const isDemoMode = !!demo.isDemoMode;

  const { identity: athleteProfile } = useAthleteIdentity();
  const athleteSportId = athleteProfile?.sport_id ? String(athleteProfile.sport_id) : "";

  const { hasAccess, seasonYear: accessSeasonYear } = useSeasonAccess();
  const writeGate = useWriteGate();

  const isPaid = !!hasAccess && !isDemoMode;

  // ...rest of file unchanged...
  // (Keep your existing Discover.jsx body below this point)
}