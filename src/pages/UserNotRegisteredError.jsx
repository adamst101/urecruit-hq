// src/pages/UserNotRegisteredError.jsx
// Route-level wrapper that reuses the canonical UI component.
// Keep all UX and tracking logic in src/components/UserNotRegisteredError.jsx

import React from "react";
import UserNotRegisteredError from "../components/UserNotRegisteredError";

export default function UserNotRegisteredErrorPage() {
  return <UserNotRegisteredError />;
}
