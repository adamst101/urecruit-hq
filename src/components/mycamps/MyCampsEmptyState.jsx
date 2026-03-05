import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";

export default function MyCampsEmptyState({ tab, onSwitchToFavorites }) {
  const nav = useNavigate();

  if (tab === "favorites") {
    return (
      <div className="text-center py-16 px-4">
        <div className="text-4xl mb-4">★</div>
        <div className="text-lg font-semibold text-[#f9fafb] mb-2">No favorites yet</div>
        <div className="text-sm text-[#9ca3af] mb-6 max-w-xs mx-auto">
          Star camps on the Discover page to save them here.
        </div>
        <button
          onClick={() => nav(createPageUrl("Discover"))}
          style={{
            background: "#e8a020",
            color: "#0a0e1a",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Browse Camps →
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-16 px-4">
      <div className="text-4xl mb-4">✓</div>
      <div className="text-lg font-semibold text-[#f9fafb] mb-2">No registered camps yet</div>
      <div className="text-sm text-[#9ca3af] mb-6 max-w-xs mx-auto">
        Register for camps from your Favorites list.
      </div>
      <button
        onClick={onSwitchToFavorites}
        style={{
          background: "#e8a020",
          color: "#0a0e1a",
          border: "none",
          borderRadius: 8,
          padding: "10px 24px",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        View Favorites →
      </button>
    </div>
  );
}