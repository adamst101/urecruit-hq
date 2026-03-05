// src/components/utils/memberLogin.jsx

/**
 * Always route Base44 login return through AuthRedirect.
 * This prevents "login returns to demo" behavior.
 *
 * IMPORTANT: nextPath must be an INTERNAL PATH (e.g. "/Workspace", "/Discover").
 * We sanitize it to prevent absolute URLs / weird encodings.
 */

function sanitizeNext(next) {
  const fallback = "/Workspace";
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

  const next = sanitizeNext(nextPath || "/Workspace");

  // ✅ Preferred: store next in sessionStorage to avoid nested encoding issues
  // AuthRedirect will consume (and remove) this key.
  try { sessionStorage.setItem("post_login_next", next); } catch {}

  const returnTo =
    `${window.location.origin}/AuthRedirect` +
    `?next=${encodeURIComponent(next)}` +
    `&source=${encodeURIComponent(source)}`;

  const loginUrl =
    `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;

  window.location.assign(loginUrl);
}