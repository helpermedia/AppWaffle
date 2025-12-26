import { useEffect, useMemo, useRef, useState } from "react";
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
import { AppItem } from "./AppItem";
import { FolderItem } from "./FolderItem";
import { SortableItem } from "./SortableItem";

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

  // Create sorted items from props
  const sortedItems = useMemo<GridItem[]>(() => {
    const appItems: GridItem[] = apps.map((app) => ({ type: "app", data: app }));
    const folderItems: GridItem[] = folders.map((folder) => ({ type: "folder", data: folder }));
    return [...appItems, ...folderItems].sort((a, b) =>
      a.data.name.toLowerCase().localeCompare(b.data.name.toLowerCase())
    );
  }, [apps, folders]);

  // Track custom order after user reorders (null = use sortedItems)
  const [customOrder, setCustomOrder] = useState<GridItem[] | null>(null);
  const items = customOrder ?? sortedItems;

  // Get item IDs for SortableContext
  const itemIds = useMemo(() => items.map((item) => item.data.path), [items]);

  // Sensor for pointer/mouse
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Handle drag end - reorder items
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.data.path === active.id);
      const newIndex = items.findIndex((item) => item.data.path === over.id);
      setCustomOrder(arrayMove(items, oldIndex, newIndex));
    }
  };

  // Keyboard navigation
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <div
          ref={gridRef}
          className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4 p-10 max-w-275 mx-auto justify-items-center pointer-events-auto"
        >
          {items.map((item, index) => {
            const itemId = item.data.path;

            return (
              <SortableItem key={itemId} id={itemId}>
                {item.type === "app" ? (
                  <AppItem
                    ref={(el) => { buttonRefs.current[index] = el; }}
                    app={item.data}
                    index={index}
                    onLaunch={onLaunch}
                    isLaunching={item.data.path === launchingPath}
                  />
                ) : (
                  <FolderItem
                    ref={(el) => { buttonRefs.current[index] = el; }}
                    folder={item.data}
                    index={index}
                    onOpen={onOpenFolder}
                  />
                )}
              </SortableItem>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
