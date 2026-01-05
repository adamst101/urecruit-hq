import React, { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Calendar, MapPin, DollarSign, ExternalLink, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { base44 } from "@/api/base44Client";
import { useSeasonAccess } from "@/components/hooks/useSeasonAccess";
import { createPageUrl } from "@/utils";

const divisionColors = {
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  D2: "bg-blue-600 text-white",
  D3: "bg-emerald-600 text-white",
  NAIA: "bg-purple-600 text-white",
  JUCO: "bg-slate-600 text-white"
};

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function pickSchoolName(s) {
  return s?.school_name || s?.name || s?.title || "Unknown School";
}
function pickSchoolDivision(s) {
  return s?.division || s?.school_division || s?.division_code || s?.division_level || null;
}
function pickSchoolLogo(s) {
  return s?.logo_url || s?.school_logo_url || s?.logo || s?.image_url || null;
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

function getCampIdFromAllSources({ params, location }) {
  const fromParams = normId(params?.id) || normId(params?.camp_id);
  const fromState = normId(location?.state?.camp_id) || normId(location?.state?.id);
  const sp = new URLSearchParams(location?.search || "");
  const fromQuery = normId(sp.get("id") || sp.get("camp_id") || sp.get("campId"));

  let fromSession = null;
  try {
    fromSession = normId(sessionStorage.getItem("last_demo_camp_id"));
  } catch {}

  return fromParams || fromState || fromQuery || fromSession || null;
}

function safeDate(d) {
  try {
    return d ? format(new Date(d), "MMM d, yyyy") : "TBD";
  } catch {
    return "TBD";
  }
}

async function fetchOneById(entityName, id) {
  const cleanId = normId(id);
  if (!cleanId) return null;

  try {
    const rows = await base44.entities[entityName].filter({ id: cleanId });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  } catch {}

  try {
    const rows2 = await base44.entities[entityName].filter({ _id: cleanId });
    if (Array.isArray(rows2) && rows2[0]) return rows2[0];
  } catch {}

  return null;
}

async function fetchDemoCampDetail({ campId, demoYear }) {
  if (!campId || !demoYear) return null;

  const camp = await fetchOneById("Camp", campId);
  if (!camp) return null;

  // Ensure it belongs to demo year (same logic as Discover)
  const start = `${Number(demoYear)}-01-01`;
  const next = `${Number(demoYear) + 1}-01-01`;
  const d = camp?.start_date_
