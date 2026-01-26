// src/components/utils/memberLogin.jsx
import { createPageUrl } from "../../utils";

/**
 * Always route Base44 login return through AuthRedirect.
 * This prevents "login returns to demo" behavior and centralizes post-login logic.
 */

function sanitizeNext(next) {
  const fallback = createPageUrl("Discover");
  const s = String(next || "").trim();
  if (!s) return fallback;

  // Only allow internal paths
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;

  // Normalize to leading slash
  if (!s.startsWith("/")) return `/${s}`;

  return s;
}

export function startMemberLogin({ nextPath = null, source = "member_login" } = {}) {
  // Clear demo stickiness if user is intentionally logging in
  try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
  try { sessionStorage.removeItem("demo_year_v1"); } catch {}

  const next = sanitizeNext(nextPath || createPageUrl("Discover")); // <-- REQUIRED

  // Always return to AuthRedirect (absolute URL)
  const returnTo =
    `${window.location.origin}${createPageUrl("AuthRedirect")}` +
    `?next=${encodeURIComponent(next)}` +
    `&source=${encodeURIComponent(source)}`;

  // Base44 login route expects from_url (absolute)
  const loginUrl =
    `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;

  window.location.assign(loginUrl);
}
