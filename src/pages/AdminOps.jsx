// src/pages/AdminOps.jsx
import { useNavigate } from "react-router-dom";
import IngestStatusPanel from "../components/admin/IngestStatusPanel";
import AdminRoute from "../components/auth/AdminRoute";

const TOOLS = [
  {
    section: "Data Managers",
    items: [
      {
        title: "Schools Manager",
        description: "Browse, edit, and delete School records. Filter by division, audit status, conference. Inline cell editing.",
        route: "/SchoolsManager",
        icon: "🏫",
        color: "#1a4e6b",
      },
      {
        title: "Camps Manager",
        description: "Browse, edit, and delete Camp records. Filter by source, status, state. Fix school links and review flagged camps.",
        route: "/CampsManager",
        icon: "⛺",
        color: "#1a6b3a",
      },
    ],
  },
  {
    section: "Ingestion & Enrichment",
    items: [
      {
        title: "School Athletics Cleanup",
        description: "Audit and verify school divisions, conferences, nicknames and Wikipedia URLs.",
        route: "/SchoolAthleticsCleanup",
        icon: "🔍",
        color: "#4a3d8f",
      },
      {
        title: "Seed School Logos",
        description: "Pull Wikidata P154 athletic logos for all schools missing a logo.",
        route: "/AdminSeedSchoolLogos",
        icon: "🖼",
        color: "#6b3d1a",
      },
      {
        title: "Seed Schools Master",
        description: "Re-seed the School table from Wikipedia NCAA/NAIA conference member pages.",
        route: "/AdminSeedSchoolsMaster",
        icon: "🌐",
        color: "#1a6b5a",
      },
      {
        title: "Ingest Runner",
        description: "Auto-batch ingestCampsUSA to completion. Run full ingest with progress tracking.",
        route: "/TestFunctions",
        icon: "⚗️",
        color: "#3a5a6b",
      },
      {
        title: "Generate Demo Camps",
        description: "Clone current camps with shifted dates to create prior-season demo data.",
        route: "/GenerateDemoCamps",
        icon: "🎭",
        color: "#5a3a6b",
      },
      {
        title: "Block List",
        description: "View and manage blocked camp source_keys. Blocked camps are never re-ingested.",
        route: "/BlockListManager",
        icon: "🚫",
        color: "#6b1a3a",
      },
      {
        title: "Sport Configs",
        description: "Configure multi-sport ingestion: URLs, keywords, mappings, blocklists. Test and toggle sports.",
        route: "/SportIngestConfigManager",
        icon: "🏆",
        color: "#6b4e1a",
      },
      {
        title: "Host Org Mappings",
        description: "Map host_org / Ryzer program names to schools. Auto-links camps during ingestion.",
        route: "/HostOrgMappingManager",
        icon: "🔗",
        color: "#1a4e6b",
      },
      {
        title: "Backfill Ryzer Program Names",
        description: "Re-fetch Ryzer pages to fill missing ryzer_program_name, venue, and fix city data on existing camps.",
        route: "/BackfillRyzerProgramName",
        icon: "🔄",
        color: "#3a6b1a",
      },
      {
        title: "Geocode Schools",
        description: "Backfill lat/lng coordinates on School records for accurate distance filtering. Uses Census Geocoding API.",
        route: "/GeocodeSchools",
        icon: "📍",
        color: "#1a6b3a",
      },
    ],
  },
  {
    section: "Subscription & Athletes",
    items: [
      {
        title: "Season Manager",
        description: "Create and manage season configs. Dynamic pricing, sale windows, access dates. Zero code changes needed.",
        route: "/SeasonManager",
        icon: "📅",
        color: "#1a6b5a",
      },
      {
        title: "Athletes",
        description: "View all accounts with athletes. Flag accounts with 3+ athletes for review.",
        route: "/AthleteManager",
        icon: "👥",
        color: "#4a3d8f",
      },
    ],
  },
  {
    section: "Support",
    items: [
      {
        title: "Support Tickets",
        description: "View, triage, and respond to user support tickets, feedback, and feature requests.",
        route: "/SupportDashboard",
        icon: "🎫",
        color: "#e8a020",
      },
    ],
  },
  {
    section: "Danger Zone",
    items: [
      {
        title: "Factory Reset",
        description: "Wipe all data and reset the app to a clean state. Destructive and irreversible.",
        route: "/AdminFactoryReset",
        icon: "💣",
        color: "#6b1a1a",
        danger: true,
      },
    ],
  },
];

export default function AdminOps() {
  const nav = useNavigate();

  return (
    <AdminRoute>
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>Admin</div>
        <div style={styles.subtitle}>Tools and data managers</div>
      </div>

      <div style={styles.content}>
        <div style={{ marginBottom: 28 }}>
          <IngestStatusPanel />
        </div>
        {TOOLS.map(section => (
          <div key={section.section} style={styles.section}>
            <div style={styles.sectionLabel}>{section.section}</div>
            <div style={styles.grid}>
              {section.items.map(tool => (
                <button
                  key={tool.route}
                  style={{
                    ...styles.tile,
                    borderColor: tool.color + "55",
                    ...(tool.danger ? styles.dangerTile : {}),
                  }}
                  onClick={() => nav(tool.route)}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = tool.color + "11";
                    e.currentTarget.style.borderColor = tool.color + "66";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = tool.danger ? "#FEF2F2" : "#FFFFFF";
                    e.currentTarget.style.borderColor = "#E5E7EB";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                  }}
                >
                  <div style={styles.tileIcon}>{tool.icon}</div>
                  <div style={{ ...styles.tileTitle, color: tool.color }}>
                    {tool.title}
                  </div>
                  <div style={styles.tileDesc}>{tool.description}</div>
                  <div style={{ ...styles.tileArrow, color: tool.color + "88" }}>→</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    </AdminRoute>
  );
}

const styles = {
  root: {
    background: "#F3F4F6",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#111827",
  },
  header: {
    padding: "28px 32px 16px",
    borderBottom: "1px solid #E5E7EB",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: "#0B1F3B",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  content: {
    padding: "24px 32px",
    maxWidth: 1100,
  },
  section: {
    marginBottom: 36,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#6B7280",
    marginBottom: 14,
    paddingBottom: 6,
    borderBottom: "1px solid #E5E7EB",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 14,
  },
  tile: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: "20px 22px",
    textAlign: "left",
    cursor: "pointer",
    transition: "background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    position: "relative",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  dangerTile: {
    background: "#FEF2F2",
  },
  tileIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  tileDesc: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 1.6,
    marginTop: 2,
  },
  tileArrow: {
    fontSize: 18,
    position: "absolute",
    bottom: 18,
    right: 20,
  },
};