// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, ArrowRight } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav.jsx";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { geocodeCity } from "../components/hooks/useGeocode.jsx";

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
function safeStr(x) { return x == null ? "" : String(x); }

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
  return { heightFt: "", heightIn: "" };
}
function parseWeight(ap) {
  const w = ap?.weight_lbs ?? ap?.weightLbs ?? ap?.weight ?? null;
  const n = Number(w);
  return Number.isFinite(n) ? n : "";
}
function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  return true;
}
function getSportName(r) {
  return String(r?.sport_name || r?.name || r?.sportName || "").trim();
}

const inputClass = "mt-1 w-full rounded px-3 py-2 text-sm bg-[#1f2937] border border-[#374151] text-[#f9fafb] placeholder-[#6b7280] focus:outline-none focus:border-[#e8a020] disabled:opacity-50 disabled:cursor-not-allowed";
const selectClass = inputClass;
const labelTextClass = "text-[#9ca3af] text-sm";
const helperTextClass = "text-[#6b7280] text-xs mt-1";

export default function Profile() {
  const nav = useNavigate();
  const { hasAccess, mode, loading: seasonLoading, isLoading: seasonIsLoading } = useSeasonAccess();
  const isDemo = !seasonIsLoading && (mode === "demo" || !hasAccess);
  const { identity, loading: identityLoading, saveIdentity } = useAthleteIdentity();

  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'success' | 'error'
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
  const [playerEmail, setPlayerEmail] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentLastName, setParentLastName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");

  // Populate form from identity
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
    setPlayerEmail(safeStr(ap?.player_email));
    setXHandle(safeStr(ap?.x_handle));
    setParentFirstName(safeStr(ap?.parent_first_name));
    setParentLastName(safeStr(ap?.parent_last_name));
    setParentPhone(safeStr(ap?.parent_phone));
  }, [identity]);

  // Auto-populate parent email from logged-in account
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!cancelled && me?.email) setParentEmail(String(me.email).toLowerCase());
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Load sports + positions
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

  async function handleSave() {
    setSaveStatus("saving");
    try {
      const fy = Number(gradYear);
      if (gradYear !== "" && !Number.isFinite(fy)) throw new Error("Grad year must be a number.");
      const cleanHandle = xHandle.replace(/^@/, "").trim();

      // Geocode home location
      let homeLat = null;
      let homeLng = null;
      const trimCity = homeCity.trim();
      const trimState = homeState.trim();
      if (trimCity || trimState) {
        const coords = await geocodeCity(trimCity, trimState);
        if (coords) {
          homeLat = coords.lat;
          homeLng = coords.lng;
        }
      }

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
          home_city: trimCity || null,
          home_state: trimState || null,
          home_lat: homeLat,
          home_lng: homeLng,
          player_email: playerEmail.trim() || null,
          x_handle: cleanHandle || null,
          parent_first_name: parentFirstName.trim() || null,
          parent_last_name: parentLastName.trim() || null,
          parent_phone: parentPhone.trim() || null,
        },
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus(null), 4000);
    } catch {
      setSaveStatus("error");
    }
  }

  // Auto-backfill: geocode existing profiles that have city/state but no lat/lng
  const [backfillDone, setBackfillDone] = useState(false);
  useEffect(() => {
    if (backfillDone || isDemo || !identity) return;
    const ap = identity?.athleteProfile || identity?.athlete_profile || identity || null;
    const hasCity = !!(ap?.home_city || ap?.home_state);
    const hasCoords = ap?.home_lat != null && ap?.home_lng != null;
    if (hasCity && !hasCoords) {
      setBackfillDone(true);
      geocodeCity(ap.home_city, ap.home_state).then((coords) => {
        if (coords) {
          saveIdentity({
            athleteProfile: {
              ...ap,
              home_lat: coords.lat,
              home_lng: coords.lng,
            },
          }).catch(() => {});
        }
      });
    }
  }, [identity, isDemo, backfillDone]);

  const disabled = isDemo;

  if (seasonIsLoading) {
    return (
      <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 16 }}>
        Loading your profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <button
          type="button"
          onClick={() => nav("/Workspace")}
          className="mb-3 text-sm font-medium text-[#e8a020] hover:text-[#f3b13f] flex items-center gap-1"
        >
          ← HQ
        </button>
        {/* Header */}
        <div className="flex items-center gap-2">
          <User className="w-6 h-6 text-[#e8a020]" />
          <h1 className="text-2xl font-bold text-[#f9fafb]">Profile</h1>
        </div>

        {/* Demo banner */}
        {isDemo && (
          <div className="rounded-lg border-l-4 border-[#e8a020] bg-[#111827] border border-[#1f2937] p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-[#f9fafb]">🔒 Profile editing is available to Season Pass members.</div>
            </div>
            <button
              onClick={() => nav("/Subscribe")}
              className="text-sm font-bold text-[#e8a020] hover:text-[#f3b13f] flex items-center gap-1 whitespace-nowrap"
            >
              Get Season Pass <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Save status banners */}
        {saveStatus === "success" && (
          <div className="rounded-lg bg-[#064e3b] border border-[#059669] p-3">
            <div className="text-sm text-[#a7f3d0] font-medium">✓ Profile saved successfully.</div>
          </div>
        )}
        {saveStatus === "error" && (
          <div className="rounded-lg bg-[#7f1d1d] border border-[#dc2626] p-3">
            <div className="text-sm text-[#fca5a5] font-medium">Something went wrong. Please try again.</div>
          </div>
        )}

        {/* ── SECTION: Athlete Info ── */}
        <Card className="p-4 space-y-4 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Athlete Info</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>First name</div>
              <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" disabled={disabled} />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Last name</div>
              <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" disabled={disabled} />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>Grad year</div>
              <input className={inputClass} value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2027" disabled={disabled} />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Sport</div>
              <select className={selectClass} value={sportId} onChange={(e) => { setSportId(e.target.value); setPrimaryPositionId(""); }} disabled={disabled}>
                <option value="">Select sport</option>
                {sports.map((s) => {
                  const id = normId(s);
                  const name = getSportName(s) || "(Unnamed sport)";
                  return <option key={id || name} value={id || ""}>{name}</option>;
                })}
              </select>
            </label>
          </div>

          <label className="text-sm">
            <div className={labelTextClass}>Primary position</div>
            <select className={selectClass} value={primaryPositionId} onChange={(e) => setPrimaryPositionId(e.target.value)} disabled={disabled || !sportId}>
              <option value="">{!sportId ? "Select a sport first" : filteredPositions.length ? "Select position" : "No positions found"}</option>
              {filteredPositions.map((p) => {
                const id = normId(p);
                const name = String(p?.position_name || p?.name || "").trim() || "(Unnamed)";
                return <option key={id || name} value={id || ""}>{name}</option>;
              })}
            </select>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>Height (ft)</div>
              <select className={selectClass} value={heightFt} onChange={(e) => setHeightFt(e.target.value)} disabled={disabled}>
                <option value="">—</option>
                {FEET_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Height (in)</div>
              <select className={selectClass} value={heightIn} onChange={(e) => setHeightIn(e.target.value)} disabled={disabled}>
                <option value="">—</option>
                {INCH_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Weight (lbs)</div>
              <select className={selectClass} value={weight} onChange={(e) => setWeight(e.target.value)} disabled={disabled}>
                <option value="">—</option>
                {WEIGHT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
        </Card>

        {/* ── SECTION: Location ── */}
        <Card className="p-4 space-y-3 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Location</div>
          <div className="text-xs text-[#6b7280]">Used to estimate travel distance to camps</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>City</div>
              <input className={inputClass} value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="e.g. Dallas" disabled={disabled} />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>State</div>
              <select className={selectClass} value={homeState} onChange={(e) => setHomeState(e.target.value)} disabled={disabled}>
                <option value="">—</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </Card>

        {/* ── SECTION: Contact & Social ── */}
        <Card className="p-4 space-y-3 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Contact & Social</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>Player Email</div>
              <input className={inputClass} type="email" value={playerEmail} onChange={(e) => setPlayerEmail(e.target.value)} placeholder="player@email.com" disabled={disabled} />
              <div className={helperTextClass}>The athlete's own email — separate from your login email</div>
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>X / Twitter</div>
              <input className={inputClass} value={xHandle ? `@${xHandle}` : ""} onChange={(e) => setXHandle(e.target.value.replace(/^@/, ""))} placeholder="@username" disabled={disabled} />
              <div className={helperTextClass}>Your recruiting profile on X — helps coaches find you</div>
            </label>
          </div>
        </Card>

        {/* ── SECTION: Parent / Guardian Info ── */}
        <Card className="p-4 space-y-3 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Parent / Guardian Info</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className={labelTextClass}>Parent First Name</div>
              <input className={inputClass} value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} placeholder="Jane" disabled={disabled} />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Parent Last Name</div>
              <input className={inputClass} value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} placeholder="Smith" disabled={disabled} />
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Parent Cell Phone</div>
              <input className={inputClass} type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="(555) 555-5555" disabled={disabled} />
              <div className={helperTextClass}>Used to personalize your HQ experience — never shared</div>
            </label>
            <label className="text-sm">
              <div className={labelTextClass}>Parent Email</div>
              <input className={inputClass} type="email" value={parentEmail} disabled={true} style={{ opacity: 0.6, cursor: "not-allowed" }} />
              <div className={helperTextClass}>Auto-filled from your account login — cannot be changed here</div>
            </label>
          </div>
        </Card>

        {/* ── Save button (paid only) ── */}
        {!isDemo && (
          <div className="pt-2">
            <Button
              className={
                saveStatus === "success"
                  ? "bg-[#059669] text-white hover:bg-[#059669] w-full md:w-auto"
                  : saveStatus === "error"
                  ? "bg-[#dc2626] text-white hover:bg-[#dc2626] w-full md:w-auto"
                  : "bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f] w-full md:w-auto"
              }
              onClick={handleSave}
              disabled={saveStatus === "saving" || saveStatus === "success" || seasonLoading || identityLoading}
            >
              {saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "success"
                ? "✓ Saved"
                : saveStatus === "error"
                ? "Save Failed — Try Again"
                : "Save Profile"}
            </Button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}