// src/pages/MyCamps.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { useDemoCampSummaries } from "../components/hooks/useDemoCampSummaries.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered } from "../components/hooks/demoRegistered.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function toISODate(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function initialBadge(name) {
  const s = String(name || "").trim();
  return (s.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();
}

function LogoAvatar({ schoolName, logoUrl }) {
  return (
    <div className="w-10 h-10 rounded-lg bg-[#0f172a] border border-[#1f2937] overflow-hidden flex items-center justify-center flex-shrink-0">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${schoolName} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
        />
      ) : (
        <div className="text-xs font-semibold text-[#9ca3af]">{initialBadge(schoolName)}</div>
      )}
    </div>
  );
}

function CampRow({ row, isDemo }) {
  const schoolName = row?.school_name || "School";
  const schoolLogo = row?.school_logo_url || null;
  const divisionLabel = row?.school_division || row?.division || null;
  const dateLabel = (() => {
    const s = toISODate(row?.start_date);
    const e = toISODate(row?.end_date);
    if (s && e && e !== s) return `${s} ? ${e}`;
    return s || "TBD";
  })();

  const st = String(row?.intent_status || "").toLowerCase();
  const isRegistered = st === "registered" || st === "completed";
  const isFavorite = st === "favorite";

  return (
    <Card className="p-4 border-[#1f2937] bg-[#111827]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <LogoAvatar schoolName={schoolName} logoUrl={schoolLogo} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {divisionLabel ? (
                <Badge className="bg-[#0f172a] text-[#f9fafb] border border-[#374151] text-xs">
                  {divisionLabel}
                </Badge>
              ) : null}
              {isDemo ? (
                <Badge variant="outline" className="text-xs border-[#374151] text-[#9ca3af]">
                  Demo
                </Badge>
              ) : null}
              {isRegistered ? (
                <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>
              ) : isFavorite ? (
                <Badge className="bg-amber-500 text-white text-xs">★ Favorite</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-xs">Potential</Badge>
              )}
            </div>

            <div className="text-lg font-semibold text-[#f9fafb] truncate mt-1">{schoolName}</div>
            <div className="text-sm text-[#9ca3af] truncate">{row?.camp_name || row?.name || "Camp"}</div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#9ca3af]">
              <span className="rounded-md bg-[#0f172a] border border-[#1f2937] px-2 py-1">{dateLabel}</span>
              {(row?.city || row?.state) ? (
                <span className="rounded-md bg-[#0f172a] border border-[#1f2937] px-2 py-1">
                  {[row?.city, row?.state].filter(Boolean).join(", ")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function MyCamps() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const { identity: athleteProfile } = useAthleteIdentity();
  const { demoProfileId } = useDemoProfile();

  const dm = readDemoMode();
  const isDemoMode = dm?.mode === "demo" || season?.mode !== "paid";
  const seasonYear = Number(dm?.seasonYear || season?.seasonYear || season?.currentYear || new Date().getFullYear());

  const athleteId = normId(athleteProfile);
  const sportId = normId(athleteProfile?.sport_id) || athleteProfile?.sport_id;

  const paidQuery = useCampSummariesClient({
    athleteId: athleteId ? String(athleteId) : undefined,
    sportId: sportId ? String(sportId) : "",
    enabled: !isDemoMode && !!athleteId,
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    enabled: isDemoMode,
  });

  const loading = isDemoMode ? !!demoQuery?.isLoading : !!paidQuery?.isLoading;

  const rows = useMemo(() => {
    if (!isDemoMode) return Array.isArray(paidQuery?.data) ? paidQuery.data : [];

    const base = Array.isArray(demoQuery?.data) ? demoQuery.data : [];
    const favSet = new Set(getDemoFavorites(demoProfileId, seasonYear).map(String));

    return base
      .map((r) => {
        const cid = String(r?.camp_id || r?.id || "");
        const reg = cid ? isDemoRegistered(demoProfileId, cid) : false;
        const fav = cid ? favSet.has(cid) : false;
        const intent = reg ? "registered" : fav ? "favorite" : "";
        return intent ? { ...r, intent_status: intent } : null;
      })
      .filter(Boolean);
  }, [isDemoMode, paidQuery?.data, demoQuery?.data, demoProfileId, seasonYear]);

  const registered = useMemo(() => {
    return rows.filter((r) => {
      const st = String(r?.intent_status || "").toLowerCase();
      return st === "registered" || st === "completed";
    });
  }, [rows]);

  const favorites = useMemo(() => {
    return rows.filter((r) => String(r?.intent_status || "").toLowerCase() === "favorite");
  }, [rows]);

  const showEmpty = registered.length === 0 && favorites.length === 0;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-[#f9fafb]">My Camps</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-[#111827] text-[#9ca3af] border border-[#1f2937]">
                Season {seasonYear}
              </Badge>
              {isDemoMode ? (
                <Badge variant="outline" className="border-[#374151] text-[#9ca3af]">Demo</Badge>
              ) : (
                <Badge className="bg-[#e8a020] text-[#0a0e1a]">Paid</Badge>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => nav("/Discover")}
            className="whitespace-nowrap border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#111827]"
          >
            Back to Discover
          </Button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-[#9ca3af]">Loading...</div>
        ) : showEmpty ? (
          <Card className="p-5 border-[#1f2937] bg-[#111827]">
            <div className="text-lg font-semibold text-[#f9fafb]">No camps yet</div>
            <div className="mt-1 text-sm text-[#9ca3af]">
              {isDemoMode
                ? "Favorite camps in Discover to see Potential camps here and in Calendar."
                : "Favorite or register for camps in Discover to see them here."}
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {registered.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold text-[#9ca3af] mb-2">Registered</h2>
                <div className="space-y-3">
                  {registered.map((r) => (
                    <CampRow key={String(r?.camp_id || r?.id || Math.random())} row={r} isDemo={isDemoMode} />
                  ))}
                </div>
              </div>
            ) : null}

            {favorites.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold text-[#9ca3af] mb-2">★ Favorites</h2>
                <div className="space-y-3">
                  {favorites.map((r) => (
                    <CampRow key={String(r?.camp_id || r?.id || Math.random())} row={r} isDemo={isDemoMode} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}