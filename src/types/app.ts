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

export interface AppConfig {
  version: number;
  order: OrderConfig;
}
