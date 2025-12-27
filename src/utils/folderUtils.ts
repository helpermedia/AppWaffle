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
