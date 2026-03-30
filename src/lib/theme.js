/**
 * uRecruit Premium Dark Design Tokens
 *
 * Reference design: Coach HQ "Colleges Engaging the Program" section.
 *
 * USAGE
 *   Inline styles (CoachDashboard pattern):
 *     import { T, shellStyle, headerBandStyle, expandedBandStyle } from '@/lib/theme';
 *     <div style={{ background: T.shellBg, border: T.shellBorderFull }}>
 *
 *   Tailwind (via ur.* extensions in tailwind.config.js):
 *     <div className="bg-ur-shell border border-ur-shell-border">
 *
 *   CSS (via --ur-* custom properties added to index.css):
 *     background: var(--ur-shell);
 */

// ── Surfaces ────────────────────────────────────────────────────────────────
export const pageBg        = "#0a0e1a";   // True page background — deepest layer
export const shellBg       = "#101A2B";   // Lifted section shell — sits above page bg
export const headerBandBg  = "#0C1524";   // Header band inside a section shell
export const cardBg        = "#111827";   // Card/panel (legacy — prefer shellBg for new components)
export const rowBg         = "transparent";
export const rowBgAlt      = "rgba(255,255,255,0.015)"; // Alternating row tint
export const rowBgHover    = "rgba(255,255,255,0.04)";  // Hovered row
export const rowBgActive   = "#162338";   // Active / selected row
export const expandedBg    = "#162B47";   // Expanded / accordion detail band
export const inputBg       = "#1f2937";   // Input / form control background

// ── Borders & Dividers ────────────────────────────────────────────────────
export const shellBorder        = "rgba(148,163,184,0.20)";
export const dividerStrong      = "rgba(148,163,184,0.22)";
export const divider            = "rgba(148,163,184,0.14)";
export const dividerSubtle      = "rgba(148,163,184,0.10)";
export const borderDefault      = "#1f2937";  // Legacy hard border
export const borderInput        = "#374151";  // Input / form field border

// ── Accent ────────────────────────────────────────────────────────────────
export const amber         = "#e8a020";
export const amberHover    = "#f3b13f";
export const amberRail     = "rgba(232,160,32,0.65)";    // Expanded state left rail
export const amberChevron  = "rgba(232,160,32,0.75)";    // Open-state chevron/icon

// ── Text Hierarchy ─────────────────────────────────────────────────────────
export const textPrimary     = "#f9fafb";
export const textSecondary   = "#9ca3af";
export const textMicro       = "rgba(148,163,184,0.82)"; // Small-caps column headers
export const textMuted       = "#6b7280";
export const textInteractive = "#e8a020";

// ── Status Colors ──────────────────────────────────────────────────────────
export const success    = "#10b981";
export const successBg  = "#052e16";
export const error      = "#ef4444";
export const errorBg    = "#7f1d1d";
export const warning    = "#f59e0b";
export const warningBg  = "#92400e";

// ── Border Radius ──────────────────────────────────────────────────────────
export const radiusSm  = 8;
export const radiusMd  = 12;
export const radiusLg  = 14;
export const radiusXl  = 16;

// ── Transitions ────────────────────────────────────────────────────────────
export const transitionFast = "150ms ease";
export const transitionMid  = "180ms ease";
export const transitionBase = "200ms ease";
export const transitionSlow = "250ms ease";

// ── Typography ─────────────────────────────────────────────────────────────
export const fontDisplay = "'Bebas Neue', sans-serif";
export const fontBody    = "'DM Sans', system-ui, sans-serif";

// ── Shorthand border strings ───────────────────────────────────────────────
export const shellBorderFull    = `1px solid ${shellBorder}`;
export const dividerFull        = `1px solid ${divider}`;
export const dividerStrongFull  = `1px solid ${dividerStrong}`;
export const dividerSubtleFull  = `1px solid ${dividerSubtle}`;

// ── Micro-label style object (spread into style prop) ──────────────────────
export const microLabel = {
  fontSize:      10,
  fontWeight:    700,
  color:         textMicro,
  textTransform: "uppercase",
  letterSpacing: "0.09em",
};

// ── Preset style objects (spread directly into style props) ────────────────

/** Section shell — the outer lifted container */
export const shellStyle = {
  background:   shellBg,
  border:       shellBorderFull,
  borderRadius: radiusLg,
  overflow:     "hidden",
  boxShadow:    "0 0 0 1px rgba(255,255,255,0.02) inset",
};

/** Header band — top row inside a section shell */
export const headerBandStyle = {
  background:   headerBandBg,
  borderBottom: dividerStrongFull,
};

/** Expanded / accordion detail band */
export const expandedBandStyle = {
  background:   expandedBg,
  borderTop:    dividerStrongFull,
  borderBottom: dividerFull,
  borderLeft:   `2px solid ${amberRail}`,
};

/** Card / panel (compatible with legacy layout) */
export const cardStyle = {
  background:   cardBg,
  border:       `1px solid ${borderDefault}`,
  borderRadius: radiusLg,
  overflow:     "hidden",
};

/**
 * T — flat object combining all tokens, for convenience when you want a
 * single import: import { T } from '@/lib/theme';
 */
export const T = {
  pageBg, shellBg, headerBandBg, cardBg,
  rowBg, rowBgAlt, rowBgHover, rowBgActive, expandedBg, inputBg,
  shellBorder, dividerStrong, divider, dividerSubtle, borderDefault, borderInput,
  shellBorderFull, dividerFull, dividerStrongFull, dividerSubtleFull,
  amber, amberHover, amberRail, amberChevron,
  textPrimary, textSecondary, textMicro, textMuted, textInteractive,
  success, successBg, error, errorBg, warning, warningBg,
  radiusSm, radiusMd, radiusLg, radiusXl,
  transitionFast, transitionMid, transitionBase, transitionSlow,
  fontDisplay, fontBody,
  microLabel,
  shellStyle, headerBandStyle, expandedBandStyle, cardStyle,
};

export default T;
