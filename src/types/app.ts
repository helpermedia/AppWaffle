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

export interface AppsResponse {
  apps: AppInfo[];
  folders: FolderInfo[];
}

export interface OrderConfig {
  main: string[];
  folders: Record<string, string[]>;
}

export interface AppConfig {
  version: number;
  order: OrderConfig;
}
