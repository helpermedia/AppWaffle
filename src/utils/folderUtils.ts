import type { AppInfo, FolderInfo, FolderMetadata } from "@/types/app";

const FOLDER_PREFIX = "folder://";

export function generateFolderId(): string {
  return `${FOLDER_PREFIX}${crypto.randomUUID()}`;
}

export function isFolderId(id: string): boolean {
  return id.startsWith(FOLDER_PREFIX);
}

export function getFolderUUID(id: string): string | null {
  if (!isFolderId(id)) return null;
  return id.slice(FOLDER_PREFIX.length);
}

export function createFolder(
  appPaths: string[],
  name: string = "Untitled"
): FolderMetadata {
  return {
    id: generateFolderId(),
    name,
    appPaths,
    createdAt: Date.now(),
  };
}

export function resolveFolderApps(
  appPaths: string[],
  appsMap: Map<string, AppInfo>
): AppInfo[] {
  return appPaths
    .map((path) => appsMap.get(path))
    .filter((app): app is AppInfo => app !== undefined);
}

/**
 * Resolve an ordered list of IDs into app items, skipping unknown IDs.
 */
export function resolveOrderToAppItems(
  order: string[],
  appsMap: Map<string, AppInfo>
): (AppInfo & { id: string })[] {
  return order
    .map((id) => {
      const app = appsMap.get(id);
      return app ? { ...app, id } : null;
    })
    .filter((item): item is AppInfo & { id: string } => item !== null);
}

/**
 * Drop apps that no longer exist on disk from folder contents, and drop
 * folders left with no apps at all. Heals configs referencing uninstalled
 * apps: phantom entries would otherwise desync FolderModal reorders (DOM
 * indices vs order array) and an all-apps-gone folder would render as a
 * permanent empty tile that can never be dissolved.
 */
export function healFolders(
  folders: FolderMetadata[],
  knownAppPaths: ReadonlySet<string>
): FolderMetadata[] {
  return folders
    .map((f) => ({ ...f, appPaths: f.appPaths.filter((p) => knownAppPaths.has(p)) }))
    .filter((f) => f.appPaths.length > 0);
}

/**
 * Build the initial main-grid order from a saved order and discovered items.
 * Drops ids that no longer exist, apps that live inside folders, and
 * duplicates (healing configs corrupted by earlier versions), then appends
 * newly discovered items at the end.
 */
export function buildInitialOrder(
  savedMain: string[],
  appPaths: string[],
  folders: FolderMetadata[]
): string[] {
  const folderContained = new Set(folders.flatMap((f) => f.appPaths));
  const allIds = new Set([
    ...appPaths.filter((path) => !folderContained.has(path)),
    ...folders.map((f) => f.id),
  ]);

  const seen = new Set<string>();
  const validSavedOrder = savedMain.filter((id) => {
    if (!allIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const newItems = [...allIds].filter((id) => !seen.has(id));
  return [...validSavedOrder, ...newItems];
}

/**
 * Dissolve a folder back into individual apps in the main grid order.
 * Replaces the folder entry with the given apps at the folder's position.
 */
export function dissolveFolder(
  folderId: string,
  order: string[],
  currentFolders: FolderMetadata[],
  appsToInsert: string[]
): { newOrder: string[]; updatedFolders: FolderMetadata[] } {
  // Drop any stray copies of the inserted apps so they can't end up twice
  const newOrder = order.filter((id) => !appsToInsert.includes(id));
  const folderIndex = newOrder.indexOf(folderId);
  if (folderIndex === -1) {
    newOrder.push(...appsToInsert);
  } else {
    newOrder.splice(folderIndex, 1, ...appsToInsert);
  }
  const updatedFolders = currentFolders.filter((f) => f.id !== folderId);
  return { newOrder, updatedFolders };
}

/**
 * Remove an app from a folder and compute the resulting order/folders.
 * If the folder has 0-1 apps remaining, it is dissolved (apps return to the grid).
 * Otherwise the folder is updated and the removed app is appended to the grid.
 */
export function removeAppFromFolder(
  folderId: string,
  appId: string,
  order: string[],
  folders: FolderMetadata[],
): { newOrder: string[]; updatedFolders: FolderMetadata[]; dissolved: boolean } {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return { newOrder: order, updatedFolders: folders, dissolved: false };

  const remainingApps = folder.appPaths.filter((id) => id !== appId);

  if (remainingApps.length <= 1) {
    const { newOrder, updatedFolders } = dissolveFolder(
      folderId, order, folders, [...remainingApps, appId],
    );
    return { newOrder, updatedFolders, dissolved: true };
  }

  const updatedFolders = updateFolderById(folders, folderId, { appPaths: remainingApps });
  // Filter first: the app must never appear twice in the grid order
  const newOrder = [...order.filter((id) => id !== appId), appId];
  return { newOrder, updatedFolders, dissolved: false };
}

/**
 * Return a new folders array with one folder updated by id.
 */
export function updateFolderById(
  folders: FolderMetadata[],
  id: string,
  updates: Partial<FolderMetadata>
): FolderMetadata[] {
  return folders.map((f) => (f.id === id ? { ...f, ...updates } : f));
}

/**
 * Convert physical folders (from disk) to FolderMetadata format.
 * Used on first launch to initialize folders from filesystem.
 */
export function convertPhysicalFolders(folders: FolderInfo[]): FolderMetadata[] {
  return folders.map((folder) => ({
    id: generateFolderId(),
    name: folder.name,
    appPaths: folder.apps.map((app) => app.path),
    createdAt: Date.now(),
  }));
}
