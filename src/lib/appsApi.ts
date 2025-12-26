import { invoke } from "@tauri-apps/api/core";
import type { AppsResponse } from "@/types/app";

// Cache the promise at module level - starts fetching immediately on import
let appsPromise: Promise<AppsResponse> | null = null;

export function getAppsPromise(): Promise<AppsResponse> {
  if (!appsPromise) {
    appsPromise = invoke<AppsResponse>("get_apps");
  }
  return appsPromise;
}

// Start fetching immediately when module is imported
getAppsPromise();
