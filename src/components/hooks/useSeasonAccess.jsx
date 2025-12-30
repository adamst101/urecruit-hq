import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess
 * Determines whether user sees Demo season or Paid season.
 *
 * CURRENT behavior (secure default):
 * - If not logged in -> demo
 * - If logged in -> demo unless Entitlement says active for current year
 *
 * This is intentionally conservative. You can loosen later.
 */
export function useSeasonAccess() {
  const currentYear = new Date().getFullYear();
  const demoYear = currentYear - 1;

  // Account is optional: base44.auth.me() should return null/undefined when logged out.
  const {
    data: account,
    isLoading: accountLoading,
    isError: accountError
  } = useQuery({
    queryKey: ["auth_me_optional"],
    retry: false,
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  // Entitlement check (secure default: if anything fails, demo)
  const {
    data: entitlementActive,
    isLoading: entitlementLoading
  } = useQuery({
    queryKey: ["entitlement_current_year", account?.id, currentYear],
    enabled: !!account?.id,
    retry: false,
    queryFn: async () => {
      try {
        // If Entitlement entity doesn't exist yet, this will throw -> demo
        const rows = await base44.entities.Entitlement.filter({
          account_id: account.id,
          season_year: currentYear,
          status: "active"
        });

        const ent = rows?.[0];
        if (!ent) return false;

        // Optional date window check if fields exist
        const now = new Date();
        const startsOk = ent.starts_at ? new Date(ent.starts_at) <= now : true;
        const endsOk = ent.ends_at ? now <= new Date(ent.ends_at) : true;
        return startsOk && endsOk;
      } catch {
        return false;
      }
    }
  });

  const loading = accountLoading || entitlementLoading;

  // Mode decision
  const mode =
    account && !accountError && entitlementActive ? "paid" : "demo";

  const seasonYear = mode === "paid" ? currentYear : demoYear;

  return {
    mode, // "demo" | "paid"
    seasonYear,
    currentYear,
    demoYear,
    account,
    loading
  };
}