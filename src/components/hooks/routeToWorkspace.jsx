// src/components/hooks/routeToWorkspace.js
import { createPageUrl } from "../../utils";

/**
 * Central routing helper (final)
 */
export function routeToWorkspace({ authed, paid, hasProfile }) {
  if (!authed) return { destination: "login", url: createPageUrl("Login") };
  if (!paid) return { destination: "subscribe", url: createPageUrl("Subscribe") };
  if (!hasProfile) {
    return {
      destination: "profile",
      url:
        createPageUrl("Profile") +
        `?next=${encodeURIComponent(createPageUrl("MyCamps"))}`,
    };
  }
  return { destination: "mycamps", url: createPageUrl("MyCamps") };
}
