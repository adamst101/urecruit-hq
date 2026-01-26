// src/components/utils/memberLogin.jsx

/**
 * Always route Base44 login return through AuthRedirect.
 * Prevents "login returns to demo" behavior.
 *
 * IMPORTANT:
 * - nextPath must always be an INTERNAL PATH (not absolute).
 */

const FALLBACK_NEXT = "/Discover";

function sanitizeNext(next) {
  const s = String(next || "").trim();
  if (!s) return FALLBACK_NEXT;

  // Only allow internal paths
  if (s.startsWith("http://") || s.startsWith("https://")) return FALLBACK_NEXT;

  // Normalize leading slash
  if (!s.startsWith("/")) return `/${s}`;

  return s;
}

export function startMemberLogin({ nextPath = null, source = "member_login" } = {}) {
  // Clear demo stickiness if user is intentionally logging in
  try {
    sessionStorage.removeItem("demo_mode_v1");
  } catch {}
  try {
    sessionStorage.removeItem("demo_year_v1");
  } catch {}

  const next = sanitizeNext(nextPath || FALLBACK_NEXT);

  // Prefer sessionStorage for next (avoids double-encoding issues)
  try {
    sessionStorage.setItem("post_login_next", next);
  } catch {}

  const returnTo =
    `${window.location.origin}/AuthRedirect` +
    `?source=${encodeURIComponent(source)}`;

  const loginUrl =
    `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;

  window.location.assign(loginUrl);
}
