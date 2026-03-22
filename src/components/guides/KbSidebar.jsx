// src/components/guides/KbSidebar.jsx
import React, { useState } from "react";
import { Search, ChevronDown, ChevronRight, X } from "lucide-react";

export const KB_CATEGORIES = [
  {
    id: "recruiting",
    label: "Recruiting Rules",
    icon: "📖",
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
    icon: "🏟️",
    topics: [
      { id: "costs",    icon: "💰", label: "What Camps Actually Cost" },
      { id: "strategy", icon: "🎯", label: "Building Your Camp Strategy" },
      { id: "film",     icon: "🎬", label: "Film That Coaches Watch" },
      { id: "social",   icon: "📱", label: "Social Media Strategy" },
    ],
  },
];

// Flat ordered list for next/prev navigation
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
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1f2937" }}>
        <div style={{ position: "relative" }}>
          <Search style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            width: 14, height: 14, color: "#4b5563"
          }} />
          <input
            type="text"
            placeholder="Search topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#0a0e1a", border: "1px solid #1f2937",
              borderRadius: 8, padding: "8px 10px 8px 32px",
              color: "#f9fafb", fontSize: 13, outline: "none",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0 }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>
      </div>

      {/* Category + topic list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 24px" }}>
        {filteredCategories.map((cat) => {
          const isCollapsed = collapsed[cat.id] && !searchQuery;
          return (
            <div key={cat.id} style={{ marginBottom: 4 }}>
              {/* Category header */}
              <button
                onClick={() => !searchQuery && setCollapsed((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 16px", color: "#6b7280", fontSize: 11,
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                }}
              >
                <span>{cat.icon} {cat.label}</span>
                {!searchQuery && (isCollapsed
                  ? <ChevronRight style={{ width: 13, height: 13 }} />
                  : <ChevronDown style={{ width: 13, height: 13 }} />)}
              </button>

              {/* Topics */}
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
                      padding: "9px 16px 9px 28px",
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#e8a020" : "#9ca3af",
                      borderRight: isActive ? "3px solid #e8a020" : "3px solid transparent",
                      background: isActive ? "rgba(232,160,32,0.07)" : "transparent",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{topic.icon}</span>
                    <span style={{ lineHeight: 1.3 }}>{topic.label}</span>
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

// Desktop sidebar (fixed left panel)
export function KbSidebarDesktop({ activeId, onSelect }) {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <div style={{
      width: 256, flexShrink: 0,
      borderRight: "1px solid #1f2937",
      background: "#0d1117",
      position: "sticky", top: 0,
      height: "100vh", overflowY: "auto",
    }}>
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #1f2937" }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#e8a020", letterSpacing: 1 }}>
          THE PLAYBOOK
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

// Mobile topic bar (horizontal scrollable pill row)
export function KbTopicBarMobile({ activeId, onSelect }) {
  const allTopics = KB_TOPICS_FLAT;
  return (
    <div style={{
      overflowX: "auto", display: "flex", gap: 8,
      padding: "10px 16px", scrollbarWidth: "none",
    }}>
      {allTopics.map((t) => {
        const isActive = activeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              flexShrink: 0, padding: "6px 14px", borderRadius: 20,
              border: "none", fontSize: 12, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              background: isActive ? "#e8a020" : "#1f2937",
              color: isActive ? "#0a0e1a" : "#9ca3af",
              transition: "all 0.15s",
            }}
          >
            {t.icon} {t.label}
          </button>
        );
      })}
    </div>
  );
}
