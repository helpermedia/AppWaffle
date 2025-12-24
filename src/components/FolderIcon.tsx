import { forwardRef } from "react";
import type { FolderInfo } from "../types/app";
import { getIconSrc, ICON_BUTTON_CLASSES } from "../utils/iconUtils";

interface FolderIconProps {
  folder: FolderInfo;
  index: number;
  onOpen: (folder: FolderInfo) => void;
}

export const FolderIcon = forwardRef<HTMLButtonElement, FolderIconProps>(
  ({ folder, index, onOpen }, ref) => {
    // Get first 4 apps for preview grid
    const previewApps = folder.apps.slice(0, 4);

    return (
      <button
        ref={ref}
        data-app-icon
        className={ICON_BUTTON_CLASSES}
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
        <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md h-8 leading-4">
          {index}. {folder.name}
        </span>
      </button>
    );
  }
);

FolderIcon.displayName = "FolderIcon";
