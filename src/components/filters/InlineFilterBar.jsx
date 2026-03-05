// src/components/filters/InlineFilterBar.jsx
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const stateActive = !!currentState;
  const divActive = !!currentDivision;
  const distActive = !!distanceMiles;

  const baseCls = "h-9 text-xs border";
  const inactiveCls = `${baseCls} bg-[#111827] border-[#1f2937] text-[#9ca3af]`;
  const activeCls = `${baseCls} bg-[#1a2744] border-[#e8a020] text-[#f9fafb]`;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* State */}
      <Select
        value={currentState || "__all__"}
        onValueChange={(v) => {
          if (setNF) setNF({ state: v === "__all__" ? "" : v });
        }}
      >
        <SelectTrigger className={`w-[120px] ${stateActive ? activeCls : inactiveCls}`}>
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb] max-h-60">
          <SelectItem value="__all__" className="text-xs hover:!text-[#e8a020] data-[state=checked]:!text-[#e8a020]">All States</SelectItem>
          {US_STATES.map((st) => (
            <SelectItem key={st} value={st} className="text-xs hover:!text-[#e8a020] data-[state=checked]:!text-[#e8a020]">{st}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Division */}
      <Select
        value={currentDivision || "__all__"}
        onValueChange={(v) => {
          if (setNF) setNF({ divisions: v === "__all__" ? [] : [v] });
        }}
      >
        <SelectTrigger className={`w-[130px] ${divActive ? activeCls : inactiveCls}`}>
          <SelectValue placeholder="Division" />
        </SelectTrigger>
        <SelectContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb]">
          <SelectItem value="__all__" className="text-xs hover:!text-[#e8a020] data-[state=checked]:!text-[#e8a020]">All Divisions</SelectItem>
          {DIVISION_OPTIONS.map((d) => (
            <SelectItem key={d.value} value={d.value} className="text-xs hover:!text-[#e8a020] data-[state=checked]:!text-[#e8a020]">{d.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Distance (paid only) */}
      {isPaid && onDistanceChange && (
        <Select
          value={distanceMiles ? String(distanceMiles) : "__all__"}
          onValueChange={(v) => onDistanceChange(v === "__all__" ? null : Number(v))}
        >
          <SelectTrigger className={`w-[140px] ${distActive ? activeCls : inactiveCls}`}>
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