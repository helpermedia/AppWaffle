export interface AppInfo {
  name: string;
  path: string;
  icon: string | null;
}

export interface FolderInfo {
  name: string;
  path: string;
  apps: AppInfo[];
}

export interface FolderMetadata {
  id: string;
  name: string;
  appPaths: string[];
  createdAt: number;
}

export interface AppsResponse {
  apps: AppInfo[];
  folders: FolderInfo[];
}

export interface OrderConfig {
  main: string[];
  folders: FolderMetadata[];
}

export interface DndSettings {
  /** How long to hold over an app before folder creation ring appears (ms) */
  folderCreationDelay: number;
  /** How long before items shift to show the new drop position (ms) */
  sortingDelay: number;
  /** Minimum overlap ratio (0-1) required for folder creation highlight */
  overlapThreshold: number;
}

export interface AppConfig {
  version: number;
  order: OrderConfig;
  dnd?: DndSettings;
}
