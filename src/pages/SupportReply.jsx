import React, { useEffect, useState } from "react";
import { base44 } from "../api/base44Client";

export default function SupportReply() {
  const params = new URLSearchParams(window.location.search);
  const ticketId = params.get("ticket") || "";
  const token = params.get("token") || "";

  const [phase, setPhase] = useState("loading"); // loading | form | submitting | success | error
  const [ticketInfo, setTicketInfo] = useState(null);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!ticketId || !token) {
      setErrorMsg("This link is missing required information. Please use the link from your support email.");
      setPhase("error");
      return;
    }
    (async () => {
      try {
        const res = await base44.functions.invoke("submitTicketReply", { ticketId, token });
        if (!res?.ok) {
          setErrorMsg(res?.error || "This link is invalid or has expired.");
          setPhase("error");
        } else {
          setTicketInfo(res.ticket);
          setPhase("form");
        }
      } catch {
        setErrorMsg("Something went wrong. Please try again or contact us directly.");
        setPhase("error");
      }
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const msg = message.trim();
    if (!msg) return;
    setPhase("submitting");
    try {
      const res = await base44.functions.invoke("submitTicketReply", { ticketId, token, message: msg });
      if (!res?.ok) {
        setErrorMsg(res?.error || "Failed to send your reply. Please try again.");
        setPhase("form");
      } else {
        setPhase("success");
      }
    } catch {
      setErrorMsg("Something went wrong sending your reply. Please try again.");
      setPhase("form");
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-start justify-center pt-12 px-4 pb-20">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-[#D4AF37] font-bold text-xl tracking-wide">URecruit HQ</span>
          </div>
          <div className="text-[#6b7280] text-sm">Support</div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden">
          {/* Loading */}
          {phase === "loading" && (
            <div className="p-8 text-center text-[#6b7280] text-sm">
              <div className="w-6 h-6 border-2 border-[#1f2937] border-t-[#e8a020] rounded-full animate-spin mx-auto mb-3" />
              Verifying your link...
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="p-8 text-center">
              <div className="text-3xl mb-3">⚠️</div>
              <div className="text-[#f9fafb] font-semibold mb-2">Link Issue</div>
              <div className="text-[#9ca3af] text-sm leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Form */}
          {(phase === "form" || phase === "submitting") && ticketInfo && (
            <form onSubmit={handleSubmit}>
              <div className="px-6 pt-6 pb-4 border-b border-[#1f2937]">
                <div className="text-xs text-[#6b7280] font-mono mb-1">{ticketInfo.ticket_number || "Support Ticket"}</div>
                <div className="text-[#f9fafb] font-semibold text-base leading-snug">{ticketInfo.subject}</div>
                {ticketInfo.user_name && (
                  <div className="text-xs text-[#6b7280] mt-1">Hi {ticketInfo.user_name} — reply below and our team will be notified.</div>
                )}
              </div>

              <div className="p-6 space-y-4">
                {errorMsg && (
                  <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5">Your reply</label>
                  <textarea
                    className="w-full rounded-lg bg-[#0a0e1a] border border-[#1f2937] text-[#f9fafb] text-sm px-3 py-2.5 resize-none placeholder-[#374151] focus:outline-none focus:border-[#e8a020]"
                    rows={5}
                    placeholder="Type your response here..."
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); setErrorMsg(""); }}
                    disabled={phase === "submitting"}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={!message.trim() || phase === "submitting"}
                  className="w-full py-2.5 rounded-lg bg-[#e8a020] text-[#0a0e1a] font-semibold text-sm hover:bg-[#f3b13f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {phase === "submitting" ? "Sending..." : "Send Reply"}
                </button>
              </div>
            </form>
          )}

          {/* Success */}
          {phase === "success" && (
            <div className="p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-[#f9fafb] font-semibold mb-2">Reply Sent!</div>
              <div className="text-[#9ca3af] text-sm leading-relaxed">
                Our support team has been notified and will follow up with you shortly.
              </div>
              {ticketInfo && (
                <div className="mt-4 text-xs text-[#6b7280]">
                  Ticket: {ticketInfo.ticket_number}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-[#374151]">
          URecruit HQ · Support Portal
        </div>
      </div>
    </div>
  );
}
