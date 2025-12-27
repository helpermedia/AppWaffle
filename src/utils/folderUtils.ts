import type { AppInfo, VirtualFolderMetadata } from "@/types/app";

const VIRTUAL_FOLDER_PREFIX = "virtual://";

export function generateVirtualFolderId(): string {
  return `${VIRTUAL_FOLDER_PREFIX}${crypto.randomUUID()}`;
}

export function isVirtualFolderId(id: string): boolean {
  return id.startsWith(VIRTUAL_FOLDER_PREFIX);
}

export function getVirtualFolderUUID(id: string): string | null {
  if (!isVirtualFolderId(id)) return null;
  return id.slice(VIRTUAL_FOLDER_PREFIX.length);
}

export function createVirtualFolder(
  appPaths: string[],
  name: string = "Untitled"
): VirtualFolderMetadata {
  return {
    id: generateVirtualFolderId(),
    name,
    appPaths,
    createdAt: Date.now(),
  };
}

export function resolveVirtualFolderApps(
  appPaths: string[],
  appsMap: Map<string, AppInfo>
): AppInfo[] {
  return appPaths
    .map((path) => appsMap.get(path))
    .filter((app): app is AppInfo => app !== undefined);
}
