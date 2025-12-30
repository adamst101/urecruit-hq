import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

import BottomNav from "../components/navigation/BottomNav";

import { ChevronLeft, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns";

import { useAthleteIdentity } from "../components/useAthleteIdentity";

export default function Calendar() {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [sportFilter, setSportFilter] = useState("all");

  // -----------------------------
  // Identity (hook must ALWAYS run)
  // -----------------------------
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  const athleteId = clean(athleteProfile?.id);
  const athleteSportId = clean(athleteProfile?.sport_id);

  // -----------------------------
  // Client-side summaries adapter (hook must ALWAYS run)
  // Mirrors MyCamps exactly; uses enabled flag to defer until athleteId exists.
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useQuery({
    queryKey: ["myCampsSummaries_client", athleteId, athleteSportId],
    enabled: !!athleteId && !identityLoading && !identityError,
    retry: false,
    queryFn: async () => {
      const payload = {
        athlete_id: athleteId,
        sport_id: athleteSportId,
        limit: 500
      };

      // Camps (optionally by sport)
      const campQuery = {};
      if (payload.sport_id) campQuery.sport_id = payload.sport_id;

      const camps = await base44.entities.Camp.filter(
        campQuery,
        "-start_date",
        payload.limit || 500
      );

      // Batch join: School / Sport / Position
      const schoolIds = [...new Set(camps.map((c) => c.school_id).filter(Boolean))];
      const sportIds = [...new Set(camps.map((c) => c.sport_id).filter(Boolean))];

      const [schools, sports, positions] = await Promise.all([
        schoolIds.length
          ? base44.entities.School.filter({ id: { $in: schoolIds } })
          : Promise.resolve([]),
        sportIds.length
          ? base44.entities.Sport.filter({ id: { $in: sportIds } })
          : Promise.resolve([]),
        base44.entities.Position.list()
      ]);

      const schoolMap = Object.fromEntries(schools.map((s) => [s.id, s]));
      const sportMap = Object.fromEntries(sports.map((s) => [s.id, s]));
      const positionMap = Object.fromEntries(positions.map((p) => [p.id, p]));

      // Athlete-specific: CampIntent + TargetSchool
      const [intents, targets] = await Promise.all([
        base44.entities.CampIntent.filter({ athlete_id: payload.athlete_id }),
        base44.entities.TargetSchool.filter({ athlete_id: payload.athlete_id })
      ]);

      const intentMap = Object.fromEntries(intents.map((i) => [i.camp_id, i]));
      const targetSchoolIds = new Set(targets.map((t) => t.school_id));

      // Summaries
      return camps.map((camp) => {
        const school = schoolMap[camp.school_id];
        const sport = sportMap[camp.sport_id];
        const intent = intentMap[camp.id] || null;
        const campPositions = (camp.position_ids || [])
          .map((pid) => positionMap[pid])
          .filter(Boolean);

        return {
          camp_id: camp.id,
          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date,
          price: camp.price,
          link_url: camp.link_url,
          notes: camp.notes,
          city: camp.city,
          state: camp.state,
          position_ids: camp.position_ids || [],
          position_codes: campPositions.map((p) => p.position_code),

          school_id: school?.id,
          school_name: school?.school_name,
          school_division: school?.division,
          school_logo_url: school?.logo_url,
          school_city: school?.city,
          school_state: school?.state,
          school_conference: school?.conference,

          sport_id: sport?.id,
          sport_name: sport?.sport_name,

          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,
          is_target_school: targetSchoolIds.has(camp.school_id)
        };
      });
    }
  });

  // -----------------------------
  // Derived lists (hooks must ALWAYS run)
  // -----------------------------
  const sortedSummaries = useMemo(() => {
    const list = Array.isArray(campSummaries) ? [...campSummaries] : [];
    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries]);

  const { registeredCamps, favoriteCamps } = useMemo(() => {
    let registered = sortedSummaries.filter(
      (c) => c.intent_status === "registered" || c.intent_status === "completed"
    );
    let favorite = sortedSummaries.filter((c) => c.intent_status === "favorite");

    if (sportFilter !== "all") {
      registered = registered.filter((c) => c.sport_id === sportFilter);
      favorite = favorite.filter((c) => c.sport_i_
