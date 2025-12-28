import { useState, useRef, useEffect } from "react";
import { useDndSettings } from "@/hooks/useConfig";
import type { DragMoveInfo, DragEndInfo, DragCompleteCallback } from "@/hooks/useDragGrid";

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
  handleDragMove: (info: DragMoveInfo) => void;
  handleDragEnd: (info: DragEndInfo, reorder: () => void, complete: DragCompleteCallback) => void;
}

export function useFolderCreation({
  getItemType,
  onCreateFolder,
  onAddToFolder,
}: UseFolderCreationOptions): UseFolderCreationReturn {
  const { folderCreationDelay, overlapThreshold } = useDndSettings();
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  // Track hover state for folder creation dwell time
  const hoverRef = useRef<{
    id: string;
    timerId: ReturnType<typeof setTimeout> | null;
    triggered: boolean;
  } | null>(null);

  function clearHoverTimer() {
    if (hoverRef.current?.timerId) {
      clearTimeout(hoverRef.current.timerId);
    }
    hoverRef.current = null;
  }

  // Cleanup timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      clearHoverTimer();
    };
  }, []);

  function handleDragMove(info: DragMoveInfo) {
    const { activeId, overlap } = info;

    // No overlap or overlapping self
    if (!overlap || overlap.targetId === activeId) {
      clearHoverTimer();
      setDropTarget(null);
      return;
    }

    const overId = overlap.targetId;
    const overlapRatio = overlap.ratio;
    const activeType = getItemType(activeId);
    const overType = getItemType(overId);

    // Only apps can be dragged to create/add to folders
    if (activeType !== "app") {
      clearHoverTimer();
      setDropTarget(null);
      return;
    }

    // App over folder → add to folder (only if overlap meets threshold)
    if (overType === "folder") {
      if (overlapRatio >= overlapThreshold) {
        clearHoverTimer();
        setDropTarget({ id: overId, action: "add-to-folder" });
      } else {
        clearHoverTimer();
        setDropTarget(null);
      }
      return;
    }

    // App over app → create folder (with dwell time)
    // Only if overlap meets threshold
    if (overType === "app") {
      if (overlapRatio < overlapThreshold) {
        clearHoverTimer();
        setDropTarget(null);
        return;
      }

      const hover = hoverRef.current;

      // Check if we're hovering over the same item
      if (hover?.id === overId) {
        // Already triggered - stay in triggered state
        if (hover.triggered) {
          return;
        }
        // Timer is running, let it continue
        return;
      }

      // Different target or first target - start fresh
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

      hoverRef.current = { id: overId, timerId, triggered: false };
      return;
    }

    clearHoverTimer();
    setDropTarget(null);
  }

  function handleDragEnd(info: DragEndInfo, reorder: () => void, complete: DragCompleteCallback) {
    const { activeId, overId, overlapRatio } = info;

    // Clear any pending dwell timer
    clearHoverTimer();

    // Capture current drop target before clearing
    const currentDropTarget = dropTarget;
    setDropTarget(null);

    // No overlap, overlapping self, or overlap below threshold - just reorder
    if (!overId || overId === activeId || overlapRatio < overlapThreshold) {
      reorder();
      complete();
      return;
    }

    const activeType = getItemType(activeId);
    const overType = getItemType(overId);

    // Handle folder creation: only if dwell time passed AND we're still over the same target
    if (activeType === "app" && overType === "app") {
      if (
        currentDropTarget?.action === "create-folder" &&
        currentDropTarget.id === overId
      ) {
        // Folder action - item will be removed from grid, complete after state update
        onCreateFolder(activeId, overId);
        complete();
      } else {
        // Dwell time didn't pass or target changed, treat as reorder
        reorder();
        complete();
      }
      return;
    }

    // Handle add to folder: app dropped on folder
    // Only if the visual indicator was showing (user was deliberately hovering)
    if (activeType === "app" && overType === "folder") {
      if (
        currentDropTarget?.action === "add-to-folder" &&
        currentDropTarget.id === overId
      ) {
        // Folder action - item will be removed from grid, complete after state update
        onAddToFolder(overId, activeId);
        complete();
      } else {
        // Visual indicator wasn't showing, treat as reorder
        reorder();
        complete();
      }
      return;
    }

    // Otherwise, use default reorder behavior
    reorder();
    complete();
  }

  return {
    dropTarget,
    handleDragMove,
    handleDragEnd,
  };
}
