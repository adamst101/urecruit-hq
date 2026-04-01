// src/pages/FunctionalTestEnv.jsx
// Admin Ops page — Functional Test Environment
// Seed, verify, and monitor the functional test dataset.

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";
import {
  SEED_VERSION,
  SEED_PREFIX,
  verifyTopology,
  seedTopology,
  resetTopology,
  discoverSeeds,
} from "../lib/ftEnvService";

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_LAST_SEEDED  = "__hc_ft_lastSeeded";
const LS_LAST_VERIFIED = "__hc_ft_lastVerified";
const LS_SEED_VERSION  = "__hc_ft_seedVersion";

function lsGet(key) {
  try { return localStorage.getItem(key) || null; } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

// ---------------------------------------------------------------------------
// Scenario metadata
// ---------------------------------------------------------------------------

const SCENARIO_META = [
  { key: "multiAthleteHousehold",    icon: "👨‍👩‍👦", label: "Multi-athlete household"       },
  { key: "athleteTiedToCoach1Only",  icon: "🎽", label: "Athlete → Coach 1 only"          },
  { key: "athleteTiedToCoach2Only",  icon: "🎽", label: "Athlete → Coach 2 only"          },
  { key: "athleteTiedToBothCoaches", icon: "🔀", label: "Athlete → both coaches"           },
  { key: "highTractionAthlete",      icon: "🔥", label: "High-traction athlete (≥4 acts)"  },
  { key: "moderateTractionAthlete",  icon: "📈", label: "Moderate-traction (≥2 acts)"      },
  { key: "campFocusedAthlete",       icon: "⛺", label: "Camp-focused athlete"             },
  { key: "sparseDataAthlete",        icon: "🌫️", label: "Sparse-data athlete (0 acts)"     },
];

// Quick-launch destinations
const QUICK_LINKS = [
  { label: "🎽 Coach Demo",   route: "/CoachDemoStory"  },
  { label: "👤 User Demo",    route: "/DemoStory"        },
  { label: "🔍 Discover",     route: "/Discover?demo=user" },
  { label: "📋 Coach HQ",     route: "/CoachDashboard"  },
  { label: "🏠 Workspace",    route: "/Workspace"        },
  { label: "🩺 Health Check", route: "/AppHealthCheck"  },
];

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------
function fmtTs(iso) {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FunctionalTestEnv() {
  const nav = useNavigate();

  const [status,       setStatus]       = useState("unknown");
  const [seedData,     setSeedData]     = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [actionLog,    setActionLog]    = useState([]);
  const [lastSeeded,   setLastSeeded]   = useState(() => lsGet(LS_LAST_SEEDED));
  const [lastVerified, setLastVerified] = useState(() => lsGet(LS_LAST_VERIFIED));
  const [running,      setRunning]      = useState(null); // "seed"|"reset"|"verify"|"discover"
  const [notesOpen,    setNotesOpen]    = useState(true);

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    setActionLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 20));
  }, []);

  // -------------------------------------------------------------------------
  // discoverSeeds — populate status from live data
  // -------------------------------------------------------------------------
  const handleDiscover = useCallback(async () => {
    setRunning("discover");
    setLoading(true);
    try {
      const found = await discoverSeeds(base44);
      setSeedData({
        coaches:    found.coaches,
        athletes:   found.athletes,
        rosters:    found.rosters,
        activities: found.activities,
        meta: null,
      });

      // Infer a rough status from counts
      const total = found.coaches.length + found.athletes.length +
                    found.rosters.length + found.activities.length;
      if (total === 0) {
        setStatus("missing");
        addLog("Discover: no seed records found — dataset not seeded");
      } else if (
        found.coaches.length === 2 &&
        found.athletes.length === 6 &&
        found.rosters.length === 6 &&
        found.activities.length === 15
      ) {
        setStatus("ready");
        addLog(`Discover: full dataset present (${total} records)`);
      } else {
        setStatus("partial");
        addLog(`Discover: partial dataset — coaches=${found.coaches.length} athletes=${found.athletes.length} rosters=${found.rosters.length} activities=${found.activities.length}`);
      }
    } catch (err) {
      setStatus("broken");
      addLog(`Discover ERROR: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setRunning(null);
    }
  }, [addLog]);

  // On mount — auto-discover
  useEffect(() => {
    handleDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Seed
  // -------------------------------------------------------------------------
  const handleSeed = useCallback(async () => {
    if (!window.confirm(
      "This will write synthetic test records (prefix __hc_ft_) to the current environment.\n\nProceed?"
    )) return;

    setRunning("seed");
    setLoading(true);
    addLog("Seeding topology…");
    try {
      const result = await seedTopology(base44);
      setSeedData(result);
      setStatus("ready");
      const ts = new Date().toISOString();
      lsSet(LS_LAST_SEEDED,  ts);
      lsSet(LS_SEED_VERSION, SEED_VERSION);
      setLastSeeded(ts);
      addLog(`Seed complete — ${result.meta.totalRecords} records created (v${SEED_VERSION})`);
    } catch (err) {
      setStatus("broken");
      addLog(`Seed ERROR: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setRunning(null);
    }
  }, [addLog]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  const handleReset = useCallback(async () => {
    if (!window.confirm(
      "RESET & RESEED will DELETE all existing __hc_ft_ seed records and recreate them.\n\nThis is destructive. Proceed?"
    )) return;

    setRunning("reset");
    setLoading(true);
    addLog("Resetting topology (delete + reseed)…");
    try {
      const result = await resetTopology(base44);
      setSeedData(result);
      setStatus("ready");
      const ts = new Date().toISOString();
      lsSet(LS_LAST_SEEDED,  ts);
      lsSet(LS_SEED_VERSION, SEED_VERSION);
      setLastSeeded(ts);
      setVerifyResult(null);
      addLog(`Reset complete — ${result.meta.totalRecords} records recreated (v${SEED_VERSION})`);
    } catch (err) {
      setStatus("broken");
      addLog(`Reset ERROR: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setRunning(null);
    }
  }, [addLog]);

  // -------------------------------------------------------------------------
  // Verify
  // -------------------------------------------------------------------------
  const handleVerify = useCallback(async () => {
    setRunning("verify");
    setLoading(true);
    addLog("Running verification…");
    try {
      const result = await verifyTopology(base44);
      setVerifyResult(result);
      setStatus(result.status);
      const ts = new Date().toISOString();
      lsSet(LS_LAST_VERIFIED, ts);
      setLastVerified(ts);
      addLog(`Verify complete — status=${result.status} errors=${result.errors.length} warnings=${result.warnings.length}`);
    } catch (err) {
      setStatus("broken");
      addLog(`Verify ERROR: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setRunning(null);
    }
  }, [addLog]);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const statusConfig = {
    ready:   { label: "READY",   bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
    partial: { label: "PARTIAL", bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
    missing: { label: "MISSING", bg: "#F3F4F6", color: "#374151", border: "#D1D5DB" },
    broken:  { label: "BROKEN",  bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
    unknown: { label: "UNKNOWN", bg: "#F3F4F6", color: "#6B7280", border: "#D1D5DB" },
  };
  const sc = statusConfig[status] || statusConfig.unknown;

  const counts = seedData
    ? {
        coaches:    seedData.coaches?.length    ?? 0,
        athletes:   seedData.athletes?.length   ?? 0,
        rosters:    seedData.rosters?.length    ?? 0,
        activities: seedData.activities?.length ?? 0,
      }
    : { coaches: 0, athletes: 0, rosters: 0, activities: 0 };

  // Helpers to find athlete activity count and roster info
  const actCountForAthlete = (athleteId) =>
    (seedData?.activities || []).filter(a => a.athlete_id === athleteId).length;

  const rostersForAthlete = (athleteId) =>
    (seedData?.rosters || []).filter(r => r.athlete_id === athleteId);

  const hayesCoach  = seedData?.coaches?.find(c => c.last_name === "Hayes");
  const riveraCoach = seedData?.coaches?.find(c => c.last_name === "Rivera");

  // Athlete display rows
  const ATHLETE_ROWS = [
    { firstName: "__hc_ft_Tyler",  lastName: "Johnson",  family: "family1", grad: 2026, pos: "QB",  scenario: "High traction · Coach 1 only"   },
    { firstName: "__hc_ft_Marcus", lastName: "Johnson",  family: "family1", grad: 2027, pos: "WR",  scenario: "Multi-household · Coach 2 only"  },
    { firstName: "__hc_ft_Sofia",  lastName: "Martinez", family: "family2", grad: 2026, pos: "DB",  scenario: "High traction · Both coaches"    },
    { firstName: "__hc_ft_Jamal",  lastName: "Williams", family: "family3", grad: 2026, pos: "RB",  scenario: "Camp-focused · Coach 1 only"     },
    { firstName: "__hc_ft_Aisha",  lastName: "Davis",    family: "family4", grad: 2027, pos: "LB",  scenario: "Moderate · Coach 2 only"         },
    { firstName: "__hc_ft_Devon",  lastName: "Brown",    family: "family5", grad: 2028, pos: "OL",  scenario: "Sparse — no coach, 0 acts"       },
  ];

  const findAthleteRecord = (firstName, lastName, family) =>
    (seedData?.athletes || []).find(
      a => a.first_name === firstName &&
           a.last_name  === lastName  &&
           a.account_id === `__hc_ft_${family}`
    );

  // Verify result badge
  const verifyBadge = verifyResult
    ? verifyResult.errors.length > 0
      ? { label: "FAIL",    bg: "#FEE2E2", color: "#991B1B" }
      : verifyResult.warnings.length > 0
        ? { label: "WARNING", bg: "#FEF3C7", color: "#92400E" }
        : { label: "PASS",    bg: "#D1FAE5", color: "#065F46" }
    : null;

  const isRunning = running !== null;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function Badge({ label, bg, color, border }) {
    return (
      <span style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        background: bg,
        color,
        border: `1px solid ${border || color + "44"}`,
      }}>
        {label}
      </span>
    );
  }

  function ActionBtn({ label, onClick, disabled, danger, running: isThisRunning }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: "9px 18px",
          borderRadius: 8,
          border: danger ? "1px solid #FCA5A5" : "1px solid #D1D5DB",
          background: disabled
            ? "#F9FAFB"
            : danger
              ? "#FEF2F2"
              : "#FFFFFF",
          color: disabled
            ? "#9CA3AF"
            : danger
              ? "#B91C1C"
              : "#0B1F3B",
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background 0.12s, border-color 0.12s",
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => {
          if (!disabled) {
            e.currentTarget.style.background = danger ? "#FEE2E2" : "#F0F4FF";
          }
        }}
        onMouseLeave={e => {
          if (!disabled) {
            e.currentTarget.style.background = danger ? "#FEF2F2" : "#FFFFFF";
          }
        }}
      >
        {isThisRunning ? "⏳" : null}
        {label}
      </button>
    );
  }

  function SectionCard({ title, children, collapsible, open, onToggle }) {
    return (
      <div style={styles.card}>
        <div
          style={{
            ...styles.cardHeader,
            cursor: collapsible ? "pointer" : "default",
          }}
          onClick={collapsible ? onToggle : undefined}
        >
          <span style={styles.cardTitle}>{title}</span>
          {collapsible && (
            <span style={{ color: "#9CA3AF", fontSize: 14 }}>
              {open ? "▲" : "▼"}
            </span>
          )}
        </div>
        {(!collapsible || open) && (
          <div style={styles.cardBody}>{children}</div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AdminRoute>
      <div style={styles.root}>
        {/* Page Header */}
        <div style={styles.header}>
          <button
            onClick={() => nav("/AdminOps")}
            style={styles.backBtn}
          >
            ← Admin Ops
          </button>
          <div style={styles.title}>🧪 Functional Test Environment</div>
          <div style={styles.subtitle}>
            Seed and verify the functional test dataset. Confirm coach/athlete topology and journey coverage.
          </div>
        </div>

        <div style={styles.content}>

          {/* ── Section 1: Environment Status Header ── */}
          <div style={{ ...styles.card, borderColor: sc.border, background: "#FFFFFF" }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Environment Status</span>
            </div>
            <div style={styles.cardBody}>
              <div style={styles.statusRow}>

                <div style={styles.statusItem}>
                  <div style={styles.statusLabel}>Dataset Status</div>
                  <Badge label={sc.label} bg={sc.bg} color={sc.color} border={sc.border} />
                </div>

                <div style={styles.statusItem}>
                  <div style={styles.statusLabel}>Seed Version</div>
                  <div style={styles.statusValue}>{SEED_VERSION}</div>
                </div>

                <div style={styles.statusItem}>
                  <div style={styles.statusLabel}>Last Seeded</div>
                  <div style={styles.statusValue}>{fmtTs(lastSeeded)}</div>
                </div>

                <div style={styles.statusItem}>
                  <div style={styles.statusLabel}>Last Verified</div>
                  <div style={styles.statusValue}>{fmtTs(lastVerified)}</div>
                </div>

                {verifyBadge && (
                  <div style={styles.statusItem}>
                    <div style={styles.statusLabel}>Verification</div>
                    <Badge label={verifyBadge.label} bg={verifyBadge.bg} color={verifyBadge.color} />
                  </div>
                )}
              </div>

              {/* Record counts row */}
              <div style={{ ...styles.statusRow, marginTop: 16, paddingTop: 14, borderTop: "1px solid #F3F4F6" }}>
                {[
                  { label: "Coaches",    val: counts.coaches,    exp: 2  },
                  { label: "Athletes",   val: counts.athletes,   exp: 6  },
                  { label: "Rosters",    val: counts.rosters,    exp: 6  },
                  { label: "Activities", val: counts.activities, exp: 15 },
                ].map(({ label, val, exp }) => (
                  <div key={label} style={styles.countTile}>
                    <div style={{
                      ...styles.countNum,
                      color: val === exp ? "#065F46" : val === 0 ? "#9CA3AF" : "#92400E",
                    }}>
                      {val}
                      <span style={{ fontSize: 11, fontWeight: 400, color: "#9CA3AF", marginLeft: 2 }}>
                        /{exp}
                      </span>
                    </div>
                    <div style={styles.countLabel}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 2: Action Bar ── */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Actions</span>
            </div>
            <div style={styles.cardBody}>
              {/* Caution banner */}
              <div style={styles.cautionBanner}>
                ⚠ Caution: seeding writes to the currently connected environment. Seeded records use the
                prefix <code style={styles.code}>{SEED_PREFIX}</code> and can be identified and removed at any time.
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <ActionBtn
                  label="⚡ Seed Dataset"
                  onClick={handleSeed}
                  disabled={isRunning}
                  running={running === "seed"}
                />
                <ActionBtn
                  label="🔄 Reset &amp; Reseed"
                  onClick={handleReset}
                  disabled={isRunning}
                  running={running === "reset"}
                  danger
                />
                <ActionBtn
                  label="✓ Run Verification"
                  onClick={handleVerify}
                  disabled={isRunning}
                  running={running === "verify"}
                />
                <ActionBtn
                  label="↺ Refresh Status"
                  onClick={handleDiscover}
                  disabled={isRunning}
                  running={running === "discover"}
                />
              </div>

              {isRunning && (
                <div style={styles.runningBanner}>
                  ⏳ Running: <strong>{running}</strong>…
                </div>
              )}
            </div>
          </div>

          {/* ── Section 3: Status Notes / Warnings ── */}
          <SectionCard
            title="Status Notes &amp; Warnings"
            collapsible
            open={notesOpen}
            onToggle={() => setNotesOpen(v => !v)}
          >
            {actionLog.length === 0 && !verifyResult ? (
              <div style={{ color: "#9CA3AF", fontSize: 13 }}>No issues detected.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {actionLog.length > 0 && (
                  <div>
                    <div style={styles.notesGroupLabel}>Action Log</div>
                    <div style={styles.logBox}>
                      {actionLog.map((entry, i) => (
                        <div key={i} style={styles.logEntry}>{entry}</div>
                      ))}
                    </div>
                  </div>
                )}

                {verifyResult?.errors?.length > 0 && (
                  <div>
                    <div style={{ ...styles.notesGroupLabel, color: "#B91C1C" }}>Errors</div>
                    {verifyResult.errors.map((e, i) => (
                      <div key={i} style={{ ...styles.noteItem, background: "#FEE2E2", color: "#991B1B", borderLeft: "3px solid #F87171" }}>
                        ✗ {e}
                      </div>
                    ))}
                  </div>
                )}

                {verifyResult?.warnings?.length > 0 && (
                  <div>
                    <div style={{ ...styles.notesGroupLabel, color: "#B45309" }}>Warnings</div>
                    {verifyResult.warnings.map((w, i) => (
                      <div key={i} style={{ ...styles.noteItem, background: "#FEF3C7", color: "#92400E", borderLeft: "3px solid #FCD34D" }}>
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                )}

                {verifyResult?.notes?.length > 0 && (
                  <div>
                    <div style={styles.notesGroupLabel}>Verification Notes</div>
                    {verifyResult.notes.map((n, i) => (
                      <div key={i} style={{ ...styles.noteItem, background: "#F0FDF4", color: "#166534", borderLeft: "3px solid #6EE7B7" }}>
                        ✓ {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ── Section 4: Seeded Account Matrix ── */}
          <SectionCard title="Seeded Account Matrix">
            {/* Table A — Coaches */}
            <div style={styles.tableTitle}>Coaches</div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Invite Code</th>
                    <th style={styles.th}>School / Org</th>
                    <th style={styles.th}>Sport</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Roster Links</th>
                  </tr>
                </thead>
                <tbody>
                  {seedData?.coaches?.length ? seedData.coaches.map((c, i) => {
                    const rosterCount = (seedData.rosters || []).filter(r => r.coach_id === c.id).length;
                    return (
                      <tr key={c.id || i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={styles.td}>{c.first_name?.replace(SEED_PREFIX, "")} {c.last_name}</td>
                        <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 11 }}>{c.invite_code}</td>
                        <td style={styles.td}>{c.school_or_org}</td>
                        <td style={styles.td}>{c.sport}</td>
                        <td style={styles.td}>
                          <Badge
                            label={c.status || "—"}
                            bg={c.status === "approved" ? "#D1FAE5" : "#F3F4F6"}
                            color={c.status === "approved" ? "#065F46" : "#6B7280"}
                          />
                        </td>
                        <td style={{ ...styles.td, textAlign: "center" }}>{rosterCount}</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} style={{ ...styles.td, color: "#9CA3AF", textAlign: "center" }}>
                        Not seeded — run "Seed Dataset" to populate
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table B — Family Accounts */}
            <div style={{ ...styles.tableTitle, marginTop: 24 }}>Family Accounts</div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    <th style={styles.th}>Account ID</th>
                    <th style={styles.th}>Athletes</th>
                    <th style={styles.th}>Login Context</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: "__hc_ft_family1", note: "Multi-athlete household — Tyler + Marcus" },
                    { id: "__hc_ft_family2", note: "Single athlete — Sofia" },
                    { id: "__hc_ft_family3", note: "Single athlete — Jamal" },
                    { id: "__hc_ft_family4", note: "Single athlete — Aisha" },
                    { id: "__hc_ft_family5", note: "Single athlete — Devon (sparse)" },
                  ].map((fam, i) => {
                    const famAthletes = (seedData?.athletes || []).filter(a => a.account_id === fam.id);
                    return (
                      <tr key={fam.id} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 11 }}>{fam.id}</td>
                        <td style={styles.td}>
                          {famAthletes.length > 0
                            ? famAthletes.map(a => `${a.first_name?.replace(SEED_PREFIX, "")} ${a.last_name}`).join(", ")
                            : <span style={{ color: "#9CA3AF" }}>—</span>
                          }
                        </td>
                        <td style={{ ...styles.td, color: "#6B7280", fontSize: 12 }}>{fam.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── Section 5: Relationship Matrix ── */}
          <SectionCard title="Relationship Matrix">
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    <th style={styles.th}>Athlete</th>
                    <th style={styles.th}>Grad</th>
                    <th style={styles.th}>Family</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>Coach Hayes</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>Coach Rivera</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>Acts</th>
                    <th style={styles.th}>Scenario</th>
                  </tr>
                </thead>
                <tbody>
                  {ATHLETE_ROWS.map((row, i) => {
                    const rec = findAthleteRecord(row.firstName, row.lastName, row.family);
                    const actCount = rec ? actCountForAthlete(rec.id) : 0;
                    const rosters  = rec ? rostersForAthlete(rec.id)  : [];
                    const hasHayes  = hayesCoach  && rosters.some(r => r.coach_id === hayesCoach.id);
                    const hasRivera = riveraCoach && rosters.some(r => r.coach_id === riveraCoach.id);
                    const displayName = `${row.firstName.replace(SEED_PREFIX, "")} ${row.lastName}`;

                    return (
                      <tr key={row.firstName} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={styles.td}>
                          <strong>{displayName}</strong>
                          <span style={{ marginLeft: 6, color: "#9CA3AF", fontSize: 11 }}>{row.pos}</span>
                        </td>
                        <td style={styles.td}>{row.grad}</td>
                        <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 11 }}>
                          {`__hc_ft_${row.family}`}
                        </td>
                        <td style={{ ...styles.td, textAlign: "center" }}>
                          {!rec
                            ? <span style={{ color: "#D1D5DB" }}>—</span>
                            : hasHayes
                              ? <span style={{ color: "#065F46", fontWeight: 700 }}>✓</span>
                              : <span style={{ color: "#D1D5DB" }}>—</span>
                          }
                        </td>
                        <td style={{ ...styles.td, textAlign: "center" }}>
                          {!rec
                            ? <span style={{ color: "#D1D5DB" }}>—</span>
                            : hasRivera
                              ? <span style={{ color: "#065F46", fontWeight: 700 }}>✓</span>
                              : <span style={{ color: "#D1D5DB" }}>—</span>
                          }
                        </td>
                        <td style={{ ...styles.td, textAlign: "center" }}>
                          <span style={{
                            fontWeight: 700,
                            color: actCount >= 4 ? "#065F46"
                              : actCount >= 2 ? "#1D4ED8"
                              : actCount === 0 ? "#9CA3AF"
                              : "#374151",
                          }}>
                            {actCount}
                          </span>
                        </td>
                        <td style={{ ...styles.td, fontSize: 11, color: "#6B7280" }}>{row.scenario}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── Section 6: Scenario Coverage Summary ── */}
          <SectionCard title="Scenario Coverage Summary">
            <div style={styles.scenarioGrid}>
              {SCENARIO_META.map(s => {
                const value = verifyResult?.scenarios?.[s.key];
                const state = verifyResult
                  ? (value ? "pass" : "fail")
                  : "unknown";

                const cfg = {
                  pass:    { label: "✓ Present", bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
                  fail:    { label: "✗ Missing", bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
                  unknown: { label: "? Unknown", bg: "#F3F4F6", color: "#6B7280", border: "#D1D5DB" },
                }[state];

                return (
                  <div key={s.key} style={styles.scenarioCard}>
                    <div style={styles.scenarioIcon}>{s.icon}</div>
                    <div style={styles.scenarioLabel}>{s.label}</div>
                    <Badge label={cfg.label} bg={cfg.bg} color={cfg.color} border={cfg.border} />
                  </div>
                );
              })}
            </div>
            {!verifyResult && (
              <div style={{ marginTop: 14, fontSize: 12, color: "#9CA3AF" }}>
                Run "✓ Run Verification" to check scenario coverage.
              </div>
            )}
          </SectionCard>

          {/* ── Section 7: Health Check Link ── */}
          <SectionCard title="Health Check &amp; Diagnostics">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={styles.linkRow}>
                <button
                  style={styles.linkBtn}
                  onClick={() => nav("/AppHealthCheck")}
                >
                  → Open Production Health Board
                </button>
                <button
                  style={styles.linkBtn}
                  onClick={() => nav("/AppHealthCheckDiag")}
                >
                  → Open Environment Diagnostic
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                Run the health board after seeding to confirm full journey coverage. The health check
                tests auth, entity writes, and user journeys independently of this seed dataset.
              </div>
            </div>
          </SectionCard>

          {/* ── Section 8: Quick Test Launch ── */}
          <SectionCard title="Quick Test Launch">
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>
              Navigation shortcuts — these open pages in the current session. Not login helpers.
            </div>
            <div style={styles.quickGrid}>
              {QUICK_LINKS.map(link => (
                <button
                  key={link.route}
                  style={styles.quickBtn}
                  onClick={() => nav(link.route)}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "#EEF2FF";
                    e.currentTarget.style.borderColor = "#6366F1";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "#FFFFFF";
                    e.currentTarget.style.borderColor = "#E5E7EB";
                  }}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </SectionCard>

        </div>
      </div>
    </AdminRoute>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    background: "#FFFFFF",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#6B7280",
    fontSize: 13,
    cursor: "pointer",
    padding: "0 0 8px",
    fontFamily: "inherit",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#0B1F3B",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  content: {
    padding: "24px 32px",
    maxWidth: 1100,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  cardHeader: {
    padding: "14px 20px",
    borderBottom: "1px solid #F3F4F6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0B1F3B",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  cardBody: {
    padding: "16px 20px",
  },
  statusRow: {
    display: "flex",
    gap: 32,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  statusItem: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0B1F3B",
  },
  countTile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    minWidth: 70,
  },
  countNum: {
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1,
  },
  countLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  cautionBanner: {
    background: "#FFFBEB",
    border: "1px solid #FCD34D",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 12,
    color: "#92400E",
    lineHeight: 1.6,
  },
  code: {
    background: "#FEF3C7",
    borderRadius: 3,
    padding: "1px 4px",
    fontFamily: "monospace",
    fontSize: 11,
  },
  runningBanner: {
    marginTop: 12,
    padding: "8px 14px",
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    borderRadius: 6,
    fontSize: 13,
    color: "#1D4ED8",
  },
  notesGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6,
  },
  logBox: {
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    padding: "8px 12px",
    maxHeight: 180,
    overflowY: "auto",
  },
  logEntry: {
    fontSize: 12,
    color: "#374151",
    fontFamily: "monospace",
    lineHeight: 1.8,
    borderBottom: "1px solid #F3F4F6",
  },
  noteItem: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 4,
    marginBottom: 4,
    lineHeight: 1.5,
  },
  tableTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  thead: {
    background: "#F9FAFB",
  },
  th: {
    padding: "9px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "9px 12px",
    borderBottom: "1px solid #F3F4F6",
    color: "#111827",
    fontSize: 13,
    verticalAlign: "middle",
  },
  trEven: { background: "#FFFFFF" },
  trOdd:  { background: "#FAFAFA" },
  scenarioGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
  },
  scenarioCard: {
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  scenarioIcon: {
    fontSize: 20,
  },
  scenarioLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    lineHeight: 1.4,
  },
  linkRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  linkBtn: {
    padding: "8px 16px",
    background: "#FFFFFF",
    border: "1px solid #D1D5DB",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    color: "#1a4e6b",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.12s",
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 10,
  },
  quickBtn: {
    padding: "10px 14px",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#0B1F3B",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.12s, border-color 0.12s",
    textAlign: "center",
  },
};
