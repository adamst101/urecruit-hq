// src/api/lockedBase44Client.js
//
// A Base44 client that is locked to the app's own deployment appId.
// Unlike the default `base44` client (which honours `?app_id=X` URL-param
// overrides via app-params.js), this client reads VITE_BASE44_APP_ID and
// VITE_BASE44_BACKEND_URL directly from env vars at build time, so URL-param
// test overrides cannot switch it to a different project.
//
// Use this for entity lookups that must always reflect the deployment's own
// data regardless of which test/share URL context is currently active (e.g.
// School entity for logos, which is static reference data).

import { createClient } from '@base44/sdk';

export const lockedBase44 = createClient({
  appId: import.meta.env.VITE_BASE44_APP_ID,
  serverUrl: import.meta.env.VITE_BASE44_BACKEND_URL || "https://base44.app",
  requiresAuth: false,
});
