// components/hooks/routeToWorkspace.js
import { createPageUrl } from "../../utils";

/**
 * Central routing helper so paid/profile gating logic is not duplicated everywhere.
 *
 * Contract:
 * - If not authed -> returns { destination: "login" }
 * - If authed but not paid -> "subscribe"
 * - If paid but missing profile -> "profile"
 * - If paid + profile -> "mycamps"
 */
export function routeToWorkspace({ authed, paid, hasProfile }) {
  if (!authed) return { destination: "login", url: null };
  if (!paid) return { destination: "subscribe", url: createPageUrl("Subscribe") };
  if (!hasProfile)
    return { destination: "profile", url: createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("MyCamps"))}` };
  return { destination: "mycamps", url: createPageUrl("MyCamps") };
}