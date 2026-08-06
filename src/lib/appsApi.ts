import { invoke } from "@tauri-apps/api/core";
import type { AppsResponse } from "@/types/app";

// Cache the promise at module level - starts fetching immediately on import
let appsPromise: Promise<AppsResponse> | null = null;

export function getAppsPromise(): Promise<AppsResponse> {
  if (!appsPromise) {
    appsPromise = invoke<AppsResponse>("get_apps").then(async (response) => {
      // Show window after data is ready
      await invoke("show_window");
      return response;
    });
    // Never cache a failure: the error boundary's "Try again" re-renders,
    // which calls this again and must get a fresh attempt
    appsPromise.catch(() => {
      appsPromise = null;
    });
  }
  return appsPromise;
}

// Start fetching immediately when module is imported
// Swallow here — error is re-thrown when use() is called during render
getAppsPromise().catch(() => {});
