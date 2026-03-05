// Single source of truth for admin emails
export const ADMIN_EMAILS = [
  "tom.adams101@gmail.com",
  "tom_adams_tx@live.com",
];

export function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(String(email).toLowerCase().trim());
}