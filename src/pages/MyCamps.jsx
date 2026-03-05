// src/pages/MyCamps.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import CampCard from "../components/camps/CampCard.jsx";

import BottomNav from "../components/navigation/BottomNav";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { useDemoCampSummaries } from "@/components/hooks/useDemoCampSummaries.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered } from "../components/hooks/demoRegistered.jsx";
import WarningBanner from "../components/camps/WarningBanner.jsx";
import WarningBadge from "../components/camps/WarningBadge.jsx";
import { useConflictDetection } from "../components/hooks/useConflictDetection.jsx";
import DemoBanner from "../components/DemoBanner.jsx";
import {
  matchesMonth,
  matchesStateSimple,
  matchesDivisionSimple,
  normalizeState,
  MONTH_OPTIONS,
  DIVISION_FILTER_OPTIONS,
} from "../components/filters/filterUtils.jsx";

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

  const demoQuery = useDemoCampSummaries({
    seasonYear,
    demoProfileId: demoProfileId || "default",
    enabled: isDemoMode,
  });

  const loading = isDemoMode ? !!demoQuery?.isLoading : !!paidQuery?.isLoading;

  const rows = useMemo(() => {
    if (!isDemoMode) return Array.isArray(paidQuery?.data) ? paidQuery.data : [];

    // demoQuery already has intent_status baked in from useDemoCampSummaries
    const base = Array.isArray(demoQuery?.data) ? demoQuery.data : [];
    return base.filter((r) => {
      const st = String(r?.intent_status || "").toLowerCase();
      return st === "favorite" || st === "registered" || st === "completed";
    });
  }, [isDemoMode, paidQuery?.data, demoQuery?.data]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = String(a?.start_date || "9999").slice(0, 10);
      const db = String(b?.start_date || "9999").slice(0, 10);
      return da.localeCompare(db);
    });
  }, [rows]);

  // Inline filter state
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [inlineState, setInlineState] = useState("all");
  const [inlineDivision, setInlineDivision] = useState("all");

  // Build dynamic state options from user's camps
  const stateOptions = useMemo(() => {
    return [...new Set(
      sortedRows.map((c) => normalizeState(c?.state || c?.camp_state || c?.school_state)).filter(Boolean)
    )].sort();
  }, [sortedRows]);

  // Apply inline filters
  const filteredRows = useMemo(() => {
    return sortedRows.filter((c) =>
      matchesMonth(c, selectedMonth) &&
      matchesStateSimple(c, inlineState) &&
      matchesDivisionSimple(c, inlineDivision)
    );
  }, [sortedRows, selectedMonth, inlineState, inlineDivision]);

  const showEmpty = filteredRows.length === 0;

  // Conflict detection — use filteredRows for display but sortedRows for full conflict analysis
  const favCamps = useMemo(() => sortedRows.filter((r) => {
    const st = String(r?.intent_status || "").toLowerCase();
    return st === "favorite";
  }), [sortedRows]);

  const regCamps = useMemo(() => sortedRows.filter((r) => {
    const st = String(r?.intent_status || "").toLowerCase();
    return st === "registered" || st === "completed";
  }), [sortedRows]);

  const { warnings: allWarnings, getWarningsForCamp } = useConflictDetection({
    favoritedCamps: favCamps.map((r) => ({
      id: r?.camp_id || r?.id,
      camp_name: r?.camp_name || r?.name,
      start_date: r?.start_date,
      city: r?.city || r?.school_city,
      state: r?.state || r?.school_state,
      school_name: r?.school_name,
    })),
    registeredCamps: regCamps.map((r) => ({
      id: r?.camp_id || r?.id,
      camp_name: r?.camp_name || r?.name,
      start_date: r?.start_date,
      city: r?.city || r?.school_city,
      state: r?.state || r?.school_state,
      school_name: r?.school_name,
    })),
    homeCity: athleteProfile?.home_city || null,
    homeState: athleteProfile?.home_state || null,
    isPaid: !isDemoMode,
  });

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="mb-4">
          <div className="text-2xl font-bold text-[#f9fafb]">My Camps</div>
        </div>

        {isDemoMode && <div className="mb-4"><DemoBanner seasonYear={seasonYear} /></div>}

        {/* Inline filters: Month | State | Division */}
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-[#1f2937] border border-[#374151] text-[#f9fafb] focus:border-[#e8a020] focus:outline-none"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <select
            value={inlineState}
            onChange={(e) => setInlineState(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-[#1f2937] border border-[#374151] text-[#f9fafb] focus:border-[#e8a020] focus:outline-none"
          >
            <option value="all">All States</option>
            {stateOptions.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>

          <select
            value={inlineDivision}
            onChange={(e) => setInlineDivision(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-[#1f2937] border border-[#374151] text-[#f9fafb] focus:border-[#e8a020] focus:outline-none"
          >
            {DIVISION_FILTER_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <WarningBanner warnings={allWarnings} />

        {loading ? (
          <div className="py-10 text-center text-[#9ca3af]">Loading...</div>
        ) : showEmpty ? (
          <Card className="p-5 border-[#1f2937] bg-[#111827]">
            <div className="text-lg font-semibold text-[#f9fafb]">No camps yet</div>
            <div className="mt-1 text-sm text-[#9ca3af]">
              {sortedRows.length > 0
                ? `No camps match the current filters (${filteredRows.length} of ${sortedRows.length}).`
                : isDemoMode
                  ? "Favorite camps in Discover to see Potential camps here and in Calendar."
                  : "Favorite or register for camps in Discover to see them here."}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Filter count indicator */}
            {(selectedMonth !== "all" || inlineState !== "all" || inlineDivision !== "all") && (
              <div className="text-xs text-[#9ca3af]">
                Showing {filteredRows.length} of {sortedRows.length} camps
              </div>
            )}
            {filteredRows.map((r) => {
              const campId = String(r?.camp_id || r?.id || "");
              const st = String(r?.intent_status || "").toLowerCase();
              const isRegistered = st === "registered" || st === "completed";
              const isFavorite = st === "favorite";
              const campWarnings = getWarningsForCamp(campId);

              return (
                <CampCard
                  key={campId}
                  warningBadge={campWarnings.length > 0 ? <WarningBadge warnings={campWarnings} /> : null}
                  camp={{
                    id: campId,
                    camp_name: r?.camp_name || r?.name || "Camp",
                    start_date: r?.start_date,
                    end_date: r?.end_date,
                    price: r?.price ?? null,
                    link_url: r?.link_url ?? null,
                    city: r?.city ?? null,
                    state: r?.state ?? null,
                  }}
                  school={{
                    id: r?.school_id ? String(r.school_id) : null,
                    school_name: r?.school_name ?? null,
                    division: r?.school_division ?? r?.division ?? null,
                    logo_url: r?.school_logo_url ?? null,
                  }}
                  sport={{}}
                  positions={[]}
                  isFavorite={isFavorite}
                  isRegistered={isRegistered}
                  mode={isDemoMode ? "demo" : "paid"}
                  disabledFavorite={true}
                  onClick={() => nav(`/CampDetail?id=${encodeURIComponent(campId)}`)}
                  onFavoriteToggle={() => {}}
                />
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}