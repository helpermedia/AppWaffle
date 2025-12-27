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

export interface VirtualFolderMetadata {
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
  folders: Record<string, string[]>;
  virtualFolders?: VirtualFolderMetadata[];
}

export interface DndSettings {
  /** How long to hold still over an app before folder creation ring appears (ms) */
  folderCreationDelay: number;
  /** Distance that resets the folder creation timer (px) */
  motionThreshold: number;
  /** How long before items shift to show the new drop position (ms) */
  sortingDelay: number;
}

export interface AppConfig {
  version: number;
  order: OrderConfig;
  dnd?: DndSettings;
}
