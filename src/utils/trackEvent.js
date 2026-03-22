// src/utils/trackEvent.js
// Shared fire-and-forget event logger.
// Silently ignores errors so it never breaks the page.

import { base44 } from "../api/base44Client";

/**
 * @param {string} eventType - e.g. "workspace_viewed"
 * @param {object} [meta]    - extra fields merged into payload_json
 */
export function trackEvent(eventType, meta = {}) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;
    const iso = new Date().toISOString();
    EventEntity.create({
      source_platform: "web",
      event_type: eventType,
      title: meta?.title || eventType,
      source_key: `web:${eventType}`,
      start_date: iso.slice(0, 10),
      ts: iso,
      payload_json: JSON.stringify({ event_name: eventType, ...meta }),
    });
  } catch { /* ignore */ }
}

/**
 * Fire once per browser session using a sessionStorage dedup key.
 */
export function trackEventOnce(eventType, dedupKey, meta = {}) {
  try {
    if (sessionStorage.getItem(dedupKey)) return;
    sessionStorage.setItem(dedupKey, "1");
    trackEvent(eventType, meta);
  } catch {
    trackEvent(eventType, meta);
  }
}
