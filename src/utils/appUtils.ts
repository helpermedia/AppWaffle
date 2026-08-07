import type { AppInfo } from "@/types/app";

/**
 * Build a lookup map from an array of apps, keyed by app path.
 */
export function buildAppsMap(apps: AppInfo[]): Map<string, AppInfo> {
  return new Map(apps.map((app) => [app.path, app]));
}

/** Category slugs whose display name isn't plain title-casing */
const CATEGORY_NAMES: Record<string, string> = {
  "developer-tools": "Developer Tools",
  "graphics-design": "Graphics & Design",
  "healthcare-fitness": "Health & Fitness",
  "food-drink": "Food & Drink",
  "social-networking": "Social Networking",
};

/**
 * Human-readable name for an LSApplicationCategoryType identifier,
 * e.g. "public.app-category.developer-tools" -> "Developer Tools".
 * Game subcategories collapse to "Games" like original Launchpad.
 * Returns null for missing or unrecognizable identifiers.
 */
const CATEGORY_PREFIX = "public.app-category.";

export function categoryDisplayName(categoryType: string | null | undefined): string | null {
  if (!categoryType?.startsWith(CATEGORY_PREFIX)) return null;
  const slug = categoryType.slice(CATEGORY_PREFIX.length);
  if (!slug) return null;

  if (slug === "games" || slug.endsWith("-games")) return "Games";

  const special = CATEGORY_NAMES[slug];
  if (special) return special;

  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
