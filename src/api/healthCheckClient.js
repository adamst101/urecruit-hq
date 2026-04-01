// src/api/healthCheckClient.js
// Dedicated production Base44 client for the health check board.
// Always points to the production project regardless of the current page
// environment (URL params, test pages, share links).
//
// ── Isolation guarantee ──────────────────────────────────────────────────────
// createClient() is called here with hardcoded literal strings (PROD_APP_ID and
// PROD_SERVER_URL). This file does NOT import app-params.js, so URL params such
// as ?app_id=X or ?server_url=Y have zero effect on prodBase44.
//
// prodBase44 and the default base44 client (base44Client.js) are separate
// createClient() instances with different appIds. The Base44 SDK creates an
// isolated HTTP client per createClient() call — there is no shared singleton
// auth store, cookie jar, or HTTP agent between them. The two clients cannot
// contaminate each other's auth tokens or project context.
//
// requiresAuth: false means prodBase44 never reads or writes an access token to
// localStorage, eliminating the only remaining shared-state vector (token cache).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@base44/sdk";

export const PROD_APP_ID  = "693c6f46122d274d698c00ef";
export const PROD_SERVER_URL = "https://base44.app";

export const prodBase44 = createClient({
  appId: PROD_APP_ID,
  serverUrl: PROD_SERVER_URL,
  functionsVersion: "prod",
  requiresAuth: false,
});
