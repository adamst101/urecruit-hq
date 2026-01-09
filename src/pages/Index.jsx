// src/pages/Index.jsx
import React from "react";
import Home from "./Home";

/**
 * Forces base URL "/" to render Home.
 * Base44 file-routing commonly treats Index as the root route.
 */
export default function Index() {
  return <Home />;
}