// src/components/utils/memberLogin.jsx
import { createPageUrl } from "../../utils";

/**
 * Only allow internal paths for "next".
 * If caller accidentally passes absolute URL or junk, we fall back to Discover.
 */
function sanitizeNext(next) {
  const fallback = createPageUrl("Discover");
  const s = String(next || "").trim();
  if (!s) return fallback;

  // Block absolute URLs / open redirects
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;

  // Normalize to leading slash
  if (!s.startsWith("/")) return `/${s}`;

  return s;
}

/**
 * Always route Base44 login return through AuthRedirect.
 * This prevents "login returns to demo" behavior.
 */
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
