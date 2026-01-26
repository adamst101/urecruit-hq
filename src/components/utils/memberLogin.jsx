// src/components/utils/memberLogin.jsx
import { createPageUrl } from "../../utils";

/**
 * Always route Base44 login return through AuthRedirect.
 * Store `next` in sessionStorage to avoid nested query encoding issues.
 */

function sanitizeNext(next) {
  const fallback = createPageUrl("Workspace");
  const s = String(next || "").trim();
  if (!s) return fallback;

  // Only allow internal paths
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;

  // Normalize leading slash
  if (!s.startsWith("/")) return `/${s}`;

  return s;
}

export function startMemberLogin({ nextPath = null, source = "member_login" } = {}) {
  // Clear demo stickiness if user is intentionally logging in
  try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
  try { sessionStorage.removeItem("demo_year_v1"); } catch {}

  // ✅ Single, safe next destination
  const next = sanitizeNext(nextPath || createPageUrl("Workspace"));

  // ✅ Store next in sessionStorage (prevents nested query encoding bugs)
  try { sessionStorage.setItem("post_login_next", next); } catch {}

  // ✅ Keep from_url simple (no nested next param)
  const returnTo =
    `${window.location.origin}${createPageUrl("AuthRedirect")}` +
    `?source=${encodeURIComponent(source)}`;

  const loginUrl =
    `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;

  window.location.assign(loginUrl);
}
