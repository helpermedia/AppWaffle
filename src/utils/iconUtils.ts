import { convertFileSrc } from "@tauri-apps/api/core";

// Subtle animated placeholder matching Tahoe's icon background gray
export const DEFAULT_ICON = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <style>
      @keyframes pulse { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
      rect { animation: pulse 2s ease-in-out infinite; }
    </style>
    <rect width="100" height="100" rx="22" fill="#bbb"/>
  </svg>
`)}`;

export function getIconSrc(icon: string | null): string {
  if (!icon) return DEFAULT_ICON;
  if (icon.startsWith("file://")) {
    return convertFileSrc(icon.replace("file://", ""));
  }
  return icon;
}

// Shared base classes for icon buttons (AppIcon & FolderIcon)
export const ICON_BUTTON_CLASSES =
  "flex flex-col items-center gap-0.5 px-3 pt-1 pb-2 bg-transparent border-none rounded-xl cursor-default w-36 pointer-events-none";
