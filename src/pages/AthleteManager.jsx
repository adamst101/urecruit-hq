import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { ArrowLeft } from "lucide-react";

export default function AthleteManager() {
  const nav = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [athletes, entitlements, users] = await Promise.all([
          base44.entities.AthleteProfile.list("-created_date", 500),
          base44.entities.Entitlement.list("-created_date", 500),
          base44.entities.User.list("-created_date", 500),
        ]);

        const athList = Array.isArray(athletes) ? athletes : [];
        const entList = Array.isArray(entitlements) ? entitlements : [];
        const userList = Array.isArray(users) ? users : [];

        // Group by account_id
        const byAccount = {};
        for (const a of athList) {
          const aid = a.account_id;
          if (!aid) continue;
          if (!byAccount[aid]) byAccount[aid] = { accountId: aid, athletes: [], entitlements: [], email: "" };
          byAccount[aid].athletes.push(a);
        }

        for (const e of entList) {
          const aid = e.account_id;
          if (!aid) continue;
          if (!byAccount[aid]) byAccount[aid] = { accountId: aid, athletes: [], entitlements: [], email: "" };
          byAccount[aid].entitlements.push(e);
        }

        // Match emails
        for (const u of userList) {
          const uid = u.id || u._id;
          if (byAccount[uid]) {
            byAccount[uid].email = u.email || "";
            byAccount[uid].fullName = u.full_name || "";
          }
        }

        if (!cancelled) {
          setAccounts(Object.values(byAccount).sort((a, b) => b.athletes.length - a.athletes.length));
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" }}>
      <div style={{ padding: "20px 32px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => nav("/AdminOps")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back
        </button>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3B" }}>👥 Athlete Manager</div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Loading...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  {["Account Email", "Athletes", "Entitlements", "Total Paid", "Status", "Flag"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#6B7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => {
                  const totalPaid = acc.entitlements.reduce((sum, e) => sum + (e.amount_paid || 0), 0);
                  const activeEnts = acc.entitlements.filter(e => e.status === "active").length;
                  const flagged = acc.athletes.length >= 3;
                  return (
                    <tr key={acc.accountId} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{acc.email || "—"}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{acc.fullName || ""}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {acc.athletes.map(a => (
                          <div key={a.id} style={{ fontSize: 12, marginBottom: 2 }}>
                            {a.athlete_name || a.display_name || a.first_name || "—"}
                            {a.is_primary && <span style={{ color: "#F59E0B", marginLeft: 4, fontSize: 10 }}>★ Primary</span>}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: activeEnts > 0 ? "#DEF7EC" : "#FEE2E2", color: activeEnts > 0 ? "#03543F" : "#9B1C1C", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          {activeEnts} active
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>${totalPaid.toFixed(0)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, color: activeEnts > 0 ? "#03543F" : "#6B7280" }}>{activeEnts > 0 ? "Subscribed" : "Demo"}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 16 }}>
                        {flagged ? "🚩" : "✅"}
                      </td>
                    </tr>
                  );
                })}
                {accounts.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#6B7280" }}>No athlete accounts found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}