import { useEffect, useRef } from "react";
import type { AppInfo } from "../types/app";
import { AppIcon } from "./AppIcon";

interface AppGridProps {
  apps: AppInfo[];
  onLaunch: (path: string) => void;
  launchingPath: string | null;
}

export function AppGrid({ apps, onLaunch, launchingPath }: AppGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
      if (apps.length === 0) return;

      const cols = getColumns();
      const currentIndex = getCurrentIndex();
      let newIndex = currentIndex;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, apps.length - 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + cols, apps.length - 1);
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
  }, [apps]);

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4 p-10 max-w-275 mx-auto justify-items-center pointer-events-none *:pointer-events-auto"
    >
      {apps.map((app, index) => (
        <AppIcon
          key={app.path}
          ref={(el) => (buttonRefs.current[index] = el)}
          app={app}
          onLaunch={onLaunch}
          isLaunching={app.path === launchingPath}
        />
      ))}
    </div>
  );
}
