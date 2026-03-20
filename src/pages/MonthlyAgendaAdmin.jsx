import React, { useEffect, useState, useCallback } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
    const value = d.toISOString().slice(0, 7); // YYYY-MM
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    options.push({ value, label });
  }
  return options;
}

const MONTHS = getMonthOptions();

export default function MonthlyAgendaAdmin() {
  const [month, setMonth] = useState(MONTHS[0].value);
  const [myAccountId, setMyAccountId] = useState("");
  const [subscribers, setSubscribers] = useState([]);
  const [subSearch, setSubSearch] = useState("");
  const [subsLoading, setSubsLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  // Camp Week Alert
  const [alertWorking, setAlertWorking] = useState(false);
  const [alertResult, setAlertResult] = useState(null);
  const [alertError, setAlertError] = useState("");
  const [alertDate, setAlertDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [alertConfirmSend, setAlertConfirmSend] = useState(false);

  async function runAlert(mode) {
    setAlertWorking(true);
    setAlertError("");
    setAlertResult(null);
    try {
      const payload = { mode, targetDate: alertDate };
      if (mode === "preview" || mode === "send_one") payload.accountId = myAccountId;
      const res = await base44.functions.invoke("sendCampWeekAlert", payload);
      const data = res.data;
      if (!data?.ok) { setAlertError(data?.error || "Unknown error"); return; }
      if (mode === "preview") {
        if (data.html) {
          const win = window.open("", "_blank");
          if (win) { win.document.write(data.html); win.document.close(); }
          else { setAlertError("Popup blocked — please allow popups and try again."); return; }
        }
      }
      setAlertResult(data);
    } catch (e) {
      setAlertError(e?.message || "Request failed");
    } finally {
      setAlertWorking(false);
      setAlertConfirmSend(false);
    }
  }

  // Tips / monthly content
  const [tipsId, setTipsId] = useState(null);
  const [tipsTitle, setTipsTitle] = useState("");
  const [tipsContent, setTipsContent] = useState("");
  const [tipsSaving, setTipsSaving] = useState(false);
  const [tipsSaved, setTipsSaved] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);

  const tipsPopulated = tipsContent.trim().length > 0;

  useEffect(() => {
    base44.auth.me().then(u => { if (u?.id) setMyAccountId(u.id); }).catch(() => {});
  }, []);

  useEffect(() => {
    setSubsLoading(true);
    base44.functions.invoke("sendMonthlyAgenda", { month: MONTHS[0].value, mode: "list_subscribers" })
      .then(res => { if (res?.data?.ok) setSubscribers(res.data.subscribers || []); })
      .catch(() => {})
      .finally(() => setSubsLoading(false));
  }, []);

  const loadTips = useCallback(() => {
    setTipsLoading(true);
    setTipsSaved(false);
    base44.entities.MonthlyAgendaContent.filter({ month })
      .then(rows => {
        const row = rows?.[0] || null;
        setTipsId(row?.id || null);
        setTipsTitle(row?.title || "");
        setTipsContent(row?.content || "");
      })
      .catch(() => {
        setTipsId(null);
        setTipsTitle("");
        setTipsContent("");
      })
      .finally(() => setTipsLoading(false));
  }, [month]);

  useEffect(() => { loadTips(); }, [loadTips]);

  async function saveTips() {
    setTipsSaving(true);
    try {
      if (tipsId) {
        await base44.entities.MonthlyAgendaContent.update(tipsId, { title: tipsTitle, content: tipsContent });
      } else {
        const created = await base44.entities.MonthlyAgendaContent.create({ month, title: tipsTitle, content: tipsContent });
        if (created?.id) setTipsId(created.id);
      }
      setTipsSaved(true);
    } catch (e) {
      setError("Failed to save tips: " + (e?.message || "Unknown error"));
    } finally {
      setTipsSaving(false);
    }
  }

  async function checkConfig() {
    setWorking(true);
    setError("");
    setResult(null);
    try {
      const res = await base44.functions.invoke("sendMonthlyAgenda", { month: MONTHS[0].value, mode: "check_config" });
      const data = res.data;
      setResult({ mode: "check_config", ...data });
    } catch (e) {
      setError(e?.message || "Request failed");
    } finally {
      setWorking(false);
    }
  }

  async function run(mode) {
    setWorking(true);
    setError("");
    setResult(null);
    try {
      const payload = { month, mode };
      if (mode === "preview" || mode === "send_one") payload.accountId = myAccountId;
      const res = await base44.functions.invoke("sendMonthlyAgenda", payload);
      const data = res.data;
      if (!data?.ok) { setError(data?.error || "Unknown error"); return; }
      if (mode === "preview") {
        if (data.html) {
          const win = window.open("", "_blank");
          if (win) {
            win.document.write(data.html);
            win.document.close();
          } else {
            setError("Popup was blocked — please allow popups for this site and try again.");
            return;
          }
        }
        setResult({ mode: "preview", subject: data.subject, registered: data.registered, watchlist: data.watchlist, nearby: data.nearby });
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e?.message || "Request failed");
    } finally {
      setWorking(false);
      setConfirmSend(false);
    }
  }

  const S = {
    root: { background: "#0a0e1a", minHeight: "100vh", padding: "40px 24px", fontFamily: "'DM Sans', Arial, sans-serif", color: "#f9fafb" },
    card: { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "24px", marginBottom: 20, maxWidth: 680 },
    label: { fontSize: 12, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 },
    select: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 15, color: "#f9fafb", width: "100%" },
    input: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#f9fafb", width: "100%", fontFamily: "monospace" },
    textarea: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#f9fafb", width: "100%", resize: "vertical", minHeight: 120, fontFamily: "'DM Sans', Arial, sans-serif", lineHeight: 1.6 },
    btn: (color) => ({ background: color, color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: working ? 0.6 : 1 }),
    btnOutline: { background: "transparent", color: "#9ca3af", border: "1px solid #374151", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    stat: { background: "#1f2937", borderRadius: 8, padding: "12px 16px", textAlign: "center", flex: 1 },
    statNum: { fontSize: 24, fontWeight: 700, color: "#f9fafb" },
    statLabel: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  };

  return (
    <AdminRoute>
      <div style={S.root}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: "0 0 8px" }}>Communications</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 32 }}>
          Manage and send subscriber emails — monthly camp agendas and camp week alerts.
        </p>

        {/* Controls */}
        <div style={S.card}>
          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Month</label>
            <select value={month} onChange={e => { setMonth(e.target.value); setResult(null); }} style={S.select} disabled={working}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={S.label}>Subscriber (for preview / send to one)</label>
            <input
              value={subSearch}
              onChange={e => setSubSearch(e.target.value)}
              placeholder={subsLoading ? "Loading subscribers…" : "Search by name or email…"}
              style={{ ...S.input, marginBottom: 6 }}
              disabled={working || subsLoading}
            />
            {(() => {
              const q = subSearch.trim().toLowerCase();
              const filtered = q
                ? subscribers.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
                : subscribers;
              if (!filtered.length && q) return (
                <div style={{ fontSize: 12, color: "#6b7280", padding: "6px 2px" }}>No matches</div>
              );
              if (!q && !myAccountId) return null;
              return (
                <div style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                  {(q ? filtered : subscribers.slice(0, 50)).map(s => (
                    <div
                      key={s.accountId}
                      onClick={() => { setMyAccountId(s.accountId); setSubSearch(""); }}
                      style={{
                        padding: "8px 12px", cursor: "pointer", fontSize: 13,
                        background: myAccountId === s.accountId ? "#374151" : "transparent",
                        borderBottom: "1px solid #374151",
                      }}
                    >
                      <span style={{ color: "#f9fafb", fontWeight: 600 }}>{s.name}</span>
                      {s.email && s.email !== s.name && <span style={{ color: "#6b7280", marginLeft: 8 }}>{s.email}</span>}
                      {!s.hasAthletes && <span style={{ color: "#e8a020", fontSize: 11, marginLeft: 8 }}>no athlete</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
            {myAccountId && !subSearch && (
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <span>Selected: <span style={{ color: "#f9fafb" }}>
                  {subscribers.find(s => s.accountId === myAccountId)?.name || myAccountId}
                </span></span>
                <button onClick={() => setMyAccountId("")} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 12 }}>✕ clear</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={S.btn("#3b82f6")} onClick={() => run("preview")} disabled={working || !myAccountId}>
              👁 Preview My Email
            </button>
            <button style={S.btn("#e8a020")} onClick={() => run("send_one")} disabled={working || !myAccountId}>
              ✉ Send to Me
            </button>
            <button style={S.btn("#6b7280")} onClick={() => run("dry_run")} disabled={working}>
              🔍 Dry Run (all accounts)
            </button>
            <button style={{ ...S.btnOutline, color: "#9ca3af" }} onClick={checkConfig} disabled={working}>
              ⚙️ Check Config
            </button>
            {!confirmSend ? (
              <button style={{ ...S.btnOutline, color: "#ef4444", borderColor: "#ef4444" }} onClick={() => setConfirmSend(true)} disabled={working}>
                📤 Send All
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#fca5a5" }}>Send to ALL active subscribers?</span>
                <button style={S.btn("#ef4444")} onClick={() => run("send_all")} disabled={working}>Confirm Send</button>
                <button style={S.btnOutline} onClick={() => setConfirmSend(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* Monthly Tips Editor */}
        <div style={{ ...S.card, borderColor: tipsPopulated ? "#374151" : "#92400e", background: tipsPopulated ? "#111827" : "rgba(120,53,15,0.15)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>
                📋 Monthly Tips & Insights
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                Included in the email above the camp sections. Populate before sending.
              </div>
            </div>
            {!tipsPopulated && (
              <div style={{ background: "#92400e", color: "#fbbf24", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                NOT SET
              </div>
            )}
            {tipsPopulated && tipsSaved && (
              <div style={{ color: "#22c55e", fontSize: 12, fontWeight: 600 }}>✓ Saved</div>
            )}
          </div>

          {tipsLoading ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Section Title (optional)</label>
                <input
                  value={tipsTitle}
                  onChange={e => { setTipsTitle(e.target.value); setTipsSaved(false); }}
                  placeholder="e.g. Recruiting Tips · May Edition"
                  style={S.input}
                  disabled={working}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Content</label>
                <textarea
                  value={tipsContent}
                  onChange={e => { setTipsContent(e.target.value); setTipsSaved(false); }}
                  placeholder={"Write tips, need-to-know info, deadlines, or any message you want subscribers to see this month.\n\nLine breaks are preserved in the email."}
                  style={S.textarea}
                  disabled={working}
                />
              </div>
              <button
                style={{ ...S.btn(tipsPopulated ? "#22c55e" : "#e8a020"), opacity: tipsSaving ? 0.6 : 1, cursor: tipsSaving ? "not-allowed" : "pointer" }}
                onClick={saveTips}
                disabled={tipsSaving || working}
              >
                {tipsSaving ? "Saving…" : tipsSaved ? "✓ Saved" : "Save Tips"}
              </button>
            </>
          )}
        </div>

        {/* ── Camp Week Alert ── */}
        <div style={{ ...S.card, borderColor: "#1e3a5f", marginTop: 32 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb", marginBottom: 4 }}>⛺ Camp Week Alert</div>
            <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
              Sends a prep email 7 days before each registered camp — what to bring, travel tips, and what coaches evaluate.
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Check Date (camp start date to look for)</label>
            <input
              type="date"
              value={alertDate}
              onChange={e => setAlertDate(e.target.value)}
              style={S.input}
              disabled={alertWorking}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              Sends to all subscribers with a registered camp starting on this date.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={{ ...S.btn("#3b82f6"), opacity: alertWorking ? 0.6 : 1 }} onClick={() => runAlert("preview")} disabled={alertWorking || !myAccountId}>
              👁 Preview
            </button>
            <button style={{ ...S.btn("#e8a020"), opacity: alertWorking ? 0.6 : 1 }} onClick={() => runAlert("send_one")} disabled={alertWorking || !myAccountId}>
              ✉ Send to Me
            </button>
            <button style={{ ...S.btn("#6b7280"), opacity: alertWorking ? 0.6 : 1 }} onClick={() => runAlert("dry_run")} disabled={alertWorking}>
              🔍 Dry Run
            </button>
            {!alertConfirmSend ? (
              <button style={{ ...S.btnOutline, color: "#ef4444", borderColor: "#ef4444" }} onClick={() => setAlertConfirmSend(true)} disabled={alertWorking}>
                📤 Send All
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#fca5a5" }}>Send camp week alerts for {alertDate}?</span>
                <button style={{ ...S.btn("#ef4444"), opacity: alertWorking ? 0.6 : 1 }} onClick={() => runAlert("send")} disabled={alertWorking}>Confirm Send</button>
                <button style={S.btnOutline} onClick={() => setAlertConfirmSend(false)}>Cancel</button>
              </div>
            )}
          </div>

          {alertWorking && (
            <div style={{ marginTop: 16, color: "#9ca3af", fontSize: 14 }}>
              <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" style={{ display: "inline-block", marginRight: 8 }} />
              Working…
            </div>
          )}
          {alertError && (
            <div style={{ marginTop: 12, color: "#fca5a5", fontSize: 13 }}>{alertError}</div>
          )}
          {alertResult && alertResult.mode !== "preview" && alertResult.summary && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 10 }}>
                {alertResult.mode === "dry_run" ? "Dry Run" : "Send"} — {alertResult.checkDate}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  { label: alertResult.mode === "dry_run" ? "Would Send" : "Sent", val: alertResult.summary.sent || alertResult.summary.dry_run, color: "#22c55e" },
                  { label: "Skipped", val: alertResult.summary.skipped, color: "#6b7280" },
                  { label: "Errors", val: alertResult.summary.errors, color: "#ef4444" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ ...S.stat }}>
                    <div style={{ ...S.statNum, color }}>{val ?? 0}</div>
                    <div style={S.statLabel}>{label}</div>
                  </div>
                ))}
              </div>
              {alertResult.results?.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Account</th>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Status</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Camps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertResult.results.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                          <td style={{ padding: "6px 8px", color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>{String(r.accountId || "").slice(0, 12)}…</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ color: r.status === "sent" ? "#22c55e" : r.status === "error" ? "#ef4444" : r.status === "dry_run" ? "#e8a020" : "#6b7280", fontWeight: 600 }}>
                              {r.status === "dry_run" ? "would send" : r.status}
                            </span>
                            {r.reason && <span style={{ color: "#6b7280", marginLeft: 8 }}>{r.reason}</span>}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.camps ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {alertResult && alertResult.mode === "preview" && (
            <div style={{ marginTop: 12, fontSize: 13, color: "#22c55e", fontWeight: 600 }}>✅ Preview opened in new tab — {alertResult.camps ?? 0} camp(s) on {alertResult.checkDate}</div>
          )}
        </div>

        {/* Reminder banner before Send All if tips not set */}
        {confirmSend && !tipsPopulated && (
          <div style={{ ...S.card, border: "1px solid #92400e", background: "rgba(120,53,15,0.2)", color: "#fbbf24", fontSize: 13, marginBottom: 0 }}>
            ⚠️ <strong>Heads up:</strong> You haven't added monthly tips content for {MONTHS.find(m => m.value === month)?.label}. The email will go out without a tips section. Save your content above before sending, or proceed anyway.
          </div>
        )}

        {working && (
          <div style={{ ...S.card, color: "#9ca3af", fontSize: 14 }}>
            <div className="w-5 h-5 border-2 border-[#e8a020] border-t-transparent rounded-full animate-spin" style={{ display: "inline-block", marginRight: 8 }} />
            Working... this may take a minute for large sends.
          </div>
        )}

        {error && (
          <div style={{ ...S.card, border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", background: "rgba(239,68,68,0.1)" }}>
            {error}
          </div>
        )}

        {result && result.mode === "check_config" && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", marginBottom: 12 }}>⚙️ Config Status</div>
            {[
              { key: "RESEND_API_KEY", val: result.RESEND_API_KEY },
              { key: "RESEND_FROM_EMAIL", val: result.RESEND_FROM_EMAIL },
            ].map(({ key, val }) => (
              <div key={key} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: "#9ca3af", fontFamily: "monospace", minWidth: 180 }}>{key}</span>
                <span style={{ color: val && !val.includes("NOT SET") ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {result && result.mode === "preview" && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", marginBottom: 12 }}>✅ Preview opened in new tab</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>Subject: <span style={{ color: "#f9fafb" }}>{result.subject}</span></div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              {[
                { label: "Registered", val: result.registered, color: "#22c55e" },
                { label: "Watchlist", val: result.watchlist, color: "#e8a020" },
                { label: "Nearby", val: result.nearby, color: "#3b82f6" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ ...S.stat }}>
                  <div style={{ ...S.statNum, color }}>{val}</div>
                  <div style={S.statLabel}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && result.mode !== "preview" && result.summary && (
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 16 }}>
              {result.mode === "dry_run" ? "Dry Run Complete" : `Send Complete — ${result.monthLabel}`}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: result.mode === "dry_run" ? "Would Send" : "Sent", val: result.summary.sent || result.summary.dry_run, color: "#22c55e" },
                { label: "Skipped", val: result.summary.skipped, color: "#6b7280" },
                { label: "Errors", val: result.summary.errors, color: "#ef4444" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ ...S.stat }}>
                  <div style={{ ...S.statNum, color }}>{val ?? 0}</div>
                  <div style={S.statLabel}>{label}</div>
                </div>
              ))}
            </div>

            {result.results?.length > 0 && (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Account</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Status</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Reg</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Watch</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Nearby</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                        <td style={{ padding: "6px 8px", color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>
                          {String(r.accountId || "").slice(0, 12)}…
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{
                            color: r.status === "sent" ? "#22c55e" : r.status === "error" ? "#ef4444" : r.status === "dry_run" ? "#e8a020" : "#6b7280",
                            fontWeight: 600,
                          }}>
                            {r.status === "dry_run" ? "would send" : r.status}
                          </span>
                          {r.reason && <span style={{ color: "#6b7280", marginLeft: 8 }}>{r.reason}</span>}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.registered ?? "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.watchlist ?? "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.nearby ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminRoute>
  );
}