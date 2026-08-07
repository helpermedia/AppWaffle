import type { AppInfo, FolderInfo, FolderMetadata, OrderConfig } from "@/types/app";
import { buildAppsMap } from "@/utils/appUtils";
import { isFolderId, resolveFolderApps, resolveOrderToAppItems, convertPhysicalFolders, buildInitialOrder, healFolders } from "@/utils/folderUtils";
import type { GridItem } from "@/components/items/AppItem";
import type { GridFolder } from "@/components/items/FolderItem";

export type GridItemUnion =
  | { type: "app"; data: GridItem }
  | { type: "folder"; data: GridFolder };

interface UseGridDataOptions {
  apps: AppInfo[];
  physicalFolders: FolderInfo[];
  folders: FolderMetadata[];
  orderConfig: OrderConfig | null;
  order: string[] | null;
  setOrder: (order: string[]) => void;
  setFolders: (folders: FolderMetadata[]) => void;
  activeId: string | null;
}

export function useGridData({
  apps,
  physicalFolders,
  folders,
  orderConfig,
  order,
  setOrder,
  setFolders,
  activeId,
}: UseGridDataOptions) {
  // Create apps map for resolving folder apps
  // Include both top-level apps AND apps from physical folders (for initial conversion)
  const appsMap = buildAppsMap([
    ...apps,
    ...physicalFolders.flatMap((folder) => folder.apps),
  ]);

  // Get item type for folder creation hook
  function getItemType(id: string): "app" | "folder" | null {
    if (appsMap.has(id)) return "app";
    if (isFolderId(id)) return "folder";
    return null;
  }

  // Build items array from order
  function buildItems(currentOrder: string[] | null): GridItemUnion[] {
    if (!currentOrder) return [];
    const foldersMap = new Map(folders.map((f) => [f.id, f]));
    const resolvedApps = new Map(
      resolveOrderToAppItems(currentOrder, appsMap).map((item) => [item.id, item])
    );

    return currentOrder
      .map((id): GridItemUnion | null => {
        const appItem = resolvedApps.get(id);
        if (appItem) return { type: "app", data: appItem };

        if (isFolderId(id)) {
          const folder = foldersMap.get(id);
          if (folder) {
            return {
              type: "folder",
              data: { id, name: folder.name, apps: resolveFolderApps(folder.appPaths, appsMap) },
            };
          }
        }

        return null;
      })
      .filter((item): item is GridItemUnion => item !== null);
  }

  // Initialize order once apps/folders load
  if (order === null && (apps.length > 0 || physicalFolders.length > 0)) {
    // Check if we have saved folders or need to convert physical folders,
    // then heal them: drop uninstalled apps and folders left empty
    const savedFolders = orderConfig?.folders ?? [];
    const effectiveFolders = healFolders(
      savedFolders.length > 0 ? savedFolders : convertPhysicalFolders(physicalFolders),
      new Set(appsMap.keys())
    );

    // Seed local folder state — from here on it is the single source of
    // truth (mutations append/update it, so it must start complete)
    if (effectiveFolders.length > 0) {
      setFolders(effectiveFolders);
    }

    // Build order from saved config (healing stale/duplicate/folder-contained
    // entries) or from scratch on first launch — same reconciliation either way
    setOrder(
      buildInitialOrder(
        orderConfig?.main ?? [],
        apps.map((a) => a.path),
        effectiveFolders
      )
    );
  }

  // Build items from current order
  const items = buildItems(order);

  const activeItem = activeId
    ? items.find((i) => i.data.id === activeId) ?? null
    : null;

  const itemIds = items.map((item) => item.data.id);

  return {
    items,
    itemIds,
    activeItem,
    appsMap,
    getItemType,
  };
}
