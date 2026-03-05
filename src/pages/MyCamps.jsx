// src/pages/MyCamps.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { Card } from "../components/ui/card";

import CampCard from "../components/camps/CampCard.jsx";
import BottomNav from "../components/navigation/BottomNav";
import MyCampsSummaryPills from "../components/mycamps/MyCampsSummaryPills.jsx";
import MyCampsTabs from "../components/mycamps/MyCampsTabs.jsx";
import MyCampsEmptyState from "../components/mycamps/MyCampsEmptyState.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { useDemoCampSummaries } from "@/components/hooks/useDemoCampSummaries.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
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

export default function MyCamps() {
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const season = useSeasonAccess();

  // Invalidate cached camp summaries on mount so we pick up
  // any favorites/registrations made on the Discover page
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["demoCampSummaries"] });
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
  }, [queryClient]);
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

  // Split into favorites and registered
  const favCamps = useMemo(() => sortedRows.filter((r) => {
    const st = String(r?.intent_status || "").toLowerCase();
    return st === "favorite";
  }), [sortedRows]);

  const regCamps = useMemo(() => sortedRows.filter((r) => {
    const st = String(r?.intent_status || "").toLowerCase();
    return st === "registered" || st === "completed";
  }), [sortedRows]);

  // Conflict detection
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

  // Count conflicts: camps that share a date with another camp
  const conflictCampIds = useMemo(() => {
    const dateCounts = {};
    sortedRows.forEach((r) => {
      const d = String(r?.start_date || "").slice(0, 10);
      if (!d || d === "") return;
      if (!dateCounts[d]) dateCounts[d] = [];
      dateCounts[d].push(String(r?.camp_id || r?.id || ""));
    });
    const ids = new Set();
    Object.values(dateCounts).forEach((arr) => {
      if (arr.length > 1) arr.forEach((id) => ids.add(id));
    });
    return ids;
  }, [sortedRows]);

  const conflictCount = conflictCampIds.size;

  // UI state
  const [activeTab, setActiveTab] = useState("favorites");
  const [pillFilter, setPillFilter] = useState(null);

  // Inline filters
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [inlineState, setInlineState] = useState("all");
  const [inlineDivision, setInlineDivision] = useState("all");

  // Determine which rows to show based on tab + pill filter
  const displayRows = useMemo(() => {
    let base;
    if (pillFilter === "conflict") {
      base = sortedRows.filter((r) => conflictCampIds.has(String(r?.camp_id || r?.id || "")));
    } else if (pillFilter === "favorite") {
      base = favCamps;
    } else if (pillFilter === "registered") {
      base = regCamps;
    } else if (activeTab === "favorites") {
      base = favCamps;
    } else {
      base = regCamps;
    }

    return base.filter((c) =>
      matchesMonth(c, selectedMonth) &&
      matchesStateSimple(c, inlineState) &&
      matchesDivisionSimple(c, inlineDivision)
    );
  }, [pillFilter, activeTab, favCamps, regCamps, sortedRows, conflictCampIds, selectedMonth, inlineState, inlineDivision]);

  // State options from current tab rows
  const stateOptions = useMemo(() => {
    const source = activeTab === "favorites" ? favCamps : regCamps;
    return [...new Set(
      source.map((c) => normalizeState(c?.state || c?.camp_state || c?.school_state)).filter(Boolean)
    )].sort();
  }, [activeTab, favCamps, regCamps]);

  const showEmpty = !loading && displayRows.length === 0 && !pillFilter &&
    selectedMonth === "all" && inlineState === "all" && inlineDivision === "all";

  const effectiveTab = pillFilter === "favorite" ? "favorites" : pillFilter === "registered" ? "registered" : activeTab;

  function renderCampRow(r) {
    const campId = String(r?.camp_id || r?.id || "");
    const st = String(r?.intent_status || "").toLowerCase();
    const isRegistered = st === "registered" || st === "completed";
    const isFavorite = st === "favorite";
    const campWarnings = getWarningsForCamp(campId);
    const hasConflict = conflictCampIds.has(campId);

    return (
      <div key={campId} className="relative">
        {hasConflict && (
          <div className="absolute top-2 right-12 z-10">
            <span style={{
              background: "#7f1d1d",
              color: "#fca5a5",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 12,
            }}>
              ⚠ Date conflict
            </span>
          </div>
        )}
        <CampCard
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
          onClick={undefined}
          onFavoriteToggle={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="mb-4">
          <div className="text-2xl font-bold text-[#f9fafb]">My Camps</div>
        </div>

        {isDemoMode && <div className="mb-4"><DemoBanner seasonYear={seasonYear} /></div>}

        {/* Summary pills */}
        <MyCampsSummaryPills
          favCount={favCamps.length}
          regCount={regCamps.length}
          conflictCount={conflictCount}
          activeFilter={pillFilter}
          onFilterChange={setPillFilter}
        />

        {/* Tabs */}
        <MyCampsTabs
          activeTab={pillFilter ? effectiveTab : activeTab}
          onTabChange={(t) => { setActiveTab(t); setPillFilter(null); }}
          favCount={favCamps.length}
          regCount={regCamps.length}
        />

        {/* Inline filters */}
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

        {loading ? (
          <div className="py-10 text-center text-[#9ca3af]">Loading...</div>
        ) : showEmpty ? (
          <MyCampsEmptyState
            tab={activeTab}
            onSwitchToFavorites={() => setActiveTab("favorites")}
          />
        ) : displayRows.length === 0 ? (
          <Card className="p-5 border-[#1f2937] bg-[#111827]">
            <div className="text-lg font-semibold text-[#f9fafb]">No camps match filters</div>
            <div className="mt-1 text-sm text-[#9ca3af]">
              Try clearing filters or switching tabs.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {(selectedMonth !== "all" || inlineState !== "all" || inlineDivision !== "all") && (
              <div className="text-xs text-[#9ca3af]">
                Showing {displayRows.length} camps
              </div>
            )}
            {displayRows.map(renderCampRow)}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}