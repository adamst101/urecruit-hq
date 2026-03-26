/**
 * Returns 'dev' when running on base44's share/test URL, undefined otherwise.
 * Pass this as `env` to all serverless function invocations so they target
 * the correct database environment via asServiceRole entity operations.
 */
export function getDataEnv() {
  if (typeof window === 'undefined') return undefined;
  return window.location.hostname.includes('share--') ? 'dev' : undefined;
}
