import React, { useState, useEffect, useMemo } from "react";
import { X, CheckCircle2, Loader2, Star } from "lucide-react";
import { base44 } from "../../api/base44Client";
import { Button } from "../ui/button";

const TABS = [
  { key: "support", label: "Get Support" },
  { key: "feedback", label: "Give Feedback" },
  { key: "feature_request", label: "Request Feature" },
];

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star
            className={`w-6 h-6 transition-colors ${n <= value ? "text-[#e8a020] fill-[#e8a020]" : "text-[#374151]"}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function SupportModal({ onClose }) {
  const [tab, setTab] = useState("support");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState(null);
  const [accountType, setAccountType] = useState("anonymous");
  const [rating, setRating] = useState(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (me?.email) {
          setEmail(me.email);
          setEmailLocked(true);
          setUserName(me.full_name || me.name || "");
          setUserId(me.id || null);
          setAccountType("paid");
        }
      } catch {
        setAccountType("anonymous");
      }
    })();
  }, []);

  function resetForm() {
    setSubject("");
    setDescription("");
    setRating(0);
    setError("");
    setResult(null);
  }

  function handleTabChange(key) {
    setTab(key);
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!subject.trim()) { setError("Subject is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }

    setSending(true);
    const res = await base44.functions.invoke("submitSupportTicket", {
      type: tab,
      subject: subject.trim(),
      description: description.trim(),
      userEmail: email.trim(),
      userName: userName || null,
      userId: userId || null,
      accountType,
      currentPage: window.location.pathname,
      browserInfo: navigator.userAgent,
      seasonYear: new Date().getFullYear(),
      rating: tab === "feedback" ? rating : null,
    });

    setSending(false);
    if (res?.data?.ok) {
      setResult({ ticketNumber: res.data.ticketNumber, email: email.trim() });
    } else {
      setError(res?.data?.error || "Something went wrong. Please try again.");
    }
  }

  const placeholders = useMemo(() => ({
    support: { subject: "What do you need help with?", desc: "Describe your issue in detail..." },
    feedback: { subject: "What's working well or not?", desc: "Tell us more..." },
    feature_request: { subject: "What feature would you like?", desc: "Describe the feature and why it would help your recruiting process..." },
  }), []);

  const submitLabel = { support: "Submit Support Request", feedback: "Send Feedback", feature_request: "Submit Feature Request" };

  const inputCls = "w-full rounded-lg bg-[#0a0e1a] border border-[#1f2937] text-[#f9fafb] text-sm px-3 py-2.5 placeholder:text-[#6b7280] focus:outline-none focus:border-[#e8a020]";

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-end justify-end p-4" onClick={onClose}>
      <div
        className="w-full sm:w-[380px] max-h-[560px] bg-[#111827] rounded-2xl border border-[#1f2937] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        style={{ borderTop: "3px solid #e8a020", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold text-[#f9fafb]">How can we help?</h2>
          <button type="button" onClick={onClose} className="text-[#6b7280] hover:text-[#f9fafb]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success */}
        {result ? (
          <div className="flex-1 flex flex-col items-center justify-center px-5 pb-6 gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div className="text-center">
              <div className="text-[#f9fafb] font-semibold">Got it! Ticket #{result.ticketNumber} created.</div>
              <div className="text-sm text-[#9ca3af] mt-1">We'll reply to {result.email} within 24-48 hours.</div>
            </div>
            <Button onClick={onClose} className="mt-3 bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]">Close</Button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-[#1f2937] px-5 gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTabChange(t.key)}
                  className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors ${tab === t.key ? "border-[#e8a020] text-[#e8a020]" : "border-transparent text-[#6b7280] hover:text-[#9ca3af]"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {tab === "feedback" && (
                <div>
                  <div className="text-xs text-[#9ca3af] mb-1.5">How would you rate URecruit HQ?</div>
                  <StarRating value={rating} onChange={setRating} />
                </div>
              )}

              <input
                className={inputCls}
                placeholder={placeholders[tab]?.subject}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />

              <textarea
                className={`${inputCls} resize-none`}
                rows={4}
                placeholder={placeholders[tab]?.desc}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <input
                className={`${inputCls} ${emailLocked ? "opacity-60" : ""}`}
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => !emailLocked && setEmail(e.target.value)}
                readOnly={emailLocked}
              />

              {error && <div className="text-xs text-red-400">{error}</div>}

              <Button
                type="submit"
                disabled={sending}
                className="w-full bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f] font-semibold"
              >
                {sending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</> : submitLabel[tab]}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}