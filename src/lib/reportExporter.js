// src/lib/reportExporter.js
// Generates print-ready HTML documents and opens a browser print window.
// Uses the browser's native Save as PDF capability — no external PDF library needed.

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(str) {
  return (str || "Report")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}

// ── Shared print stylesheet ───────────────────────────────────────────────────
const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { margin: 0.65in; size: letter portrait; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    background: white;
    line-height: 1.55;
  }

  /* ── Report header ── */
  .rpt-header {
    background: #0a0e1a;
    color: white;
    padding: 20pt 24pt;
    margin: -0.65in -0.65in 20pt;
    display: flex;
    gap: 14pt;
    align-items: flex-start;
  }
  .rpt-accent-bar {
    width: 4pt; background: #e8a020;
    border-radius: 2pt; flex-shrink: 0;
    align-self: stretch;
  }
  .rpt-header-label {
    font-size: 7.5pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: #e8a020; margin-bottom: 4pt;
  }
  .rpt-header-name {
    font-size: 24pt; font-weight: 700; color: white;
    line-height: 1.1; margin-bottom: 5pt;
  }
  .rpt-header-meta { font-size: 9.5pt; color: #94a3b8; line-height: 1.7; }

  /* ── Section headings ── */
  h2 {
    font-size: 12pt; font-weight: 700; color: #0a0e1a;
    margin: 18pt 0 6pt;
    border-bottom: 1.5pt solid #e8a020;
    padding-bottom: 3pt;
  }
  h3 {
    font-size: 10.5pt; font-weight: 700; color: #1a1a1a;
    margin: 13pt 0 4pt;
  }

  /* ── Narrative block ── */
  .narrative {
    background: #f8fafc;
    border-left: 3pt solid #e8a020;
    padding: 9pt 13pt;
    margin: 0 0 14pt;
    font-size: 10.5pt; color: #1e293b; line-height: 1.65;
    page-break-inside: avoid;
  }

  /* ── Snapshot tiles ── */
  .snap-grid {
    display: grid;
    gap: 7pt;
    margin: 0 0 14pt;
  }
  .snap-grid-4 { grid-template-columns: repeat(4, 1fr); }
  .snap-grid-6 { grid-template-columns: repeat(6, 1fr); }
  .snap-tile {
    background: #f8fafc; border: 1pt solid #e2e8f0;
    border-radius: 5pt; padding: 9pt 6pt; text-align: center;
    page-break-inside: avoid;
  }
  .snap-tile .val { font-size: 20pt; font-weight: 700; color: #0a0e1a; line-height: 1; }
  .snap-tile .lbl { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-top: 3pt; }

  /* ── Meta bar ── */
  .meta-bar {
    display: flex; gap: 18pt; flex-wrap: wrap;
    background: #f8fafc; border: 1pt solid #e2e8f0;
    border-radius: 5pt; padding: 8pt 12pt;
    margin: 0 0 14pt;
  }
  .meta-item .mi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; }
  .meta-item .mi-value { font-size: 9.5pt; font-weight: 600; color: #1a1a1a; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin: 0 0 14pt; font-size: 9pt; }
  thead tr { page-break-inside: avoid; }
  tr { page-break-inside: avoid; }
  th {
    background: #f1f5f9;
    text-align: left; padding: 6pt 7pt;
    font-size: 7pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: #4b5563;
    border-bottom: 1.5pt solid #cbd5e1;
  }
  td { padding: 5.5pt 7pt; border-bottom: 0.75pt solid #e2e8f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .muted { color: #9ca3af; }
  .note  { font-size: 8.5pt; color: #6b7280; }

  /* ── Empty states ── */
  .empty-state { color: #9ca3af; font-style: italic; font-size: 9.5pt; padding: 4pt 0 12pt; }

  /* ── Program cover / athlete page breaks ── */
  .program-cover { margin-bottom: 0; }
  .athlete-section { page-break-before: always; padding-top: 4pt; }

  /* ── Floating print button (screen only) ── */
  @media screen {
    body { max-width: 820px; margin: 0 auto; padding: 0 20px 60px; }
    .rpt-header { margin: 0 -20px 20pt; }
    .print-btn {
      position: fixed; bottom: 24px; right: 24px;
      background: #e8a020; color: #0a0e1a;
      border: none; border-radius: 10px; padding: 12px 22px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 100;
    }
    .print-btn:hover { background: #f3b13f; }
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-btn { display: none; }
    .rpt-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .snap-tile  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .narrative  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th          { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// ── Shared section renderers ──────────────────────────────────────────────────

function renderSnapshotTiles(snapshot, cols = 4) {
  const tiles = [
    { val: snapshot.engagedColleges, lbl: "Engaged Colleges" },
    { val: snapshot.trueTraction,    lbl: "True Traction"    },
    { val: snapshot.visitsOffers,    lbl: "Visits / Offers"  },
    { val: snapshot.campCount,       lbl: "Camps"            },
  ];
  return `
    <div class="snap-grid snap-grid-${cols}">
      ${tiles.map(t => `
        <div class="snap-tile">
          <div class="val">${t.val ?? "—"}</div>
          <div class="lbl">${esc(t.lbl)}</div>
        </div>
      `).join("")}
    </div>`;
}

function renderSchoolsTable(schools) {
  if (!schools || schools.length === 0) {
    return `<p class="empty-state">No college interest on record.</p>`;
  }
  return `
    <table>
      <thead><tr>
        <th>College</th><th>Status</th>
        <th>Recruiting Coach</th><th>Last Contact</th><th>Events</th>
      </tr></thead>
      <tbody>
        ${schools.map(s => `
          <tr>
            <td><strong>${esc(s.college)}</strong></td>
            <td>${esc(s.status || "—")}</td>
            <td>${s.coachName
              ? `${esc(s.coachName)}${s.coachTitle ? `<br><span class="note">${esc(s.coachTitle)}</span>` : ""}`
              : `<span class="muted">—</span>`}</td>
            <td style="white-space:nowrap">${s.lastDate ? esc(s.lastDate) : `<span class="muted">—</span>`}</td>
            <td>${s.activityCount > 0 ? s.activityCount : "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderCampsTable(camps) {
  if (!camps || camps.length === 0) {
    return `<p class="empty-state">No camps on record.</p>`;
  }
  return `
    <table>
      <thead><tr>
        <th>School</th><th>Camp Name</th><th>Date</th><th>Division</th>
      </tr></thead>
      <tbody>
        ${camps.map(c => `
          <tr>
            <td><strong>${esc(c.school)}</strong></td>
            <td>${c.campName ? esc(c.campName) : `<span class="muted">—</span>`}</td>
            <td style="white-space:nowrap">${c.date ? esc(c.date) : `<span class="muted">—</span>`}</td>
            <td>${c.division ? esc(c.division) : `<span class="muted">—</span>`}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderActivityLog(log) {
  if (!log || log.length === 0) {
    return `<p class="empty-state">No activity on record for the selected period.</p>`;
  }
  const rows = log.slice(0, 60);
  const capped = log.length > 60;
  return `
    <table>
      <thead><tr>
        <th>Date</th><th>Type</th><th>School</th><th>Coach</th><th>Notes</th>
      </tr></thead>
      <tbody>
        ${rows.map(a => `
          <tr>
            <td style="white-space:nowrap">${a.date ? esc(a.date) : "—"}</td>
            <td style="white-space:nowrap">${esc(a.type)}</td>
            <td>${a.school ? esc(a.school) : `<span class="muted">—</span>`}</td>
            <td>${a.coach
              ? `${esc(a.coach)}${a.coachTitle ? `<br><span class="note">${esc(a.coachTitle)}</span>` : ""}`
              : `<span class="muted">—</span>`}</td>
            <td>${a.notes ? esc(a.notes) : ""}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    ${capped ? `<p style="font-size:8pt;color:#9ca3af">Showing most recent 60 of ${log.length} events.</p>` : ""}`;
}

// ── Player Report HTML ────────────────────────────────────────────────────────
function buildPlayerReportHtml(data) {
  const { meta, recentActivityNarrative, recruitingJourneyNarrative, snapshot, interestedSchools, camps, activityLog } = data;

  const headerMeta = [
    meta.gradYear ? `Class of ${meta.gradYear}` : null,
    meta.position || null,
    meta.programName,
  ].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(meta.athleteName)} — Player Recruiting Report</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>

  <header class="rpt-header">
    <div class="rpt-accent-bar"></div>
    <div>
      <div class="rpt-header-label">Player Recruiting Report</div>
      <div class="rpt-header-name">${esc(meta.athleteName)}</div>
      <div class="rpt-header-meta">
        ${headerMeta}
        ${meta.coachName ? `<br>Prepared by: ${esc(meta.coachName)}` : ""}
        <br>Report date: ${esc(meta.reportDate)} &nbsp;·&nbsp; Period: ${esc(meta.period)}
      </div>
    </div>
  </header>

  <h2>Recruiting Snapshot</h2>
  ${renderSnapshotTiles(snapshot, 4)}
  <div class="meta-bar">
    <div class="meta-item"><div class="mi-label">Activity Count</div><div class="mi-value">${snapshot.activityCount}</div></div>
    <div class="meta-item"><div class="mi-label">Last Activity</div><div class="mi-value">${snapshot.lastActivityDate || "—"}</div></div>
    <div class="meta-item"><div class="mi-label">Reporting Period</div><div class="mi-value">${esc(meta.period)}</div></div>
  </div>

  <h2>Recent Activity Summary</h2>
  <div class="narrative">${esc(recentActivityNarrative)}</div>

  <h2>Overall Recruiting Journey</h2>
  <div class="narrative">${esc(recruitingJourneyNarrative)}</div>

  <h2>Interested Schools &amp; Coach Contacts</h2>
  ${renderSchoolsTable(interestedSchools)}

  <h2>Registered Camps</h2>
  ${renderCampsTable(camps)}

  <h2>Activity Log</h2>
  ${renderActivityLog(activityLog)}

</body>
</html>`;
}

// ── Program Report HTML ───────────────────────────────────────────────────────
function buildProgramReportHtml(data) {
  const { meta, programSummary: ps, programNarrative, athletes } = data;

  const coverHtml = `
  <div class="program-cover">
    <header class="rpt-header">
      <div class="rpt-accent-bar"></div>
      <div>
        <div class="rpt-header-label">Program Recruiting Report</div>
        <div class="rpt-header-name">${esc(meta.programName)}</div>
        <div class="rpt-header-meta">
          ${meta.sport ? `${esc(meta.sport)} &nbsp;·&nbsp; ` : ""}${meta.coachName ? `Coach ${esc(meta.coachName)}` : ""}
          <br>Report date: ${esc(meta.reportDate)} &nbsp;·&nbsp; Period: ${esc(meta.period)}
        </div>
      </div>
    </header>

    <h2>Program Summary</h2>
    <div class="snap-grid snap-grid-6">
      <div class="snap-tile"><div class="val">${ps.totalAthletes}</div><div class="lbl">Athletes</div></div>
      <div class="snap-tile"><div class="val">${ps.totalEngagedColleges}</div><div class="lbl">Colleges</div></div>
      <div class="snap-tile"><div class="val">${ps.totalVisitsOffers}</div><div class="lbl">Visits / Offers</div></div>
      <div class="snap-tile"><div class="val">${ps.totalCamps}</div><div class="lbl">Total Camps</div></div>
      <div class="snap-tile"><div class="val">${ps.heatingUp}</div><div class="lbl">Active (30d)</div></div>
      <div class="snap-tile"><div class="val">${ps.needsAttention}</div><div class="lbl">Needs Attention</div></div>
    </div>

    <h3>Program Overview</h3>
    <div class="narrative">${esc(programNarrative)}</div>
  </div>`;

  const athletesSectionHtml = athletes.map(a => {
    const { meta: am, recentActivityNarrative, recruitingJourneyNarrative, snapshot, interestedSchools, camps } = a;
    const sub = [am.gradYear ? `Class of ${am.gradYear}` : null, am.position || null].filter(Boolean).map(esc).join(" · ");
    return `
  <div class="athlete-section">
    <h2>${esc(am.athleteName)}${sub ? ` <span style="font-weight:400;font-size:10pt;color:#4b5563"> — ${sub}</span>` : ""}</h2>

    ${renderSnapshotTiles(snapshot, 4)}

    <h3>Recent Activity</h3>
    <div class="narrative" style="font-size:10pt">${esc(recentActivityNarrative)}</div>

    <h3>Recruiting Journey</h3>
    <div class="narrative" style="font-size:10pt">${esc(recruitingJourneyNarrative)}</div>

    <h3>Interested Schools</h3>
    ${renderSchoolsTable(interestedSchools)}

    <h3>Camps</h3>
    ${renderCampsTable(camps)}
  </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(meta.programName)} — Program Recruiting Report</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  ${coverHtml}
  ${athletesSectionHtml}
</body>
</html>`;
}

// ── Print window launcher ─────────────────────────────────────────────────────
function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=900,height=720,scrollbars=yes");
  if (!win) {
    // eslint-disable-next-line no-alert
    alert("Pop-ups are blocked. Please allow pop-ups for this site and try again.");
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Brief render delay before triggering print dialog
  setTimeout(() => {
    try { win.focus(); win.print(); } catch {}
  }, 700);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates and opens a printable player recruiting report.
 * @param {object} playerData - Output of buildPlayerRecruitingReportData()
 * @returns {boolean} false if popup was blocked
 */
export function exportPlayerReportPdf(playerData) {
  return openPrintWindow(buildPlayerReportHtml(playerData));
}

/**
 * Generates and opens a printable program recruiting report.
 * @param {object} programData - Output of buildProgramRecruitingReportData()
 * @returns {boolean} false if popup was blocked
 */
export function exportProgramReportPdf(programData) {
  return openPrintWindow(buildProgramReportHtml(programData));
}
