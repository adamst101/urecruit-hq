// src/pages/AdminHQ.jsx
// Admin HQ — Dark operational command center
// Route: /AdminHQ

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminRoute from "../components/auth/AdminRoute";
import IngestStatusPanel from "../components/admin/IngestStatusPanel";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  PAGE_BG:       "#060d18",
  NAV_BG:        "#040910",
  NAV_BORDER:    "#0f1e30",
  NAV_ACTIVE:    "#0d1e35",
  CARD_BG:       "#0b1424",
  CARD_BORDER:   "#162033",
  CARD_BG_HOVER: "#0e1a2e",
  HEADER_BG:     "#040b16",
  HEADER_BORDER: "#0e1d2f",
  TEXT_1:        "#e8edf4",
  TEXT_2:        "#8899aa",
  TEXT_3:        "#4a5a6a",
  ACCENT:        "#e8a020",
  GREEN:         "#22c55e",
  AMBER:         "#f59e0b",
  RED:           "#ef4444",
  BLUE:          "#3b82f6",
  DIVIDER:       "#0e1a28",
};

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "home",       label: "Home",        icon: "🏠" },
  { id: "operations", label: "Operations",  icon: "⚙️" },
  { id: "tickets",    label: "Tickets",     icon: "🎫" },
  { id: "data",       label: "Data",        icon: "🗄" },
  { id: "demo",       label: "Demo / Test", icon: "🧪" },
  { id: "reporting",  label: "Reporting",   icon: "📊" },
  { id: "logs",       label: "Admin Logs",  icon: "📋" },
];

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, accentColor }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 22, fontWeight: 700,
        color: accentColor || T.TEXT_1,
        margin: 0, letterSpacing: 0.3,
      }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 13, color: T.TEXT_2, margin: "6px 0 0", lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function ToolCard({ icon, title, description, onClick, featured, danger, statusChip }) {
  const [hovered, setHovered] = useState(false);
  const borderColor = danger ? T.RED + "55" : (hovered ? T.CARD_BORDER : T.CARD_BORDER);
  const bg = hovered ? T.CARD_BG_HOVER : T.CARD_BG;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg,
        border: `1px solid ${danger ? T.RED + "44" : (featured ? T.ACCENT + "33" : T.CARD_BORDER)}`,
        borderRadius: 12,
        padding: 20,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
      }}
    >
      {statusChip && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          background: T.GREEN + "20", border: `1px solid ${T.GREEN}44`,
          color: T.GREEN, fontSize: 11, fontWeight: 600,
          padding: "2px 8px", borderRadius: 20,
        }}>
          {statusChip}
        </div>
      )}
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: danger ? T.RED : T.TEXT_1 }}>{title}</div>
      <div style={{ fontSize: 12, color: T.TEXT_2, lineHeight: 1.6 }}>{description}</div>
      <div style={{
        fontSize: 12, color: danger ? T.RED : T.ACCENT,
        marginTop: 4, fontWeight: 600,
      }}>
        Open →
      </div>
    </div>
  );
}

function WorkspaceCard({ icon, title, description, bullets, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? T.CARD_BG_HOVER : T.CARD_BG,
        border: `1px solid ${T.CARD_BORDER}`,
        borderRadius: 12,
        padding: 22,
        cursor: "pointer",
        transition: "background 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.TEXT_1 }}>{title}</span>
      </div>
      <p style={{ fontSize: 13, color: T.TEXT_2, margin: 0, lineHeight: 1.5 }}>{description}</p>
      {bullets && (
        <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc" }}>
          {bullets.map(b => (
            <li key={b} style={{ fontSize: 12, color: T.TEXT_3, lineHeight: 1.8 }}>{b}</li>
          ))}
        </ul>
      )}
      <div style={{ textAlign: "right", fontSize: 13, color: T.ACCENT, fontWeight: 600, marginTop: 4 }}>
        Enter →
      </div>
    </div>
  );
}

