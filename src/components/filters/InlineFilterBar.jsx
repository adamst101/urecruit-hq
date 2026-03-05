// src/components/filters/InlineFilterBar.jsx
import React, { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeState } from "./filterUtils.jsx";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const DIVISION_OPTIONS = [
  { value: "D1 (FBS)", label: "D1 (FBS)" },
  { value: "D1 (FCS)", label: "D1 (FCS)" },
  { value: "D2", label: "D2" },
  { value: "D3", label: "D3" },
  { value: "NAIA", label: "NAIA" },
  { value: "JUCO", label: "JUCO" },
];

const DISTANCE_OPTIONS = [
  { value: "50", label: "Within 50 mi" },
  { value: "100", label: "Within 100 mi" },
  { value: "200", label: "Within 200 mi" },
  { value: "500", label: "Within 500 mi" },
];

export default function InlineFilterBar({ nf, setNF, isPaid, distanceMiles, onDistanceChange }) {
  const currentState = nf?.state || "";
  const currentDivision = Array.isArray(nf?.divisions) && nf.divisions.length === 1
    ? nf.divisions[0]
    : "";

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* State */}
      <Select
        value={currentState || "__all__"}
        onValueChange={(v) => setNF({ state: v === "__all__" ? "" : v })}
      >
        <SelectTrigger className="w-[120px] h-9 bg-[#111827] border-[#1f2937] text-[#f9fafb] text-xs">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb] max-h-60">
          <SelectItem value="__all__" className="text-xs">All States</SelectItem>
          {US_STATES.map((st) => (
            <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Division */}
      <Select
        value={currentDivision || "__all__"}
        onValueChange={(v) => setNF({ divisions: v === "__all__" ? [] : [v] })}
      >
        <SelectTrigger className="w-[130px] h-9 bg-[#111827] border-[#1f2937] text-[#f9fafb] text-xs">
          <SelectValue placeholder="Division" />
        </SelectTrigger>
        <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb]">
          <SelectItem value="__all__" className="text-xs">All Divisions</SelectItem>
          {DIVISION_OPTIONS.map((d) => (
            <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Distance (paid only) */}
      {isPaid && onDistanceChange && (
        <Select
          value={distanceMiles ? String(distanceMiles) : "__all__"}
          onValueChange={(v) => onDistanceChange(v === "__all__" ? null : Number(v))}
        >
          <SelectTrigger className="w-[140px] h-9 bg-[#111827] border-[#1f2937] text-[#f9fafb] text-xs">
            <SelectValue placeholder="Distance" />
          </SelectTrigger>
          <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb]">
            <SelectItem value="__all__" className="text-xs">Any Distance</SelectItem>
            {DISTANCE_OPTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}