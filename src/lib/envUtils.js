/**
 * Returns 'dev' when running against a base44 test/dev backend, undefined otherwise.
 * Detects via appParams.serverUrl (set from URL param or localStorage by base44's
 * app-params loader) — the same mechanism AppHealthCheck uses.
 * Pass this as `env` to all serverless function invocations so they target
 * the correct database environment via asServiceRole entity operations.
 */
export function getDataEnv() {
  if (typeof window === 'undefined') return undefined;
  const serverUrl = (window.localStorage.getItem('base44_server_url') || '').toLowerCase();
  return (serverUrl.includes('dev') || serverUrl.includes('test') || serverUrl.includes('staging')) ? 'dev' : undefined;
}
