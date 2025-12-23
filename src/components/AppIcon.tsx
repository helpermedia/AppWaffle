import { forwardRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { AppInfo } from "../types/app";

interface AppIconProps {
  app: AppInfo;
  onLaunch: (path: string) => void;
  isLaunching: boolean;
}

// Subtle animated placeholder matching Tahoe's icon background gray
const DEFAULT_ICON = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <style>
      @keyframes pulse { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
      rect { animation: pulse 2s ease-in-out infinite; }
    </style>
    <rect width="100" height="100" rx="22" fill="#bbb"/>
  </svg>
`)}`;

function getIconSrc(icon: string | null): string {
  if (!icon) return DEFAULT_ICON;

  if (icon.startsWith("file://")) {
    const filePath = icon.replace("file://", "");
    return convertFileSrc(filePath);
  }

  return icon;
}

export const AppIcon = forwardRef<HTMLButtonElement, AppIconProps>(
  ({ app, onLaunch, isLaunching }, ref) => {
    const baseClasses =
      "flex flex-col items-center gap-2 p-3 bg-transparent border-none rounded-xl cursor-default w-24 pointer-events-none transition-all duration-100 ease-out active:scale-95";

    const launchingClasses = isLaunching ? "scale-125 duration-150" : "";

    return (
      <button
        ref={ref}
        data-app-icon
        className={`${baseClasses} ${launchingClasses}`}
        onClick={() => onLaunch(app.path)}
        title={app.name}
      >
        <div className="size-16 flex items-center justify-center pointer-events-auto cursor-pointer">
          <img
            src={getIconSrc(app.icon)}
            alt={app.name}
            className="size-full object-contain drop-shadow-lg"
            draggable={false}
          />
        </div>
        <span className="text-xs text-white text-center max-w-full truncate drop-shadow-md pointer-events-auto cursor-pointer">
          {app.name}
        </span>
      </button>
    );
  }
);
