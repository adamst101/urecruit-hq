import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { base44 } from "../api/base44Client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

/**
 * Assumptions:
 * - You have a base44 entity: base44.entities.Sport
 * - Each Sport has at least: { id, name } and optionally { is_active, slug }
 *
 * Props:
 * - value: sport_id (string | null)
 * - onChange: (sportId: string | null, sportObj?: object) => void
 * - disabled?: boolean
 * - placeholder?: string
 */
export default function SportSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Select a sport…",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load sports once
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Prefer active sports if field exists; otherwise just list all.
        // If your SDK supports query options, adjust accordingly.
        const rows = await base44.entities.Sport.list();
        if (!mounted) return;

        const normalized = Array.isArray(rows) ? rows : [];
        // If there's an is_active flag, show active first.
        normalized.sort((a, b) => {
          const aa = a?.is_active === false ? 1 : 0;
          const bb = b?.is_active === false ? 1 : 0;
          if (aa !== bb) return aa - bb;
          return String(a?.name || "").localeCompare(String(b?.name || ""));
        });

        setSports(normalized);
      } catch {
        if (mounted) setSports([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedSport = useMemo(() => {
    if (!value) return null;
    return sports.find((s) => String(s?.id) === String(value)) || null;
  }, [value, sports]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sports;
    return sports.filter((s) => {
      const name = String(s?.name || "").toLowerCase();
      const slug = String(s?.slug || "").toLowerCase();
      return name.includes(needle) || slug.includes(needle);
    });
  }, [q, sports]);

  function pick(s) {
    onChange?.(s?.id ? String(s.id) : null, s);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">
          {selectedSport?.name || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </Button>

      {open && (
        <Card className="absolute z-50 mt-2 w-full p-2 shadow-lg">
          <div className="flex items-center gap-2 p-2">
            <Search className="h-4 w-4 opacity-60" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sports…"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-auto">
            {loading ? (
              <div className="p-3 text-sm opacity-70">Loading sports…</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-sm opacity-70">No matches.</div>
            ) : (
              filtered.map((s) => {
                const isSelected = String(s?.id) === String(value);
                return (
                  <button
                    key={String(s?.id)}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted"
                    onClick={() => pick(s)}
                  >
                    <span className="truncate">{s?.name || "Unnamed sport"}</span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex justify-end p-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}