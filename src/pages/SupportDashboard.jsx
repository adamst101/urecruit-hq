import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ChevronDown, ChevronUp, ArrowLeft, Send, MessageSquare, HelpCircle } from "lucide-react";
import { createPageUrl } from "../utils";
import AdminRoute from "../components/auth/AdminRoute";

const TYPE_COLORS = { support: "bg-red-600", bug: "bg-orange-500", feedback: "bg-blue-500", feature_request: "bg-purple-500" };
const STATUS_COLORS = { open: "bg-red-600", in_progress: "bg-amber-500", resolved: "bg-green-600", closed: "bg-gray-500" };
const TYPE_LABELS = { support: "Support", bug: "Bug", feedback: "Feedback", feature_request: "Feature" };
const STATUS_LABELS = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };

export default function SupportDashboard() {
  const nav = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [adminNotes, setAdminNotes] = useState({});
  const [saving, setSaving] = useState(null);
  const [replyMsg, setReplyMsg] = useState({});
  const [replyType, setReplyType] = useState({});
  const [replyStatus, setReplyStatus] = useState({});
  const [replySending, setReplySending] = useState(null);
  const [replySent, setReplySent] = useState({});

  useEffect(() => {
    (async () => {
      const res = await base44.functions.invoke("listSupportTickets", {});
      setTickets(Array.isArray(res?.data?.tickets) ? res.data.tickets : []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      return true;
    });
  }, [tickets, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return {
      open: tickets.filter((t) => t.status === "open").length,
      thisWeek: tickets.filter((t) => new Date(t.created_date) >= weekAgo).length,
      features: tickets.filter((t) => t.type === "feature_request").length,
      total: tickets.length,
    };
  }, [tickets]);

  async function updateStatus(ticketId, newStatus) {
    setSaving(ticketId);
    const data = { status: newStatus };
    if (newStatus === "resolved") data.resolved_at = new Date().toISOString();
    await base44.functions.invoke("updateSupportTicket", { ticketId, fields: data });
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, ...data } : t)));
    setSaving(null);
  }

  async function saveNotes(ticketId) {
    setSaving(ticketId);
    await base44.functions.invoke("updateSupportTicket", { ticketId, fields: { admin_notes: adminNotes[ticketId] || "" } });
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, admin_notes: adminNotes[ticketId] || "" } : t)));
    setSaving(null);
  }

  async function sendReply(ticketId) {
    const msg = (replyMsg[ticketId] || "").trim();
    if (!msg) return;
    setReplySending(ticketId);
    try {
      const raw = await base44.functions.invoke("replyToTicket", {
        ticketId,
        message: msg,
        messageType: replyType[ticketId] || "reply",
        newStatus: replyStatus[ticketId] || "no_change",
        appUrl: window.location.origin,
      });
      const result = raw?.data ?? raw;
      if (result?.ok) {
        // Apply any ticket updates returned from the function
        if (result.updatedData) {
          setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, ...result.updatedData } : t)));
          // Sync admin notes textarea if it was updated
          if (result.updatedData.admin_notes !== undefined) {
            setAdminNotes((p) => ({ ...p, [ticketId]: result.updatedData.admin_notes }));
          }
        }
        setReplyMsg((p) => ({ ...p, [ticketId]: "" }));
        setReplySent((p) => ({ ...p, [ticketId]: Date.now() }));
      }
    } finally {
      setReplySending(null);
    }
  }

  const selectCls = "bg-[#111827] border-[#1f2937] text-[#f9fafb]";

  return (
    <AdminRoute>
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <button type="button" onClick={() => nav(createPageUrl("AdminOps"))} className="mb-3 text-sm font-medium text-[#e8a020] hover:text-[#f3b13f] flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Admin Ops
        </button>

        <h1 className="text-2xl font-bold mb-4">Support Tickets</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Open", val: stats.open, color: "text-red-400" },
            { label: "This Week", val: stats.thisWeek, color: "text-amber-400" },
            { label: "Feature Requests", val: stats.features, color: "text-purple-400" },
            { label: "Total", val: stats.total, color: "text-[#9ca3af]" },
          ].map((s) => (
            <Card key={s.label} className="p-3 border-[#1f2937] bg-[#111827]">
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-[#6b7280]">{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={`w-[150px] ${selectCls}`}><SelectValue /></SelectTrigger>
            <SelectContent className={selectCls}>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className={`w-[150px] ${selectCls}`}><SelectValue /></SelectTrigger>
            <SelectContent className={selectCls}>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feedback">Feedback</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-[#6b7280] text-sm">Loading tickets...</div>
        ) : !filtered.length ? (
          <Card className="p-5 border-[#1f2937] bg-[#111827] text-[#6b7280]">No tickets found.</Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => {
              const isExpanded = expandedId === t.id;
              return (
                <Card key={t.id} className="border-[#1f2937] bg-[#111827] overflow-hidden">
                  <button type="button" onClick={() => setExpandedId(isExpanded ? null : t.id)} className="w-full text-left p-4 flex items-center gap-3 hover:bg-[#0f172a] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-[#6b7280] font-mono">{t.ticket_number || "—"}</span>
                        <Badge className={`${TYPE_COLORS[t.type] || "bg-gray-500"} text-white text-[10px] px-1.5 py-0`}>{TYPE_LABELS[t.type] || t.type}</Badge>
                        <Badge className={`${STATUS_COLORS[t.status] || "bg-gray-500"} text-white text-[10px] px-1.5 py-0`}>{STATUS_LABELS[t.status] || t.status}</Badge>
                      </div>
                      <div className="text-sm font-medium text-[#f9fafb] mt-1 truncate">{t.subject}</div>
                      <div className="text-xs text-[#6b7280] mt-0.5">{t.user_name || t.user_email || "Anonymous"} · {t.account_type || "?"} · {new Date(t.created_date).toLocaleDateString()}</div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#6b7280]" /> : <ChevronDown className="w-4 h-4 text-[#6b7280]" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[#1f2937] pt-3 space-y-3">
                      <div>
                        <div className="text-xs text-[#6b7280] mb-1">Description</div>
                        <div className="text-sm text-[#d1d5db] whitespace-pre-wrap">{t.description}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#6b7280]">
                        <div>Email: {t.user_email || "—"}</div>
                        <div>Page: {t.current_page || "—"}</div>
                        <div>Season: {t.season_year || "—"}</div>
                        <div>Priority: {t.priority || "normal"}</div>
                        {t.rating && <div>Rating: {"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</div>}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#6b7280]">Status:</span>
                        <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                          <SelectTrigger className={`w-[140px] h-8 text-xs ${selectCls}`}><SelectValue /></SelectTrigger>
                          <SelectContent className={selectCls}>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                        {saving === t.id && <span className="text-xs text-[#e8a020]">Saving...</span>}
                      </div>

                      {/* Message User */}
                      <div className="border border-[#1f2937] rounded-lg p-3 space-y-2 bg-[#0a0e1a]">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="w-4 h-4 text-[#e8a020]" />
                          <span className="text-xs font-semibold text-[#f9fafb]">Message User</span>
                          <span className="text-xs text-[#6b7280]">→ {t.user_email}</span>
                        </div>

                        {/* Type toggle */}
                        <div className="flex gap-2">
                          {[
                            { val: "reply", label: "Update / Reply", icon: <Send className="w-3 h-3" /> },
                            { val: "info_request", label: "Request Info", icon: <HelpCircle className="w-3 h-3" /> },
                          ].map(({ val, label, icon }) => {
                            const active = (replyType[t.id] || "reply") === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setReplyType((p) => ({ ...p, [t.id]: val }))}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                                  active
                                    ? val === "info_request"
                                      ? "bg-amber-600 border-amber-600 text-white"
                                      : "bg-[#e8a020] border-[#e8a020] text-[#0a0e1a]"
                                    : "bg-transparent border-[#374151] text-[#9ca3af] hover:border-[#4b5563]"
                                }`}
                              >
                                {icon}{label}
                              </button>
                            );
                          })}
                        </div>

                        <textarea
                          className="w-full rounded-lg bg-[#111827] border border-[#1f2937] text-[#f9fafb] text-sm px-3 py-2 resize-none placeholder-[#4b5563]"
                          rows={3}
                          placeholder={(replyType[t.id] || "reply") === "info_request"
                            ? "Describe what additional information you need from the user..."
                            : "Type your update or reply to the user..."}
                          value={replyMsg[t.id] || ""}
                          onChange={(e) => {
                            setReplyMsg((p) => ({ ...p, [t.id]: e.target.value }));
                            setReplySent((p) => ({ ...p, [t.id]: null }));
                          }}
                        />

                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#6b7280]">Also change status:</span>
                            <Select
                              value={replyStatus[t.id] || "no_change"}
                              onValueChange={(v) => setReplyStatus((p) => ({ ...p, [t.id]: v }))}
                            >
                              <SelectTrigger className={`w-[140px] h-7 text-xs ${selectCls}`}><SelectValue /></SelectTrigger>
                              <SelectContent className={selectCls}>
                                <SelectItem value="no_change">No change</SelectItem>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            size="sm"
                            disabled={!replyMsg[t.id]?.trim() || replySending === t.id}
                            onClick={() => sendReply(t.id)}
                            className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f] text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            {replySending === t.id ? "Sending..." : "Send Email"}
                          </Button>

                          {replySent[t.id] && (
                            <span className="text-xs text-green-400">Email sent!</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-[#6b7280] mb-1">Admin Notes / History</div>
                        <textarea
                          className="w-full rounded-lg bg-[#0a0e1a] border border-[#1f2937] text-[#f9fafb] text-sm px-3 py-2 resize-y min-h-[80px]"
                          rows={6}
                          value={adminNotes[t.id] ?? t.admin_notes ?? ""}
                          onChange={(e) => setAdminNotes((p) => ({ ...p, [t.id]: e.target.value }))}
                        />
                        <Button size="sm" className="mt-1 bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f] text-xs" onClick={() => saveNotes(t.id)}>
                          Save Notes
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </AdminRoute>
  );
}