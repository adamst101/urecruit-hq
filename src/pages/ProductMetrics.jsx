// src/pages/ProductMetrics.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell, PieChart, Pie, Legend,
} from "recharts";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import AdminRoute from "../components/auth/AdminRoute";

// ── helpers ──────────────────────────────────────────────
function monthKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${String(week).padStart(2, "0")} ${d.getFullYear()}`;
}

function last(n, arr) {
  return arr.slice(-n);
}

function fmt$(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n, d) {
  if (!d) return "—";
  return ((n / d) * 100).toFixed(1) + "%";
}

const CHART_COLORS = ["#e8a020", "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#6b7280"];
const TOOLTIP_STYLE = { background: "#111827", border: "1px solid #1f2937", borderRadius: 8, color: "#f9fafb", fontSize: 12 };
const TOOLTIP_ITEM_STYLE = { color: "#f9fafb" };
const TOOLTIP_LABEL_STYLE = { color: "#9ca3af" };

function StatCard({ label, value, sub, color = "#f9fafb" }) {
  return (
    <Card className="p-4 border-[#1f2937] bg-[#111827]">
      <div className={`text-2xl font-bold`} style={{ color }}>{value}</div>
      <div className="text-xs text-[#6b7280] mt-0.5">{label}</div>
      {sub && <div className="text-xs text-[#4b5563] mt-1">{sub}</div>}
    </Card>
  );
}

function SectionHeader({ title }) {
  return (
    <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-widest mt-8 mb-3">
      {title}
    </h2>
  );
}

// ── main component ────────────────────────────────────────
export default function ProductMetrics() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lastLoaded, setLastLoaded] = useState(null);

  const [entitlements, setEntitlements] = useState([]);
  const [campIntents,  setCampIntents]  = useState([]);
  const [tickets,      setTickets]      = useState([]);
  const [events,       setEvents]       = useState([]);
  const [athletes,     setAthletes]     = useState([]);
  const [pageEvents,   setPageEvents]   = useState([]);

  async function loadAll() {
    setLoading(true);
    const [ents, intents, tix, evts, aths, pgEvts] = await Promise.all([
      base44.entities.Entitlement.filter({}).catch(() => []),
      base44.entities.CampIntent.filter({}).catch(() => []),
      base44.entities.SupportTicket.filter({}).catch(() => []),
      base44.entities.Event.filter({ event_type: "purchase_completed" }).catch(() => []),
      base44.entities.Athlete.filter({}).catch(() => []),
      base44.entities.Event.filter({}).catch(() => []),
    ]);
    setEntitlements(Array.isArray(ents) ? ents : []);
    setCampIntents(Array.isArray(intents) ? intents : []);
    setTickets(Array.isArray(tix) ? tix : []);
    setEvents(Array.isArray(evts) ? evts : []);
    setAthletes(Array.isArray(aths) ? aths : []);
    setPageEvents(Array.isArray(pgEvts) ? pgEvts : []);
    setLastLoaded(new Date());
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  // ── Revenue metrics ───────────────────────────────────
  const revenueMetrics = useMemo(() => {
    const active = entitlements.filter((e) => e.status === "active");
    const totalRevenue = entitlements.reduce((s, e) => s + (Number(e.amount_paid) || 0), 0);
    const uniqueAccounts = new Set(active.map((e) => e.account_id).filter(Boolean)).size;
    const arpu = uniqueAccounts ? totalRevenue / uniqueAccounts : 0;

    // Revenue by month
    const byMonth = {};
    for (const e of entitlements) {
      const key = monthKey(e.starts_at || e.created_date);
      if (!key) continue;
      byMonth[key] = (byMonth[key] || 0) + (Number(e.amount_paid) || 0);
    }
    const monthlyData = last(8, Object.entries(byMonth).sort().map(([month, revenue]) => ({
      month: month.slice(5), // "MM"
      revenue,
    })));

    // Current month revenue
    const currentMonth = monthKey(new Date().toISOString());
    const mrr = byMonth[currentMonth] || 0;

    // Primary vs add-on breakdown
    const primaryRev = entitlements.filter((e) => e.is_primary).reduce((s, e) => s + (Number(e.amount_paid) || 0), 0);
    const addonRev = entitlements.filter((e) => !e.is_primary).reduce((s, e) => s + (Number(e.amount_paid) || 0), 0);

    return { totalRevenue, mrr, arpu, uniqueAccounts, monthlyData, primaryRev, addonRev };
  }, [entitlements]);

  // ── Acquisition metrics ───────────────────────────────
  const acquisitionMetrics = useMemo(() => {
    const totalPaid = new Set(
      entitlements.filter((e) => e.status === "active").map((e) => e.account_id).filter(Boolean)
    ).size;

    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    const monthAgo = new Date(now - 30 * 86400000);

    const recentEntitlements = entitlements.filter((e) => {
      const d = new Date(e.starts_at || e.created_date);
      return !isNaN(d) && d >= monthAgo;
    });

    const thisWeek = entitlements.filter((e) => {
      const d = new Date(e.starts_at || e.created_date);
      return !isNaN(d) && d >= weekAgo;
    }).length;

    // Conversions by week (last 10 weeks)
    const byWeek = {};
    for (const e of entitlements) {
      const key = weekKey(e.starts_at || e.created_date);
      if (!key) continue;
      byWeek[key] = (byWeek[key] || 0) + 1;
    }
    const weeklyData = last(10, Object.entries(byWeek).sort().map(([week, count]) => ({ week: week.split(" ")[0], count })));

    // By season year
    const bySeason = {};
    for (const e of entitlements) {
      const k = e.season_year || "Unknown";
      bySeason[k] = (bySeason[k] || 0) + 1;
    }
    const seasonData = Object.entries(bySeason).sort().map(([season, count]) => ({ season: String(season), count }));

    return { totalPaid, thisWeek, thisMonth: recentEntitlements.length, weeklyData, seasonData };
  }, [entitlements]);

  // ── Engagement metrics ────────────────────────────────
  const engagementMetrics = useMemo(() => {
    const favorites    = campIntents.filter((c) => c.status === "favorite");
    const registered   = campIntents.filter((c) => c.status === "registered" || c.status === "completed");
    const totalActive  = campIntents.filter((c) => c.status !== "removed");

    const uniqueAthletes = new Set(totalActive.map((c) => c.athlete_id).filter(Boolean)).size;
    const avgCampsPerAthlete = uniqueAthletes ? (totalActive.length / uniqueAthletes).toFixed(1) : 0;

    // Status breakdown for pie chart
    const statusBreakdown = [
      { name: "Favorites",    value: favorites.length },
      { name: "Registered",   value: registered.length },
      { name: "Completed",    value: campIntents.filter((c) => c.status === "completed").length },
    ].filter((d) => d.value > 0);

    // Activity over time (by updated_date month)
    const byMonth = {};
    for (const c of totalActive) {
      const key = monthKey(c.updated_date);
      if (!key) continue;
      byMonth[key] = (byMonth[key] || 0) + 1;
    }
    const monthlyActivity = last(8, Object.entries(byMonth).sort().map(([month, count]) => ({
      month: month.slice(5), count,
    })));

    return { totalFavorites: favorites.length, totalRegistered: registered.length, uniqueAthletes, avgCampsPerAthlete, statusBreakdown, monthlyActivity };
  }, [campIntents]);

  // ── Support metrics ───────────────────────────────────
  const supportMetrics = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);

    const open       = tickets.filter((t) => t.status === "open").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const resolved   = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
    const thisWeek   = tickets.filter((t) => new Date(t.created_date) >= weekAgo).length;

    const resolutionRate = tickets.length ? ((resolved / tickets.length) * 100).toFixed(1) : 0;

    // By type
    const typeMap = { support: 0, bug: 0, feedback: 0, feature_request: 0 };
    for (const t of tickets) typeMap[t.type] = (typeMap[t.type] || 0) + 1;
    const typeData = [
      { name: "Support",  value: typeMap.support },
      { name: "Bug",      value: typeMap.bug },
      { name: "Feedback", value: typeMap.feedback },
      { name: "Feature",  value: typeMap.feature_request },
    ].filter((d) => d.value > 0);

    // Volume by week
    const byWeek = {};
    for (const t of tickets) {
      const key = weekKey(t.created_date);
      if (!key) continue;
      byWeek[key] = (byWeek[key] || 0) + 1;
    }
    const weeklyVolume = last(8, Object.entries(byWeek).sort().map(([week, count]) => ({
      week: week.split(" ")[0], count,
    })));

    // Avg resolution time (resolved_at - created_date) in hours
    const resolved_tix = tickets.filter((t) => t.resolved_at && t.created_date);
    const avgResHours = resolved_tix.length
      ? (resolved_tix.reduce((s, t) => s + (new Date(t.resolved_at) - new Date(t.created_date)) / 3600000, 0) / resolved_tix.length).toFixed(1)
      : null;

    return { open, inProgress, resolved, thisWeek, resolutionRate, typeData, weeklyVolume, avgResHours, total: tickets.length };
  }, [tickets]);

  // ── Activation funnel ─────────────────────────────────
  const activationMetrics = useMemo(() => {
    // Paid account IDs
    const paidAccountIds = new Set(
      entitlements.filter((e) => e.status === "active").map((e) => e.account_id).filter(Boolean)
    );
    const paidCount = paidAccountIds.size;

    // Accounts that have at least one athlete profile
    const accountsWithProfile = new Set(
      athletes.map((a) => a.account_id).filter((id) => paidAccountIds.has(id))
    ).size;

    // Accounts that have at least one favorite (via athlete_id → account_id lookup)
    const athleteToAccount = {};
    for (const a of athletes) {
      if (a.id && a.account_id) athleteToAccount[a.id] = a.account_id;
    }
    const accountsWithFavorite = new Set(
      campIntents
        .filter((c) => c.status === "favorite" || c.status === "registered" || c.status === "completed")
        .map((c) => athleteToAccount[c.athlete_id])
        .filter((id) => id && paidAccountIds.has(id))
    ).size;

    const accountsWithRegistered = new Set(
      campIntents
        .filter((c) => c.status === "registered" || c.status === "completed")
        .map((c) => athleteToAccount[c.athlete_id])
        .filter((id) => id && paidAccountIds.has(id))
    ).size;

    const funnelSteps = [
      { label: "Paid Accounts", value: paidCount, pct: 100 },
      { label: "Profile Created", value: accountsWithProfile, pct: paidCount ? +((accountsWithProfile / paidCount) * 100).toFixed(1) : 0 },
      { label: "Camp Favorited", value: accountsWithFavorite, pct: paidCount ? +((accountsWithFavorite / paidCount) * 100).toFixed(1) : 0 },
      { label: "Camp Registered", value: accountsWithRegistered, pct: paidCount ? +((accountsWithRegistered / paidCount) * 100).toFixed(1) : 0 },
    ];

    return { paidCount, accountsWithProfile, accountsWithFavorite, accountsWithRegistered, funnelSteps };
  }, [entitlements, athletes, campIntents]);

  // ── Page engagement ───────────────────────────────────
  const pageEngagement = useMemo(() => {
    const PAGE_EVENTS = [
      { type: "workspace_viewed",    label: "Workspace" },
      { type: "discover_loaded",     label: "Discover" },
      { type: "my_camps_viewed",     label: "My Camps" },
      { type: "calendar_viewed",     label: "Calendar" },
      { type: "playbook_viewed",     label: "The Playbook" },
      { type: "profile_viewed",      label: "Profile" },
      { type: "camp_favorite_toggled", label: "Favorites" },
      { type: "profile_saved",       label: "Profile Saves" },
    ];

    const countByType = {};
    for (const e of pageEvents) countByType[e.event_type] = (countByType[e.event_type] || 0) + 1;

    const pageData = PAGE_EVENTS
      .map(({ type, label }) => ({ label, count: countByType[type] || 0 }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);

    // Playbook topic breakdown
    const topicCounts = {};
    for (const e of pageEvents) {
      if (e.event_type === "playbook_topic_viewed") {
        let topic = "unknown";
        try { topic = JSON.parse(e.payload_json || "{}").topic || "unknown"; } catch {}
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }
    const topicData = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);

    // WAU / MAU from page-level events
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    const monthAgo = new Date(now - 30 * 86400000);
    const pageEventTypes = new Set(PAGE_EVENTS.map((p) => p.type));
    const wauEvents = pageEvents.filter((e) => pageEventTypes.has(e.event_type) && new Date(e.ts || e.start_date) >= weekAgo);
    const mauEvents = pageEvents.filter((e) => pageEventTypes.has(e.event_type) && new Date(e.ts || e.start_date) >= monthAgo);

    return { pageData, topicData, wauSessions: wauEvents.length, mauSessions: mauEvents.length };
  }, [pageEvents]);

  // ── render ────────────────────────────────────────────
  return (
    <AdminRoute>
      <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
        <div className="max-w-6xl mx-auto px-4 pt-6">

          {/* Header */}
          <button
            type="button"
            onClick={() => nav("/AdminOps")}
            className="mb-3 text-sm font-medium text-[#e8a020] hover:text-[#f3b13f] flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Admin Ops
          </button>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Product Metrics</h1>
              {lastLoaded && (
                <div className="text-xs text-[#4b5563] mt-0.5">
                  Last loaded {lastLoaded.toLocaleTimeString()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1f2937] text-xs text-[#9ca3af] hover:text-[#f9fafb] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <div className="text-[#6b7280] text-sm py-20 text-center">Loading metrics...</div>
          ) : (
            <>
              {/* ── REVENUE ─────────────────────────────── */}
              <SectionHeader title="Revenue" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Revenue" value={fmt$(revenueMetrics.totalRevenue)} color="#e8a020" />
                <StatCard label="This Month" value={fmt$(revenueMetrics.mrr)} color="#f9fafb" />
                <StatCard label="ARPU" value={fmt$(revenueMetrics.arpu)} sub="per active account" />
                <StatCard label="Paid Accounts" value={revenueMetrics.uniqueAccounts} color="#22c55e" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Revenue by Month</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={revenueMetrics.monthlyData} barSize={20}>
                      <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => "$" + v} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmt$(v), "Revenue"]} />
                      <Bar dataKey="revenue" fill="#e8a020" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Pass Type Breakdown</div>
                  <div className="space-y-3 mt-4">
                    {[
                      { label: "Primary Passes", value: revenueMetrics.primaryRev, color: "#e8a020" },
                      { label: "Add-on Passes", value: revenueMetrics.addonRev, color: "#3b82f6" },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color }} className="font-medium">{label}</span>
                          <span className="text-[#9ca3af]">{fmt$(value)}</span>
                        </div>
                        <div className="h-2 bg-[#1f2937] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: revenueMetrics.totalRevenue ? `${(value / revenueMetrics.totalRevenue) * 100}%` : "0%", background: color }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#1f2937]">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#6b7280]">Revenue by season year</span>
                      </div>
                      {revenueMetrics.monthlyData.length === 0 && (
                        <div className="text-xs text-[#4b5563] mt-2">No data yet</div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>

              {/* ── ACQUISITION ─────────────────────────── */}
              <SectionHeader title="Acquisition" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Paid Users" value={acquisitionMetrics.totalPaid} color="#e8a020" />
                <StatCard label="New This Week" value={acquisitionMetrics.thisWeek} color="#22c55e" />
                <StatCard label="New This Month" value={acquisitionMetrics.thisMonth} color="#f9fafb" />
                <StatCard label="Seasons Active" value={acquisitionMetrics.seasonData.length} sub="distinct season years" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">New Purchases by Week</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={acquisitionMetrics.weeklyData} barSize={18}>
                      <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Purchases"]} />
                      <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Purchases by Season Year</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={acquisitionMetrics.seasonData} barSize={32}>
                      <XAxis dataKey="season" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Purchases"]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {acquisitionMetrics.seasonData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* ── ENGAGEMENT ──────────────────────────── */}
              <SectionHeader title="Engagement" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Favorites" value={engagementMetrics.totalFavorites.toLocaleString()} color="#e8a020" />
                <StatCard label="Total Registered" value={engagementMetrics.totalRegistered.toLocaleString()} color="#22c55e" />
                <StatCard label="Active Athletes" value={engagementMetrics.uniqueAthletes} sub="with ≥1 camp saved" />
                <StatCard label="Avg Camps / Athlete" value={engagementMetrics.avgCampsPerAthlete} color="#f9fafb" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Camp Activity by Month</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={engagementMetrics.monthlyActivity}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Actions"]} />
                      <Line type="monotone" dataKey="count" stroke="#e8a020" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Intent Status Breakdown</div>
                  {engagementMetrics.statusBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={engagementMetrics.statusBreakdown}
                          cx="50%" cy="50%" outerRadius={60}
                          dataKey="value" nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {engagementMetrics.statusBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-[#4b5563] py-10 text-center">No camp data yet</div>
                  )}
                </Card>
              </div>

              {/* ── SUPPORT HEALTH ───────────────────────── */}
              <SectionHeader title="Support Health" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Open Tickets" value={supportMetrics.open} color={supportMetrics.open > 5 ? "#ef4444" : "#f9fafb"} />
                <StatCard label="In Progress" value={supportMetrics.inProgress} color="#e8a020" />
                <StatCard label="New This Week" value={supportMetrics.thisWeek} color="#f9fafb" />
                <StatCard
                  label="Resolution Rate"
                  value={`${supportMetrics.resolutionRate}%`}
                  color="#22c55e"
                  sub={supportMetrics.avgResHours ? `Avg ${supportMetrics.avgResHours}h to resolve` : undefined}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Ticket Volume by Week</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={supportMetrics.weeklyVolume} barSize={18}>
                      <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Tickets"]} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card className="p-4 border-[#1f2937] bg-[#111827]">
                  <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Ticket Type Breakdown</div>
                  {supportMetrics.typeData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={120}>
                        <PieChart>
                          <Pie data={supportMetrics.typeData} cx="50%" cy="50%" outerRadius={50} dataKey="value" nameKey="name">
                            {supportMetrics.typeData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1">
                        {supportMetrics.typeData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
                            <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            {d.name} ({d.value})
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-[#4b5563] py-10 text-center">No tickets yet</div>
                  )}
                </Card>
              </div>

              {/* ── ACTIVATION FUNNEL ───────────────────── */}
              <SectionHeader title="Activation Funnel" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {activationMetrics.funnelSteps.map((step, i) => (
                  <StatCard
                    key={step.label}
                    label={step.label}
                    value={step.value}
                    sub={i > 0 ? `${step.pct}% of paid` : undefined}
                    color={i === 0 ? "#e8a020" : step.pct >= 60 ? "#22c55e" : step.pct >= 30 ? "#f9fafb" : "#ef4444"}
                  />
                ))}
              </div>
              <Card className="p-4 border-[#1f2937] bg-[#111827] mb-2">
                <div className="text-xs text-[#6b7280] mb-4 font-semibold uppercase tracking-wide">Funnel Drop-off</div>
                <div className="space-y-3">
                  {activationMetrics.funnelSteps.map((step, i) => (
                    <div key={step.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#9ca3af]">{step.label}</span>
                        <span className="text-[#f9fafb] font-medium">{step.value} <span className="text-[#6b7280]">({step.pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-[#1f2937] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${step.pct}%`,
                            background: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ── PAGE ENGAGEMENT ──────────────────────── */}
              <SectionHeader title="Page Engagement" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Sessions (7d)" value={pageEngagement.wauSessions} color="#e8a020" sub="page-level events" />
                <StatCard label="Sessions (30d)" value={pageEngagement.mauSessions} color="#f9fafb" sub="page-level events" />
                <StatCard label="Playbook Topics Tracked" value={pageEngagement.topicData.length} sub="topics with views" />
                <StatCard label="Total Page Events" value={pageEvents.length.toLocaleString()} color="#6b7280" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                {pageEngagement.pageData.length > 0 ? (
                  <Card className="p-4 border-[#1f2937] bg-[#111827]">
                    <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Page Views by Type</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={pageEngagement.pageData} layout="vertical" barSize={14}>
                        <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v) => [v, "Views"]} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {pageEngagement.pageData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                ) : (
                  <Card className="p-4 border-[#1f2937] bg-[#111827] flex items-center justify-center">
                    <div className="text-xs text-[#4b5563]">Page tracking events will appear here once users visit instrumented pages.</div>
                  </Card>
                )}
                {pageEngagement.topicData.length > 0 ? (
                  <Card className="p-4 border-[#1f2937] bg-[#111827]">
                    <div className="text-xs text-[#6b7280] mb-3 font-semibold uppercase tracking-wide">Playbook Topic Views</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={pageEngagement.topicData} layout="vertical" barSize={14}>
                        <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="topic" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v) => [v, "Views"]} />
                        <Bar dataKey="count" fill="#e8a020" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                ) : (
                  <Card className="p-4 border-[#1f2937] bg-[#111827] flex items-center justify-center">
                    <div className="text-xs text-[#4b5563]">Playbook topic tracking will appear here once users open The Playbook.</div>
                  </Card>
                )}
              </div>

              <div className="mt-6 text-xs text-[#374151] text-center pb-4">
                Phase 1+2 metrics — Entitlement, CampIntent, SupportTicket, Athlete, and Event tables.
                WAU/MAU counts are session events; user-level deduplication requires account_id on events (Phase 3).
              </div>
            </>
          )}
        </div>
      </div>
    </AdminRoute>
  );
}
