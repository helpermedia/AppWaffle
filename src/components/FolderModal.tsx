import { useEffect, useRef, useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import type { AppInfo, FolderInfo } from "../types/app";
import { AppIcon } from "./AppIcon";
import { SortableItem } from "./SortableItem";

interface FolderModalProps {
  folder: FolderInfo;
  onClose: () => void;
  onLaunch: (path: string) => void;
  launchingPath: string | null;
}

export function FolderModal({ folder, onClose, onLaunch, launchingPath }: FolderModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Track apps in local state for reordering
  const [apps, setApps] = useState<AppInfo[]>(folder.apps);

  // Get item IDs for SortableContext
  const itemIds = useMemo(() => apps.map((app) => app.path), [apps]);

  // Sensor for pointer/mouse
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Handle drag end - reorder apps
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setApps((prevApps) => {
        const oldIndex = prevApps.findIndex((app) => app.path === active.id);
        const newIndex = prevApps.findIndex((app) => app.path === over.id);
        return arrayMove(prevApps, oldIndex, newIndex);
      });
    }
  };

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
  }, [apps.length, onClose]);

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-2">
              {apps.map((app, index) => (
                <SortableItem key={app.path} id={app.path}>
                  <AppIcon
                    ref={(el) => { buttonRefs.current[index] = el; }}
                    app={app}
                    index={index}
                    onLaunch={onLaunch}
                    isLaunching={app.path === launchingPath}
                  />
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
