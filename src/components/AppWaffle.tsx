import { useEffect, useRef } from "react";
import { exit } from "@tauri-apps/plugin-process";
import { DndContext, DragOverlay, rectIntersection } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { useGrid } from "@/hooks/useGrid";
import { AppItem } from "@/components/items/AppItem";
import { AppItemOverlay } from "@/components/items/AppItemOverlay";
import { FolderItem, FolderItemOverlay } from "@/components/items/FolderItem";
import { FolderModal } from "@/components/FolderModal";

export function AppWaffle() {
  const {
    items,
    itemIds,
    activeItem,
    openFolder,
    sensors,
    delayedStrategy,
    dropTarget,
    handleDragStart,
    handleDragOver,
    onDragEnd,
    handleOpenFolder,
    handleCloseFolder,
    handleFolderOrderChange,
    getOpenFolderSavedOrder,
  } = useGrid();

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  // Save scroll position when opening folder
  function onOpenFolder(folder: Parameters<typeof handleOpenFolder>[0], isVirtual: boolean) {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    handleOpenFolder(folder, isVirtual);
  }

  // Restore scroll position when closing folder
  function onCloseFolder() {
    handleCloseFolder();
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = savedScrollTop.current;
      }
    });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !openFolder) {
        exit(0);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFolder]);

  return (
    <div ref={scrollRef} className="w-full h-full p-20 overflow-auto">
      {openFolder && (
        <FolderModal
          folder={openFolder.data}
          savedOrder={getOpenFolderSavedOrder()}
          onOrderChange={(newOrder) => handleFolderOrderChange(openFolder.data.id, newOrder)}
          onClose={onCloseFolder}
        />
      )}

      <div className={openFolder ? "hidden" : undefined}>
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={itemIds} strategy={delayedStrategy}>
            <div className="grid grid-cols-7 gap-4 place-items-center max-w-7xl mx-auto">
              {items.map((item) => {
                const isDropTarget = dropTarget?.id === item.data.id;
                const dropAction = isDropTarget ? dropTarget.action : undefined;

                if (item.type === "app") {
                  return (
                    <AppItem
                      key={item.data.id}
                      item={item.data}
                      isDragActive={activeItem !== null}
                      dropAction={dropAction}
                    />
                  );
                } else {
                  return (
                    <FolderItem
                      key={item.data.id}
                      item={item.data}
                      isDragActive={activeItem !== null}
                      dropAction={dropAction}
                      onOpen={(folder) => onOpenFolder(folder, item.isVirtual)}
                    />
                  );
                }
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeItem?.type === "app" && <AppItemOverlay item={activeItem.data} />}
            {activeItem?.type === "folder" && <FolderItemOverlay item={activeItem.data} />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
