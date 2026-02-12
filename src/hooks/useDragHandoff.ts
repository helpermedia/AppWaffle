import { useState, useEffect } from "react";
import { DragCoordinator } from "@/lib/helper-dnd";
import type { HandoffRequest } from "@/lib/helper-dnd";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { FolderMetadata } from "@/types/app";
import type { GridFolder } from "@/components/items/FolderItem";
import { removeAppFromFolder } from "@/utils/folderUtils";
import type { DragEngine } from "@/lib/helper-dnd";

interface DragGridHandle {
  order: string[] | null;
  setOrder: (order: string[]) => void;
  getEngine: () => DragEngine | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseDragHandoffOptions {
  openFolder: GridFolder | null;
  setOpenFolder: (folder: GridFolder | null) => void;
  folders: FolderMetadata[];
  setFolders: (folders: FolderMetadata[]) => void;
  dragGrid: DragGridHandle;
  saveOrder: (order: string[], folders: FolderMetadata[]) => void;
}

export function useDragHandoff({
  openFolder,
  setOpenFolder,
  folders,
  setFolders,
  dragGrid,
  saveOrder,
}: UseDragHandoffOptions) {
  const [coordinator] = useState(() => new DragCoordinator({}));

  // Refs for handoff callback to access current state
  const openFolderRef = useLatestRef(openFolder);
  const foldersRef = useLatestRef(folders);
  const dragGridRef = useLatestRef(dragGrid);
  const saveOrderRef = useLatestRef(saveOrder);
  const setFoldersRef = useLatestRef(setFolders);
  const setOpenFolderRef = useLatestRef(setOpenFolder);

  // Wire up the coordinator's onHandoff (once on mount).
  // All values accessed via stable refs — no need to recreate on every render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Coordinator is mutable by design
    coordinator.onHandoff = async (request: HandoffRequest) => {
      const currentOpenFolder = openFolderRef.current;
      const currentDragGrid = dragGridRef.current;
      const currentFolders = foldersRef.current;

      if (!currentOpenFolder || !currentDragGrid.order) return;

      if (!currentFolders.some((f) => f.id === currentOpenFolder.id)) return;

      const { newOrder, updatedFolders } = removeAppFromFolder(
        currentOpenFolder.id,
        request.itemId,
        currentDragGrid.order,
        currentFolders,
      );

      setFoldersRef.current(updatedFolders);
      currentDragGrid.setOrder(newOrder);
      saveOrderRef.current(newOrder, updatedFolders);
      setOpenFolderRef.current(null);
    };
  }, [coordinator, openFolderRef, foldersRef, dragGridRef, saveOrderRef, setFoldersRef, setOpenFolderRef]);

  // Register main grid with coordinator when engine is available
  useEffect(() => {
    const engine = dragGrid.getEngine();
    const container = dragGrid.containerRef.current;

    if (coordinator && engine && container) {
      coordinator.register({
        id: "main-grid",
        engine,
        container,
      });
    }

    return () => {
      coordinator?.unregister("main-grid");
    };
  }, [coordinator, dragGrid]);

  return { coordinator };
}
