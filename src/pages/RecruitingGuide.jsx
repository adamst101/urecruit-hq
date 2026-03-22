// Redirects to the unified Knowledge Base
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function RecruitingGuide() {
  const nav = useNavigate();
  useEffect(() => { nav("/KnowledgeBase?topic=timeline", { replace: true }); }, []);
  return null;
}
