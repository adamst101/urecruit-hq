/**
 * Returns 'dev' when running on the base44 share/test URL (share-- hostname), undefined otherwise.
 * Pass this as `env` to all serverless function invocations so they target
 * the correct database environment via asServiceRole entity operations.
 *
 * IMPORTANT: Call this while still on the share URL (e.g. at form submission time),
 * not after a redirect, since the hostname may change during auth flows.
 */
export function getDataEnv() {
  if (typeof window === 'undefined') return undefined;
  return window.location.hostname.includes('share--') ? 'dev' : undefined;
}
