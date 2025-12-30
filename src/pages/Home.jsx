import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Home() {
  const navigate = useNavigate();

  const { data: account, isLoading: accountLoading, isError: accountError } = useQuery({
    queryKey: ["account"],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const {
    data: athleteProfile,
    isLoading: athleteLoading,
    isError: athleteError,
  } = useQuery({
    queryKey: ["athleteProfile", account?.id],
    queryFn: async () => {
      if (!account?.id) return null;
      const profiles = await base44.entities.AthleteProfile.filter({
        account_id: account.id,
        active: true,
      });
      return profiles?.[0] || null;
    },
    enabled: !!account?.id,
    retry: false,
  });

  useEffect(() => {
    if (accountLoading || athleteLoading) return;

    // If not logged in or auth fails, let your existing auth flow handle it
    if (accountError || athleteError) return;

    // No athlete profile → onboarding
    if (!athleteProfile) {
      navigate(createPageUrl("Onboarding"));
      return;
    }

    // Has profile → Discover
    navigate(createPageUrl("Discover"));
  }, [accountLoading, athleteLoading, accountError, athleteError, athleteProfile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );
}
