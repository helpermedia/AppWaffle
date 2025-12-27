import { useState } from "react";
import type { DragOverEvent, DragEndEvent } from "@dnd-kit/core";

export type DropAction = "create-folder" | "add-to-folder" | null;

interface DropTargetState {
  id: string;
  action: DropAction;
}

interface UseFolderCreationOptions {
  getItemType: (id: string) => "app" | "folder" | "virtual-folder" | null;
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
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setDropTarget(null);
      return;
    }

    const activeType = getItemType(String(active.id));
    const overType = getItemType(String(over.id));

    // Only apps can be dragged to create/add to folders
    if (activeType !== "app") {
      setDropTarget(null);
      return;
    }

    // App dropped on app → create folder
    if (overType === "app") {
      setDropTarget({ id: String(over.id), action: "create-folder" });
      return;
    }

    // App dropped on folder → add to folder
    if (overType === "folder" || overType === "virtual-folder") {
      setDropTarget({ id: String(over.id), action: "add-to-folder" });
      return;
    }

    setDropTarget(null);
  }

  function handleDragEnd(event: DragEndEvent, defaultHandler: () => void) {
    const { active, over } = event;
    setDropTarget(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeType = getItemType(String(active.id));
    const overType = getItemType(String(over.id));

    // Handle folder creation: app dropped on app
    if (activeType === "app" && overType === "app") {
      onCreateFolder(String(active.id), String(over.id));
      return;
    }

    // Handle add to folder: app dropped on folder
    if (activeType === "app" && (overType === "folder" || overType === "virtual-folder")) {
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
