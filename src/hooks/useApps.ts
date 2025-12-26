import { use, useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppInfo, FolderInfo } from "@/types/app";
import { getAppsPromise } from "@/lib/appsApi";

interface UseAppsResult {
  apps: AppInfo[];
  folders: FolderInfo[];
}

export function useApps(): UseAppsResult {
  // use() suspends until the promise resolves - data is available immediately after
  const initialData = use(getAppsPromise());

  // State for progressive icon updates
  const [apps, setApps] = useState(initialData.apps);
  const [folders, setFolders] = useState(initialData.folders);
  const iconsLoadedRef = useRef(false);

  // Load icons progressively after initial render
  useEffect(() => {
    if (iconsLoadedRef.current) return;
    iconsLoadedRef.current = true;

    // Collect all apps that need icons
    const allApps = [
      ...initialData.apps,
      ...initialData.folders.flatMap((folder) => folder.apps),
    ];
    const appsWithoutIcons = allApps.filter((app) => !app.icon);

    // Load missing icons progressively
    for (const app of appsWithoutIcons) {
      loadIcon(app.path);
    }

    async function loadIcon(appPath: string) {
      try {
        const icon = await invoke<string | null>("get_app_icon", { path: appPath });
        if (icon) {
          // Update top-level apps
          setApps((prev) =>
            prev.map((a) => (a.path === appPath ? { ...a, icon } : a))
          );
          // Update apps in folders
          setFolders((prev) =>
            prev.map((folder) => ({
              ...folder,
              apps: folder.apps.map((a) =>
                a.path === appPath ? { ...a, icon } : a
              ),
            }))
          );
        }
      } catch (e) {
        console.error(`Failed to load icon for ${appPath}:`, e);
      }
    }
  }, [initialData]);

  return { apps, folders };
}
