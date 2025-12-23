import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppInfo } from "../types/app";

interface UseAppsResult {
  apps: AppInfo[];
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApps(): UseAppsResult {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  // Load icon for a single app and update state
  const loadIcon = useCallback(async (appPath: string) => {
    try {
      const icon = await invoke<string | null>("get_app_icon", { path: appPath });
      if (icon) {
        setApps(prev => prev.map(app =>
          app.path === appPath ? { ...app, icon } : app
        ));
      }
    } catch (e) {
      console.error(`Failed to load icon for ${appPath}:`, e);
    }
  }, []);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadingMessage("Loading applications...");

    try {
      const result = await invoke<AppInfo[]>("get_apps");
      setApps(result);
      setLoading(false);

      // Load missing icons progressively in background
      const appsWithoutIcons = result.filter(app => !app.icon);
      for (const app of appsWithoutIcons) {
        loadIcon(app.path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [loadIcon]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data fetch on mount is valid
    fetchApps();
  }, [fetchApps]);

  return { apps, loading, loadingMessage, error, refetch: fetchApps };
}
