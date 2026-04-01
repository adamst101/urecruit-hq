import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { ArrowLeft, Plus, Save, Trash2, Star } from "lucide-react";
import AdminRoute from "../components/auth/AdminRoute";

export default function SeasonManager() {
  const nav = useNavigate();
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm());

  function defaultForm() {
    return {
      season_year: new Date().getFullYear() + 1,
      display_name: "",
      stripe_price_primary: "",
      stripe_price_add_on: "",
      price_primary: 49,
      price_add_on: 39,
      sale_opens_at: "",
      sale_closes_at: "",
      access_starts_at: "",
      access_ends_at: "",
      active: true,
      is_current: false,
      notes: "",
    };
  }

  async function loadSeasons() {
    try {
      const rows = await base44.entities.SeasonConfig.list("-season_year");
      setSeasons(Array.isArray(rows) ? rows : []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadSeasons(); }, []);

  async function handleSave() {
    setSaving(true);
    try {
      if (!form.display_name) form.display_name = `Season ${form.season_year}`;
      await base44.entities.SeasonConfig.create(form);
      setShowForm(false);
      setForm(defaultForm());
      await loadSeasons();
    } catch (e) {
      alert("Error: " + (e.message || "Save failed"));
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this season config?")) return;
    try {
      await base44.entities.SeasonConfig.delete(id);
      await loadSeasons();
    } catch {}
  }

  async function toggleActive(s) {
    try {
      await base44.entities.SeasonConfig.update(s.id, { active: !s.active });
      await loadSeasons();
    } catch {}
  }

  async function markCurrent(s) {
    try {
      // Remove is_current from all
      for (const season of seasons) {
        if (season.is_current) {
          await base44.entities.SeasonConfig.update(season.id, { is_current: false });
        }
      }
      await base44.entities.SeasonConfig.update(s.id, { is_current: true });
      await loadSeasons();
    } catch {}
  }

  const now = new Date();
  const currentSeason = seasons.find(s => {
    if (!s.active) return false;
    const opens = s.sale_opens_at ? new Date(s.sale_opens_at) : null;
    const closes = s.sale_closes_at ? new Date(s.sale_closes_at) : null;
    if (opens && now < opens) return false;
    if (closes && now > closes) return false;
    return true;
  }) || seasons.find(s => s.is_current);

  const inputStyle = { background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 12px", fontSize: 14, width: "100%" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" };

  return (
    <AdminRoute>
    <div style={{ background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" }}>
      <div style={{ padding: "20px 32px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => nav("/AdminHQ")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back
        </button>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3B" }}>📅 Season Manager</div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 900 }}>
        {/* Current season highlight */}
        {currentSeason && (
          <div style={{ background: "#FFFBEB", border: "2px solid #F59E0B", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#B45309" }}>Currently Selling</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{currentSeason.display_name}</div>
            <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
              Primary: ${currentSeason.price_primary} · Add-on: ${currentSeason.price_add_on} · Sale: {currentSeason.sale_opens_at} → {currentSeason.sale_closes_at}
            </div>
          </div>
        )}

        {/* Add button */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ background: "#0B1F3B", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus style={{ width: 16, height: 16 }} /> Add New Season
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "24px", marginBottom: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Season Year</label>
                <input type="number" value={form.season_year} onChange={e => setForm({ ...form, season_year: parseInt(e.target.value) || 0 })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Display Name</label>
                <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Season 2027" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Stripe Price ID — Primary</label>
                <input value={form.stripe_price_primary} onChange={e => setForm({ ...form, stripe_price_primary: e.target.value })} placeholder="price_1..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Stripe Price ID — Add-on</label>
                <input value={form.stripe_price_add_on} onChange={e => setForm({ ...form, stripe_price_add_on: e.target.value })} placeholder="price_1..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Primary Price ($)</label>
                <input type="number" value={form.price_primary} onChange={e => setForm({ ...form, price_primary: parseInt(e.target.value) || 0 })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Add-on Price ($)</label>
                <input type="number" value={form.price_add_on} onChange={e => setForm({ ...form, price_add_on: parseInt(e.target.value) || 0 })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sale Opens</label>
                <input type="date" value={form.sale_opens_at} onChange={e => setForm({ ...form, sale_opens_at: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sale Closes</label>
                <input type="date" value={form.sale_closes_at} onChange={e => setForm({ ...form, sale_closes_at: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Access Starts</label>
                <input type="date" value={form.access_starts_at} onChange={e => setForm({ ...form, access_starts_at: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Access Ends</label>
                <input type="date" value={form.access_ends_at} onChange={e => setForm({ ...form, access_ends_at: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input type="checkbox" checked={form.is_current} onChange={e => setForm({ ...form, is_current: e.target.checked })} /> Is Current (fallback)
              </label>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ background: "#0B1F3B", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <Save style={{ width: 14, height: 14 }} /> {saving ? "Saving..." : "Save Season"}
              </button>
              <button onClick={() => { setShowForm(false); setForm(defaultForm()); }} style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Seasons table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Loading...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  {["Year", "Name", "Primary $", "Add-on $", "Sale Opens", "Sale Closes", "Active", "Current", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#6B7280", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seasons.map(s => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{s.season_year}</td>
                    <td style={{ padding: "10px 14px" }}>{s.display_name}</td>
                    <td style={{ padding: "10px 14px" }}>${s.price_primary}</td>
                    <td style={{ padding: "10px 14px" }}>${s.price_add_on}</td>
                    <td style={{ padding: "10px 14px" }}>{s.sale_opens_at || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{s.sale_closes_at || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => toggleActive(s)} style={{ background: s.active ? "#DEF7EC" : "#FEE2E2", color: s.active ? "#03543F" : "#9B1C1C", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {s.active ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {s.is_current ? (
                        <Star style={{ width: 14, height: 14, color: "#F59E0B", fill: "#F59E0B" }} />
                      ) : (
                        <button onClick={() => markCurrent(s)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 11 }}>Set</button>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => handleDelete(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }}>
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </AdminRoute>
  );
}