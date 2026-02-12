import type { AppInfo } from "@/types/app";

/**
 * Build a lookup map from an array of apps, keyed by app path.
 */
export function buildAppsMap(apps: AppInfo[]): Map<string, AppInfo> {
  return new Map(apps.map((app) => [app.path, app]));
}
