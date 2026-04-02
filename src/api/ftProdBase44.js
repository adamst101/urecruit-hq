// src/api/ftProdBase44.js
//
// Production-locked Base44 client for the Functional Test Environment.
//
// WHY THIS EXISTS:
// Base44 SDK routes function.invoke() calls using the `Base44-Functions-Version`
// header. When the FT admin page is accessed through Base44's test/preview
// environment, functionsVersion defaults to "dev"/"latest", routing function
// calls to the TEST function slot.
//
// This client hardcodes functionsVersion:"prod" so that all server function
// invocations from the FT page (manageFtSeeds, claimSlotProfiles, etc.) are
// routed to the PROD function slot, which writes to PROD data.
//
// IMPORTANT — functionsVersion DOES NOT affect entity writes:
// In the SDK, functionsVersion only applies to the `functionsAxiosClient` used
// by base44.functions.invoke(). The `entities` module uses a separate
// `axiosClient` that never carries Base44-Functions-Version (client.js:75-118).
// Entity routing is determined by `X-Origin-URL` (window.location.href), which
// is set by the browser context — test URL → TEST data, prod URL → PROD data.
//
// For this reason, ALL FT seed entity creates/reads/deletes go through the
// manageFtSeeds server function (PROD slot), not client-side entity calls.
//
// USE THIS CLIENT for:
//   - discoverSeeds / seedTopology / resetTopology / deleteAllSeeds  (→ manageFtSeeds)
//   - checkSeedIntegrity                                             (→ manageFtSeeds)
//   - claimSlot / releaseSlot                                        (→ claimSlotProfiles)
//   - grantTestEntitlement / revokeTestEntitlement                   (→ grantFtEntitlement)
//   - lookupAccountByEmail                                           (User entity — global namespace)

import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const PROD_APP_ID    = "693c6f46122d274d698c00ef";
const PROD_SERVER_URL = "https://base44.app";

export const ftProdBase44 = createClient({
  appId:            PROD_APP_ID,      // hardcoded — never overrideable via URL params
  serverUrl:        PROD_SERVER_URL,  // hardcoded
  functionsVersion: "prod",           // routes functions.invoke() to PROD slot
  token:            appParams.token,  // carries the logged-in admin's auth token
  requiresAuth:     false,
});

// Diagnostic — shown in the FT page env bar
export const FT_SEED_ENV = {
  appId:            PROD_APP_ID,
  functionsVersion: "prod",
  locked:           true,
};
