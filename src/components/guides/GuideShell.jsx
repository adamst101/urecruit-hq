import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { ArrowLeft } from "lucide-react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

export default function GuideShell({ title, subtitle, sections, children }) {
  const nav = useNavigate();
  const [activeId, setActiveId] = useState(sections[0]?.id || "");
  const observerRef = useRef(null);

  useEffect(() => {
    const els = sections.map(s => document.getElementById(s.id)).filter(Boolean);
    if (!els.length) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0.1 }
    );
    els.forEach(el => observerRef.current.observe(el));
    return () => observerRef.current?.disconnect();
  }, [sections]);

  function scrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      {/* Sticky nav */}
      <div style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(10,14,26,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1f2937",
        padding: "12px 16px"
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                borderRadius: 20,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: activeId === s.id ? "#e8a020" : "#1f2937",
                color: activeId === s.id ? "#0a0e1a" : "#9ca3af",
                transition: "all 0.2s"
              }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px 80px" }}>
        {/* Back + Header */}
        <button
          onClick={() => nav(createPageUrl("Workspace"))}
          style={{ background: "none", border: "none", color: "#e8a020", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#f3b13f"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#e8a020"; }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} /> HQ
        </button>

        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: "#f9fafb", margin: "0 0 8px", lineHeight: 1.1 }}>
          {title}
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 16, lineHeight: 1.6, margin: "0 0 48px", maxWidth: 600 }}>
          {subtitle}
        </p>

        {children}
      </div>
    </div>
  );
}