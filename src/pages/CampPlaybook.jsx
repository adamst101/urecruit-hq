// Redirects to the unified Knowledge Base
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function CampPlaybook() {
  const nav = useNavigate();
  useEffect(() => { nav("/KnowledgeBase?topic=costs", { replace: true }); }, []);
  return null;
}
