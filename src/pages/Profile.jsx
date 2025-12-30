import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, UserCircle2, ArrowRight, Lock } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * Profile
 * - Authenticated users: show athlete profile summary + logout
 * - Demo/unauthenticated users: show sign-in / upgrade CTA (no loops)
 *
 * Critical: Logout MUST actually sign out + clear caches + hard redirect.
 */
export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mode, loading: accessLoading, accountId, currentYear, demoYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading, isError: identityError, error: identityErrorObj } =
    useAthleteIdentity();

  const [logoutWorking, setLogoutWorking] = useState(false);

  const isAuthed = !!accountId;

  const headlineBadge = useMemo(() => {
    if (!isAuthed) return <Badge className="bg-slate-900 text-white">Demo {demoYear}</Badge>;
    if (mode === "paid") return <Badge className="bg-emerald-600 text-white">Paid {currentYear}</Badge>;
    return <Badge className="bg-amber-500 text-white">Unpaid {currentYear}</Badge>;
  }, [isAuthed, mode, currentYear, demoYear]);

  const handleLogout = async () => {
    setLogoutWorking(true);
    try {
      // 1) Real sign-out (method name can vary by SDK)
      if (base44?.auth?.signOut) {
        await base44.auth.signOut();
      } else if (base44?.auth?.logout) {
        await base44.auth.logout();
      }

      // 2) Clear react-query cache so nothing "sticks"
      queryClient.clear();

      // 3) Hard redirect + reload to eliminate stale in-memory session
      window.location.href = createPageUrl("Home");
    } catch (e) {
      // Even if SDK sign-out is weird, force-reset UI state
      try {
        queryClient.clear();
      } catch {}
      window.location.href = createPageUrl("Home");
    } finally {
      setLogoutWorking(false);
    }
  };

  // Loading
  if (accessLoading || identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Demo / unauthenticated view (do NOT route them to onboarding automatically)
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-md mx-auto p-4">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Profile</h1>
              {headlineBadge}
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Sign in to create a real athlete profile and save camps.
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto p-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <UserCircle2 className="w-6 h-6 text-slate-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-deep-navy">You’re in demo mode</div>
                <div className="text-sm text-slate-600 mt-1">
                  Demo browsing is available, but profiles require an account.
                </div>

                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                    Sign In / Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
                    Back to Demo
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Lock className="w-6 h-6 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">Unlock current season</div>
                <div className="text-sm text-amber-900/80 mt-1">
                  Upgrade to access current-year camps and planning.
                </div>
                <div className="mt-4">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                    Upgrade
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <BottomNav />
      </div>
    );
  }

  // Authenticated but identity error
  if (identityError) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-md mx-auto p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-deep-navy">Profile</h1>
                {headlineBadge}
              </div>
              <Button variant="outline" onClick={handleLogout} disabled={logoutWorking}>
                {logoutWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto p-4">
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load athlete profile</div>
            <div className="text-xs mt-2 break-words">
              {String(identityErrorObj?.message || identityErrorObj)}
            </div>
            <div className="mt-4 space-y-2">
              <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                Go to Onboarding
              </Button>
              <Button variant="outline" className="w-full" onClick={handleLogout} disabled={logoutWorking}>
                {logoutWorking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing out…
                  </>
                ) : (
                  "Sign Out"
                )}
              </Button>
            </div>
          </Card>
        </div>

        <BottomNav />
      </div>
    );
  }

  // Authenticated view (with or without athleteProfile)
  const hasProfile = !!athleteProfile;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-deep-navy">Profile</h1>
                {headlineBadge}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {hasProfile ? "Manage your athlete profile." : "Complete setup to personalize camps."}
              </div>
            </div>

            <Button variant="outline" onClick={handleLogout} disabled={logoutWorking}>
              {logoutWorking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing out…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {!hasProfile ? (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <UserCircle2 className="w-6 h-6 text-slate-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-deep-navy">No athlete profile yet</div>
                <div className="text-sm text-slate-600 mt-1">
                  Create your athlete profile so camps can be filtered and saved correctly.
                </div>
                <div className="mt-4">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                    Complete Setup
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <UserCircle2 className="w-6 h-6 text-slate-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-deep-navy">
                  {athleteProfile?.athlete_name || athleteProfile?.name || "Athlete"}
                </div>

                <div className="text-sm text-slate-600 mt-1 space-y-1">
                  {athleteProfile?.sport_id && (
                    <div>
                      <span className="font-medium text-slate-700">Sport:</span>{" "}
                      <span>{athleteProfile.sport_id}</span>
                    </div>
                  )}
                  {athleteProfile?.state && (
                    <div>
                      <span className="font-medium text-slate-700">State:</span>{" "}
                      <span>{athleteProfile.state}</span>
                    </div>
                  )}
                  {athleteProfile?.grad_year && (
                    <div>
                      <span className="font-medium text-slate-700">Grad Year:</span>{" "}
                      <span>{athleteProfile.grad_year}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                    Edit Profile / Setup
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>

                  {mode !== "paid" && (
                    <Button className="w-full" onClick={() => navigate(createPageUrl("Checkout"))}>
                      Upgrade to Current Season
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
