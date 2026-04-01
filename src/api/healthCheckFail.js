// src/api/healthCheckFail.js
// Shared FAIL taxonomy for all AppHealthCheck files.
// Import this in any health-check file that needs typed failure messages.
//
// Usage:
//   import { FAIL } from "../api/healthCheckFail";
//   FAIL.config("No SportIngestConfig records — ...");
//
// Categories:
//   FAIL.config  — production configuration missing (operator action required)
//   FAIL.data    — production data missing/corrupt  (seeding / sync required)
//   FAIL.runtime — production code / runtime issue  (deploy / bug fix required)
//   FAIL.ext     — external dependency issue         (third-party service / network)

export const FAIL = {
  config:  (msg) => { throw new Error(`[PROD CONFIG MISSING] ${msg}`); },
  data:    (msg) => { throw new Error(`[PROD DATA MISSING] ${msg}`); },
  runtime: (msg) => { throw new Error(`[PROD CODE/RUNTIME] ${msg}`); },
  ext:     (msg) => { throw new Error(`[EXTERNAL DEPENDENCY] ${msg}`); },
};
