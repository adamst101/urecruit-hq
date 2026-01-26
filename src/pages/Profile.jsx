// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

// ---- routes (no createPageUrl dependency) ----
const ROUTES = {
  Home: "/Home",
  Workspace: "/Workspace",
  Discover: "/Discover",
};

// Positions list (as requested)
const POSITION_OPTIONS = ["QB", "WR", "TE", "OL", "DL", "DB", "LB", "K", "P", "LS"];

// Height options
const FEET_OPTIONS = [4, 5, 6, 7];
const INCH_OPTIONS = Array.from({ length: 12 }, (_, i) => i);

// Weight options (pick list)
const WEIGHT_OPTIONS = Array.from({ length: 61 }, (_, i) => 100 + i * 5); // 100..400 step 5

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function parseNameParts(athleteProfile) {
  const first = safeStr(athleteProfile?.first_name || athleteProfile?.firstName).trim();
  const last = safeStr(athleteProfile?.last_name || athleteProfile?.lastName).trim();
  if (first || last) return { first, last };

  const full = safeStr(
    athleteProfile?.athlete_name || athleteProfile?.athleteName || athleteProfile?.name
  ).trim();
  if (!full) return { first: "", last: "" };

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseHeightParts(athleteProfile) {
  const ft =
    athleteProfile?.height_ft ??
    athleteProfile?.heightFeet ??
    athleteProfile?.height_feet ??
    null;
  const inch =
    athleteProfile?.height_in ??
    athleteProfile?.heightInches ??
    athleteProfile?.height_inches ??
    null;

  const ftNum = Number(ft);
  const inNum = Number(inch);
  if (Number.isFinite(ftNum) && Number.isFinite(inNum)) {
    return { heightFt: ftNum, heightIn: inNum };
  }

  const raw = safeStr(athleteProfile?.height).trim();
  if (!raw) return { heightFt: null, heightIn: null };

  const m = raw.match(/(\d)\s*['-]\s*(\d{1,2})/);
  if (!m) return { heightFt: null, heightIn: null };

  const a = Number(m[1]);
  const b = Number(m[2]);
  return {
    heightFt: Number.isFinite(a) ? a : null,
    heightIn: Number.isFinite(b) ? b : null,
  };
}

function parseWeight(athleteProfile) {
  const w = athleteProfile?.weight_lbs ?? athleteProfile?.weightLbs ?? athleteProfile?.weight ?? null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}

function parseGradYear(athleteProfile) {
  const y = athleteProfile?.grad_year ?? athleteProfile?.gradYear ?? null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function parsePrimaryPosition(athleteProfile) {
  const p = safeStr(athleteProfile?.primary_position || athleteProfile?.primaryPosition)
    .trim()
    .toUpperCase();
  return POSITION_OPTIONS.includes(p) ? p : "";
}

function getAthleteEntity() {
  return (
    base44?.entities?.AthleteProfile ||
    base44?.entities?.Athlete ||
    base44?.entities?.AthleteIdentity ||
    null
  );
}

async function upsertAthleteProfile({ athleteId, payloadFull, payloadFallback }) {
  const Entity = getAthleteEntity();
  if (!Entity) throw new Error("No athlete entity found (expected AthleteProfile/Athlete/AthleteIdentity).");

  if (athleteId) {
    try {
      await Entity.update(athleteId, payloadFull);
      return { mode: "updated_full" };
    } catch (e1) {
      await Entity.update(athleteId, payloadFallback);
      return { mode: "updated_fallback", error: e1 };
    }
  }

  try {
    await Entity.create(payloadFull);
    return { mode: "created_full" };
  } catch (e1) {
    await Entity.create(payloadFallback);
    return { mode: "created_fallback", error: e1 };
  }
}

export default function Profile() {
  const nav = useNavigate();
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);
  const accountId = season?.accountId || null;

  // Grad years: current year → +10
  const GRAD_YEAR_OPTIONS = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => y + i);
  }, []);

  // ✅ Keep state as STRINGS for inputs/selects
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState(""); // string
  const [primaryPosition, setPrimaryPosition] = useState("");
  const [heightFt, setHeightFt] = useState(""); // string
  const [heightIn, setHeightIn] = useState(""); // string
  const [weight, setWeight] = useState(""); // string

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loading = !!season?.isLoading || !!identityLoading;

  // ✅ Auth guard: if they hit /Profile while not signed in
  useEffect(() => {
    if (season?.isLoading) return;
    if (!season?.accountId) {
      nav(`${ROUTES.Home}?signin=1&next=${encodeURIComponent("/Profile")}`, { replace: true });
    }
  }, [season?.isLoading, season?.accountId, nav]);

  // Prefill when profile loads/changes
  useEffect(() => {
    if (!athleteProfile) return;

    const n = parseNameParts(athleteProfile);
    const h = parseHeightParts(athleteProfile);
    const g = parseGradYear(athleteProfile);
    const w = parseWeight(athleteProfile);

    setFirstName(n.first || "");
    setLastName(n.last || "");

    setGradYear(g != null ? String(g) : "");
    setPrimaryPosition(parsePrimaryPosition(athleteProfile) || "");

    setHeightFt(h.heightFt != null ? String(h.heightFt) : "");
    setHeightIn(h.heightIn != null ? String(h.heightIn) : "");

    setWeight(w != null ? String(w) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const fullName = useMemo(() => {
    return `${safeStr(firstName).trim()} ${safeStr(lastName).trim()}`.trim();
  }, [firstName, lastName]);

  const heightString = useMemo(() => {
    const f = Number(heightFt);
    const i = Number(heightIn);
    if (!Number.isFinite(f) || !Number.isFinite(i)) return "";
    return `${f}'${i}"`;
  }, [heightFt, heightIn]);

  async function handleSave() {
    setErr("");

    if (!safeStr(firstName).trim()) return setErr("First name is required.");
    if (!safeStr(lastName).trim()) return setErr("Last name is required.");

    const gradNum = Number(gradYear);
    if (!Number.isFinite(gradNum)) return setErr("Grad year is required.");
    if (!primaryPosition) return setErr("Primary position is required.");

    const anyHeight = safeStr(heightFt).trim() || safeStr(heightIn).trim();
    let ftNum = null;
    let inNum = null;

    if (anyHeight) {
      ftNum = Number(heightFt);
      inNum = Number(heightIn);
      if (!Number.isFinite(ftNum) || !Number.isFinite(inNum)) return setErr("Height must include feet and inches.");
      if (!FEET_OPTIONS.includes(ftNum)) return setErr("Height (feet) is out of range.");
      if (!(inNum >= 0 && inNum <= 11)) return setErr("Height (inches) must be 0–11.");
    }

    const wNum = safeStr(weight).trim() ? Number(weight) : null;
    if (wNum != null && !Number.isFinite(wNum)) return setErr("Weight is invalid.");

    setSaving(true);

    try {
      // Full payload (new fields + legacy)
      const payloadFull = {
        account_id: accountId || undefined,

        first_name: safeStr(firstName).trim(),
        last_name: safeStr(lastName).trim(),
        grad_year: gradNum,
        primary_position: primaryPosition,

        height_ft: anyHeight ? ftNum : null,
        height_in: anyHeight ? inNum : null,
        weight_lbs: wNum,

        // legacy
        athlete_name: fullName,
        height: anyHeight ? heightString : null,
        weight: wNum,
      };

      // Fallback (legacy-only)
      const payloadFallback = {
        account_id: accountId || undefined,
        athlete_name: fullName,
        grad_year: gradNum,
        primary_position: primaryPosition,
        height: anyHeight ? heightString : null,
        weight: wNum,
      };

      await upsertAthleteProfile({ athleteId, payloadFull, payloadFallback });

      nav(ROUTES.Workspace);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <User className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <div className="text-lg font-semibold text-deep-navy">Athlete Profile</div>
              <div className="text-sm text-slate-600 mt-1">
                This profile powers paid features (My Camps, Calendar overlays, and planning tools).
              </div>
            </div>
          </div>

          {err ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {err}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {/* First/Last */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">First name</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Last name</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                />
              </div>
            </div>

            {/* Grad year / Position */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Grad year</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                >
                  <option value="">Select…</option>
                  {GRAD_YEAR_OPTIONS.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary position</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={primaryPosition}
                  onChange={(e) => setPrimaryPosition(e.target.value)}
                >
                  <option value="">Select…</option>
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Height */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Height</label>
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                >
                  <option value="">Feet</option>
                  {FEET_OPTIONS.map((f) => (
                    <option key={f} value={String(f)}>
                      {f} ft
                    </option>
                  ))}
                </select>

                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                >
                  <option value="">Inches</option>
                  {INCH_OPTIONS.map((i) => (
                    <option key={i} value={String(i)}>
                      {i} in
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {heightString ? `Selected: ${heightString}` : "Optional"}
              </div>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Weight</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              >
                <option value="">Select…</option>
                {WEIGHT_OPTIONS.map((w) => (
                  <option key={w} value={String(w)}>
                    {w} lbs
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">Optional</div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <Button className="btn-brand sm:flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>

            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={() => nav(ROUTES.Workspace)}
              disabled={saving}
            >
              Back to Workspace
            </Button>
          </div>
        </Card>

        <div className="mt-3 text-center">
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700 underline"
            onClick={() => nav(ROUTES.Discover)}
          >
            Go to Discover
          </button>
        </div>
      </div>
    </div>
  );
}
