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
