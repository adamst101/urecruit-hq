// src/pages/DemoSetup.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, SlidersHorizontal, Loader2 } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

import { base44 } from "../api/base44Client";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

/**
 * DemoSetup
 * Demo-only: allows users to personalize the demo via localStorage DemoProfile.
 * No backend writes.
 */
export default function DemoSetup() {
  const navigate = useNavigate();

  // ✅ Standard hook usage
  const { isLoading: accessLoading, mode, demoYear } = useSeasonAccess();

  const { loaded, demoProfile, updateDemoProfile, clearDemoProfile } =
    useDemoProfile();

  const [loadingLists, setLoadingLists] = useState(false);
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  const [err, setErr] = useState(null);

  // ✅ Redirect paid users with effect (never call navigate during render)
  useEffect(() => {
    if (accessLoading) return;
    if (mode === "paid") {
      navigate(createPageUrl("Profile"), { replace: true });
    }
  }, [accessLoading, mode, navigate]);

  // ✅ Lazy-load lists once user lands
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoadingLists(true);
      setErr(null);

      try {
        const [sportsList, posList] = await Promise.all([
          base44.entities.Sport.list(),
          base44.entities.Position.list(),
        ]);

        if (!mounted) return;
        setSports(Array.isArray(sportsList) ? sportsList : []);
        setPositions(Array.isArray(posList) ? posList : []);
      } catch (e) {
        if (!mounted) return;
        setErr(String(e?.message || e));
      } finally {
        if (!mounted) return;
        setLoadingLists(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const divisions = useMemo(
    () => ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"],
    []
  );

  const states = useMemo(
    () => [
      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
      "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
      "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
    ],
    []
  );

  const gradYears = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y + i);
  }, []);

  const selectedSportId = demoProfile?.sport_id || "none";
  const selectedState = demoProfile?.state || "none";
  const selectedDivision = demoProfile?.division || "none";
  const selectedGradYear = demoProfile?.grad_year
    ? String(demoProfile.grad_year)
    : "none";

  const selectedPositions = Array.isArray(demoProfile?.position_ids)
    ? demoProfile.position_ids
    : [];

  const togglePosition = (positionId) => {
    const exists = selectedPositions.includes(positionId);
    const next = exists
      ? selectedPositions.filter((id) => id !== positionId)
      : [...selectedPositions, positionId];
    updateDemoProfile({ position_ids: next });
  };

  const handleContinue = () => {
    navigate(createPageUrl("Discover"));
  };

  // ✅ Unified loading guard
  if (accessLoading || !loaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Paid users render nothing while redirecting
  if (mode === "paid") return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          onClick={() => navigate(createPageUrl("Discover"))}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          type="button"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Demo
        </button>

        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-deep-navy">Personalize Demo</h1>
            <Badge className="bg-slate-900 text-white">Demo: {demoYear}</Badge>
          </div>
          <p className="text-slate-600 mt-2">
            These settings are saved locally on this device and used to filter demo
            camps. No account required.
          </p>
        </div>

        {err && (
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load lists</div>
            <div className="text-xs mt-2 break-words">{err}</div>
          </Card>
        )}

        <Card className="p-4 space-y-4">
          {/* Sport */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Sport</div>
            <Select
              value={selectedSportId}
              onValueChange={(v) =>
                updateDemoProfile({ sport_id: v === "none" ? null : v })
              }
              disabled={loadingLists}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any sport</SelectItem>
                {sports.map((s) => {
                  const id = String(s.id || s._id || s.uuid || "");
                  if (!id) return null;
                  return (
                    <SelectItem key={id} value={id}>
                      {s.sport_name || s.name || s.title || "Sport"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* State */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">State</div>
            <Select
              value={selectedState}
              onValueChange={(v) => updateDemoProfile({ state: v === "none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any state</SelectItem>
                {states.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Division */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Division</div>
            <Select
              value={selectedDivision}
              onValueChange={(v) =>
                updateDemoProfile({ division: v === "none" ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any division</SelectItem>
                {divisions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Grad Year */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Grad Year</div>
            <Select
              value={selectedGradYear}
              onValueChange={(v) =>
                updateDemoProfile({ grad_year: v === "none" ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select grad year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any year</SelectItem>
                {gradYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Positions */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Positions</div>

            {loadingLists ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading positions…
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {positions.map((p) => {
                  const id = String(p.id || p._id || p.uuid || "");
                  if (!id) return null;

                  const active = selectedPositions.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => togglePosition(id)}
                      className={[
                        "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                        active
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                      ].join(" ")}
                    >
                      {p.position_code || p.position_name || p.name || "POS"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={clearDemoProfile}>
            Reset
          </Button>
          <Button className="flex-1" onClick={handleContinue}>
            Continue to Demo
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        <div className="text-xs text-slate-500 text-center pt-2">
          Next: When users sign up, offer "Import demo settings" into the real profile.
        </div>
      </div>
    </div>
  );
}
