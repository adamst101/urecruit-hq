import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

export default function BackfillRyzerProgramName() {
  const nav = useNavigate();
  const [dryRun, setDryRun] = useState(true);
  const [maxCamps, setMaxCamps] = useState(50);
  const [sleepMs, setSleepMs] = useState(800);
  const [running, setRunning] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const stopRef = useRef(false);

  const [batches, setBatches] = useState([]);
  const [totals, setTotals] = useState({ processed: 0, updated: 0, skipped: 0, errors: 0, rpnFound: 0, venueNameFound: 0, venueAddressFound: 0, cityFixed: 0 });

  const runBatch = async (startAt) => {
    const res = await base44.functions.invoke("backfillRyzerProgramName", {
      dryRun, maxCamps, startAt, sleepMs, timeBudgetMs: 50000,
    });
    return res.data;
  };

  const runAll = async () => {
    setRunning(true);
    stopRef.current = false;
    let cursor = 0;

    while (!stopRef.current) {
      const result = await runBatch(cursor);
      setBatches(prev => [...prev, result]);
      setTotals(prev => ({
        processed: prev.processed + (result.stats?.processed || 0),
        updated: prev.updated + (result.stats?.updated || 0),
        skipped: prev.skipped + (result.stats?.skipped || 0),
        errors: prev.errors + (result.stats?.errors || 0),
        rpnFound: prev.rpnFound + (result.stats?.rpnFound || 0),
        venueNameFound: prev.venueNameFound + (result.stats?.venueNameFound || 0),
        venueAddressFound: prev.venueAddressFound + (result.stats?.venueAddressFound || 0),
        cityFixed: prev.cityFixed + (result.stats?.cityFixed || 0),
      }));

      if (result.pagination?.done) break;
      cursor = result.pagination?.nextStartAt || cursor + maxCamps;

      if (!autoRun) break;
    }

    setRunning(false);
  };

  const handleStop = () => { stopRef.current = true; };

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    card: { background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", marginBottom: 12 },
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
    input: { background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 12px", fontSize: 14, width: 120, outline: "none" },
    btn: { background: "#0B1F3B", color: "#FFF", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    btnDanger: { background: "#DC2626", color: "#FFF", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    stat: { fontSize: 28, fontWeight: 700, color: "#0B1F3B" },
    statLabel: { fontSize: 12, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" },
  };

  const lastBatch = batches.length > 0 ? batches[batches.length - 1] : null;

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3B" }}>Backfill Ryzer Program Names</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            Re-fetches Ryzer pages to fill missing ryzer_program_name, venue_name, venue_address
          </div>
        </div>
        <button onClick={() => nav("/AdminOps")} style={{ ...S.btn, background: "#FFF", color: "#374151", border: "1px solid #E5E7EB" }}>← Admin</button>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900 }}>
        {/* Config */}
        <div style={{ ...S.card, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={S.label}>Dry Run</span>
            <select value={String(dryRun)} onChange={e => setDryRun(e.target.value === "true")} style={S.input}>
              <option value="true">Yes (preview)</option>
              <option value="false">No (write)</option>
            </select>
          </div>
          <div>
            <span style={S.label}>Batch Size</span>
            <input type="number" value={maxCamps} onChange={e => setMaxCamps(Number(e.target.value) || 50)} style={S.input} />
          </div>
          <div>
            <span style={S.label}>Sleep (ms)</span>
            <input type="number" value={sleepMs} onChange={e => setSleepMs(Number(e.target.value) || 800)} style={S.input} />
          </div>
          <div>
            <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)} />
              Auto-continue all batches
            </label>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {running ? (
              <button onClick={handleStop} style={S.btnDanger}>⏹ Stop</button>
            ) : (
              <button onClick={runAll} style={S.btn}>
                {batches.length === 0 ? "▶ Start" : "▶ Continue"}
              </button>
            )}
          </div>
        </div>

        {/* Totals */}
        {batches.length > 0 && (
          <div style={{ ...S.card, display: "flex", gap: 32, flexWrap: "wrap" }}>
            {[
              ["Processed", totals.processed],
              ["Updated", totals.updated],
              ["RPN Found", totals.rpnFound],
              ["Venue Names", totals.venueNameFound],
              ["Venue Addr", totals.venueAddressFound],
              ["City Fixed", totals.cityFixed],
              ["Skipped", totals.skipped],
              ["Errors", totals.errors],
            ].map(([label, val]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={S.stat}>{val}</div>
                <div style={S.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Status */}
        {lastBatch && (
          <div style={{ ...S.card, fontSize: 13, color: "#6B7280" }}>
            <strong>Last batch:</strong> startAt={lastBatch.pagination?.startAt}, processed={lastBatch.stats?.processed}, 
            nextStartAt={lastBatch.pagination?.nextStartAt}, 
            eligible={lastBatch.pagination?.totalEligible}, 
            done={String(lastBatch.pagination?.done)}, 
            elapsed={lastBatch.elapsedMs}ms
            {dryRun && <span style={{ color: "#D97706", fontWeight: 600, marginLeft: 8 }}>DRY RUN — no writes</span>}
          </div>
        )}

        {/* Batch log */}
        {batches.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Batch Log ({batches.length} batches)</div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {batches.map((b, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: "#374151", padding: "4px 0", borderBottom: "1px solid #F3F4F6" }}>
                  #{i + 1} — start={b.pagination?.startAt} proc={b.stats?.processed} upd={b.stats?.updated} rpn={b.stats?.rpnFound} venue={b.stats?.venueNameFound} skip={b.stats?.skipped} err={b.stats?.errors} {b.stats?.stoppedEarly ? "⏱ time" : ""} {b.pagination?.done ? "✅ DONE" : ""}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sample from last batch */}
        {lastBatch?.sample?.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Sample (last batch)</div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Camp", "Status", "RPN", "Found"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #E5E7EB", color: "#6B7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lastBatch.sample.map((s, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#FFF" : "#F9FAFB" }}>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F3F4F6", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.camp_name || s.source_key}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F3F4F6" }}>
                        <span style={{ color: s.status === "updated" ? "#059669" : s.status === "no_data_found" ? "#D97706" : "#DC2626", fontWeight: 600 }}>{s.status}</span>
                      </td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F3F4F6", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>{s.ryzer_program_name || "—"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F3F4F6", color: "#6B7280" }}>{(s.found || []).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}