// src/components/utils/memberLogin.jsx
import { createPageUrl } from "../../utils";

/**
 * Always route Base44 login return through AuthRedirect.
 * This prevents "login returns to demo" behavior.
 */

function sanitizeNext(next) {
  const fallback = createPageUrl("Discover");
  const s = String(next || "").trim();
  if (!s) return fallback;

  // Only allow internal paths
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;

  // Normalize to leading slash
  if (!s.startsWith("/")) return `/${s}`;

  // Strip demo-stickiness params if present
  try {
    const u = new URL(s, window.location.origin);
    u.searchParams.delete("mode");
    u.searchParams.delete("src");
    u.searchParams.delete("source");
    return `${u.pathname}${u.search ? u.search : ""}` || fallback;
  } catch {
    return fallback;
  }
}

export function startMemberLogin({ nextPath = null, source = "member_login" } = {}) {
  // Clear demo stickiness if user is intentionally logging in
  try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
  try { sessionStorage.removeItem("demo_year_v1"); } catch {}

  const next = sanitizeNext(nextPath || createPageUrl("Discover"));

  const returnTo =
    `${window.location.origin}${createPageUrl("AuthRedirect")}` +
    `?next=${encodeURIComponent(next)}` +
    `&source=${encodeURIComponent(source)}`;

  const loginUrl =
    `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;

  window.location.assign(loginUrl);
}
