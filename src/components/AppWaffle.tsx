import { useState, useEffect, useRef } from "react";
import { exit } from "@tauri-apps/plugin-process";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useApps } from "@/hooks/useApps";
import { useSortableGrid } from "@/hooks/useSortableGrid";
import { AppItem, type GridItem } from "@/components/items/AppItem";
import { AppItemOverlay } from "@/components/items/AppItemOverlay";
import { FolderItem, type GridFolder } from "@/components/items/FolderItem";
import { FolderItemOverlay } from "@/components/items/FolderItemOverlay";
import { FolderModal } from "@/components/FolderModal";

// Union type for grid items
type GridItemUnion =
  | { type: "app"; data: GridItem }
  | { type: "folder"; data: GridFolder };

export function AppWaffle() {
  const { apps, folders, loading, loadingMessage, error } = useApps();
  const { order, setOrder, activeId, sensors, handleDragStart, handleDragEnd } =
    useSortableGrid({ initialOrder: null, enableKeyboard: true });
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
  const items: GridItemUnion[] = (() => {
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
  })();

  const activeItem = activeId ? items.find((i) => i.data.id === activeId) ?? null : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !openFolder) {
        exit(0);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFolder]);

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
                  <AppItem
                    key={item.data.id}
                    item={item.data}
                    isDragActive={activeItem !== null}
                  />
                ) : (
                  <FolderItem
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
