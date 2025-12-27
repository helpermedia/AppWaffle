import { useState, useEffect, useRef } from "react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { AppItem, type GridItem } from "@/components/items/AppItem";
import { AppItemOverlay } from "@/components/items/AppItemOverlay";
import { useSortableGrid } from "@/hooks/useSortableGrid";
import { type GridFolder } from "@/components/items/FolderItem";
import { cn } from "@/utils/cn";

interface FolderModalProps {
  folder: GridFolder;
  savedOrder?: string[];
  onOrderChange?: (newOrder: string[]) => void;
  onClose: () => void;
}

export function FolderModal({
  folder,
  savedOrder,
  onOrderChange,
  onClose,
}: FolderModalProps) {
  // Use saved order if available, otherwise use folder.apps order
  const defaultOrder = folder.apps.map((app) => app.path);
  const initialOrder = savedOrder && savedOrder.length > 0 ? savedOrder : defaultOrder;
  const { order, activeId, sensors, handleDragStart, handleDragEnd } =
    useSortableGrid({ initialOrder, onOrderChange });
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  function handleClose() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    setTimeout(() => onCloseRef.current(), 200); // Match animation duration
  }

  // Derive items from order + folder apps
  const appsMap = new Map(folder.apps.map((app) => [app.path, app]));
  const items = (order ?? [])
    .map((id) => {
      const app = appsMap.get(id);
      return app ? { ...app, id } : null;
    })
    .filter((item): item is GridItem => item !== null);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;
  const itemIds = items.map((item) => item.id);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          "h-full flex flex-col items-center justify-center",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={handleBackdropClick}
      >
        <h2
          className={cn(
            "text-white text-xl font-medium text-center mb-4 drop-shadow-md",
            isClosing ? "animate-scale-out" : "animate-scale-in"
          )}
        >
          {folder.name}
        </h2>
        <div
          className={cn(
            "bg-white/15 backdrop-blur-xl rounded-3xl pt-8 pb-4 w-full max-w-7xl max-h-[60vh] overflow-y-auto",
            isClosing ? "animate-scale-out" : "animate-scale-in"
          )}
        >
          <SortableContext items={itemIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-7 gap-4 place-items-center">
              {items.map((item) => (
                <AppItem
                  key={item.id}
                  item={item}
                  isDragActive={activeItem !== null}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      </div>

      <DragOverlay>
        {activeItem && <AppItemOverlay item={activeItem} />}
      </DragOverlay>
    </DndContext>
  );
}
