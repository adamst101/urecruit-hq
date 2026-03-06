// Subtle PWA install prompt for Workspace page.
// Android: uses deferred beforeinstallprompt
// iOS: shows manual "Add to Home Screen" instructions
// Hidden when already installed or dismissed.
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

const LS_KEY = "pwa_install_dismissed";

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
}

export default function InstallButton() {
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissed = localStorage.getItem(LS_KEY) === "true";
    if (dismissed) return;

    if (isIOS()) {
      setShowIOS(true);
      return;
    }

    // Android / Chrome — check if deferred prompt is already available
    if (window.deferredInstallPrompt) {
      setShowAndroid(true);
      return;
    }

    // Listen for it if it hasn't fired yet
    function handler() { setShowAndroid(true); }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setShowAndroid(false);
    setShowIOS(false);
    localStorage.setItem(LS_KEY, "true");
  }

  async function handleInstall() {
    const prompt = window.deferredInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowAndroid(false);
    }
    window.deferredInstallPrompt = null;
  }

  if (!showAndroid && !showIOS) return null;

  return (
    <div style={{
      background: "#111827",
      border: "1px solid #374151",
      borderRadius: 10,
      padding: "12px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    }}>
      {showAndroid && (
        <>
          <button
            onClick={handleInstall}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#9ca3af", fontSize: 14, display: "flex",
              alignItems: "center", gap: 8, padding: 0,
            }}
          >
            <span style={{ fontSize: 18 }}>📲</span>
            Add URecruit to your home screen
          </button>
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </>
      )}

      {showIOS && (
        <>
          <div style={{ color: "#9ca3af", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📲</span>
            <span>To install: tap <strong>Share</strong> → <strong>Add to Home Screen</strong></span>
          </div>
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </>
      )}
    </div>
  );
}