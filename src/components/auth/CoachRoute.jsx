// src/components/auth/CoachRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

export default function CoachRoute({ children }) {
  const { role, isLoading } = useSeasonAccess();
  if (isLoading) return null;
  if (role !== "coach") return <Navigate to="/Workspace" replace />;
  return children;
}
