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

// Requested football position labels (for fallback UI)
const POSITION_LABELS = ["QB", "WR", "TE", "OL", "DL", "DB", "LB", "K", "P", "LS"];

// Weight options (pick list)
const WEIGHT_OPTIONS = Array.from({ length: 61 }, (_, i) => 100 + i * 5); // 100..400 step 5

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function parseNameParts(athleteProfile) {
  const full = safeStr(athleteProfile?.athlete_name).trim();
  if (!full) return { first: "", last: "" };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseGradYear(athleteProfile) {
  const n = Number(athleteProfile?.grad_year);
  return Number.isFinite(n) ? n : null;
}

function parseWeight(athleteProfile) {
  // If you later add weight_lbs to schema, this will prefill
  const n = Number(athleteProfile?.weight_lbs ?? athleteProfile?.weight);
  return Number.isFinite(n) ? n : null;
}

function parseHeightParts(athleteProfile) {
  // If you later add height_ft/height_in to schema, this will prefill
  const ft = Number(athleteProfile?.height_ft);
  const inch = Number(athleteProfile?.height_in);
  if (Number.isFinite(ft) && Number.isFinite(inch)) return { ft, inch };

  // Optional: parse legacy text like 6'2"
  const raw = safeStr(athleteProfile?.height).trim();
  const m = raw.match(/(\d)\s*['-]\s*(\d{1,2})/);
  if (!m) return { ft: null, inch: null };
  const a = Number(m[1]);
  const b = Number(m[2]);
  return { ft: Number.isFinite(a) ? a : null, inch: Number.isFinite(b) ? b : null };
}

/**
 * Try to resolve the Sport ID for Football when athleteProfile doesn't have sport_id yet.
 * - Looks for entities.Sport or entities.Sports
 * - Picks the first sport where name contains "football"
 */
async function resolveFootballSportId() {
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  if (!SportEntity?.filter) return null;

  try {
    const rows = asArray(await SportEntity.filter({}));
    const football = rows.find((r) => safeStr(r?.name).toLowerCase().includes("football"));
    return football?.id ? String(football.id) : null;
  } catch {
    return null;
  }
}

/**
 * Load Position options as [{ id, label }]
 * - Prefer entities.Position or entities.Positions
 * - Filter by sport_id if supported
 * - Label picks from common fields: code/abbrev/name/label
 */
async function loadPositionOptions(sportId) {
  const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;
  if (!PositionEntity?.filter) return null;

  try {
    let rows = [];
    try {
      // Some Base44 schemas support filtering
      rows = asArray(await PositionEntity.filter(sportId ? { sport_id: sportId } : {}));
    } catch {
      rows = asArray(await PositionEntity.filter({}));
    }

    const opts = rows
      .map((r) => {
        const id = r?.id ? String(r.id) : null;
        const label =
          safeStr(r?.code || r?.abbrev || r?.short_name || r?.name || r?.label).trim() || "";
        return id && label ? { id, label: label.toUpperCase() } : null;
      })
      .filter(Boolean);

    return opts.length ? opts : null;
  } catch {
    return null;
  }
}

async function upsertAthleteProfile({ athleteId, payloadFull, payloadFallback }) {
  const Entity = base44?.entities?.AthleteProfile || null;
  if (!Entity) throw new Error("Missing base44.entities.AthleteProfile");

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
  const accountId = season?.accountId ? String(season.accountId) : "";

  // Grad years: current year → +10
  const GRAD_YEAR_OPTIONS = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => y + i);
  }, []);

  // ---- Form state (strings for inputs/selects) ----
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState(""); // string
  const [sportId, setSportId] = useState(""); // required in schema
  const [primaryPositionId, setPrimaryPositionId] = useState(""); // required in schema

  // Requested UI fields (schema not yet has these)
  const [heightFt, setHeightFt] = useState(""); // string (input box)
  const [heightIn, setHeightIn] = useState(""); // string (input box)
  const [weight, setWeight] = useState(""); // string (select)

  const [positionOptions, setPositionOptions] = useState(null); // [{id,label}]
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loading = !!season?.isLoading || !!identityLoading;

  // Auth guard
  useEffect(() => {
    if (season?.isLoading) return;
    if (!season?.accountId) {
      nav(`${ROUTES.Home}?signin=1&next=${encodeURIComponent("/Profile")}`, { replace: true });
    }
  }, [season?.isLoading, season?.accountId, nav]);

  // Prefill from existing profile
  useEffect(() => {
    if (!athleteProfile) return;

    const n = parseNameParts(athleteProfile);
    const g = parseGradYear(athleteProfile);
    const h = parseHeightParts(athleteProfile);
    const w = parseWeight(athleteProfile);

    setFirstName(n.first || "");
    setLastName(n.last || "");
    setGradYear(g != null ? String(g) : "");

    setSportId(athleteProfile?.sport_id ? String(athleteProfile.sport_id) : "");
    setPrimaryPositionId(
      athleteProfile?.primary_position_id ? String(athleteProfile.primary_position_id) : ""
    );

    setHeightFt(h.ft != null ? String(h.ft) : "");
    setHeightIn(h.inch != null ? String(h.inch) : "");
    setWeight(w != null ? String(w) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  // Ensure sport_id exists (Football default) + load positions
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Resolve sportId if empty
      let effectiveSportId = sportId;
      if (!effectiveSportId) {
        const fb = await resolveFootballSportId();
        if (!cancelled && fb) {
          effectiveSportId = fb;
          setSportId(fb);
        }
      }

      // Load positions for this sport
      const opts = await loadPositionOptions(effectiveSportId || null);
      if (cancelled) return;

      if (opts && opts.length) {
        setPositionOptions(opts);

        // If current primary_position_id isn't in options, clear it
        if (primaryPositionId) {
          const ok = opts.some((o) => o.id === primaryPositionId);
          if (!ok) setPrimaryPositionId("");
        }
      } else {
        setPositionOptions(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sportId, primaryPositionId]);

  const fullName = useMemo(() => {
    return `${safeStr(firstName).trim()} ${safeStr(lastName).trim()}`.trim();
  }, [firstName, lastName]);

  async function handleSave() {
    setErr("");

    // Required schema fields
    if (!accountId) return setErr("You must be signed in to save a profile.");
    if (!safeStr(firstName).trim()) return setErr("First name is required.");
    if (!safeStr(lastName).trim()) return setErr("Last name is required.");
    if (!fullName) return setErr("Athlete name is required.");

    const gradNum = Number(gradYear);
    if (!Number.isFinite(gradNum)) return setErr("Grad year is required.");

    if (!sportId) return setErr("Sport is required, but Football sport_id could not be resolved.");
    if (!primaryPositionId) return setErr("Primary position is required.");

    // Height inputs: optional, but if either is filled require both valid
    const anyHeight = safeStr(heightFt).trim() || safeStr(heightIn).trim();
    let ftNum = null;
    let inNum = null;

    if (anyHeight) {
      ftNum = Number(heightFt);
      inNum = Number(heightIn);
      if (!Number.isFinite(ftNum) || !Number.isFinite(inNum)) return setErr("Height must include feet and inches.");
      if (!(ftNum >= 4 && ftNum <= 7)) return setErr("Height (feet) must be 4–7.");
      if (!(inNum >= 0 && inNum <= 11)) return setErr("Height (inches) must be 0–11.");
    }

    // Weight: optional
    const wNum = safeStr(weight).trim() ? Number(weight) : null;
    if (wNum != null && !Number.isFinite(wNum)) return setErr("Weight is invalid.");

    setSaving(true);

    try {
      // Full payload: schema fields + attempted new fields (if you add them later)
      const payloadFull = {
        account_id: accountId,
        athlete_name: fullName,
        sport_id: sportId,
        grad_year: gradNum,
        primary_position_id: primaryPositionId,

        // Optional existing schema fields (safe)
        active: true,

        // 🔜 If you add these fields to schema later, they will start saving immediately:
        height_ft: anyHeight ? ftNum : null,
        height_in: anyHeight ? inNum : null,
        weight_lbs: wNum,
      };

      // Fallback payload: ONLY what your schema definitely accepts
      const payloadFallback = {
        account_id: accountId,
        athlete_name: fullName,
        sport_id: sportId,
        grad_year: gradNum,
        primary_position_id: primaryPositionId,
        active: true,
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

                {/* If we can load Position entities, use them */}
                {positionOptions && positionOptions.length ? (
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                    value={primaryPositionId}
                    onChange={(e) => setPrimaryPositionId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {positionOptions
                      .filter((o) => POSITION_LABELS.includes(o.label)) // football positions only
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                ) : (
                  // Fallback: shows labels but cannot guarantee they match your Position IDs
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                    value={primaryPositionId}
                    onChange={(e) => setPrimaryPositionId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {POSITION_LABELS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}

                {!positionOptions ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Note: Position IDs couldn’t be loaded from Base44. If saves fail, we need a Position entity (QB/WR/etc)
                    and must store its <b>id</b> in <code>primary_position_id</code>.
                  </div>
                ) : null}
              </div>
            </div>

            {/* Height: boxes (feet + inches) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Height</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Feet"
                  inputMode="numeric"
                />
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Inches"
                  inputMode="numeric"
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">Optional (will only persist after you add fields to schema)</div>
            </div>

            {/* Weight: pick list */}
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
              <div className="mt-1 text-xs text-slate-500">Optional (will only persist after you add fields to schema)</div>
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
