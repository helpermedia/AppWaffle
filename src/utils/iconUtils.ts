import { convertFileSrc } from "@tauri-apps/api/core";

// Skeleton placeholder while an icon generates: a faint pulsing squircle
// on the real icons' footprint (icons keep a ~9px transparent margin at
// 96px with a ~20px corner, measured from the cached icon PNGs), so the
// artwork lands exactly on top of it instead of replacing a larger block
export const DEFAULT_ICON = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <style>
      @keyframes pulse { 0%, 100% { opacity: 0.14; } 50% { opacity: 0.26; } }
      rect { animation: pulse 2s ease-in-out infinite; }
    </style>
    <rect x="9" y="9" width="78" height="78" rx="20" fill="#fff"/>
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
