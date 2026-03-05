// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav.jsx";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import DemoBanner from "../components/DemoBanner.jsx";

// ---- routes ----
const ROUTES = {
  Workspace: "/Workspace",
  Discover: "/Discover",
  Home: "/Home",
  AdminOps: "/AdminOps",
};

const ADMIN_MODE_KEY = "campapp_admin_enabled_v1";
const FEET_OPTIONS = [4, 5, 6, 7];
const INCH_OPTIONS = Array.from({ length: 12 }, (_, i) => i);
const WEIGHT_OPTIONS = Array.from({ length: 61 }, (_, i) => 100 + i * 5);

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
];

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function parseNameParts(ap) {
  const first = safeStr(ap?.first_name || ap?.firstName).trim();
  const last = safeStr(ap?.last_name || ap?.lastName).trim();
  if (first || last) return { first, last };
  const full = safeStr(ap?.athlete_name || ap?.athleteName || ap?.name).trim();
  if (!full) return { first: "", last: "" };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseGradYear(ap) {
  const y = ap?.grad_year ?? ap?.gradYear ?? null;
  const n = Number(y);
  return Number.isFinite(n) ? n : "";
}

function parseHeightParts(ap) {
  const ft = ap?.height_ft ?? ap?.heightFeet ?? ap?.height_feet ?? null;
  const inch = ap?.height_in ?? ap?.heightInches ?? ap?.height_inches ?? null;
  const ftNum = Number(ft);
  const inNum = Number(inch);
  if (Number.isFinite(ftNum) && Number.isFinite(inNum)) return { heightFt: ftNum, heightIn: inNum };
  const raw = safeStr(ap?.height).trim();
  if (!raw) return { heightFt: "", heightIn: "" };
  const m = raw.match(/(\d)\s*['-]\s*(\d{1,2})/);
  if (!m) return { heightFt: "", heightIn: "" };
  return { heightFt: Number(m[1]) || "", heightIn: Number(m[2]) || "" };
}

function parseWeight(ap) {
  const w = ap?.weight_lbs ?? ap?.weightLbs ?? ap?.weight ?? null;
  const n = Number(w);
  return Number.isFinite(n) ? n : "";
}

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;
  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive") return false;
  return true;
}

function getSportName(r) {
  return String(r?.sport_name || r?.name || r?.sportName || "").trim();
}

async function resolveFootballSportIdActiveOnly() {
  const SportEntity = base44?.entities?.Sport || null;
  if (!SportEntity?.filter) return null;
  try {
    const rows = await SportEntity.filter({});
    const arr = Array.isArray(rows) ? rows : [];
    const football = arr.find((r) => readActiveFlag(r) && getSportName(r).toLowerCase().includes("football"));
    return football?.id || football?._id || null;
  } catch { return null; }
}

// Dark/amber theme inline styles
const inputClass = "mt-1 w-full rounded px-3 py-2 text-sm bg-[#1f2937] border border-[#374151] text-[#f9fafb] placeholder-[#6b7280] focus:outline-none focus:border-[#e8a020]";
const selectClass = inputClass;
const labelTextClass = "text-[#9ca3af] text-sm";

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
  const [homeCity, setHomeCity] = useState("");
  const [homeState, setHomeState] = useState("");
  const [adminEnabled, setAdminEnabled] = useState(false);

  useEffect(() => {
    setAdminEnabled(localStorage.getItem(ADMIN_MODE_KEY) === "true");
  }, []);

  function toggleAdminMode() {
    const next = !(localStorage.getItem(ADMIN_MODE_KEY) === "true");
    localStorage.setItem(ADMIN_MODE_KEY, next ? "true" : "false");
    setAdminEnabled(next);
    setStatus(`Admin Mode ${next ? "enabled" : "disabled"}`);
    setTimeout(() => setStatus(""), 2500);
  }

  useEffect(() => {
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
    setHomeCity(safeStr(ap?.home_city));
    setHomeState(safeStr(ap?.home_state));
  }, [identity]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const SportEntity = base44?.entities?.Sport || null;
        const PositionEntity = base44?.entities?.Position || null;
        const [sportRows, positionRows] = await Promise.all([
          SportEntity?.list ? SportEntity.list() : [],
          PositionEntity?.list ? PositionEntity.list() : [],
        ]);
        if (!mounted) return;
        setSports((Array.isArray(sportRows) ? sportRows : []).filter(readActiveFlag).sort((a, b) => getSportName(a).localeCompare(getSportName(b))));
        setPositions(Array.isArray(positionRows) ? positionRows : []);
      } catch {
        if (mounted) { setSports([]); setPositions([]); }
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const filteredPositions = useMemo(() => {
    if (!sportId) return [];
    const sId = String(sportId);
    return (Array.isArray(positions) ? positions : [])
      .filter((p) => { const pid = normId(p?.sport_id || p?.sportId || p?.sport); return pid && String(pid) === sId; })
      .sort((a, b) => String(a?.position_name || "").localeCompare(String(b?.position_name || "")));
  }, [positions, sportId]);

  async function onSave() {
    setSaving(true);
    setStatus("");
    try {
      const fy = Number(gradYear);
      if (gradYear !== "" && !Number.isFinite(fy)) throw new Error("Grad year must be a number.");
      await saveIdentity({
        athleteProfile: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          grad_year: gradYear === "" ? null : Number(gradYear),
          height_ft: heightFt === "" ? null : Number(heightFt),
          height_in: heightIn === "" ? null : Number(heightIn),
          weight_lbs: weight === "" ? null : Number(weight),
          sport_id: sportId ? String(sportId) : null,
          primary_position_id: primaryPositionId ? String(primaryPositionId) : null,
          home_city: homeCity.trim() || null,
          home_state: homeState.trim() || null,
        },
      });
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
    if (!id) { setStatus("Could not resolve Football sport id."); return; }
    setSportId(String(id));
    setPrimaryPositionId("");
    setStatus("Football selected.");
    setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <User className="w-6 h-6 text-[#e8a020]" />
            <h1 className="text-2xl font-bold text-[#f9fafb]">Profile</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#111827]" onClick={() => nav(ROUTES.Workspace)}>Workspace</Button>
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#111827]" onClick={() => nav(ROUTES.Discover)}>Discover</Button>
          </div>
        </div>

        {!isPaidSeason && <DemoBanner />}

        {/* Status toast */}
        {status && (
          <Card className="p-3 border-[#1f2937] bg-[#111827]">
            <div className="text-sm text-[#f9fafb]">{status}</div>
          </Card>
        )}

        {/* Athlete card */}
        <Card className="p-4 space-y-4 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Athlete</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>First name</div>
              <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Last name</div>
              <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>Grad year</div>
              <input className={inputClass} value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2027" />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Height (ft)</div>
              <select className={selectClass} value={heightFt} onChange={(e) => setHeightFt(e.target.value)}>
                <option value="">—</option>
                {FEET_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Height (in)</div>
              <select className={selectClass} value={heightIn} onChange={(e) => setHeightIn(e.target.value)}>
                <option value="">—</option>
                {INCH_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>

          <label className="text-sm">
            <div className={labelTextClass}>Weight (lbs)</div>
            <select className={selectClass} value={weight} onChange={(e) => setWeight(e.target.value)}>
              <option value="">—</option>
              {WEIGHT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>Sport</div>
              <select className={selectClass} value={sportId} onChange={(e) => setSportId(e.target.value)}>
                <option value="">—</option>
                {sports.map((s) => {
                  const id = normId(s);
                  const name = getSportName(s) || "(Unnamed sport)";
                  return <option key={id || name} value={id || ""}>{name}</option>;
                })}
              </select>
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Primary position</div>
              <select className={selectClass} value={primaryPositionId} onChange={(e) => setPrimaryPositionId(e.target.value)} disabled={!sportId}>
                <option value="">{!sportId ? "Select a sport first" : filteredPositions.length ? "—" : "No positions found"}</option>
                {filteredPositions.map((p) => {
                  const id = normId(p);
                  const name = String(p?.position_name || p?.name || "").trim() || "(Unnamed)";
                  return <option key={id || name} value={id || ""}>{name}</option>;
                })}
              </select>
            </label>
          </div>

          {/* Home Location */}
          <div className="border-t border-[#1f2937] pt-4 mt-2">
            <div className="text-sm font-semibold text-[#f9fafb] mb-2">Home Location</div>
            <div className="text-xs text-[#6b7280] mb-2">Used to estimate travel distance to camps</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className={labelTextClass}>City</div>
                <input className={inputClass} value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="e.g. Dallas" />
              </label>
              <label className="text-sm">
                <div className={labelTextClass}>State</div>
                <select className={selectClass} value={homeState} onChange={(e) => setHomeState(e.target.value)}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={onSave} disabled={saving || seasonLoading || identityLoading}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={onAutoSetFootball}>
              Auto-select Football
            </Button>
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={() => nav(ROUTES.Home)}>
              Home
            </Button>
          </div>
        </Card>

        {/* Season access */}
        <Card className="p-4 space-y-3 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Season access</div>
          <div className="text-sm text-[#9ca3af]">
            {seasonLoading ? "Checking access..." : isPaidSeason ? "Paid season access is active." : "Demo mode (limited)."}
          </div>
        </Card>

        {/* Admin */}
        <Card className="p-4 space-y-3 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Admin</div>
          <div className="text-sm text-[#9ca3af]">
            Use Admin Ops for bulk purge, dedupe, and diagnostics.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className={adminEnabled ? "bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" : "border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]"}
              variant={adminEnabled ? "default" : "outline"}
              onClick={toggleAdminMode}
            >
              Admin Mode: {adminEnabled ? "ON" : "OFF"}
            </Button>
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={() => nav(ROUTES.AdminOps)}>
              Open Admin Ops
            </Button>
          </div>
          {!adminEnabled && (
            <div className="text-xs text-[#6b7280]">
              Admin actions are gated. Turn on Admin Mode before running destructive operations.
            </div>
          )}
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}