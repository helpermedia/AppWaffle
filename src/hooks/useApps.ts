import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppInfo, FolderInfo, AppsResponse } from "@/types/app";

interface UseAppsResult {
  apps: AppInfo[];
  folders: FolderInfo[];
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApps(): UseAppsResult {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  // Load icon for a single app and update state (both top-level and in folders)
  async function loadIcon(appPath: string) {
    try {
      const icon = await invoke<string | null>("get_app_icon", { path: appPath });
      if (icon) {
        // Update top-level apps
        setApps(prev => prev.map(app =>
          app.path === appPath ? { ...app, icon } : app
        ));
        // Update apps in folders
        setFolders(prev => prev.map(folder => ({
          ...folder,
          apps: folder.apps.map(app =>
            app.path === appPath ? { ...app, icon } : app
          )
        })));
      }
    } catch (e) {
      console.error(`Failed to load icon for ${appPath}:`, e);
    }
  }

  async function fetchApps() {
    setLoading(true);
    setError(null);
    setLoadingMessage("Loading applications...");

    try {
      const result = await invoke<AppsResponse>("get_apps");
      setApps(result.apps);
      setFolders(result.folders);
      setLoading(false);

      // Collect all apps that need icons (top-level + folder apps)
      const allApps = [
        ...result.apps,
        ...result.folders.flatMap(folder => folder.apps)
      ];
      const appsWithoutIcons = allApps.filter(app => !app.icon);

      // Load missing icons progressively in background
      for (const app of appsWithoutIcons) {
        loadIcon(app.path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount
  }, []);

  return { apps, folders, loading, loadingMessage, error, refetch: fetchApps };
}
