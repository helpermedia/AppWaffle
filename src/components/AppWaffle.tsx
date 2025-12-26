import { useState, useMemo, useEffect, useRef } from "react";
import { exit } from "@tauri-apps/plugin-process";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useApps } from "../hooks/useApps";
import {
  SortableAppItem,
  AppItemOverlay,
  type GridItem,
} from "./items/AppItem";
import {
  SortableFolderItem,
  FolderItemOverlay,
  type GridFolder,
} from "./items/FolderItem";
import { FolderModal } from "./FolderModal";

// Union type for grid items
type GridItemUnion =
  | { type: "app"; data: GridItem }
  | { type: "folder"; data: GridFolder };

export function AppWaffle() {
  const { apps, folders, loading, loadingMessage, error } = useApps();
  const [order, setOrder] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<GridFolder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  // Initialize order once apps/folders load
  if (order === null && (apps.length > 0 || folders.length > 0)) {
    setOrder([
      ...apps.map((app) => app.path),
      ...folders.map((folder) => folder.path),
    ]);
  }

  // Derive items from order + apps + folders (icons update automatically)
  const items = useMemo((): GridItemUnion[] => {
    if (!order) return [];
    const appsMap = new Map(apps.map((app) => [app.path, app]));
    const foldersMap = new Map(folders.map((folder) => [folder.path, folder]));

    return order
      .map((id): GridItemUnion | null => {
        const app = appsMap.get(id);
        if (app) return { type: "app", data: { ...app, id } };

        const folder = foldersMap.get(id);
        if (folder) return { type: "folder", data: { ...folder, id } };

        return null;
      })
      .filter((item): item is GridItemUnion => item !== null);
  }, [order, apps, folders]);

  const activeItem = activeId ? items.find((i) => i.data.id === activeId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !openFolder) {
        exit(0);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFolder]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setOrder((prev) => {
        if (!prev) return prev;
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-white/70">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  // Get IDs for SortableContext
  const itemIds = items.map((item) => item.data.id);

  const handleOpenFolder = (folder: GridFolder) => {
    // Save scroll position before opening folder
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    setOpenFolder(folder);
  };

  return (
    <div ref={scrollRef} className="w-full h-full p-20 overflow-auto">
      {openFolder && (
        <FolderModal
          folder={openFolder}
          onClose={() => {
            setOpenFolder(null);
            // Restore scroll position after render
            requestAnimationFrame(() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = savedScrollTop.current;
              }
            });
          }}
        />
      )}

      <div className={openFolder ? "hidden" : undefined}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-7 gap-4 place-items-center max-w-7xl mx-auto">
              {items.map((item) =>
                item.type === "app" ? (
                  <SortableAppItem
                    key={item.data.id}
                    item={item.data}
                    isDragActive={activeItem !== null}
                  />
                ) : (
                  <SortableFolderItem
                    key={item.data.id}
                    item={item.data}
                    isDragActive={activeItem !== null}
                    onOpen={handleOpenFolder}
                  />
                )
              )}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeItem?.type === "app" && (
              <AppItemOverlay item={activeItem.data} />
            )}
            {activeItem?.type === "folder" && (
              <FolderItemOverlay item={activeItem.data} />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
