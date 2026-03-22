// src/utils/trackEvent.js
// Shared fire-and-forget event logger.
// Silently ignores errors so it never breaks the page.
// Phase 3: auto-resolves account_id from auth and embeds it in every event.

import { base44 } from "../api/base44Client";

// Module-level cache — fetched once per page load.
let _accountIdPromise = null;

function resolveAccountId() {
  if (_accountIdPromise) return _accountIdPromise;
  _accountIdPromise = base44.auth.me()
    .then((me) => me?.id || null)
    .catch(() => null);
  return _accountIdPromise;
}

async function _fire(eventType, meta) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;
    const accountId = await resolveAccountId();
    const iso = new Date().toISOString();
    EventEntity.create({
      source_platform: "web",
      event_type: eventType,
      title: meta?.title || eventType,
      source_key: `web:${eventType}`,
      start_date: iso.slice(0, 10),
      ts: iso,
      payload_json: JSON.stringify({
        event_name: eventType,
        ...(accountId ? { account_id: accountId } : {}),
        ...meta,
      }),
    });
  } catch { /* ignore */ }
}

/**
 * Fire an event. Returns immediately — account_id is resolved in the background.
 * @param {string} eventType - e.g. "workspace_viewed"
 * @param {object} [meta]    - extra fields merged into payload_json
 */
export function trackEvent(eventType, meta = {}) {
  _fire(eventType, meta);
}

/**
 * Fire once per browser session using a sessionStorage dedup key.
 */
export function trackEventOnce(eventType, dedupKey, meta = {}) {
  try {
    if (sessionStorage.getItem(dedupKey)) return;
    sessionStorage.setItem(dedupKey, "1");
  } catch { /* ignore */ }
  _fire(eventType, meta);
}
