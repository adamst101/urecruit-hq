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
        className="fixed z-[9999] rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-[#1d4ed8] w-7 h-7 top-[60px] right-2 sm:top-auto sm:w-14 sm:h-14 sm:bottom-32 sm:right-4"
        style={{
          background: "#2563eb",
          border: "2px solid rgba(255,255,255,0.2)",
          boxShadow: "0 4px 20px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.4)",
          animation: pulse ? "pulse-ring 1.5s ease-out infinite" : "none",
        }}
        aria-label="Help & Feedback"
      >
        <span className="hidden sm:block" style={{ color: "#ffffff", fontWeight: 800, fontSize: 22, lineHeight: 1 }}>?</span>
        <MessageCircleQuestion className="block sm:hidden w-4 h-4 text-white" />
      </button>

      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  );
}