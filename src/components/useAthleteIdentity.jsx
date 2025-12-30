import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Canonical identity resolver for the app.
 * - account: logged-in Base44 user
 * - athleteProfile: active AthleteProfile for that account
 *
 * This replaces ALL uses of:
 *   base44.functions.getAthleteProfile()
 */
export function useAthleteIdentity() {
  // 1) Logged-in account
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  // 2) Athlete profile for that account
  const athleteQuery = useQuery({
    queryKey: ["athleteProfile", accountQuery.data?.id],
    queryFn: async () => {
      const account = accountQuery.data;
      if (!account?.id) return null;

      const profiles = await base44.entities.AthleteProfile.filter({
        account_id: account.id,
        active: true
      });

      return profiles?.[0] || null;
    },
    enabled: !!accountQuery.data?.id,
    retry: false
  });

  return {
    account: accountQuery.data,
    athleteProfile: athleteQuery.data,
    isLoading: accountQuery.isLoading || athleteQuery.isLoading,
    isError: accountQuery.isError || athleteQuery.isError,
    error: accountQuery.error || athleteQuery.error
  };
}