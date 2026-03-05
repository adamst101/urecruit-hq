// src/pages/MyCamps.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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

  const showEmpty = sortedRows.length === 0;

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
          <div className="space-y-3">
            {sortedRows.map((r) => {
              const campId = String(r?.camp_id || r?.id || "");
              const st = String(r?.intent_status || "").toLowerCase();
              const isRegistered = st === "registered" || st === "completed";
              const isFavorite = st === "favorite";

              return (
                <CampCard
                  key={campId}
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