function StatusCard({ title, status, sub, dotColor, borderColor, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? T.CARD_BG_HOVER : T.CARD_BG,
        border: `1px ${borderColor === "dashed" ? "dashed" : "solid"} ${borderColor === "dashed" ? T.TEXT_3 : borderColor}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: "pointer",
        flex: "1 1 140px",
        minWidth: 140,
        transition: "background 0.15s",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: T.TEXT_1 }}>{status}</span>
      </div>
      <div style={{ fontSize: 11, color: T.TEXT_3 }}>{sub}</div>
    </div>
  );
}

function QueuePanel({ icon, title, placeholder, count, onAction, actionLabel }) {
  return (
    <div style={{
      background: T.CARD_BG,
      border: `1px solid ${T.CARD_BORDER}`,
      borderRadius: 12,
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT_1 }}>{title}</span>
        </div>
        {count > 0 && (
          <span style={{
            background: T.RED, color: "#fff", fontSize: 11, fontWeight: 700,
            borderRadius: 20, padding: "2px 8px",
          }}>{count}</span>
        )}
      </div>
      <div style={{ borderTop: `1px solid ${T.DIVIDER}`, paddingTop: 10 }}>
        <p style={{ fontSize: 12, color: T.TEXT_3, fontStyle: "italic", margin: 0 }}>{placeholder}</p>
      </div>
      <div style={{ textAlign: "right" }}>
        <button
          onClick={onAction}
          style={{
            background: "transparent", border: `1px solid ${T.CARD_BORDER}`,
            color: T.TEXT_2, fontSize: 12, fontWeight: 500,
            borderRadius: 6, padding: "5px 12px", cursor: "pointer",
          }}
        >
          {actionLabel || "View All →"}
        </button>
      </div>
    </div>
  );
}

const ACTIVITY_ROWS = [
  { time: "2m ago",     admin: "admin@urecruithq.com", action: "Ran Health Check",   entity: "Platform",  status: "✓ Passed" },
  { time: "14m ago",    admin: "admin@urecruithq.com", action: "Opened Ticket",      entity: "#1042",     status: "Open" },
  { time: "1h ago",     admin: "admin@urecruithq.com", action: "Seeded Test Data",   entity: "FT Env",    status: "Complete" },
  { time: "3h ago",     admin: "admin@urecruithq.com", action: "Triggered Ingest",   entity: "Football",  status: "In Progress" },
  { time: "Yesterday",  admin: "admin@urecruithq.com", action: "Camp Data Review",   entity: "Schools",   status: "Needs Action" },
];

function ActivityTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["Time", "Admin", "Action", "Entity", "Status"].map(h => (
              <th key={h} style={{
                textAlign: "left", padding: "8px 12px",
                color: T.TEXT_3, fontWeight: 600, fontSize: 11,
                borderBottom: `1px solid ${T.DIVIDER}`,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACTIVITY_ROWS.map((r, i) => (
            <tr key={i} style={{ opacity: 0.75 }}>
              <td style={{ padding: "9px 12px", color: T.TEXT_3, borderBottom: `1px solid ${T.DIVIDER}` }}>{r.time}</td>
              <td style={{ padding: "9px 12px", color: T.TEXT_2, borderBottom: `1px solid ${T.DIVIDER}` }}>{r.admin}</td>
              <td style={{ padding: "9px 12px", color: T.TEXT_2, borderBottom: `1px solid ${T.DIVIDER}` }}>{r.action}</td>
              <td style={{ padding: "9px 12px", color: T.TEXT_1, borderBottom: `1px solid ${T.DIVIDER}` }}>{r.entity}</td>
              <td style={{ padding: "9px 12px", color: T.TEXT_3, borderBottom: `1px solid ${T.DIVIDER}` }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: T.TEXT_3, fontStyle: "italic", marginTop: 10, paddingLeft: 12 }}>
        Live activity logging coming soon.
      </p>
    </div>
  );
}

// ─── HOME SECTION ─────────────────────────────────────────────────────────────

function HomeSection({ nav, setActiveSection }) {
  const env = window.location.hostname === "localhost" ? "LOCAL" : "PRODUCTION";
  const envColor = env === "LOCAL" ? T.GREEN : T.AMBER;
  const [refreshTime] = useState(() => new Date().toLocaleTimeString());

  const statusCards = [
    {
      title: "Platform Health",
      status: "No results yet",
      sub: "Run health check to populate",
      dotColor: T.TEXT_3,
      borderColor: "dashed",
      onClick: () => nav("/AppHealthCheck"),
    },
    {
      title: "Open Tickets",
      status: "—",
      sub: "View ticket queue",
      dotColor: T.TEXT_3,
      borderColor: "dashed",
      onClick: () => nav("/SupportDashboard"),
    },
    {
      title: "Ingest Status",
      status: "—",
      sub: "View sport configs",
      dotColor: T.TEXT_3,
      borderColor: "dashed",
      onClick: () => setActiveSection("operations"),
    },
    {
      title: "Failed Checks",
      status: "—",
      sub: "Run health board",
      dotColor: T.TEXT_3,
      borderColor: "dashed",
      onClick: () => nav("/AppHealthCheck"),
    },
    {
      title: "Demo Environment",
      status: "—",
      sub: "Check test seed",
      dotColor: T.TEXT_3,
      borderColor: "dashed",
      onClick: () => nav("/FunctionalTestEnv"),
    },
    {
      title: "Pending Records",
      status: "—",
      sub: "Review data queue",
      dotColor: T.TEXT_3,
      borderColor: "dashed",
      onClick: () => setActiveSection("data"),
    },
  ];

  const workspaceCards = [
    {
      icon: "⚙️", title: "Operations",
      description: "Platform health, ingest, and background job monitoring.",
      bullets: ["App Health Check", "Ingest Runner", "Sport Config Monitor"],
      onClick: () => setActiveSection("operations"),
    },
    {
      icon: "🎫", title: "Tickets",
      description: "Support queue management, open issues, and escalation.",
      bullets: ["Open Tickets", "Urgent Issues", "Ticket History"],
      onClick: () => nav("/SupportDashboard"),
    },
    {
      icon: "🗄", title: "Data",
      description: "Core data management — camps, schools, users, coaches, and configuration.",
      bullets: ["Camps", "Schools", "Users & Coaches", "Season Config"],
      onClick: () => setActiveSection("data"),
    },
    {
      icon: "🧪", title: "Demo / Test",
      description: "Synthetic data management, demo generators, and environment validation.",
      bullets: ["Functional Test Environment", "Demo Generators", "Environment Diagnostic"],
      onClick: () => setActiveSection("demo"),
    },
    {
      icon: "📊", title: "Reporting",
      description: "Platform metrics, product analytics, and operational KPIs.",
      bullets: ["Product Metrics", "Product Roadmap", "Platform KPIs"],
      onClick: () => setActiveSection("reporting"),
    },
  ];

  const quickActions = [
    { label: "▶ Health Check",  onClick: () => nav("/AppHealthCheck") },
    { label: "🎫 Ticket Queue", onClick: () => nav("/SupportDashboard") },
    { label: "⚡ Run Ingest",   onClick: () => nav("/TestFunctions") },
    { label: "🏆 Sport Configs",onClick: () => nav("/SportIngestConfigManager") },
    { label: "🧪 Test Env",     onClick: () => nav("/FunctionalTestEnv") },
  ];

  return (
    <div>
      {/* Page Header */}
      <div style={{
        background: T.HEADER_BG,
        borderBottom: `1px solid ${T.HEADER_BORDER}`,
        padding: "16px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.TEXT_1, letterSpacing: 0.3 }}>
            Administrators HQ
          </div>
          <div style={{ fontSize: 12, color: T.TEXT_2, marginTop: 3 }}>
            Platform operations, health, support, and data
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{
            background: envColor + "20",
            border: `1px solid ${envColor}44`,
            color: envColor,
            fontSize: 11, fontWeight: 700,
            borderRadius: 20, padding: "3px 10px",
            letterSpacing: "0.06em",
          }}>
            {env}
          </span>
          <span style={{ fontSize: 11, color: T.TEXT_3 }}>
            Last refresh: {refreshTime}
          </span>
          <button
            onClick={() => nav("/AppHealthCheck")}
            style={{
              background: T.ACCENT, color: "#0a0e1a",
              border: "none", borderRadius: 7,
              padding: "7px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ▶ Run Health Check
          </button>
          <button
            onClick={() => nav("/SupportDashboard")}
            style={{
              background: "transparent",
              border: `1px solid ${T.CARD_BORDER}`,
              color: T.TEXT_1,
              borderRadius: 7,
              padding: "7px 16px", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🎫 Tickets
          </button>
        </div>
      </div>

      <div style={{ padding: "28px 28px 48px" }}>

        {/* B. Critical Status Strip */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 12 }}>
            Critical Status
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {statusCards.map(c => (
              <StatusCard key={c.title} {...c} />
            ))}
          </div>
        </div>

        {/* C. Needs Attention — Work Queues */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 12 }}>
            Needs Attention
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            <QueuePanel
              icon="⚠️"
              title="Urgent Tickets"
              placeholder="No urgent tickets"
              count={0}
              actionLabel="View Queue →"
              onAction={() => nav("/SupportDashboard")}
            />
            <QueuePanel
              icon="🔴"
              title="Failed Jobs / Ingest"
              placeholder="No failures detected"
              count={0}
              actionLabel="View Operations →"
              onAction={() => setActiveSection("operations")}
            />
            <QueuePanel
              icon="🧪"
              title="Demo Environment"
              placeholder="Run verification to check"
              count={0}
              actionLabel="Check Env →"
              onAction={() => nav("/FunctionalTestEnv")}
            />
          </div>
        </div>

        {/* D. Quick Actions */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 12 }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {quickActions.map(a => (
              <button
                key={a.label}
                onClick={a.onClick}
                style={{
                  background: "transparent",
                  border: `1px solid ${T.CARD_BORDER}`,
                  color: T.TEXT_1,
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13, fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = T.CARD_BG_HOVER;
                  e.currentTarget.style.borderColor = T.ACCENT + "55";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = T.CARD_BORDER;
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* E. Workspace Cards */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 12 }}>
            Workspaces
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {workspaceCards.map(c => (
              <WorkspaceCard key={c.title} {...c} />
            ))}
          </div>
        </div>

        {/* F. Recent Activity */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 12 }}>
            Recent Activity
          </div>
          <div style={{
            background: T.CARD_BG,
            border: `1px solid ${T.CARD_BORDER}`,
            borderRadius: 12,
            overflow: "hidden",
          }}>
            <ActivityTable />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── OPERATIONS SECTION ───────────────────────────────────────────────────────

function OperationsSection({ nav }) {
  const tools = [
    {
      icon: "🩺", title: "App Health Board",
      description: "Production-pinned release readiness. Run journeys after deploys or data changes.",
      onClick: () => nav("/AppHealthCheck"),
      statusChip: "Production Pinned",
    },
    {
      icon: "🔬", title: "Environment Diagnostic",
      description: "Test current-environment connectivity. Non-production diagnostic tool.",
      onClick: () => nav("/AppHealthCheckDiag"),
    },
    {
      icon: "⚗️", title: "Ingest Runner",
      description: "Auto-batch camp ingestion to completion. Run and monitor ingest progress.",
      onClick: () => nav("/TestFunctions"),
    },
    {
      icon: "🏆", title: "Sport Configs",
      description: "Configure multi-sport ingestion: URLs, keywords, mappings. Seed defaults if empty.",
      onClick: () => nav("/SportIngestConfigManager"),
    },
    {
      icon: "🔍", title: "School Athletics Cleanup",
      description: "Audit and verify school divisions, conferences, and Wikipedia URLs.",
      onClick: () => nav("/SchoolAthleticsCleanup"),
    },
    {
      icon: "📍", title: "Geocode Schools",
      description: "Backfill lat/lng coordinates for distance filtering and travel alerts.",
      onClick: () => nav("/GeocodeSchools"),
    },
  ];

  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <SectionHeader
        title="Operations"
        subtitle="Platform health, ingest monitoring, and background job oversight"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 36 }}>
        {tools.map(t => (
          <ToolCard key={t.title} {...t} />
        ))}
      </div>

      <div style={{
        borderTop: `1px solid ${T.DIVIDER}`,
        paddingTop: 24,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.TEXT_3, marginBottom: 16 }}>
          Ingest Status
        </div>
        <IngestStatusPanel />
      </div>
    </div>
  );
}

// ─── TICKETS SECTION ──────────────────────────────────────────────────────────

function TicketsSection({ nav }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <SectionHeader
        title="Tickets"
        subtitle="Support queue, open issues, and escalation management"
      />

      {/* Primary tile */}
      <div
        onClick={() => nav("/SupportDashboard")}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? T.CARD_BG_HOVER : T.CARD_BG,
          border: `1px solid ${T.ACCENT}44`,
          borderRadius: 12,
          padding: "28px 32px",
          cursor: "pointer",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "background 0.15s",
        }}
      >
        <div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎫</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.TEXT_1, marginBottom: 6 }}>
            Support Dashboard
          </div>
          <div style={{ fontSize: 13, color: T.TEXT_2 }}>
            View, triage, and manage all open support tickets
          </div>
        </div>
        <div style={{
          background: T.ACCENT, color: "#0a0e1a",
          border: "none", borderRadius: 8,
          padding: "10px 22px", fontSize: 14, fontWeight: 700,
          cursor: "pointer",
        }}>
          Open Dashboard →
        </div>
      </div>

      {/* Sub-tools */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 28 }}>
        <ToolCard
          icon="📥"
          title="Open Tickets"
          description="View and triage all open support requests"
          onClick={() => nav("/SupportDashboard")}
        />
        <ToolCard
          icon="💬"
          title="Reply to Ticket"
          description="Respond to an open ticket directly"
          onClick={() => nav("/SupportReply")}
        />
      </div>

      <p style={{ fontSize: 12, color: T.TEXT_3, fontStyle: "italic" }}>
        Ticket queue metrics and smart triage coming soon.
      </p>
    </div>
  );
}

// ─── DATA SECTION ─────────────────────────────────────────────────────────────

function DataSection({ nav }) {
  const tools = [
    { icon: "⛺", title: "Camps",                  description: "Browse, edit, and manage camp records.",                          onClick: () => nav("/CampsManager") },
    { icon: "🏫", title: "Schools",                description: "Browse, edit, and manage school records.",                        onClick: () => nav("/SchoolsManager") },
    { icon: "👥", title: "Users / Athletes",        description: "View all accounts with athletes. Flag accounts for review.",      onClick: () => nav("/AthleteManager") },
    { icon: "🎽", title: "Coaches",                description: "View all coach accounts, roster sizes, invite codes, messages.",  onClick: () => nav("/CoachNetworkAdmin") },
    { icon: "📅", title: "Season Manager",         description: "Create and manage season configs, pricing, sale windows.",        onClick: () => nav("/SeasonManager") },
    { icon: "📧", title: "Communications",         description: "Manage subscriber emails — monthly agendas and camp week alerts.", onClick: () => nav("/MonthlyAgendaAdmin") },
    { icon: "🚫", title: "Block List",             description: "View and manage blocked camp source_keys.",                       onClick: () => nav("/BlockListManager") },
    { icon: "🔗", title: "Host Org Mappings",      description: "Map host_org / Ryzer program names to schools.",                  onClick: () => nav("/HostOrgMappingManager") },
    { icon: "🖼",  title: "Seed School Logos",     description: "Pull Wikidata P154 athletic logos for schools missing a logo.",   onClick: () => nav("/AdminSeedSchoolLogos") },
    { icon: "🌐", title: "Seed Schools Master",    description: "Re-seed the School table from Wikipedia conference member pages.", onClick: () => nav("/AdminSeedSchoolsMaster") },
    { icon: "🔄", title: "Backfill Ryzer Names",   description: "Re-fetch Ryzer pages to fill missing program names and venue data.", onClick: () => nav("/BackfillRyzerProgramName") },
  ];

  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <SectionHeader
        title="Data"
        subtitle="Core data management — camps, schools, users, coaches, and configuration"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {tools.map(t => (
          <ToolCard key={t.title} {...t} />
        ))}
      </div>
    </div>
  );
}

// ─── DEMO / TEST SECTION ──────────────────────────────────────────────────────

function DemoSection({ nav }) {
  const tools = [
    {
      icon: "🧪", title: "Functional Test Environment",
      description: "Seed, verify, and monitor the functional test topology. 2 coaches, 5 families, 6 athletes.",
      onClick: () => nav("/FunctionalTestEnv"),
      featured: true,
    },
    {
      icon: "🎭", title: "Generate Demo Camps",
      description: "Clone current camps with shifted dates for demo data.",
      onClick: () => nav("/GenerateDemoCamps"),
    },
    {
      icon: "🔬", title: "Environment Diagnostic",
      description: "Check current-environment connectivity. Non-production only.",
      onClick: () => nav("/AppHealthCheckDiag"),
    },
    {
      icon: "👤", title: "User Demo Story",
      description: "Preview the user/athlete onboarding demo journey.",
      onClick: () => nav("/DemoStory"),
    },
    {
      icon: "🎽", title: "Coach Demo Story",
      description: "Preview the coach onboarding demo journey.",
      onClick: () => nav("/CoachDemoStory"),
    },
  ];

  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <SectionHeader
        title="Demo / Test"
        subtitle="Synthetic data management, demo generators, and environment validation"
      />

      {/* Warning banner */}
      <div style={{
        background: T.AMBER + "15",
        border: `1px solid ${T.AMBER}44`,
        borderRadius: 10,
        padding: "12px 18px",
        marginBottom: 24,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <span style={{ fontSize: 13, color: T.AMBER, lineHeight: 1.6 }}>
          These tools modify or read synthetic test data. Do not confuse seeded test accounts with real users.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {tools.map(t => (
          <ToolCard key={t.title} {...t} />
        ))}
      </div>
    </div>
  );
}

// ─── REPORTING SECTION ────────────────────────────────────────────────────────

function ReportingSection({ nav }) {
  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <SectionHeader
        title="Reporting"
        subtitle="Platform metrics, product analytics, and operational KPIs"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginBottom: 28 }}>
        <ToolCard
          icon="📊"
          title="Product Metrics"
          description="Phase 1 KPI dashboard — Revenue, Acquisition, Engagement, Support Health."
          onClick={() => nav("/ProductMetrics")}
        />
        <ToolCard
          icon="🗺️"
          title="Product Roadmap"
          description="Track what is being built, why, who owns it, and where it is stuck."
          onClick={() => nav("/ProductRoadmap")}
        />
      </div>

      <p style={{ fontSize: 12, color: T.TEXT_3, fontStyle: "italic" }}>
        Funnel metrics, user adoption reporting, and ingest analytics coming soon.
      </p>
    </div>
  );
}

// ─── ADMIN LOGS SECTION ───────────────────────────────────────────────────────

function LogsSection() {
  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <SectionHeader
        title="Admin Logs"
        subtitle="Recent admin actions, audit trail, and change history"
      />

      <div style={{
        background: T.CARD_BG,
        border: `1px solid ${T.CARD_BORDER}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 20,
      }}>
        <ActivityTable />
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.DIVIDER}` }}>
          <button style={{
            background: "transparent",
            border: `1px solid ${T.CARD_BORDER}`,
            color: T.TEXT_2,
            borderRadius: 6, padding: "6px 16px",
            fontSize: 12, cursor: "pointer",
          }}>
            Load more...
          </button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: T.TEXT_3, fontStyle: "italic", lineHeight: 1.6 }}>
        Full audit log persistence and filtering coming soon. Admin actions are currently tracked in application logs.
      </p>
    </div>
  );
}

// ─── RESTRICTED SECTION ───────────────────────────────────────────────────────

function RestrictedSection({ nav }) {
  return (
    <div style={{ padding: "28px 28px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: T.RED, margin: 0 }}>Restricted</h2>
      </div>
      <p style={{ fontSize: 13, color: T.TEXT_2, margin: "0 0 24px", lineHeight: 1.5 }}>
        Infrequent, risky, or destructive utilities. Proceed with caution.
      </p>

      {/* Red warning banner */}
      <div style={{
        background: T.RED + "15",
        border: `1px solid ${T.RED}44`,
        borderRadius: 10,
        padding: "12px 18px",
        marginBottom: 28,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🛑</span>
        <span style={{ fontSize: 13, color: T.RED, lineHeight: 1.6 }}>
          These tools can cause irreversible data changes. Only use when you know exactly what you are doing.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        <ToolCard
          icon="💣"
          title="Factory Reset"
          description="Wipe all data and reset the app to a clean state. Destructive and irreversible."
          onClick={() => nav("/AdminFactoryReset")}
          danger
        />
      </div>
    </div>
  );
}

// ─── ROOT COMPONENT ───────────────────────────────────────────────────────────

export default function AdminHQ() {
  const nav = useNavigate();
  const [activeSection, setActiveSection] = useState("home");

  function renderSection() {
    switch (activeSection) {
      case "home":       return <HomeSection nav={nav} setActiveSection={setActiveSection} />;
      case "operations": return <OperationsSection nav={nav} />;
      case "tickets":    return <TicketsSection nav={nav} />;
      case "data":       return <DataSection nav={nav} />;
      case "demo":       return <DemoSection nav={nav} />;
      case "reporting":  return <ReportingSection nav={nav} />;
      case "logs":       return <LogsSection />;
      case "restricted": return <RestrictedSection nav={nav} />;
      default:           return <HomeSection nav={nav} setActiveSection={setActiveSection} />;
    }
  }

  return (
    <AdminRoute>
      <div style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: T.PAGE_BG,
        fontFamily: "Inter, system-ui, sans-serif",
        color: T.TEXT_1,
      }}>

        {/* ── Left Navigation ─────────────────────────────────────────────── */}
        <div style={{
          width: 220,
          flexShrink: 0,
          background: T.NAV_BG,
          borderRight: `1px solid ${T.NAV_BORDER}`,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflowY: "auto",
        }}>
          {/* Logo area */}
          <div style={{
            padding: "20px 16px 16px",
            borderBottom: `1px solid ${T.NAV_BORDER}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ACCENT, letterSpacing: 0.5 }}>
              Admin HQ
            </div>
            <div style={{ fontSize: 10, color: T.TEXT_3, marginTop: 3, letterSpacing: "0.08em" }}>
              COMMAND CENTER
            </div>
          </div>

          {/* Nav items */}
          <nav style={{ padding: "12px 10px", flex: 1 }}>
            {NAV_ITEMS.map(item => {
              const isActive = activeSection === item.id;
              return (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  onClick={() => setActiveSection(item.id)}
                />
              );
            })}

            {/* Divider */}
            <div style={{
              borderTop: `1px solid ${T.NAV_BORDER}`,
              margin: "10px 6px",
            }} />

            {/* Restricted item */}
            <NavItemRestricted
              isActive={activeSection === "restricted"}
              onClick={() => setActiveSection("restricted")}
            />
          </nav>

          {/* Nav footer */}
          <div style={{
            padding: "14px 16px",
            borderTop: `1px solid ${T.NAV_BORDER}`,
          }}>
            <button
              onClick={() => nav("/AdminOps")}
              style={{
                background: "transparent", border: "none",
                color: T.TEXT_3, fontSize: 12, cursor: "pointer",
                padding: 0, display: "block", marginBottom: 6,
              }}
            >
              ← Admin Ops
            </button>
            <div style={{ fontSize: 11, color: T.TEXT_3, letterSpacing: "0.04em" }}>
              Admin HQ v2
            </div>
          </div>
        </div>

        {/* ── Content Area ────────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          background: T.PAGE_BG,
        }}>
          {renderSection()}
        </div>

      </div>
    </AdminRoute>
  );
}

// ─── Nav item sub-components (defined after root to avoid hoisting issues) ────

function NavItem({ item, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "10px 16px",
        borderRadius: 8,
        border: isActive ? `1px solid transparent` : "1px solid transparent",
        borderLeft: isActive ? `3px solid ${T.ACCENT}` : "3px solid transparent",
        background: isActive ? T.CARD_BG : (hovered ? T.NAV_ACTIVE : "transparent"),
        color: isActive ? T.TEXT_1 : T.TEXT_2,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s, color 0.12s",
        marginBottom: 2,
        paddingLeft: isActive ? 13 : 16,
      }}
    >
      <span style={{ fontSize: 15 }}>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
}

function NavItemRestricted({ isActive, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "10px 16px",
        borderRadius: 8,
        border: "1px solid transparent",
        borderLeft: isActive ? `3px solid ${T.RED}` : "3px solid transparent",
        background: isActive ? T.CARD_BG : (hovered ? T.NAV_ACTIVE : "transparent"),
        color: T.RED,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
        marginBottom: 2,
        paddingLeft: isActive ? 13 : 16,
      }}
    >
      <span style={{ fontSize: 15 }}>🔒</span>
      <span>Restricted</span>
    </button>
  );
}
