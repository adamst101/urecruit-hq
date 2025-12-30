import React, { useEffect, useState } from "react";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { createPageUrl } from "../utils";

export default function LogoutDebug() {
  const { accountId, mode } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const [me, setMe] = useState(null);
  const [err, setErr] = useState(null);
  const [working, setWorking] = useState(false);

  const refreshMe = async () => {
    setErr(null);
    try {
      if (base44?.auth?.me) {
        const r = await base44.auth.me();
        setMe(r || null);
      } else {
        setMe({ note: "base44.auth.me() not available" });
      }
    } catch (e) {
      setErr(String(e?.message || e));
      setMe(null);
    }
  };

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hardLogout = async () => {
    setWorking(true);
    setErr(null);
    try {
      // Try common logout methods
      if (base44?.auth?.signOut) await base44.auth.signOut();
      if (base44?.auth?.logout) await base44.auth.logout();

      // Try to refresh auth state after logout
      await refreshMe();

      // Force a hard redirect to Home
      window.location.href = createPageUrl("Home") + `?t=${Date.now()}`;
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Logout Debug</h1>

        <Card className="p-4 space-y-2">
          <div className="font-semibold">useSeasonAccess()</div>
          <div className="text-sm">accountId: {String(accountId)}</div>
          <div className="text-sm">mode: {String(mode)}</div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="font-semibold">useAthleteIdentity()</div>
          <div className="text-sm">athleteProfile: {athleteProfile ? "present" : "null"}</div>
          {athleteProfile?.id && <div className="text-sm">athleteProfile.id: {athleteProfile.id}</div>}
        </Card>

        <Card className="p-4 space-y-2">
          <div className="font-semibold">base44.auth.me()</div>
          {err && <div className="text-sm text-rose-700">Error: {err}</div>}
          <pre className="text-xs bg-white p-2 rounded border overflow-auto">
            {JSON.stringify(me, null, 2)}
          </pre>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshMe} disabled={working}>
              Refresh
            </Button>
            <Button onClick={hardLogout} disabled={working}>
              {working ? "Logging out..." : "Hard Logout"}
            </Button>
          </div>
        </Card>

        <Card className="p-4 text-sm text-slate-600">
          If accountId stays non-null after logout, sign-out is not actually clearing session in Base44.
        </Card>
      </div>
    </div>
  );
}