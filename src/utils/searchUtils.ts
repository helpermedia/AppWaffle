import type { GridItemUnion } from "@/hooks/useGridData";
import type { GridItem } from "@/components/items/AppItem";

/**
 * Strip diacritics and lowercase for accent-insensitive matching
 * ("cafe" finds "Café").
 */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Match quality for a normalized query: 0 = name starts with it,
 * 1 = a word in the name starts with it, 2 = substring anywhere.
 * null = no match.
 */
function matchRank(name: string, normalizedQuery: string): number | null {
  const normalized = normalize(name);
  if (normalized.startsWith(normalizedQuery)) return 0;
  if (normalized.split(/[\s\-_.]+/).some((word) => word.startsWith(normalizedQuery))) return 1;
  if (normalized.includes(normalizedQuery)) return 2;
  return null;
}

/**
 * All launchable apps in grid order — top-level apps plus apps inside
 * folders (Launchpad search looks inside folders too), deduped by path.
 */
export function collectSearchableApps(items: GridItemUnion[]): GridItem[] {
  const seen = new Set<string>();
  const apps: GridItem[] = [];
  for (const item of items) {
    if (item.type === "app") {
      if (!seen.has(item.data.path)) {
        seen.add(item.data.path);
        apps.push(item.data);
      }
    } else {
      for (const app of item.data.apps) {
        if (!seen.has(app.path)) {
          seen.add(app.path);
          apps.push({ ...app, id: app.path });
        }
      }
    }
  }
  return apps;
}

/**
 * Filter apps by name match, best matches first (prefix, then word-prefix,
 * then substring), keeping grid order within each tier.
 */
export function searchApps(items: GridItemUnion[], query: string): GridItem[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  return collectSearchableApps(items)
    .map((app) => ({ app, rank: matchRank(app.name, normalizedQuery) }))
    .filter((entry): entry is { app: GridItem; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.app);
}
