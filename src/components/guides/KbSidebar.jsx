// src/components/guides/KbSidebar.jsx
import React, { useEffect, useState } from "react";
import { Search, ChevronDown, ChevronRight, X, CheckCircle2, Lock } from "lucide-react";

export const KB_CATEGORIES = [
  {
    id: "recruiting",
    label: "Recruiting Rules",
    topics: [
      { id: "timeline",      icon: "📅", label: "The Recruiting Timeline" },
      { id: "communication", icon: "💬", label: "How to Contact Coaches" },
      { id: "offers",        icon: "🤝", label: "Understanding Offers" },
      { id: "playbook",      icon: "📋", label: "The Contact Playbook" },
    ],
  },
  {
    id: "camps",
    label: "Camp Strategy",
    topics: [
      { id: "costs",    icon: "💰", label: "What Camps Actually Cost" },
      { id: "strategy", icon: "🎯", label: "Building Your Camp Strategy" },
      { id: "film",     icon: "🎬", label: "Film That Coaches Watch" },
      { id: "social",   icon: "📱", label: "Social Media Strategy" },
    ],
  },
];

export const KB_TOPICS_FLAT = KB_CATEGORIES.flatMap((c) =>
  c.topics.map((t) => ({ ...t, categoryId: c.id, categoryLabel: c.label }))
);

// Articles unlocked in demo mode — all others show the paywall
export const DEMO_UNLOCKED_ARTICLE_IDS = ["timeline", "strategy"];

function SidebarContent({ activeId, onSelect, searchQuery, setSearchQuery, demoUnlockedIds }) {
  const [collapsed, setCollapsed] = useState({});

  const filteredCategories = KB_CATEGORIES.map((cat) => ({
    ...cat,
    topics: cat.topics.filter((t) =>
      !searchQuery || t.label.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.topics.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ position: "relative" }}>
          <Search style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            width: 13, height: 13, color: "#475569",
          }} />
          <input
            type="text"
            placeholder="Search guides…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 7, padding: "7px 10px 7px 30px",
              color: "#e2e8f0", fontSize: 13, outline: "none",
              fontFamily: "inherit",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute", right: 8, top: "50%",
                transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "#64748b", padding: 0,
              }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      </div>

      {/* Category + topic list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0 24px" }}>
        {filteredCategories.map((cat) => {
          const isCollapsed = collapsed[cat.id] && !searchQuery;
          return (
            <div key={cat.id} style={{ marginBottom: 4 }}>
              <button
                onClick={() => !searchQuery && setCollapsed((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 16px", color: "#64748b", fontSize: 10,
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                  fontFamily: "inherit",
                }}
              >
                <span>{cat.label}</span>
                {!searchQuery && (isCollapsed
                  ? <ChevronRight style={{ width: 12, height: 12 }} />
                  : <ChevronDown style={{ width: 12, height: 12 }} />
                )}
              </button>

              {!isCollapsed && cat.topics.map((topic) => {
                const isActive = activeId === topic.id;
                const isLocked = demoUnlockedIds != null && !demoUnlockedIds.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    onClick={() => onSelect(topic.id)}
                    style={{
                      width: "100%", background: "none", border: "none",
                      cursor: "pointer", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 16px 8px 24px",
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isLocked ? "#4b5563" : isActive ? "#f1f5f9" : "#94a3b8",
                      borderLeft: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                      background: isActive ? "rgba(59,130,246,0.09)" : "transparent",
                      transition: "all 0.12s",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 14, opacity: isLocked ? 0.4 : 1 }}>{topic.icon}</span>
                    <span style={{ lineHeight: 1.35, flex: 1 }}>{topic.label}</span>
                    {isLocked && (
                      <Lock style={{ width: 11, height: 11, color: "#4b5563", flexShrink: 0, marginRight: 4 }} />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KbSidebarDesktop({ activeId, onSelect, demoUnlockedIds }) {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <div style={{
      width: 240, flexShrink: 0,
      borderRight: "1px solid rgba(255,255,255,0.06)",
      background: "#080e1c",
      position: "sticky", top: 0,
      height: "100vh", overflowY: "auto",
    }}>
      <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 4,
        }}>
          The Playbook
        </div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>
          Recruiting guides for parents
        </div>
      </div>
      <SidebarContent
        activeId={activeId}
        onSelect={onSelect}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        demoUnlockedIds={demoUnlockedIds}
      />
    </div>
  );
}

// ── Mobile bottom-sheet drawer ────────────────────────────────────────────────
export function KbMobileDrawer({ activeId, onSelect, isOpen, onClose, demoUnlockedIds }) {
  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.52)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
        background: "#ffffff",
        borderRadius: "18px 18px 0 0",
        maxHeight: "82vh",
        overflowY: "auto",
        transform: isOpen ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.20)",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
        WebkitOverflowScrolling: "touch",
      }}>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#e2e8f0" }} />
        </div>

        {/* Sheet header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 20px 14px",
          borderBottom: "1px solid #f1f5f9",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            All guides
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9", border: "none", borderRadius: 8,
              padding: "6px 14px", fontSize: 13, fontWeight: 600,
              color: "#374151", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Done
          </button>
        </div>

        {/* Topic list by category */}
        <div style={{ paddingBottom: 32 }}>
          {KB_CATEGORIES.map((cat, catIdx) => (
            <div key={cat.id}>
              {/* Category divider label */}
              <div style={{
                padding: "14px 20px 6px",
                fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.09em",
                color: "#94a3b8",
                borderTop: catIdx > 0 ? "1px solid #f1f5f9" : "none",
              }}>
                {cat.label}
              </div>

              {cat.topics.map((topic) => {
                const isActive = activeId === topic.id;
                const isLocked = demoUnlockedIds != null && !demoUnlockedIds.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    onClick={() => onSelect(topic.id)}
                    style={{
                      width: "100%", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "13px 20px",
                      border: "none",
                      borderLeft: isActive ? "3px solid #2563eb" : "3px solid transparent",
                      background: isActive ? "rgba(37,99,235,0.05)" : "transparent",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0, opacity: isLocked ? 0.35 : 1 }}>{topic.icon}</span>
                    <span style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: isActive ? 600 : 400,
                      color: isLocked ? "#9ca3af" : isActive ? "#1e3a8a" : "#374151",
                      lineHeight: 1.3,
                    }}>
                      {topic.label}
                    </span>
                    {isLocked ? (
                      <Lock style={{ width: 14, height: 14, color: "#9ca3af", flexShrink: 0 }} />
                    ) : isActive ? (
                      <CheckCircle2 style={{ width: 16, height: 16, color: "#2563eb", flexShrink: 0 }} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
