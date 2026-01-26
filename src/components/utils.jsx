// src/utils.js

/**
 * Creates a URL path for a given page name.
 * Base44 uses /PageName as the route pattern.
 * 
 * @param {string} pageName - Name of the page (e.g., "Home", "Discover")
 * @returns {string} - URL path (e.g., "/Home", "/Discover")
 */
export function createPageUrl(pageName) {
  if (!pageName) return "/";
  return `/${String(pageName)}`;
}