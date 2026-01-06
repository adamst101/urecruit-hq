import { useEffect, useMemo, useState } from "react";
import { base44 } from "../../api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Central identity resolver:
 * - auth user
 * - subscription status
 * - children list
 * - active child
 *
 * Replace base44.functions.* with your real function names.
 */
export function useIdentity() {
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState({ status: "unknown" }); // "active" | "inactive" | "unknown"
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState(null);
  const [error, setError] = useState(null);

  // Local storage active child (per user)
  const activeChildKey = useMemo(() => {
    const uid = user?.id || user?.user_id || "anon";
    return `activeChildId:${uid}`;
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1) Auth user
        const me = await base44.auth.me?.();
        if (!mounted) return;

        if (!me) {
          setUser(null);
          setSubscription({ status: "inactive" });
          setChildren([]);
          setActiveChildId(null);
          setLoading(false);
          return;
        }

        setUser(me);

        // 2) Subscription
        // Expected return: { status: "active" | "inactive" }
        // If you don't have it yet, default inactive and flip later when wired.
        let sub = { status: "inactive" };
        try {
          sub = (await base44.functions.getSubscriptionStatus?.()) || sub;
        } catch {
          // keep default
        }
        if (!mounted) return;
        setSubscription(sub);

        // 3) Children
        // Expected return: [{ id, first_name, last_name, sport, grad_year, ... }]
        let kids = [];
        try {
          kids = (await base44.functions.listChildren?.()) || [];
        } catch {
          kids = [];
        }
        if (!mounted) return;
        setChildren(kids);

        // 4) Active child
        const saved = window.localStorage.getItem(activeChildKey);
        const savedValid = saved && kids.some(k => String(k.id) === String(saved));
        const fallback = kids[0]?.id ?? null;

        const resolvedActive = savedValid ? saved : fallback;
        setActiveChildId(resolvedActive);

        if (resolvedActive) {
          window.localStorage.setItem(activeChildKey, String(resolvedActive));
        }
      } catch (e) {
        if (!mounted) return;
        setError(e);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [activeChildKey, queryClient]);

  const isAuthed = !!user;
  const isSubscribed = subscription?.status === "active";
  const hasChild = children?.length > 0;

  function setActiveChild(id) {
    setActiveChildId(id);
    window.localStorage.setItem(activeChildKey, String(id));
    // optionally invalidate queries that depend on active child
    try { queryClient.invalidateQueries(); } catch {}
  }

  return {
    loading,
    error,
    user,
    subscription,
    isAuthed,
    isSubscribed,
    children,
    hasChild,
    activeChildId,
    setActiveChild,
  };
}