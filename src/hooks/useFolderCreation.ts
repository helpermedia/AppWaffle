import { useState, useRef } from "react";
import type { DragOverEvent, DragEndEvent } from "@dnd-kit/core";
import { useDndSettings } from "@/contexts/ConfigContext";

export type DropAction = "create-folder" | "add-to-folder" | null;

interface DropTargetState {
  id: string;
  action: DropAction;
}

interface UseFolderCreationOptions {
  getItemType: (id: string) => "app" | "folder" | null;
  onCreateFolder: (sourceAppId: string, targetAppId: string) => void;
  onAddToFolder: (folderId: string, appId: string) => void;
}

interface UseFolderCreationReturn {
  dropTarget: DropTargetState | null;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent, defaultHandler: () => void) => void;
}

export function useFolderCreation({
  getItemType,
  onCreateFolder,
  onAddToFolder,
}: UseFolderCreationOptions): UseFolderCreationReturn {
  const { folderCreationDelay, motionThreshold } = useDndSettings();
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  // Track hover state for folder creation dwell time with motion detection
  const hoverRef = useRef<{
    id: string;
    timerId: ReturnType<typeof setTimeout>;
    lastX: number;
    lastY: number;
  } | null>(null);

  function clearHoverTimer() {
    if (hoverRef.current) {
      clearTimeout(hoverRef.current.timerId);
      hoverRef.current = null;
    }
  }

  function getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      clearHoverTimer();
      setDropTarget(null);
      return;
    }

    const overId = String(over.id);
    const activeType = getItemType(String(active.id));
    const overType = getItemType(overId);

    // Get current drag position
    const rect = active.rect.current.translated;
    const currentX = rect?.left ?? 0;
    const currentY = rect?.top ?? 0;

    // Only apps can be dragged to create/add to folders
    if (activeType !== "app") {
      clearHoverTimer();
      setDropTarget(null);
      return;
    }

    // App over folder → add to folder (immediate feedback)
    if (overType === "folder") {
      clearHoverTimer();
      setDropTarget({ id: overId, action: "add-to-folder" });
      return;
    }

    // App over app → create folder (with dwell time + motion detection)
    if (overType === "app") {
      const hover = hoverRef.current;

      // Check if we're hovering over the same item
      if (hover?.id === overId) {
        // Check if cursor moved beyond threshold - reset timer if so
        const distance = getDistance(currentX, currentY, hover.lastX, hover.lastY);
        if (distance > motionThreshold) {
          // Motion detected - clear ring and restart timer from current position
          clearTimeout(hover.timerId);
          setDropTarget(null);
          const timerId = setTimeout(() => {
            setDropTarget({ id: overId, action: "create-folder" });
            hoverRef.current = null;
          }, folderCreationDelay);
          hoverRef.current = { id: overId, timerId, lastX: currentX, lastY: currentY };
        }
        // If within threshold, let existing timer continue
        return;
      }

      // New target - clear any existing timer and dropTarget, start fresh
      clearHoverTimer();
      setDropTarget(null);

      // Start dwell timer for folder creation
      const timerId = setTimeout(() => {
        setDropTarget({ id: overId, action: "create-folder" });
        hoverRef.current = null;
      }, folderCreationDelay);

      hoverRef.current = { id: overId, timerId, lastX: currentX, lastY: currentY };
      return;
    }

    clearHoverTimer();
    setDropTarget(null);
  }

  function handleDragEnd(event: DragEndEvent, defaultHandler: () => void) {
    const { active, over } = event;

    // Clear any pending dwell timer
    clearHoverTimer();

    // Capture current drop target before clearing
    const currentDropTarget = dropTarget;
    setDropTarget(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeType = getItemType(String(active.id));
    const overType = getItemType(String(over.id));

    // Handle folder creation: only if dwell time passed AND we're still over the same target
    if (activeType === "app" && overType === "app") {
      if (
        currentDropTarget?.action === "create-folder" &&
        currentDropTarget.id === String(over.id)
      ) {
        onCreateFolder(String(active.id), String(over.id));
      } else {
        // Dwell time didn't pass or target changed, treat as reorder
        defaultHandler();
      }
      return;
    }

    // Handle add to folder: app dropped on folder
    if (activeType === "app" && overType === "folder") {
      onAddToFolder(String(over.id), String(active.id));
      return;
    }

    // Otherwise, use default reorder behavior
    defaultHandler();
  }

  return {
    dropTarget,
    handleDragOver,
    handleDragEnd,
  };
}
