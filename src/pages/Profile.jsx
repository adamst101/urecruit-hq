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
  AdminOps: "/AdminOps",
};

// Admin mode gate (shared with AdminOps page)
const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";

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

function parseGradYear(athleteProfile) {
  const y = athleteProfile?.grad_year ?? athleteProfile?.gradYear ?? null;
  const n = Number(y);
  return Number.isFinite(n) ? n : "";
}

function parseHeightParts(athleteProfile) {
  const ft =
    athleteProfile?.height_ft ?? athleteProfile?.heightFeet ?? athleteProfile?.height_feet ?? null;
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

/**
 * Active flag reader (best-effort across possible schemas).
 * If a sport row does not have any active fields, we default to true (visible).
 */
function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;

  return true;
}

function getSportName(r) {
  return String(r?.sport_name || r?.name || r?.sportName || "").trim();
}

async function resolveFootballSportIdActiveOnly() {
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  if (!SportEntity?.filter) return null;

  try {
    const rows = await SportEntity.filter({});
    const arr = Array.isArray(rows) ? rows : [];
    const football = arr.find((r) => {
      if (!readActiveFlag(r)) return false;
      const n = getSportName(r).toLowerCase();
      return n === "football" || n.includes("football");
    });
    return football?.id || football?._id || football?.uuid || null;
  } catch {
    return null;
  }
}

