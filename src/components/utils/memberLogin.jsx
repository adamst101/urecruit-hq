// src/components/utils/memberLogin.jsx
import { createPageUrl } from "../../utils";

/**
 * Ensure "next" is always a safe internal path.
 * - If empty -> default Discover
 * - If absolute URL -> default Discover
 * - If relative (no leading /) -> prefix /
 * - Otherwise keep as-is
 */
function sanitizeNext(next) {
  const s = String(next || "");
  if (!s) return createPageUrl("Discover");

  // Only allow internal paths
  if (s.startsWith("http://") || s.startsWith("https://")) return createPageUrl("Discover");

  // Normalize to path
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

  const next = sanitizeNext(nextPath || createPageUrl("Discover")); // "/Discover"

  const returnTo =
    `${window.location.origin}${createPageUrl("AuthRedirect")}` +
    `?next=${encodeURIComponent(next)}` +
    `&source=${encodeURIComponent(source)}`;

  const loginUrl =
    `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;

  window.location.assign(loginUrl);
}
