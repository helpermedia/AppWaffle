import { useState, useRef } from "react";
import type { DragOverEvent, DragEndEvent } from "@dnd-kit/core";
import { useDndSettings } from "@/hooks/useConfig";

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
    timerId: ReturnType<typeof setTimeout> | null;
    startX: number;
    startY: number;
    triggered: boolean;  // True once timer completed and highlight is showing
  } | null>(null);

  function clearHoverTimer() {
    if (hoverRef.current?.timerId) {
      clearTimeout(hoverRef.current.timerId);
    }
    hoverRef.current = null;
  }

  function getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over, delta } = event;

    if (!over || active.id === over.id) {
      clearHoverTimer();
      setDropTarget(null);
      return;
    }

    const overId = String(over.id);
    const activeType = getItemType(String(active.id));
    const overType = getItemType(overId);

    // Use delta for motion detection - this actually updates during drag
    // (activeRect positions are static and don't work)
    const currentX = delta.x;
    const currentY = delta.y;

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
        // Already triggered - just stay in triggered state while on same target
        if (hover.triggered) {
          return;
        }

        // Check drift from initial position
        const driftDistance = getDistance(currentX, currentY, hover.startX, hover.startY);
        if (driftDistance > motionThreshold) {
          // Drifted too far - cancel timer and restart from current position
          if (hover.timerId) {
            clearTimeout(hover.timerId);
          }
          setDropTarget(null);
          const timerId = setTimeout(() => {
            setDropTarget({ id: overId, action: "create-folder" });
            if (hoverRef.current) {
              hoverRef.current.triggered = true;
              hoverRef.current.timerId = null;
            }
          }, folderCreationDelay);
          hoverRef.current = { id: overId, timerId, startX: currentX, startY: currentY, triggered: false };
        }
        // If within threshold, let existing timer continue
        return;
      }

      // Different target or first target - clear everything and start fresh
      clearHoverTimer();
      setDropTarget(null);

      // Start dwell timer for folder creation
      const timerId = setTimeout(() => {
        setDropTarget({ id: overId, action: "create-folder" });
        if (hoverRef.current) {
          hoverRef.current.triggered = true;
          hoverRef.current.timerId = null;
        }
      }, folderCreationDelay);

      hoverRef.current = { id: overId, timerId, startX: currentX, startY: currentY, triggered: false };
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
