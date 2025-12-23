import { useEffect, useRef } from "react";
import type { FolderInfo } from "../types/app";
import { AppIcon } from "./AppIcon";

interface FolderModalProps {
  folder: FolderInfo;
  onClose: () => void;
  onLaunch: (path: string) => void;
  launchingPath: string | null;
}

export function FolderModal({ folder, onClose, onLaunch, launchingPath }: FolderModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      const cols = 4;
      const currentIndex = buttonRefs.current.findIndex((ref) => ref === document.activeElement);
      let newIndex = currentIndex;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, folder.apps.length - 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
          break;
        case "ArrowDown":
          e.preventDefault();
          newIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + cols, folder.apps.length - 1);
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
  }, [folder.apps.length, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white/15 backdrop-blur-xl rounded-3xl p-6 max-w-lg max-h-[70vh] overflow-y-auto animate-scale-in"
        data-app-icon
      >
        <h2 className="text-white text-xl font-medium text-center mb-4 drop-shadow-md">
          {folder.name}
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {folder.apps.map((app, index) => (
            <AppIcon
              key={app.path}
              ref={(el) => { buttonRefs.current[index] = el; }}
              app={app}
              onLaunch={onLaunch}
              isLaunching={app.path === launchingPath}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
