// Captures beforeinstallprompt event and suppresses the automatic browser banner.
// Mount once in Layout so it runs on every page load.
import { useEffect } from "react";

export default function InstallPromptCapture() {
  useEffect(() => {
    function handler(e) {
      e.preventDefault();
      window.deferredInstallPrompt = e;
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return null;
}