export default function Profile() {
  const nav = useNavigate();

  const { isPaidSeason, loading: seasonLoading } = useSeasonAccess();
  const { identity, loading: identityLoading, saveIdentity } = useAthleteIdentity();

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  const [sportId, setSportId] = useState("");
  const [primaryPositionId, setPrimaryPositionId] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");

  const [adminEnabled, setAdminEnabled] = useState(false);

  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");
  }, []);

  function toggleAdminMode() {
    const next = !(localStorage.getItem(ADMIN_MODE_KEY) === "true");
    localStorage.setItem(ADMIN_MODE_KEY, next ? "true" : "false");
    setAdminEnabled(next);
    setStatus(`Admin Mode ${next ? "enabled" : "disabled"} (local to this browser).`);
    setTimeout(() => setStatus(""), 2500);
  }

  useEffect(() => {
    // hydrate from identity
    const ap = identity?.athleteProfile || identity?.athlete_profile || identity || null;
    const np = parseNameParts(ap);
    setFirstName(np.first);
    setLastName(np.last);
    setGradYear(parseGradYear(ap));

    const hp = parseHeightParts(ap);
    setHeightFt(hp.heightFt);
    setHeightIn(hp.heightIn);

    setWeight(parseWeight(ap));

    const sport = ap?.sport_id || ap?.sportId || ap?.sport || "";
    setSportId(sport ? String(sport) : "");

    const pos = ap?.primary_position_id || ap?.primaryPositionId || ap?.primary_position || "";
    setPrimaryPositionId(pos ? String(pos) : "");
  }, [identity]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
        const PositionEntity = base44?.entities?.Position || base44?.entities?.Positions || null;

        const [sportRows, positionRows] = await Promise.all([
          SportEntity?.list ? SportEntity.list() : [],
          PositionEntity?.list ? PositionEntity.list() : [],
        ]);

        if (!mounted) return;

        const sportArr = Array.isArray(sportRows) ? sportRows : [];
        const posArr = Array.isArray(positionRows) ? positionRows : [];

        setSports(
          sportArr
            .filter((r) => readActiveFlag(r))
            .sort((a, b) => getSportName(a).localeCompare(getSportName(b)))
        );
        setPositions(posArr);
      } catch {
        if (!mounted) return;
        setSports([]);
        setPositions([]);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredPositions = useMemo(() => {
    if (!sportId) return [];
    const sId = String(sportId);

    const arr = Array.isArray(positions) ? positions : [];
    const filtered = arr.filter((p) => {
      const pid = normId(p?.sport_id || p?.sportId || p?.sport);
      return pid && String(pid) === sId;
    });

    filtered.sort((a, b) => {
      const an = String(a?.position_name || a?.name || "").trim();
      const bn = String(b?.position_name || b?.name || "").trim();
      return an.localeCompare(bn);
    });

    return filtered;
  }, [positions, sportId]);

  async function onSave() {
    setSaving(true);
    setStatus("");

    try {
      // Basic validation
      const fy = Number(gradYear);
      if (gradYear !== "" && !Number.isFinite(fy)) throw new Error("Grad year must be a number.");

      const payload = {
        athleteProfile: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          grad_year: gradYear === "" ? null : Number(gradYear),

          height_ft: heightFt === "" ? null : Number(heightFt),
          height_in: heightIn === "" ? null : Number(heightIn),
          weight_lbs: weight === "" ? null : Number(weight),

          sport_id: sportId ? String(sportId) : null,
          primary_position_id: primaryPositionId ? String(primaryPositionId) : null,
        },
      };

      await saveIdentity(payload);

      setStatus("Saved.");
      setTimeout(() => setStatus(""), 2500);
    } catch (e) {
      setStatus(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function onAutoSetFootball() {
    setStatus("");
    const id = await resolveFootballSportIdActiveOnly();
    if (!id) {
      setStatus("Could not resolve Football sport id. Check Sport table.");
      return;
    }
    setSportId(String(id));
    setPrimaryPositionId("");
    setStatus("Football selected.");
    setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <User className="w-6 h-6" />
          <h1 className="text-2xl font-semibold">Profile</h1>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav(ROUTES.Workspace)}>
            Workspace
          </Button>
          <Button variant="outline" onClick={() => nav(ROUTES.Discover)}>
            Discover
          </Button>
        </div>
      </div>

      {status ? (
        <Card className="p-3 border">
          <div className="text-sm">{status}</div>
        </Card>
      ) : null}

      <Card className="p-4 space-y-3">
        <div className="text-lg font-semibold">Athlete</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-gray-700">First name</div>
            <input
              className="mt-1 w-full border rounded px-2 py-1"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First"
            />
          </label>

          <label className="text-sm">
            <div className="text-gray-700">Last name</div>
            <input
              className="mt-1 w-full border rounded px-2 py-1"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <div className="text-gray-700">Grad year</div>
            <input
              className="mt-1 w-full border rounded px-2 py-1"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              placeholder="2027"
            />
          </label>

          <label className="text-sm">
            <div className="text-gray-700">Height (ft)</div>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
            >
              <option value="">—</option>
              {FEET_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="text-gray-700">Height (in)</div>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
            >
              <option value="">—</option>
              {INCH_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm">
          <div className="text-gray-700">Weight (lbs)</div>
          <select className="mt-1 w-full border rounded px-2 py-1" value={weight} onChange={(e) => setWeight(e.target.value)}>
            <option value="">—</option>
            {WEIGHT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-gray-700">Sport</div>
            <select className="mt-1 w-full border rounded px-2 py-1" value={sportId} onChange={(e) => setSportId(e.target.value)}>
              <option value="">—</option>
              {sports.map((s) => {
                const id = normId(s);
                const name = getSportName(s) || "(Unnamed sport)";
                return (
                  <option key={id || name} value={id || ""}>
                    {name}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="text-sm">
            <div className="text-gray-700">Primary position</div>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={primaryPositionId}
              onChange={(e) => setPrimaryPositionId(e.target.value)}
              disabled={!sportId}
            >
              <option value="">
                {!sportId
                  ? "Select a sport first"
                  : filteredPositions.length
                  ? "—"
                  : "No positions found for this sport (use Admin → Manage Positions → Auto-seed)."}
              </option>
              {filteredPositions.map((p) => {
                const id = normId(p);
                const name = String(p?.position_name || p?.name || "").trim() || "(Unnamed position)";
                return (
                  <option key={id || name} value={id || ""}>
                    {name}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onSave} disabled={saving || seasonLoading || identityLoading}>
            {saving ? "Saving..." : "Save"}
          </Button>

          <Button variant="outline" onClick={onAutoSetFootball}>
            Auto-select Football
          </Button>

          <Button variant="outline" onClick={() => nav(ROUTES.Home)}>
            Home
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-lg font-semibold">Season access</div>
        <div className="text-sm text-gray-700">
          {seasonLoading ? "Checking access..." : isPaidSeason ? "Paid season access is active." : "Demo mode (limited)."}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-lg font-semibold">Admin</div>
        <div className="text-sm text-gray-700">
          Use Admin Ops for bulk purge, dedupe, and diagnostics. Admin Mode is stored locally per browser.
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={adminEnabled ? "default" : "outline"} onClick={toggleAdminMode}>
            Admin Mode: {adminEnabled ? "ON" : "OFF"}
          </Button>

          <Button variant="outline" onClick={() => nav(ROUTES.AdminOps)}>
            Open Admin Ops
          </Button>
        </div>

        {!adminEnabled && (
          <div className="text-xs text-gray-600">
            Admin actions are gated. Turn on Admin Mode before running destructive operations.
          </div>
        )}
      </Card>
    </div>
  );
}
