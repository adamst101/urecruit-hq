// src/pages/Calendar.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Loader2, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { createPageUrl } from "../utils";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import RouteGuard from "../components/auth/RouteGuard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

/**
 * CalendarPage
 * - Default view: LIST (better for finding camps)
 * - Optional view: CALENDAR (better for spotting conflicts)
 * - Demo/Anon: shows preview list/calendar + upgrade CTA (not a dead-end)
 * - Paid+Authed: shows real data list/calendar
 *
 * NOTE:
 * - Removed ALL demo profile display content (both views) per request.
 */

const VIEW_KEY = "urecruit_calendar_view";
const VIEW_LIST = "list";
const VIEW_CAL = "calendar";

function CalendarPage() {
  const navigate = useNavigate();

  // IMPORTANT: require auth for paid
  const { mode, currentYear, accountId } = useSeasonAccess();
  const authed = !!accountId;

  // If mode can be "paid" while not authed, do NOT treat as paid yet.
  const isPaid = mode === "paid" && authed;

  // Hook stays mounted; but we only block UI with loading when truly paid+authed.
  const { athleteProfile, isLoading: identityLoading, isError: identityError, error } = useAthleteIdentity();

  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  // Persisted view mode (default list)
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === VIEW_CAL ? VIEW_CAL : VIEW_LIST;
    } catch {
      return VIEW_LIST;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  // Paid query only when paid+authed+profile present
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: isPaid && !!athleteId
  });

  // Prevent forever-spinner: only block when truly paid+authed.
  const loading = isPaid && (identityLoading || paidQuery.isLoading);
  const isErr = isPaid && (identityError || paidQuery.isError);
  const errObj = error || paidQuery.error;

  const paidCamps = useMemo(() => {
    if (!isPaid) return [];
    const rows = paidQuery.data || [];
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data]);

  // Demo preview data (explicitly labeled preview)
  const demoCamps = useMemo(() => buildDemoPreviewCamps(), []);

  const camps = isPaid ? paidCamps : demoCamps;

  const scheduleItems = useMemo(() => {
    const filtered = isPaid
      ? camps.filter(
          (c) =>
            c.intent_status === "favorite" ||
            c.intent_status === "registered" ||
            c.intent_status === "completed"
        )
      : camps;

    return sortCampsByStartDate(filtered);
  }, [camps, isPaid]);

  const calendarEvents = useMemo(() => {
    return buildEventsFromCamps(scheduleItems, { includeMultiDay: true });
  }, [scheduleItems]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isErr) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-20">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load Calendar</div>
          <div className="text-xs mt-2 break-words">{String(errObj?.message || errObj)}</div>
          <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Discover"))}>
            Back to Discover
          </Button>
        </Card>
        <BottomNav />
      </div>
    );
  }

  const badgeText = isPaid ? `Current ${currentYear}` : "Demo";
  const badgeClass = isPaid ? "bg-emerald-600 text-white" : "bg-slate-900 text-white";

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Sticky header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
              <Badge className={badgeClass}>{badgeText}</Badge>
            </div>
          </div>

          {/* Toggle */}
          <SegmentedToggle
            value={viewMode}
            onChange={setViewMode}
            left={{ value: VIEW_LIST, label: "List" }}
            right={{ value: VIEW_CAL, label: "Calendar" }}
          />

          <div className="text-sm text-slate-600">
            {viewMode === VIEW_LIST
              ? "Find what’s next fast. Switch to Calendar when you want to see conflicts."
              : "See timing and overlaps. Use List to quickly find specific camps."}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {viewMode === VIEW_LIST ? (
          <ListView
            isPaid={isPaid}
            items={scheduleItems}
            onGoDiscover={() => navigate(createPageUrl("Discover"))}
          />
        ) : (
          <CalendarView events={calendarEvents} />
        )}

        {/* Demo upsell (secondary) */}
        {!isPaid && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">Upgrade to unlock your real schedule</div>
                <div className="text-sm text-amber-900/80 mt-1">
                  Overlay your own favorites + registrations and flag conflicts automatically.
                </div>
                <div className="mt-3">
                  <Button
                    className="w-full"
                    onClick={() => navigate(createPageUrl("Subscribe") + `?source=calendar_demo`)}
                  >
                    See Plan & Pricing
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function SegmentedToggle({ value, onChange, left, right }) {
  return (
    <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
      <button
        type="button"
        onClick={() => onChange(left.value)}
        className={[
          "flex-1 rounded-lg py-2 text-sm font-semibold transition",
          value === left.value ? "bg-white shadow-sm text-deep-navy" : "text-slate-600 hover:text-slate-800"
        ].join(" ")}
      >
        {left.label}
      </button>
      <button
        type="button"
        onClick={() => onChange(right.value)}
        className={[
          "flex-1 rounded-lg py-2 text-sm font-semibold transition",
          value === right.value ? "bg-white shadow-sm text-deep-navy" : "text-slate-600 hover:text-slate-800"
        ].join(" ")}
      >
        {right.label}
      </button>
    </div>
  );
}

/* ------------------------
   LIST VIEW
------------------------ */
function ListView({ isPaid, items, onGoDiscover }) {
  if (!items || items.length === 0) {
    return (
      <Card className="p-4">
        <div className="font-semibold text-deep-navy">
          {isPaid ? "Nothing to schedule yet" : "Preview schedule (demo)"}
        </div>
        <div className="text-sm text-slate-600 mt-1">
          {isPaid
            ? "Favorite or register for camps in Discover to see them here."
            : "This is a preview of how your schedule list will look once you add camps."}
        </div>
        {isPaid && (
          <Button className="w-full mt-4" onClick={onGoDiscover}>
            Go to Discover
          </Button>
        )}
      </Card>
    );
  }

  const { upcoming, later } = groupUpcoming(items);

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map((c) => (
            <CampRow key={stableKey(c)} camp={c} />
          ))}
        </Section>
      )}

      {later.length > 0 && (
        <Section title="Later">
          {later.map((c) => (
            <CampRow key={stableKey(c)} camp={c} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CampRow({ camp }) {
  const status = camp.intent_status || "planned";
  const statusLabel =
    status === "registered"
      ? "Registered"
      : status === "completed"
      ? "Completed"
      : status === "favorite"
      ? "Favorite"
      : "Planned";

  const statusClass =
    status === "registered"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "completed"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : status === "favorite"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  const when = formatDateRange(camp.start_date, camp.end_date);

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-deep-navy truncate">
            {camp.school_name || camp.school || "Unknown School"}
          </div>
          <div className="text-sm text-slate-600 truncate">{camp.camp_name || "Camp"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {[when, [camp.city, camp.state].filter(Boolean).join(", ")].filter(Boolean).join(" • ")}
          </div>
        </div>

        <div className={["text-[11px] px-2 py-1 rounded-full border whitespace-nowrap", statusClass].join(" ")}>
          {statusLabel}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------
   CALENDAR VIEW
------------------------ */
function CalendarView({ events }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-deep-navy">Calendar view</div>
      <div className="text-xs text-slate-500 mt-1">
        Best for spotting overlaps. Use List view to quickly find specific camps.
      </div>

      <div className="mt-3">
        <MonthGrid events={events} />
      </div>
    </Card>
  );
}

function MonthGrid({ events = [] }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const label = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  const days = useMemo(() => buildMonthCells(cursor), [cursor]);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const e of events || []) {
      if (!e?.date) continue;
      const arr = m.get(e.date) || [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  const todayKey = toISODate(new Date());

  return (
    <div className="select-none">
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="px-2" onClick={() => setCursor((d) => addMonths(d, -1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-sm font-semibold text-deep-navy">{label}</div>
        <Button variant="ghost" className="px-2" onClick={() => setCursor((d) => addMonths(d, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mt-2 text-[11px] text-slate-500">
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 mt-1">
        {days.map((cell) => {
          const cellEvents = byDate.get(cell.dateKey) || [];
          const isToday = cell.dateKey === todayKey;

          return (
            <div
              key={cell.dateKey}
              className={[
                "min-h-[58px] rounded-md border p-1",
                cell.inMonth ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100",
                isToday ? "ring-2 ring-amber-300" : ""
              ].join(" ")}
            >
              <div
                className={[
                  "text-[11px] font-semibold",
                  cell.inMonth ? "text-deep-navy" : "text-slate-400"
                ].join(" ")}
              >
                {cell.day}
              </div>

              <div className="mt-1 space-y-1">
                {cellEvents.slice(0, 2).map((e, idx) => (
                  <div
                    key={idx}
                    className={[
                      "text-[10px] leading-tight px-1 py-0.5 rounded border truncate",
                      e.kind === "registered"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : e.kind === "favorite"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    ].join(" ")}
                    title={e.label}
                  >
                    {e.label}
                  </div>
                ))}
                {cellEvents.length > 2 && (
                  <div className="text-[10px] text-slate-500">+{cellEvents.length - 2}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------
   Helpers
------------------------ */
function stableKey(c) {
  return (
    c.camp_id ||
    c.id ||
    `${c.school_name || c.school || "school"}-${c.camp_name || "camp"}-${c.start_date || "na"}`
  );
}

function parseISODate(s) {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function sortCampsByStartDate(items) {
  const copy = [...(items || [])];
  copy.sort((a, b) => {
    const da = parseISODate(a.start_date)?.getTime() ?? Infinity;
    const db = parseISODate(b.start_date)?.getTime() ?? Infinity;
    if (da !== db) return da - db;
    const sa = (a.school_name || a.school || "").toLowerCase();
    const sb = (b.school_name || b.school || "").toLowerCase();
    return sa.localeCompare(sb);
  });
  return copy;
}

function groupUpcoming(items) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() + 30);

  const upcoming = [];
  const later = [];

  for (const c of items || []) {
    const d = parseISODate(c.start_date);
    if (!d) {
      later.push(c);
      continue;
    }
    if (d <= cutoff) upcoming.push(c);
    else later.push(c);
  }
  return { upcoming, later };
}

function formatDateRange(start, end) {
  const ds = parseISODate(start);
  const de = parseISODate(end);

  if (!ds) return "";
  const startLabel = ds.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (!de) return startLabel;

  const endLabel = de.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return startLabel === endLabel ? startLabel : `${startLabel}–${endLabel}`;
}

function buildEventsFromCamps(items, { includeMultiDay = true } = {}) {
  const out = [];
  for (const c of items || []) {
    const kind =
      c.intent_status === "registered" || c.intent_status === "completed"
        ? "registered"
        : c.intent_status === "favorite"
        ? "favorite"
        : "planned";

    const start = parseISODate(c.start_date);
    if (!start) continue;

    const end = parseISODate(c.end_date);

    const label = `${(c.school_name || c.school || "School").toString()}${
      c.camp_name ? ` — ${c.camp_name}` : ""
    }`;

    if (!includeMultiDay || !end || end < start) {
      out.push({ date: toISODate(start), label, kind });
      continue;
    }

    const maxDays = 14;
    let cur = new Date(start);
    let count = 0;
    while (cur <= end && count < maxDays) {
      out.push({ date: toISODate(cur), label, kind });
      cur.setDate(cur.getDate() + 1);
      count += 1;
    }
  }
  return out;
}

function buildDemoPreviewCamps() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const d1 = toISODate(new Date(y, m, 6));
  const d2 = toISODate(new Date(y, m, 12));
  const d3 = toISODate(new Date(y, m, 19));

  return [
    {
      camp_id: "demo-1",
      school_name: "Preview University",
      camp_name: "Elite Skills Camp (Preview)",
      start_date: d1,
      end_date: d1,
      intent_status: "registered",
      city: "Austin",
      state: "TX"
    },
    {
      camp_id: "demo-2",
      school_name: "State Tech",
      camp_name: "Position Session (Preview)",
      start_date: d2,
      end_date: d2,
      intent_status: "favorite",
      city: "Norman",
      state: "OK"
    },
    {
      camp_id: "demo-3",
      school_name: "Metro College",
      camp_name: "Combine Day (Preview)",
      start_date: d3,
      end_date: d3,
      intent_status: "planned",
      city: "Dallas",
      state: "TX"
    }
  ];
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function buildMonthCells(monthStart) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();

  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const gridStart = new Date(year, month, 1 - startDow);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      dateKey: toISODate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month
    });
  }
  return cells;
}

export default function Calendar() {
  /**
   * Policy:
   * - Demo users can view Calendar (preview) without auth.
   * - Paid users MUST complete athlete profile before Calendar.
   */
  return (
    <RouteGuard requireProfile={true}>
      <CalendarPage />
    </RouteGuard>
  );
}