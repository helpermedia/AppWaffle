import { convertFileSrc } from "@tauri-apps/api/core";
import type { FolderInfo } from "../types/app";

interface FolderIconProps {
  folder: FolderInfo;
  onOpen: (folder: FolderInfo) => void;
}

const DEFAULT_ICON = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="22" fill="#bbb"/>
  </svg>
`)}`;

function getIconSrc(icon: string | null): string {
  if (!icon) return DEFAULT_ICON;
  if (icon.startsWith("file://")) {
    return convertFileSrc(icon.replace("file://", ""));
  }
  return icon;
}

export function FolderIcon({ folder, onOpen }: FolderIconProps) {
  // Get first 4 apps for preview grid
  const previewApps = folder.apps.slice(0, 4);

  return (
    <button
      data-app-icon
      className="flex flex-col items-center gap-0.5 p-3 bg-transparent border-none rounded-xl cursor-default w-36 pointer-events-none transition-all duration-100 ease-out active:scale-95"
      onClick={() => onOpen(folder)}
      title={folder.name}
    >
      <div className="size-16 flex items-center justify-center pointer-events-auto cursor-pointer">
        <div className="size-14 bg-white/20 backdrop-blur-sm rounded-xl p-1.5 grid grid-cols-2 gap-0.5">
          {previewApps.map((app) => (
            <img
              key={app.path}
              src={getIconSrc(app.icon)}
              alt={app.name}
              className="size-full object-contain rounded"
              draggable={false}
            />
          ))}
          {/* Fill empty slots */}
          {Array.from({ length: 4 - previewApps.length }).map((_, i) => (
            <div key={`empty-${i}`} className="size-full rounded bg-white/10" />
          ))}
        </div>
      </div>
      <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md">
        {folder.name}
      </span>
    </button>
  );
}
