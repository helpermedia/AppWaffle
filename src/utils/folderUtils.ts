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
 * Dissolve a folder back into individual apps in the main grid order.
 * Replaces the folder entry with the given apps at the folder's position.
 */
export function dissolveFolder(
  folderId: string,
  order: string[],
  currentFolders: FolderMetadata[],
  appsToInsert: string[]
): { newOrder: string[]; updatedFolders: FolderMetadata[] } {
  const newOrder = [...order];
  const folderIndex = newOrder.indexOf(folderId);
  newOrder.splice(folderIndex, 1);
  newOrder.splice(folderIndex, 0, ...appsToInsert);
  const updatedFolders = currentFolders.filter((f) => f.id !== folderId);
  return { newOrder, updatedFolders };
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
