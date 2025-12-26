import { useState, useMemo, useEffect, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import type { FolderInfo } from "../types/app";
import { SortableAppItem, AppItemOverlay, type GridItem } from "./items/AppItem";
import { cn } from "../utils/cn";

interface FolderModalProps {
  folder: FolderInfo;
  onClose: () => void;
}

export function FolderModal({ folder, onClose }: FolderModalProps) {
  const [order, setOrder] = useState<string[]>(() =>
    folder.apps.map((app) => app.path)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, 200); // Match animation duration
  }, [isClosing, onClose]);

  // Derive items from order + folder apps
  const items = useMemo(() => {
    const appsMap = new Map(folder.apps.map((app) => [app.path, app]));
    return order
      .map((id) => {
        const app = appsMap.get(id);
        return app ? { ...app, id } : null;
      })
      .filter((item): item is GridItem => item !== null);
  }, [order, folder.apps]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

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
  }, [handleClose]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-7 gap-4 place-items-center">
              {items.map((item) => (
                <SortableAppItem
                  key={item.id}
                  item={item}
                  isDragActive={activeItem !== null}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeItem && <AppItemOverlay item={activeItem} />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
