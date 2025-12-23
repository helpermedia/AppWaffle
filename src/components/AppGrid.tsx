import { useEffect, useMemo, useRef } from "react";
import type { AppInfo, FolderInfo } from "../types/app";
import { AppIcon } from "./AppIcon";
import { FolderIcon } from "./FolderIcon";

type GridItem =
  | { type: "app"; data: AppInfo }
  | { type: "folder"; data: FolderInfo };

interface AppGridProps {
  apps: AppInfo[];
  folders: FolderInfo[];
  onLaunch: (path: string) => void;
  onOpenFolder: (folder: FolderInfo) => void;
  launchingPath: string | null;
}

export function AppGrid({ apps, folders, onLaunch, onOpenFolder, launchingPath }: AppGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Combine apps and folders into a single sorted list
  const items = useMemo<GridItem[]>(() => {
    const appItems: GridItem[] = apps.map((app) => ({ type: "app", data: app }));
    const folderItems: GridItem[] = folders.map((folder) => ({ type: "folder", data: folder }));
    return [...appItems, ...folderItems].sort((a, b) =>
      a.data.name.toLowerCase().localeCompare(b.data.name.toLowerCase())
    );
  }, [apps, folders]);

  const getColumns = () => {
    if (!gridRef.current) return 8;
    const width = gridRef.current.offsetWidth;
    if (width >= 1280) return 8;
    if (width >= 768) return 6;
    return 4;
  };

  const getCurrentIndex = () => {
    const focused = document.activeElement;
    return buttonRefs.current.findIndex((ref) => ref === focused);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (items.length === 0) return;

      const cols = getColumns();
      const currentIndex = getCurrentIndex();
      let newIndex = currentIndex;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + cols, items.length - 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - cols, 0);
          break;
        default:
          return;
      }

      buttonRefs.current[newIndex]?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [items]);

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4 p-10 max-w-275 mx-auto justify-items-center pointer-events-none *:pointer-events-auto"
    >
      {items.map((item, index) =>
        item.type === "app" ? (
          <AppIcon
            key={item.data.path}
            ref={(el) => { buttonRefs.current[index] = el; }}
            app={item.data}
            onLaunch={onLaunch}
            isLaunching={item.data.path === launchingPath}
          />
        ) : (
          <FolderIcon
            key={item.data.path}
            folder={item.data}
            onOpen={onOpenFolder}
          />
        )
      )}
    </div>
  );
}
