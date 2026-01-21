// src/components/utils/authDebug.jsx
import { base44 } from "../../api/base44Client";

export async function logoutBase44Safe() {
  try {
    // Base44 auth APIs can vary; try common methods safely.
    if (typeof base44?.auth?.logout === "function") {
      await base44.auth.logout();
      return true;
    }
    if (typeof base44?.auth?.signOut === "function") {
      await base44.auth.signOut();
      return true;
    }
  } catch {}

  // Fallback: still clear local/session storage so app behaves like logged out
  return false;
}

export function clearDemoFlags() {
  try {
    localStorage.removeItem("demo_mode_v1");
    localStorage.removeItem("demoMode"); // fallback keys if you used different names
    localStorage.removeItem("demoSeasonYear");
  } catch {}
  try {
    sessionStorage.removeItem("workspace_intent_v1"); // if you ever added intent
  } catch {}
}