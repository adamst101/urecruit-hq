// src/components/guides/KbSidebar.jsx
import React, { useState } from "react";
import { Search, ChevronDown, ChevronRight, X } from "lucide-react";

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

function SidebarContent({ activeId, onSelect, searchQuery, setSearchQuery }) {
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
                      color: isActive ? "#f1f5f9" : "#94a3b8",
                      borderLeft: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                      background: isActive ? "rgba(59,130,246,0.09)" : "transparent",
                      transition: "all 0.12s",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{topic.icon}</span>
                    <span style={{ lineHeight: 1.35 }}>{topic.label}</span>
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

export function KbSidebarDesktop({ activeId, onSelect }) {
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
      />
    </div>
  );
}

export function KbTopicBarMobile({ activeId, onSelect }) {
  return (
    <div style={{
      overflowX: "auto", display: "flex", gap: 6,
      padding: "8px 16px", scrollbarWidth: "none",
    }}>
      {KB_TOPICS_FLAT.map((t) => {
        const isActive = activeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              flexShrink: 0, padding: "5px 12px", borderRadius: 20,
              border: isActive ? "none" : "1px solid rgba(255,255,255,0.08)",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              background: isActive ? "#f1f5f9" : "transparent",
              color: isActive ? "#0f172a" : "#94a3b8",
              transition: "all 0.12s",
              fontFamily: "inherit",
            }}
          >
            {t.icon} {t.label}
          </button>
        );
      })}
    </div>
  );
}
