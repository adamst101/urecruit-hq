// src/components/camps/SchoolGroupCard.jsx
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import WarningBadge from "./WarningBadge.jsx";
import { base44 } from "../../api/base44Client";

function safeShortDate(d) {
  try {
    if (!d) return null;
    return format(new Date(d), "MMM d");
  } catch {
    return null;
  }
}

function toISODate(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim()))
    return dateInput.trim();
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function extractUrl(v) {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") return v.url || v.src || v.href || null;
  return null;
}

function LogoAvatar({ schoolName, logoUrl }) {
  const [imgErr, setImgErr] = useState(false);
  const resolvedUrl = extractUrl(logoUrl);
  const showImg = !!resolvedUrl && !imgErr;
  const letter = (String(schoolName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();

  return (
    <div className="w-11 h-11 rounded-lg bg-[#0f172a] border border-[#1f2937] overflow-hidden flex items-center justify-center flex-shrink-0">
      {showImg ? (
        <img
          src={resolvedUrl}
          alt={`${schoolName} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="text-sm font-semibold text-[#9ca3af]">{letter}</div>
      )}
    </div>
  );
}

export default function SchoolGroupCard({
  group,
  isExpanded,
  onToggle,
  isPaid,
  isCoach,
  isCoachDemo,
  coachRoster,
  isCampFavorite,
  isCampRegistered,
  onFavoriteToggle,
  onRegisteredToggle,
  onRegisterClick,
  onCampClick,
  getWarningsForCamp,
}) {
  const { school_name, school_logo_url, division, camps } = group;
  const expanded = isExpanded;

  // Coach share-with-roster state
  const [sharePanelCampId, setSharePanelCampId] = useState(null);
  const [sharePanelMode, setSharePanelMode] = useState("message"); // "message" | "recommend"
  const [shareRecipient, setShareRecipient] = useState("all");
  const [shareMsg, setShareMsg] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [shareSentFor, setShareSentFor] = useState(null); // campId that was just sent

  function openSharePanel(camp, mode = "message") {
    const campId = String(camp?.id ?? "");
    if (sharePanelCampId === campId && sharePanelMode === mode) {
      setSharePanelCampId(null);
      return;
    }
    const startLabel = safeShortDate(camp.start_date) || "TBD";
    const city = [camp.city, camp.state].filter(Boolean).join(", ");
    const priceLabel = typeof camp.price === "number" && camp.price > 0 ? ` · $${camp.price}` : "";
    const link = camp.link_url || camp.source_url || "(see website)";
    const defaultMsg = mode === "recommend"
      ? `I recommend checking out this camp: ${camp.camp_name || "Camp"} at ${school_name}\n📅 ${startLabel}${city ? ` · 📍 ${city}` : ""}${priceLabel}\n\nRegister here: ${link}`
      : `Check out this camp: ${camp.camp_name || "Camp"} at ${school_name}\n📅 ${startLabel}${city ? ` · 📍 ${city}` : ""}${priceLabel}\n\nRegister: ${link}`;
    setShareRecipient("all");
    setShareMsg(defaultMsg);
    setSharePanelCampId(campId);
    setSharePanelMode(mode);
    setShareSentFor(null);
  }

  async function sendShare(camp) {
    if (isCoachDemo) return; // Demo: sharing is disabled
    if (!shareMsg.trim() || shareSending) return;
    setShareSending(true);
    try {
      const roster = Array.isArray(coachRoster) ? coachRoster : [];
      const campId = String(camp?.id ?? "");
      if (shareRecipient === "all") {
        await Promise.all(roster.map((athlete) =>
          base44.functions.invoke("sendCoachMessage", {
            subject: `Camp Info: ${camp.camp_name || "Camp"}`,
            message: shareMsg.trim(),
            recipientAthleteId: String(athlete.id ?? ""),
            recipientName: athlete.athlete_name || athlete.name || "",
                      }).catch(() => {})
        ));
      } else {
        const athlete = roster.find((a) => String(a.id) === shareRecipient);
        await base44.functions.invoke("sendCoachMessage", {
          subject: `Camp Info: ${camp.camp_name || "Camp"}`,
          message: shareMsg.trim(),
          recipientAthleteId: shareRecipient,
          recipientName: athlete?.athlete_name || athlete?.name || "",
                  });
      }
      setShareSentFor(campId);
      setSharePanelCampId(null);
    } catch {
      // silently fail — user can retry
    } finally {
      setShareSending(false);
    }
  }

  // Aggregate stats
  const dates = camps
    .map((c) => toISODate(c.start_date))
    .filter(Boolean)
    .sort();
  const dateMin = dates[0] || null;
  const dateMax = dates[dates.length - 1] || null;

  const prices = camps
    .map((c) => (typeof c.price === "number" && c.price > 0 ? c.price : null))
    .filter(Boolean);
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;

  // Most common city
  const cityCount = {};
  camps.forEach((c) => {
    const loc = [c.city, c.state].filter(Boolean).join(", ");
    if (loc) cityCount[loc] = (cityCount[loc] || 0) + 1;
  });
  const primaryCity = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Date pills (up to 4 upcoming)
  const datePills = dates.slice(0, 4);
  const moreCount = dates.length > 4 ? dates.length - 4 : 0;

  // Grades
  const allGrades = [...new Set(camps.map((c) => c.grades).filter(Boolean))];
  const gradesLabel = allGrades.length === 1 ? allGrades[0] : allGrades.length > 1 ? allGrades.join(", ") : null;

  return (
    <div
      className={
        "rounded-xl border transition-colors " +
        (expanded ? "border-[#e8a020]/40 " : "border-[#1f2937] hover:border-[#e8a020]/60 ") +
        "bg-[#111827] overflow-hidden"
      }
    >
      {/* Header — always visible, clickable */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => onToggle?.()}
        role="button"
        tabIndex={0}
      >
        {/* Amber accent bar */}
        <div
          className={
            "w-[3px] self-stretch rounded-full transition-colors flex-shrink-0 " +
            (expanded ? "bg-[#e8a020]" : "bg-transparent group-hover:bg-[#e8a020]")
          }
        />

        <LogoAvatar schoolName={school_name} logoUrl={school_logo_url} />

        <div className="min-w-0 flex-1">
          {/* Row 1: name + division + camp count */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-[#f9fafb] truncate">{school_name}</span>
            {division && (
              <Badge className="bg-[#0f172a] text-[#f9fafb] border border-[#374151] text-[10px] px-1.5 py-0">{division}</Badge>
            )}
            <Badge className="bg-[#e8a020]/15 text-[#e8a020] border border-[#e8a020]/30 text-[10px] px-1.5 py-0">
              {camps.length} camp{camps.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {/* Row 2: city · price */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9ca3af]">
            {primaryCity && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">📍</span>
                {primaryCity}
              </span>
            )}
            {priceMin != null && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">💰</span>
                ${priceMin}{priceMax != null && priceMax !== priceMin ? ` — $${priceMax}` : ""}
              </span>
            )}
            {gradesLabel && (
              <span className="flex items-center gap-1">
                <span className="text-[#6b7280]">🎓</span>
                {gradesLabel}
              </span>
            )}
          </div>

          {/* Row 3: date pills */}
          {datePills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-[#9ca3af] text-sm leading-none">📅</span>
              {datePills.map((d, i) => (
                <span
                  key={`${d}-${i}`}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-[#e8a020]/30 text-[#e8a020]/80 bg-[#e8a020]/5"
                >
                  {safeShortDate(d)}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#374151] text-[#9ca3af]">
                  +{moreCount} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chevron */}
        <ChevronDown
          className={
            "w-5 h-5 text-[#9ca3af] flex-shrink-0 transition-transform duration-200 " +
            (expanded ? "rotate-180" : "")
          }
        />
      </div>

      {/* Expanded: individual camps */}
      {expanded && (
        <div className="border-t border-[#1f2937]">
          {camps.map((camp, idx) => {
            const campId = String(camp?.id ?? "");
            const isFav = isCampFavorite(campId);
            const isReg = isCampRegistered ? isCampRegistered(campId) : false;
            const startLabel = safeShortDate(camp.start_date) || "TBD";
            const city = [camp.city, camp.state].filter(Boolean).join(", ");
            const priceLabel = typeof camp.price === "number" && camp.price > 0 ? `$${camp.price}` : null;
            const campWarnings = getWarningsForCamp ? getWarningsForCamp(campId) : [];

            // Coaches don't have personal registration/favorite states — suppress those row styles
            const rowBg = (!isCoach && isReg) ? "#052e16" : (idx % 2 === 1 ? "rgba(15,23,42,0.4)" : "transparent");
            const rowBorder = (!isCoach && isReg) ? "#10b981" : (!isCoach && isFav) ? "#e8a020" : "transparent";
            const shareOpen = sharePanelCampId === campId;
            const justSent = shareSentFor === campId;

            return (
              <div key={campId}>
                <div
                  className="flex items-center gap-3 px-5 py-3 hover:brightness-110 transition"
                  style={{ background: rowBg, borderLeft: `3px solid ${rowBorder}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-[#f9fafb] truncate">
                        {camp.camp_name || "Camp"}
                      </div>
                      <WarningBadge warnings={campWarnings} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#9ca3af]">
                      <span>{startLabel}</span>
                      {city && <span>{city}</span>}
                      {priceLabel && <span className="text-[#e8a020]">{priceLabel}</span>}
                      {camp.grades && <span>{camp.grades}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Star — hidden for coach demo; shown for regular users */}
                    {!isCoachDemo && (
                      <button
                        type="button"
                        title={isFav ? "Remove from favorites" : "Add to favorites"}
                        className={"h-8 w-8 p-0 flex items-center justify-center rounded-md hover:bg-[#1f2937] " + (isFav ? "text-[#e8a020]" : "text-[#6b7280] hover:text-[#e8a020]")}
                        style={{ background: "none", border: "none", cursor: "pointer", transition: "color 0.15s" }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onFavoriteToggle?.(campId);
                        }}
                      >
                        <span className="text-lg leading-none">
                          {isFav ? "★" : "☆"}
                        </span>
                      </button>
                    )}
                    {/* Checkmark — hidden for coaches */}
                    {!isCoach && onRegisteredToggle && (
                      <button
                        type="button"
                        title={isReg ? "Remove registered status" : "Mark as registered"}
                        className="h-8 w-8 p-0 flex items-center justify-center rounded-md hover:bg-[#1f2937]"
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 18, lineHeight: 1,
                          fontWeight: isReg ? 700 : 300,
                          color: isReg ? "#10b981" : "#6b7280",
                          opacity: isReg ? 1 : 0.6,
                          transition: "color 0.15s ease, opacity 0.15s ease",
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRegisteredToggle(campId);
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#10b981"; e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={(e) => {
                          if (!isReg) { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.opacity = "0.6"; }
                          else { e.currentTarget.style.color = "#10b981"; e.currentTarget.style.opacity = "1"; }
                        }}
                      >
                        ✓
                      </button>
                    )}
                    {/* Register → opens Ryzer URL — shown for non-coach users */}
                    {!isCoach && (
                      <button
                        type="button"
                        className="text-xs h-7 px-3 rounded-md font-medium bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]"
                        style={{ pointerEvents: "auto", cursor: "pointer", position: "relative", zIndex: 10 }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRegisterClick?.(camp);
                        }}
                      >
                        Register →
                      </button>
                    )}
                    {/* Coach actions: Message Roster + Recommend Camp */}
                    {isCoach && (
                      <>
                        <button
                          type="button"
                          className="text-xs h-7 px-3 rounded-md font-medium border"
                          style={{
                            background: (shareOpen && sharePanelMode === "recommend") ? "#1a2e1a" : "none",
                            borderColor: (shareOpen && sharePanelMode === "recommend") ? "#4ade80" : "#374151",
                            color: (shareOpen && sharePanelMode === "recommend") ? "#86efac" : "#9ca3af",
                            cursor: "pointer",
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openSharePanel(camp, "recommend");
                          }}
                        >
                          Recommend
                        </button>
                        <button
                          type="button"
                          className="text-xs h-7 px-3 rounded-md font-medium border"
                          style={{
                            background: (shareOpen && sharePanelMode === "message") ? "#1e3a5f" : "none",
                            borderColor: (shareOpen && sharePanelMode === "message") ? "#3b82f6" : "#374151",
                            color: (shareOpen && sharePanelMode === "message") ? "#93c5fd" : "#9ca3af",
                            cursor: "pointer",
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openSharePanel(camp, "message");
                          }}
                        >
                          {justSent ? "✓ Sent" : "Message Roster"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Share panel — inline, below camp row */}
                {isCoach && shareOpen && (
                  <div
                    className="px-5 py-4 border-t"
                    style={{ background: sharePanelMode === "recommend" ? "#0d1a0d" : "#0d1526", borderColor: sharePanelMode === "recommend" ? "#1a3a1a" : "#1e3a5f" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-xs font-semibold mb-3" style={{ color: sharePanelMode === "recommend" ? "#86efac" : "#93c5fd" }}>
                      {sharePanelMode === "recommend" ? "Recommend to Roster" : "Message Roster"}
                    </div>

                    {/* Recipient selector */}
                    <div className="mb-3">
                      <label className="block text-xs text-[#9ca3af] mb-1">To</label>
                      <select
                        value={shareRecipient}
                        onChange={(e) => setShareRecipient(e.target.value)}
                        className="w-full text-sm rounded-md px-3 py-1.5"
                        style={{ background: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
                      >
                        <option value="all">All Athletes ({Array.isArray(coachRoster) ? coachRoster.length : 0})</option>
                        {(Array.isArray(coachRoster) ? coachRoster : []).map((athlete) => (
                          <option key={String(athlete.id)} value={String(athlete.id)}>
                            {athlete.athlete_name || athlete.name || `Athlete ${athlete.id}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Message */}
                    <div className="mb-3">
                      <label className="block text-xs text-[#9ca3af] mb-1">Message</label>
                      <textarea
                        value={shareMsg}
                        onChange={(e) => setShareMsg(e.target.value)}
                        rows={4}
                        className="w-full text-sm rounded-md px-3 py-2 resize-none"
                        style={{ background: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isCoachDemo || shareSending || !shareMsg.trim()}
                        className="text-xs h-7 px-4 rounded-md font-medium"
                        style={{
                          background: isCoachDemo ? "#1f2937" : shareSending ? "#374151" : "#e8a020",
                          color: isCoachDemo ? "#6b7280" : "#0a0e1a",
                          cursor: isCoachDemo || shareSending ? "default" : "pointer",
                          opacity: (!shareMsg.trim() && !isCoachDemo) ? 0.5 : 1,
                        }}
                        title={isCoachDemo ? "Sign up to send messages to your roster" : undefined}
                        onClick={() => sendShare(camp)}
                      >
                        {isCoachDemo ? "Demo — sign up to send" : shareSending ? "Sending…" : "Send"}
                      </button>
                      <button
                        type="button"
                        className="text-xs h-7 px-3 rounded-md"
                        style={{ background: "none", border: "1px solid #374151", color: "#9ca3af", cursor: "pointer" }}
                        onClick={() => setSharePanelCampId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}