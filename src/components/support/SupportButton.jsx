import React, { useState, useEffect } from "react";
import { MessageCircleQuestion } from "lucide-react";
import SupportModal from "./SupportModal.jsx";

const PULSE_KEY = "support_btn_pulsed";

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(PULSE_KEY)) {
      setPulse(true);
      const t = setTimeout(() => {
        setPulse(false);
        sessionStorage.setItem(PULSE_KEY, "1");
      }, 3000);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.6), 0 4px 20px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.4); }
          70% { box-shadow: 0 0 0 12px rgba(37,99,235,0), 0 4px 20px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.4); }
          100% { box-shadow: 0 0 0 0 rgba(37,99,235,0), 0 4px 20px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.4); }
        }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-[9999] flex items-center gap-2 transition-all duration-200 hover:bg-[#1d4ed8]"
        style={{
          background: "#2563eb",
          border: "2px solid rgba(255,255,255,0.2)",
          borderRadius: 999,
          padding: "10px 18px 10px 14px",
          bottom: 24,
          right: 16,
          boxShadow: "0 4px 20px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.4)",
          animation: pulse ? "pulse-ring 1.5s ease-out infinite" : "none",
          cursor: "pointer",
        }}
        aria-label="Help & Feedback"
      >
        <MessageCircleQuestion style={{ width: 20, height: 20, color: "#fff", flexShrink: 0 }} />
        <span className="hidden md:inline" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 0.2, whiteSpace: "nowrap" }}>Support</span>
      </button>

      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  );
}