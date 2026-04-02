// src/components/utils/ScrollToTop.jsx
// Fires window.scrollTo(0, 0) on every pathname change.
// Prevents stale scroll position when navigating through the guided Marcus tour.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
