// Single source of truth for primary navigation, shared by the desktop SiteNav
// and the mobile tab bar so the two can never drift (e.g. a route appearing in
// one nav but not the other). Pure + side-effect-free so it is unit-tested.

export type NavItem = {
  href: string;
  /** Descriptive label for the desktop nav. */
  label: string;
  /** Compact label for the phone tab bar. */
  shortLabel: string;
  /** Glyph shown above the label in the phone tab bar. */
  icon: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Home", icon: "🏠" },
  { href: "/matches", label: "Matches", shortLabel: "Matches", icon: "📅" },
  { href: "/groups", label: "Groups", shortLabel: "Groups", icon: "📊" },
  { href: "/teams", label: "Teams", shortLabel: "Teams", icon: "👥" },
  { href: "/bracket", label: "Bracket", shortLabel: "Bracket", icon: "🏆" },
  { href: "/model", label: "Model", shortLabel: "Model", icon: "📈" },
];

/**
 * Segment-aware active check: exact match for the root, otherwise the current
 * path must be the route itself or a descendant of it. Matching on the segment
 * boundary (`href + "/"`) instead of a bare `startsWith` avoids prefix
 * collisions if sibling routes ever share a prefix (e.g. `/team` vs `/teams`).
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
