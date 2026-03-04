// src/pages/AdminOps.jsx
import { useNavigate } from "react-router-dom";

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
        title: "Admin Import",
        description: "Import data from CSV or external sources into entities.",
        route: "/AdminImport",
        icon: "📥",
        color: "#4a4a1a",
      },
      {
        title: "Test Functions",
        description: "Run and test backend functions manually with custom parameters.",
        route: "/TestFunctions",
        icon: "⚗️",
        color: "#3a5a6b",
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
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>Admin</div>
        <div style={styles.subtitle}>Tools and data managers</div>
      </div>

      <div style={styles.content}>
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
                    e.currentTarget.style.background = tool.color + "22";
                    e.currentTarget.style.borderColor = tool.color + "99";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = tool.danger ? "#1a0a0a" : "#0d1a28";
                    e.currentTarget.style.borderColor = tool.color + "55";
                    e.currentTarget.style.transform = "translateY(0)";
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
  );
}

const styles = {
  root: {
    background: "#080e18",
    minHeight: "100vh",
    fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
    color: "#c8d8f0",
  },
  header: {
    padding: "28px 32px 16px",
    borderBottom: "1px solid #1a2535",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: "#e8f4ff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: "#4a6080",
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
    color: "#3a5070",
    marginBottom: 14,
    paddingBottom: 6,
    borderBottom: "1px solid #111d2a",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 14,
  },
  tile: {
    background: "#0d1a28",
    border: "1px solid #1e3048",
    borderRadius: 10,
    padding: "20px 22px",
    textAlign: "left",
    cursor: "pointer",
    transition: "background 0.15s, border-color 0.15s, transform 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    position: "relative",
  },
  dangerTile: {
    background: "#1a0a0a",
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
    color: "#4a6080",
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