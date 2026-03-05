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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-24 right-4 z-[9999] w-13 h-13 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 ${pulse ? "animate-pulse" : ""}`}
        style={{
          background: "#e8a020",
          boxShadow: pulse
            ? "0 0 0 6px rgba(232,160,32,0.3), 0 4px 16px rgba(0,0,0,0.3)"
            : "0 4px 16px rgba(0,0,0,0.3)",
        }}
        aria-label="Help & Feedback"
      >
        <MessageCircleQuestion className="w-6 h-6 text-[#0a0e1a]" />
      </button>

      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  );
}