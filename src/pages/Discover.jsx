// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite, isDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

// ---------- helpers ----------
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function pickStateValue(val) {
  if (!val) return "";
  const s = String(val).trim();

  // If already 2-letter, keep it
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();

  // Common full names -> abbreviations (extend later if needed)
  const map = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
    michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
    nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
    oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY"
  };

  const key = s.toLowerCase();
  return map[key] || "";
}

function withinDateRange(startDateStr, start, end) {
  if (!start && !end) return true;
  if (!startDateStr) return false;
  const d = String(startDateStr).slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

export default function Discover() {
  const season = useSeasonAccess();
  const { demoProfile, demoProfileId, loaded: demoLoaded } = useDemoProfile();
  const { athleteProfile } = useAthleteIdentity();
  const writeGate = useWriteGate();

  // Determine effective mode:
  // - URL ?mode=demo forces demo
  // - otherwise paid if season says paid
  const effectiveMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search || "");
      if (sp.get("mode") === "demo") return "demo";
    } catch {}
    return season.mode === "paid" ? "paid" : "demo";
  }, [season.mode]);

  const isDemo = effectiveMode === "demo";

  // Filter state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Load sports + positions for sheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sRows, pRows] = await Promise.all([
          base44.entities.Sport.list?.() ?? [],
          base44.entities.Position.list?.() ?? []
        ]);
        if (!mounted) return;
        setSports(Array.isArray(sRows) ? sRows : []);
        setPositions(Array.isArray(pRows) ? pRows : []);
      } catch {
        if (!mounted) return;
        setSports([]);
        setPositions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // In demo, default filters can come from demoProfile (optional)
  useEffect(() => {
    if (!isDemo) return;
    if (!demoLoaded) return;

    // Only set initial values if user hasn't touched filters yet
    setFilters((prev) => {
      const untouched =
        !prev.sport && !prev.state &&
        (prev.divisions || []).length === 0 &&
        (prev.positions || []).length === 0 &&
        !prev.startDate && !prev.endDate;

      if (!untouched) return prev;

      return {
        ...prev,
        sport: demoProfile?.sport_id ? String(demoProfile.sport_id) : "",
        state: demoProfile?.state ? String(demoProfile.state) : "",
        divisions: demoProfile?.division ? [String(demoProfile.division)] : [],
        positions: Array.isArray(demoProfile?.position_ids)
          ? demoProfile.position_ids.map((x) => String(x)).filter(Boolean)
          : []
      };
    });
  }, [isDemo, demoLoaded, demoProfile]);

  const seasonYear = season.seasonYear;

  // Normalize filters for hook inputs
  const hookSportId = filters.sport ? String(filters.sport) : null;
  const hookState = pickStateValue(filters.state) || null;
  const hookDivision = (filters.divisions || [])[0] || null; // hook supports single division today
  const hookPositionIds = Array.isArray(filters.positions) ? filters.positions : [];

  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: hookSportId,
    state: hookState,
    division: hookDivision,
    positionIds: hookPositionIds,
    limit: 500,
    enabled: true
  });

  const rows = Array.isArray(publicQuery.data) ? publicQuery.data : [];

  // Client-side date filtering (applies consistently across Base44 filter variance)
  const filteredRows = useMemo(() => {
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";
    if (!start && !end) return rows;

    return rows.filter((r) => withinDateRange(r?.start_date, start, end));
  }, [rows, filters.startDate, filters.endDate]);

  // Demo favorites + registered
  const [demoFavs, setDemoFavs] = useState(() => getDemoFavorites(demoProfileId, seasonYear));
  useEffect(() => {
    if (!isDemo) return;
    setDemoFavs(getDemoFavorites(demoProfileId, seasonYear));
  }, [isDemo, demoProfileId, seasonYear]);

  const onToggleFavorite = async (campId) => {
    const cid = String(campId);

    // Paid: gate writes (must be paid+profile)
    if (!isDemo) {
      return writeGate.write({
        paid: async () => {
          // upsert intent
          // if no athlete profile, gate should redirect, but double safety:
          const aId = normId(athleteProfile);
          if (!aId) return;

          const existing = await base44.entities.CampIntent.filter({
            athlete_id: aId,
            camp_id: cid
          });

          const row = Array.isArray(existing) ? existing[0] : null;

          if (row) {
            // delete or flip status - keep simple: delete means "unfavorite"
            await base44.entities.CampIntent.delete?.(row.id ?? row._id ?? row.uuid);
          } else {
            await base44.entities.CampIntent.create({
              athlete_id: aId,
              camp_id: cid,
              status: "favorite"
            });
          }
        },
        demo: async () => {},
        next: createPageUrl("Discover")
      });
    }

    // Demo: client-only favorites
    const next = toggleDemoFavorite(demoProfileId, cid, seasonYear);
    setDemoFavs(next);
  };

  const onToggleRegistered = (campId) => {
    if (!isDemo) {
      // Registered is a paid-only write in your model; force upgrade/profile if needed
      return writeGate.requirePaid({ next: createPageUrl("Discover"), source: "discover_register" });
    }
    toggleDemoRegistered(demoProfileId, String(campId));
    // no need to re-render everything; UI computes via isDemoRegistered below
  };

  // Render helpers
  const isFav = (campId) => {
    if (!isDemo) return false; // Paid favorites visual comes from intent model later (MyCamps)
    return demoFavs.includes(String(campId)) || isDemoFavorite(demoProfileId, campId, seasonYear);
  };

  const isReg = (campId) => {
    if (!isDemo) return false;
    return isDemoRegistered(demoProfileId, campId);
  };

  useEffect(() => {
    const key = "evt_discover_viewed_v1";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "discover_viewed",
      mode: isDemo ? "demo" : "paid",
      season_year: seasonYear
    });
  }, [isDemo, seasonYear]);

  const filterLabel = useMemo(() => {
    const count =
      (filters.sport ? 1 : 0) +
      (filters.state ? 1 : 0) +
      ((filters.divisions || []).length ? 1 : 0) +
      ((filters.positions || []).length ? 1 : 0) +
      (filters.startDate ? 1 : 0) +
      (filters.endDate ? 1 : 0);

    return count > 0 ? `Filters (${count})` : "Filters";
  }, [filters]);

  return (
    <div className="min-h-screen bg-surface pb-20">
      <div className="max-w-md mx-auto px-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold text-deep-navy">Discover</div>
            <div className="text-xs text-slate-500">
              {isDemo ? "Demo mode" : "Paid mode"} · Season {seasonYear}
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setSheetOpen(true)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            {filterLabel}
          </Button>
        </div>

        <Card className="mt-4 p-3 border-slate-200 bg-white">
          <div className="text-sm text-slate-600">
            {publicQuery.isLoading
              ? "Loading camps…"
              : filteredRows.length === 0
                ? "No camps match your filters."
                : `${filteredRows.length} camps found`}
          </div>
        </Card>

        <div className="mt-4 space-y-3">
          {filteredRows.map((r) => {
            const campId = String(r.camp_id);
            const school = {
              school_name: r.school_name,
              school_division: r.school_division
            };
            const sport = { sport_name: r.sport_name };
            const camp = {
              id: campId,
              camp_name: r.camp_name,
              start_date: r.start_date,
              end_date: r.end_date,
              price: r.price,
              city: r.city,
              state: r.state,
              link_url: r.link_url
            };

            // positions not currently joined for public query output, but CampCard supports empty array
            const positionsForCard = [];

            return (
              <CampCard
                key={campId}
                camp={camp}
                school={school}
                sport={sport}
                positions={positionsForCard}
                isFavorite={isFav(campId)}
                isRegistered={isReg(campId)}
                onFavoriteToggle={() => onToggleFavorite(campId)}
                onClick={() => {
                  trackEvent({
                    event_name: "discover_camp_open",
                    camp_id: campId,
                    mode: isDemo ? "demo" : "paid"
                  });
                  // For now: open external link if present; otherwise do nothing
                  if (camp.link_url) window.open(camp.link_url, "_blank", "noopener,noreferrer");
                }}
                mode={isDemo ? "demo" : "paid"}
                disabledFavorite={false}
              />
            );
          })}
        </div>
      </div>

      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
          setSheetOpen(false);
        }}
        onApply={() => {
          setSheetOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
