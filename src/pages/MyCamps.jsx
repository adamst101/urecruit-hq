// src/pages/MyCamps.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Trash2, RefreshCw, Wrench } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav";
import RouteGuard from "../components/auth/RouteGuard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { base44 } from "../api/base44Client";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function normLower(x) {
  return String(x || "").trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function chunk(arr, size) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Number(size) || 25);
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("rate limited") || msg.includes("429") || msg.includes("too many");
}

async function safeFilter(entity, where, sort, limit, { retries = 1, baseDelayMs = 250 } = {}) {
  if (!entity?.filter) return [];
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await entity.filter(where || {}, sort, limit);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      last = e;
      if (!isRateLimitError(e) || attempt === retries) break;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw last;
}

function MyCampsPage() {
  const navigate = useNavigate();
  const { currentYear } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const athleteId = normId(athleteProfile);
  const sportId = normId(athleteProfile?.sport_id) || athleteProfile?.sport_id;

  // Diagnostics on demand only
  const [diag, setDiag] = useState({
    loading: false,
    loaded: false,
    count: 0,
    favorites: 0,
    registered: 0,
    err: "",
    intentRows: [],
    sampleKeys: [],
  });

  const [resolve, setResolve] = useState({
    running: false,
    done: false,
    err: "",
    key: "",
    attempts: [],
    found: false,
    foundBy: "",
    foundCamp: null,
  });

  const [resetState, setResetState] = useState({
    running: false,
    done: false,
    err: "",
    deleted: 0,
  });

  const { data, isLoading, isError, error, refetch } = useCampSummariesClient({
    athleteId: athleteId ? String(athleteId) : undefined,
    sportId: sportId ? String(sportId) : "",
    enabled: !!athleteId,
  });

  const campSummaries = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const registered = useMemo(() => {
    return campSummaries.filter((c) => {
      const st = normLower(c?.intent_status);
      return st === "registered" || st === "completed";
    });
  }, [campSummaries]);

  const favorites = useMemo(() => {
    return campSummaries.filter((c) => normLower(c?.intent_status) === "favorite");
  }, [campSummaries]);

  async function runDiagnostics() {
    if (!athleteId) return;

    setDiag({
      loading: true,
      loaded: false,
      count: 0,
      favorites: 0,
      registered: 0,
      err: "",
      intentRows: [],
      sampleKeys: [],
    });
    setResolve({ running: false, done: false, err: "", key: "", attempts: [], found: false, foundBy: "", foundCamp: null });
    setResetState({ running: false, done: false, err: "", deleted: 0 });

    try {
      const Intent = base44?.entities?.CampIntent;
      if (!Intent?.filter) throw new Error("CampIntent not available");

      const rows = await safeFilter(Intent, { athlete_id: String(athleteId) }, undefined, undefined, { retries: 2 });
      const arr = Array.isArray(rows) ? rows : [];

      const fav = arr.filter((r) => normLower(r?.status) === "favorite").length;
      const reg = arr.filter((r) => ["registered", "completed"].includes(normLower(r?.status))).length;

      const sampleKeys = arr
        .map((r) => String(r?.camp_id || ""))
        .filter(Boolean)
        .slice(0, 5);

      setDiag({
        loading: false,
        loaded: true,
        count: arr.length,
        favorites: fav,
        registered: reg,
        err: "",
        intentRows: arr,
        sampleKeys,
      });
    } catch (e) {
      setDiag({
        loading: false,
        loaded: true,
        count: 0,
        favorites: 0,
        registered: 0,
        err: String(e?.message || e),
        intentRows: [],
        sampleKeys: [],
      });
    }
  }

  async function resolveOneIntentKey() {
    if (!athleteId) return;
    const Camp = base44?.entities?.Camp;
    if (!Camp?.filter) {
      setResolve((p) => ({ ...p, done: true, err: "Camp entity not available." }));
      return;
    }

    // pick the newest favorite/registered intent if possible
    const intents = Array.isArray(diag.intentRows) ? diag.intentRows : [];
    const candidate = intents.find((r) => ["favorite", "registered", "completed"].includes(normLower(r?.status))) || intents[0];
    const key = String(candidate?.camp_id || "").trim();
    if (!key) {
      setResolve({ running: false, done: true, err: "No intent key found to resolve.", key: "", attempts: [], found: false, foundBy: "", foundCamp: null });
      return;
    }

    setResolve({ running: true, done: false, err: "", key, attempts: [], found: false, foundBy: "", foundCamp: null });

    const attempts = [
      { label: "Camp.id", where: { id: key } },
      { label: "Camp._id", where: { _id: key } },
      { label: "Camp.event_key", where: { event_key: key } },
      { label: "Camp.eventKey", where: { eventKey: key } },
      { label: "Camp.source_key", where: { source_key: key } },
      { label: "Camp.event_id", where: { event_id: key } },
    ];

    try {
      for (const a of attempts) {
        let rows = [];
        let ok = false;
        let note = "";
        try {
          rows = await safeFilter(Camp, a.where, undefined, 2, { retries: 1, baseDelayMs: 300 });
          ok = true;
          note = `rows=${Array.isArray(rows) ? rows.length : 0}`;
        } catch (e) {
          ok = false;
          note = String(e?.message || e);
        }

        setResolve((prev) => ({
          ...prev,
          attempts: [...prev.attempts, { label: a.label, ok, note }],
        }));

        if (ok && Array.isArray(rows) && rows.length > 0) {
          const foundCamp = rows[0];
          setResolve({
            running: false,
            done: true,
            err: "",
            key,
            attempts: (prev => prev)(null), // placeholder, overwritten next line
            found: true,
            foundBy: a.label,
            foundCamp: {
              id: String(foundCamp?.id ?? foundCamp?._id ?? ""),
              event_key: foundCamp?.event_key ?? foundCamp?.eventKey ?? null,
              sport_id: String(normId(foundCamp?.sport_id) || foundCamp?.sport_id || ""),
              season_year: foundCamp?.season_year ?? null,
              camp_name: foundCamp?.camp_name ?? foundCamp?.name ?? null,
            },
          });

          // Because we can’t reference resolve.attempts in that setResolve above cleanly, do a second merge.
          setResolve((prev) => ({
            ...prev,
            running: false,
            done: true,
            found: true,
            foundBy: a.label,
            foundCamp: {
              id: String(foundCamp?.id ?? foundCamp?._id ?? ""),
              event_key: foundCamp?.event_key ?? foundCamp?.eventKey ?? null,
              sport_id: String(normId(foundCamp?.sport_id) || foundCamp?.sport_id || ""),
              season_year: foundCamp?.season_year ?? null,
              camp_name: foundCamp?.camp_name ?? foundCamp?.name ?? null,
            },
          }));
          return;
        }

        await sleep(80);
      }

      setResolve((prev) => ({
        ...prev,
        running: false,
        done: true,
        found: false,
        foundBy: "",
        foundCamp: null,
        err: "No Camp row matched this intent key by any known field.",
      }));
    } catch (e) {
      setResolve((prev) => ({
        ...prev,
        running: false,
        done: true,
        err: String(e?.message || e),
      }));
    }
  }

  async function resetFavorites() {
    if (!athleteId) return;
    const Intent = base44?.entities?.CampIntent;
    if (!Intent?.filter || !Intent?.delete) {
      setResetState({
        running: false,
        done: false,
        err: "CampIntent delete not available in this environment.",
        deleted: 0,
      });
      return;
    }

    setResetState({ running: true, done: false, err: "", deleted: 0 });

    try {
      const rows = await safeFilter(Intent, { athlete_id: String(athleteId) }, undefined, undefined, { retries: 2 });
      const arr = Array.isArray(rows) ? rows : [];

      const toDelete = arr
        .filter((r) => ["favorite", "registered", "completed", ""].includes(normLower(r?.status)))
        .map((r) => String(r?.id || ""))
        .filter(Boolean);

      let deleted = 0;
      for (const part of chunk(toDelete, 15)) {
        for (const id of part) {
          try {
            await Intent.delete(id);
            deleted += 1;
          } catch {
            // ignore
          }
          await sleep(80);
        }
        await sleep(250);
      }

      setResetState({ running: false, done: true, err: "", deleted });

      await runDiagnostics();
      await refetch();
    } catch (e) {
      setResetState({ running: false, done: false, err: String(e?.message || e), deleted: 0 });
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-20">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load My Camps</div>
          <div className="text-xs mt-2 break-words">{String(error?.message || error)}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="w-full" onClick={() => refetch()}>
              Retry
            </Button>
            <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
              Back to Discover
            </Button>
          </div>
        </Card>
        <BottomNav />
      </div>
    );
  }

  const showEmpty = registered.length === 0 && favorites.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy">My Camps</h1>
          <div className="text-sm text-slate-600 mt-1">Current season ({currentYear}).</div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {showEmpty && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-slate-600 mt-0.5" />
              <div className="w-full">
                <div className="font-semibold text-deep-navy">No camps yet</div>
                <div className="text-sm text-slate-600 mt-1">
                  Favorite or register for camps in Discover to see them here.
                </div>

                <div className="mt-4 flex gap-2">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
                    Go to Discover
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={runDiagnostics}
                    disabled={diag.loading}
                  >
                    {diag.loading ? "Checking…" : "Troubleshoot"}
                  </Button>
                </div>

                {diag.loaded && (
                  <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {diag.err ? (
                      <>
                        <div className="font-semibold">Diagnostics failed</div>
                        <div className="mt-1 break-words">{diag.err}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">Intent status</div>
                        <div className="mt-1">
                          Intents: {diag.count} • Favorites: {diag.favorites} • Registered: {diag.registered}
                        </div>

                        {diag.sampleKeys.length > 0 && (
                          <div className="mt-2">
                            <div className="font-semibold">Sample keys</div>
                            <div className="mt-1 break-words">{diag.sampleKeys.join(" • ")}</div>
                          </div>
                        )}

                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => refetch()}
                            disabled={resetState.running || resolve.running}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Reload
                          </Button>
                          <Button
                            className="w-full"
                            onClick={resetFavorites}
                            disabled={resetState.running || resolve.running || diag.count === 0}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {resetState.running ? "Resetting…" : "Reset favorites"}
                          </Button>
                        </div>

                        <div className="mt-2">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={resolveOneIntentKey}
                            disabled={resolve.running || diag.count === 0}
                          >
                            <Wrench className="w-4 h-4 mr-2" />
                            {resolve.running ? "Resolving…" : "Resolve 1 intent key"}
                          </Button>
                        </div>

                        {resetState.err && <div className="mt-2 text-xs text-rose-700 break-words">{resetState.err}</div>}
                        {resetState.done && !resetState.err && (
                          <div className="mt-2 text-xs text-emerald-700">
                            Reset complete. Deleted {resetState.deleted} intents. Now go favorite 1 camp in Discover.
                          </div>
                        )}

                        {resolve.done && (
                          <div className="mt-3 text-xs bg-white border border-amber-200 rounded-lg p-3 text-amber-900">
                            <div className="font-semibold">Resolve result</div>
                            <div className="mt-1 break-words">
                              Key: <span className="font-mono">{resolve.key}</span>
                            </div>

                            <div className="mt-2 space-y-1">
                              {resolve.attempts.map((a, idx) => (
                                <div key={idx} className="flex items-start justify-between gap-2">
                                  <div className="font-mono">{a.label}</div>
                                  <div className={a.ok ? "text-emerald-700" : "text-slate-600"}>{a.ok ? "OK" : "Fail"}</div>
                                </div>
                              ))}
                            </div>

                            {resolve.found ? (
                              <div className="mt-2">
                                <div className="text-emerald-700 font-semibold">Found by: {resolve.foundBy}</div>
                                <pre className="mt-2 text-[11px] overflow-auto">{JSON.stringify(resolve.foundCamp, null, 2)}</pre>
                              </div>
                            ) : (
                              <div className="mt-2 text-rose-700">{resolve.err || "Not found"}</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {registered.length > 0 && (
          <Section title="Registered">
            {registered.map((c) => (
              <CampRow key={c.camp_id} camp={c} />
            ))}
          </Section>
        )}

        {favorites.length > 0 && (
          <Section title="Favorites">
            {favorites.map((c) => (
              <CampRow key={c.camp_id} camp={c} />
            ))}
          </Section>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function MyCamps() {
  return (
    <RouteGuard requireAuth={true} requirePaid={true} requireProfile={true}>
      <MyCampsPage />
    </RouteGuard>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CampRow({ camp }) {
  return (
    <Card className="p-3">
      <div className="font-semibold text-deep-navy">{camp.school_name || "Unknown School"}</div>
      <div className="text-sm text-slate-600">{camp.camp_name || "Camp"}</div>
    </Card>
  );
}