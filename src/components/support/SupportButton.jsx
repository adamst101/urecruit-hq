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
        className={`fixed bottom-32 right-4 z-[9999] w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 ${pulse ? "animate-pulse" : ""}`}
        style={{
          background: "#e8a020",
          boxShadow: pulse
            ? "0 0 0 8px rgba(232,160,32,0.3), 0 6px 24px rgba(0,0,0,0.4)"
            : "0 6px 24px rgba(0,0,0,0.4)",
        }}
        aria-label="Help & Feedback"
      >
        <MessageCircleQuestion className="w-9 h-9 text-[#0a0e1a]" />
      </button>

      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  );
}