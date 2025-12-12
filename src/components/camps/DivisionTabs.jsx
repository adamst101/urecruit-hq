import React from 'react';
import { cn } from "@/lib/utils";

const divisions = [
  { id: 'all', label: 'All Camps' },
  { id: 'D1-FBS', label: 'D1-FBS', color: 'bg-amber-500' },
  { id: 'D1-FCS', label: 'D1-FCS', color: 'bg-orange-500' },
  { id: 'D2', label: 'Division II', color: 'bg-blue-600' },
  { id: 'D3', label: 'Division III', color: 'bg-emerald-600' },
  { id: 'NAIA', label: 'NAIA', color: 'bg-purple-600' },
  { id: 'JUCO', label: 'JUCO', color: 'bg-slate-600' },
];

export default function DivisionTabs({ selected, onChange, campCounts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {divisions.map(div => {
        const count = div.id === 'all' 
          ? campCounts.total 
          : campCounts[div.id] || 0;
        
        return (
          <button
            key={div.id}
            onClick={() => onChange(div.id)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
              "flex items-center gap-2",
              selected === div.id
                ? div.color 
                  ? `${div.color} text-white shadow-lg scale-105`
                  : "bg-slate-900 text-white shadow-lg scale-105"
                : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
            )}
          >
            {div.label}
            {count > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                selected === div.id
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}