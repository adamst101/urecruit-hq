// src/api/ftProdBase44.js
//
// Production-locked Base44 client for the Functional Test Environment.
//
// WHY THIS EXISTS:
// The default `base44` client reads functionsVersion from appParams, which
// honours ?functions_version=X URL params and localStorage overrides. When
// the FT admin page is accessed through Base44's test/preview environment,
// functionsVersion is set to "dev" or "latest", routing entity API calls
// (base44.entities.*) to the TEST data namespace. Server functions
// (claimSlotProfiles, grantFtEntitlement, etc.) are deployed to the "prod"
// slot and always access PROD data. This creates a permanent mismatch:
// seed records land in TEST, SchoolPreference bridges land in PROD.
//
// This client hardcodes functionsVersion: "prod" so that all entity reads
// and writes from the FT page always target the same PROD namespace that
// server functions access. It passes the auth token from appParams so that
// entity create/update/delete operations are authenticated.
//
// USE THIS CLIENT for:
//   - seedTopology / resetTopology / deleteAllSeeds  (entity creates/deletes)
//   - discoverSeeds / verifyTopology                 (entity reads)
//   - claimSlot / releaseSlot                        (functions.invoke)
//   - grantTestEntitlement / revokeTestEntitlement   (functions.invoke)

import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const PROD_APP_ID    = "693c6f46122d274d698c00ef";
const PROD_SERVER_URL = "https://base44.app";

export const ftProdBase44 = createClient({
  appId:            PROD_APP_ID,      // hardcoded — never overrideable via URL params
  serverUrl:        PROD_SERVER_URL,  // hardcoded
  functionsVersion: "prod",           // hardcoded — entity writes target PROD namespace
  token:            appParams.token,  // carries the logged-in admin's auth token
  requiresAuth:     false,
});

// Diagnostic — shown in the FT page env bar
export const FT_SEED_ENV = {
  appId:            PROD_APP_ID,
  functionsVersion: "prod",
  locked:           true,
};
