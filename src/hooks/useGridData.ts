import type { AppInfo, FolderInfo, FolderMetadata, OrderConfig } from "@/types/app";
import { isFolderId, resolveFolderApps, resolveOrderToAppItems, convertPhysicalFolders } from "@/utils/folderUtils";
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
  const appsMap = new Map([
    ...apps.map((app) => [app.path, app] as const),
    ...physicalFolders.flatMap((folder) => folder.apps.map((app) => [app.path, app] as const)),
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
    // Check if we have saved folders or need to convert physical folders
    const savedFolders = orderConfig?.folders ?? [];
    const effectiveFolders = savedFolders.length > 0
      ? savedFolders
      : convertPhysicalFolders(physicalFolders);

    // If we converted physical folders, save them
    if (savedFolders.length === 0 && effectiveFolders.length > 0) {
      setFolders(effectiveFolders);
    }

    const allIds = new Set([
      ...apps.map((a) => a.path),
      ...effectiveFolders.map((f) => f.id),
    ]);

    if (orderConfig?.main && orderConfig.main.length > 0) {
      // Use saved order, filter out removed items, append new items
      const validSavedOrder = orderConfig.main.filter((id) => allIds.has(id));
      const newItems = [...allIds].filter((id) => !orderConfig.main.includes(id));
      setOrder([...validSavedOrder, ...newItems]);
    } else {
      // First launch - use default order
      setOrder([
        ...apps.map((app) => app.path),
        ...effectiveFolders.map((f) => f.id),
      ]);
    }
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
