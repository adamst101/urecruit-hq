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
  Workspace: "/Workspace",
  Discover: "/Discover",
  Home: "/Home",
};

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

  const full = safeStr(athleteProfile?.athlete_name || athleteProfile?.athleteName || athleteProfile?.name).trim();
  if (!full) return { first: "", last: "" };

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseGradYear(athleteProfile) {
  const y = athleteProfile?.grad_year ?? athleteProfile?.gradYear ?? null;
  const n = Number(y);
  return Number.isFinite(n) ? n : "";
}

function parseHeightParts(athleteProfile) {
  const ft = athleteProfile?.height_ft ?? athleteProfile?.heightFeet ?? athleteProfile?.height_feet ?? null;
  const inch = athleteProfile?.height_in ?? athleteProfile?.heightInches ?? athleteProfile?.height_inches ?? null;

  const ftNum = Number(ft);
  const inNum = Number(inch);
  if (Number.isFinite(ftNum) && Number.isFinite(inNum)) {
    return { heightFt: ftNum, heightIn: inNum };
  }

  // Legacy read-only fallback (do NOT write legacy fields)
  const raw = safeStr(athleteProfile?.height).trim();
  if (!raw) return { heightFt: "", heightIn: "" };

  const m = raw.match(/(\d)\s*['-]\s*(\d{1,2})/);
  if (!m) return { heightFt: "", heightIn: "" };

  const a = Number(m[1]);
  const b = Number(m[2]);
  return { heightFt: Number.isFinite(a) ? a : "", heightIn: Number.isFinite(b) ? b : "" };
}

function parseWeight(athleteProfile) {
  const w = athleteProfile?.weight_lbs ?? athleteProfile?.weightLbs ?? athleteProfile?.weight ?? null;
  const n = Number(w);
  return Number.isFinite(n) ? n : "";
}

async function resolveFootballSportId() {
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  if (!SportEntity?.filter) return null;

  try {
    const rows = await SportEntity.filter({});
    const arr = Array.isArray(rows) ? rows : [];
    const football = arr.find((r) => {
      const n = String(r?.name || r?.sport_name || r?.sportName || "").toLowerCase().trim();
      return n === "football" || n.includes("football");
    });
    return football?.id ? String(football.id) : null;
  } catch {
    return null;
  }
}

function getAthleteEntity() {
  return base44?.entities?.AthleteProfile || base44?.entities?.Athlete || base44?.entities?.AthleteIdentity || null;
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

function resolveAccountId({ season, athleteProfile }) {
  // Best-effort across likely shapes
  const candidates = [
    season?.accountId,
    season?.account_id,
    season?.account?.id,
    season?.account?.account_id,

    athleteProfile?.account_id,
    athleteProfile?.accountId,
    athleteProfile?.account?.id,
  ];

  for (const c of candidates) {
    const v = c == null ? "" : String(c).trim();
    if (v) return v;
  }
  return "";
}

export default function Profile() {
  const nav = useNavigate();
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);
  const accountId = useMemo(() => resolveAccountId({ season, athleteProfile }), [season, athleteProfile]);

  const GRAD_YEAR_OPTIONS = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => y + i);
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");

  const [footballSportId, setFootballSportId] = useState("");
  const [selectedSportId, setSelectedSportId] = useState("");
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  const [primaryPositionId, setPrimaryPositionId] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loading = !!season?.isLoading || !!identityLoading;

  useEffect(() => {
    if (!athleteProfile) return;

    const n = parseNameParts(athleteProfile);
    const h = parseHeightParts(athleteProfile);

    setFirstName(n.first || "");
    setLastName(n.last || "");
    setGradYear(parseGradYear(athleteProfile) || "");
    setHeightFt(h.heightFt === "" ? "" : String(h.heightFt));
    setHeightIn(h.heightIn === "" ? "" : String(h.heightIn));
    setWeight(parseWeight(athleteProfile) === "" ? "" : String(parseWeight(athleteProfile)));

    const existingSportId = athleteProfile?.sport_id ? String(athleteProfile.sport_id) : "";
    if (existingSportId) setSelectedSportId(existingSportId);

    const existingPosId = athleteProfile?.primary_position_id ? String(athleteProfile.primary_position_id) : "";
    if (existingPosId) setPrimaryPositionId(existingPosId);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  // Resolve Football sport_id and default selection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sid = await resolveFootballSportId();
      if (cancelled) return;
      setFootballSportId(sid || "");
      setSelectedSportId((prev) => prev || sid || "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load sports list
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
      if (!SportEntity?.filter) return;

      try {
        const rows = await SportEntity.filter({});
        if (cancelled) return;

        const arr = Array.isArray(rows) ? rows : [];
        const normalized = arr
          .map((r) => ({
            id: r?.id ? String(r.id) : "",
            name: String(r?.name || r?.sport_name || r?.sportName || "").trim(),
          }))
          .filter((r) => r.id && r.name);

        normalized.sort((a, b) => a.name.localeCompare(b.name));
        setSports(normalized);
      } catch {
        // no-op
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load positions for selected sport
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;
      if (!PositionEntity?.filter) {
        setPositions([]);
        return;
      }
      if (!selectedSportId) {
        setPositions([]);
        return;
      }

      try {
        const rows = await PositionEntity.filter({ sport_id: selectedSportId });
        if (cancelled) return;

        const arr = Array.isArray(rows) ? rows : [];
        const normalized = arr
          .map((r) => ({
            id: r?.id ? String(r.id) : "",
            code: String(r?.position_code || "").trim(),
            name: String(r?.position_name || "").trim(),
          }))
          .filter((p) => p.id);

        normalized.sort(
          (a, b) =>
            (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || "")
        );
        setPositions(normalized);
      } catch {
        setPositions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSportId]);

  const fullName = useMemo(
    () => `${safeStr(firstName).trim()} ${safeStr(lastName).trim()}`.trim(),
    [firstName, lastName]
  );

  const heightString = useMemo(() => {
    const f = Number(heightFt);
    const i = Number(heightIn);
    if (!Number.isFinite(f) || !Number.isFinite(i)) return "";
    return `${f}'${i}"`;
  }, [heightFt, heightIn]);

  async function handleSave() {
    setErr("");

    // Hard stop: schema requires account_id
    if (!accountId) {
      return setErr("Your account was not resolved. Please re-login (Home → Sign in) and try again.");
    }

    if (!safeStr(firstName).trim()) return setErr("First name is required.");
    if (!safeStr(lastName).trim()) return setErr("Last name is required.");
    if (!Number.isFinite(Number(gradYear))) return setErr("Grad year is required.");
    if (!selectedSportId) return setErr("Sport is required.");
    if (!primaryPositionId) return setErr("Primary position is required.");

    const anyHeight = safeStr(heightFt).trim() || safeStr(heightIn).trim();
    if (anyHeight) {
      const f = Number(heightFt);
      const i = Number(heightIn);
      if (!Number.isFinite(f) || !Number.isFinite(i)) return setErr("Height must include feet and inches.");
      if (!FEET_OPTIONS.includes(f)) return setErr("Height (feet) is out of range.");
      if (!(i >= 0 && i <= 11)) return setErr("Height (inches) must be 0–11.");
    }

    const wNum = safeStr(weight).trim() ? Number(weight) : null;
    if (wNum != null && !Number.isFinite(wNum)) return setErr("Weight is invalid.");

    setSaving(true);

    try {
      // Canonical fields only (no legacy writes)
      const payloadFull = {
        account_id: accountId,
        athlete_name: fullName,
        first_name: safeStr(firstName).trim(),
        last_name: safeStr(lastName).trim(),

        sport_id: selectedSportId,
        grad_year: Number(gradYear),
        primary_position_id: primaryPositionId,

        height_ft: anyHeight ? Number(heightFt) : null,
        height_in: anyHeight ? Number(heightIn) : null,
        weight_lbs: wNum,
      };

      const payloadFallback = {
        account_id: accountId,
        athlete_name: fullName,
        sport_id: selectedSportId,
        grad_year: Number(gradYear),
        primary_position_id: primaryPositionId,
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

  const saveDisabled = saving || !accountId;

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

          {!accountId ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              We can’t detect your account yet. Use “Re-login” below, then come back and save your profile.
            </div>
          ) : null}

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

            {/* Sport / Grad year */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sport</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={selectedSportId}
                  onChange={(e) => {
                    setSelectedSportId(e.target.value);
                    setPrimaryPositionId("");
                  }}
                >
                  <option value="">Select Sport</option>
                  {sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {!sports.length && footballSportId ? <option value={footballSportId}>Football</option> : null}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Grad year</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                >
                  <option value="">Select…</option>
                  {GRAD_YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Primary position */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Primary position</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                value={primaryPositionId}
                onChange={(e) => setPrimaryPositionId(e.target.value)}
                disabled={!selectedSportId}
              >
                <option value="">{selectedSportId ? "Select…" : "Select sport first…"}</option>
                {positions.map((p) => {
                  const label = p.code && p.name ? `${p.code} — ${p.name}` : p.code || p.name || p.id;
                  return (
                    <option key={p.id} value={p.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {selectedSportId
                  ? positions.length
                    ? primaryPositionId
                      ? "Position selected ✔"
                      : "Select a position"
                    : "No positions found for this sport (use AdminImport → Seed Positions)."
                  : "Select a sport"}
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
              <div className="mt-1 text-xs text-slate-500">{heightString ? `Selected: ${heightString}` : "Optional"}</div>
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

            {/* Debug (keep lightweight) */}
            <div className="text-[11px] text-slate-500">
              <div>
                <b>account_id:</b> {accountId || "—"}
              </div>
              <div>
                <b>sport_id:</b> {selectedSportId || "—"}
              </div>
              <div>
                <b>primary_position_id:</b> {primaryPositionId || "—"}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <Button className="btn-brand sm:flex-1" onClick={handleSave} disabled={saveDisabled}>
              {saving ? "Saving…" : "Save"}
            </Button>

            {!accountId ? (
              <Button
                variant="outline"
                className="sm:flex-1"
                onClick={() => nav(`${ROUTES.Home}?signin=1&next=/Profile`)}
                disabled={saving}
              >
                Re-login
              </Button>
            ) : (
              <Button variant="outline" className="sm:flex-1" onClick={() => nav(ROUTES.Workspace)} disabled={saving}>
                Back to Workspace
              </Button>
            )}
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
