// src/pages/Discover.jsx
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, ArrowRight } from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import CampCard from "../components/camps/CampCard";
import FilterSheet from "../components/filters/FilterSheet";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function parseUrlMode(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const m = sp.get("mode");
    return m ? String(m).toLowerCase() : null;
  } catch {
    return null;
  }
}

const yStart = (y) => `${Number(y)}-01-01`;
const yNext = (y) => `${Number(y) + 1}-01-01`;

function inSeasonYear(dateStr, year) {
  if (!dateStr || !year) return true;
  const d = String(dateStr).slice(0, 10);
  const start = yStart(year);
  const next = yNext(year);
  return d >= start && d < next;
}

async function upsertFavoriteIntent({ athleteId, campId, nextFav }) {
  // Best-effort upsert; swallow errors so UI doesn’t hard-fail.
  try {
    const rows = await base44.entities.CampIntent.filter({
      athlete_id: athleteId,
      camp_id: campId
    });

    const existing = Array.isArray(rows) && rows[0] ? rows[0] : null;

    if (!existing && nextFav) {
      await base44.entities.CampIntent.create({
        athlete_id: athleteId,
        camp_id: campId,
        status: "favorite"
      });
      return;
    }

    if (existing) {
      const id = normId(existing) || existing?.id;
      if (!id) return;

      await base44.entities.CampIntent.update(id, {
        status: nextFav ? "favorite" : null
      });
    }
  } catch {
    // ignore
  }
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const urlMode = useMemo(() => parseUrlMode(loc?.search), [loc?.search]);
  const effectiveMode = urlMode === "demo" ? "demo" : season.mode;

  const isPaid = effectiveMode === "paid";
  const seasonYear = season.seasonYear;

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  // Filters (match FilterSheet contract)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Demo favorites (client only)
  const demoProfileId = "default";
  const demoFavs = useMemo(() => getDemoFavorites(demoProfileId, seasonYear), [demoProfileId, seasonYear]);

  // Paid query (includes intent fields)
  const paidQuery = useCampSummariesClient({
    athleteId: isPaid ? athleteId : null,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId
  });

  // Demo/public query
  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: "", // FilterSheet supports multi-division; apply client-side below
    positionIds: asArray(filters.positions),
    enabled: !isPaid
  });

  const loading = season.isLoading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);
  const rowsRaw = isPaid ? paidQuery.data : demoQuery.data;

  // Client-side filter to keep behavior consistent across both query types
  const rows = useMemo(() => {
    const list = asArray(rowsRaw);

    const selectedDivs = asArray(filters.divisions).filter(Boolean);
    const selectedPos = asArray(filters.positions).map(String).filter(Boolean);
    const startDate = filters.startDate ? String(filters.startDate) : "";
    const endDate = filters.endDate ? String(filters.endDate) : "";

    return list.filter((r) => {
      // enforce season year (paid query doesn’t guarantee year gating)
      if (!inSeasonYear(r?.start_date, seasonYear)) return false;

      // sport handled by query, but keep safe
      if (filters.sport && String(r?.sport_id || "") !== String(filters.sport)) return false;

      // state
      if (filters.state && String(r?.state || "") !== String(filters.state)) return false;

      // divisions (paid has school_division)
      if (selectedDivs.length > 0) {
        const div = r?.school_division || r?.division || null;
        if (!div || !selectedDivs.includes(div)) return false;
      }

      // positions
      if (selectedPos.length > 0) {
        const rPos = asArray(r?.position_ids).map(String).filter(Boolean);
        if (!selectedPos.some((p) => rPos.includes(p))) return false;
      }

      // date range
      if (startDate || endDate) {
        const d = r?.start_date ? String(r.start_date).slice(0, 10) : "";
        if (!d) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }

      return true;
    });
  }, [rowsRaw, filters, seasonYear]);

  // Best-practice: keep sports/positions optional unless you already load them elsewhere
  const sports = [];
  const positions = [];

  const [optimisticFav, setOptimisticFav] = useState(() => new Set());

  const isFavorite = (r) => {
    const campId = String(r?.camp_id || "");
    if (!campId) return false;

    if (!isPaid) {
      return demoFavs.includes(campId);
    }

    // Paid: use intent_status, plus optimistic set
    const serverFav = String(r?.intent_status || "").toLowerCase() === "favorite";
    const local = optimisticFav.has(campId);
    // optimisticFav means "toggled relative to server"—we store direct value by flipping set
    return local ? !serverFav : serverFav;
  };

  const toggleFavorite = async (r) => {
    const campId = String(r?.camp_id || "");
    if (!campId) return;

    if (!isPaid) {
      toggleDemoFavorite(demoProfileId, campId, seasonYear);
      // force re-render by touching state
      setOptimisticFav((s) => new Set(s));
      return;
    }

    if (!athleteId) return;

    // optimistic toggle marker
    setOptimisticFav((prev) => {
      const next = new Set(prev);
      if (next.has(campId)) next.delete(campId);
      else next.add(campId);
      return next;
    });

    const nextFav = !isFavorite(r);

    await upsertFavoriteIntent({ athleteId, campId, nextFav });

    // refresh server data
    try {
      paidQuery.refetch?.();
    } catch {}
  };

  if (loading) return null;

  // Paid mode but missing profile: guide user (no loops)
  if (isPaid && !athleteId) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-24">
        <div className="max-w-md mx-auto space-y-4">
          <Card className="p-5 border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-deep-navy">Discover</div>
                <div className="text-sm text-slate-600 mt-1">
                  Complete your athlete profile to unlock favorites and your season workspace.
                </div>
              </div>
              <Badge className="bg-deep-navy text-white">Paid</Badge>
            </div>

            <Button
              className="w-full mt-4"
              onClick={() => nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`)}
            >
              Go to Profile
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-deep-navy">Discover</div>
            <div className="text-sm text-slate-600">{seasonYear ? `Season ${seasonYear}` : "Season"}</div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">{isPaid ? "Paid" : "Demo"}</Badge>
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {/* List */}
        {rows.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">No camps match your filters.</div>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() =>
                setFilters({
                  sport: "",
                  state: "",
                  divisions: [],
                  positions: [],
                  startDate: "",
                  endDate: ""
                })
              }
            >
              Clear filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const camp = {
                camp_name: r?.camp_name,
                start_date: r?.start_date,
                end_date: r?.end_date,
                price: r?.price,
                city: r?.city,
                state: r?.state
              };

              const school = {
                school_name: r?.school_name,
                division: r?.school_division
              };

              const sport = {
                name: r?.sport_name
              };

              // CampCard expects positions objects; we can derive from codes if present
              const posCodes = asArray(r?.position_codes);
              const posObjs = posCodes.map((c, i) => ({ id: `${i}`, position_code: c }));

              return (
                <CampCard
                  key={String(r?.camp_id || `${r?.school_name}-${r?.camp_name}`)}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={posObjs}
                  isFavorite={isFavorite(r)}
                  isRegistered={String(r?.intent_status || "").toLowerCase() === "registered"}
                  onFavoriteToggle={() => toggleFavorite(r)}
                  mode={isPaid ? "paid" : "demo"}
                  onClick={() => {
                    // If you later wire CampDetail, route here
                    // nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(r?.camp_id))}`);
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Filters */}
        <FilterSheet
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
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
          }}
          onApply={() => setFiltersOpen(false)}
        />
      </div>
    </div>
  );
}
