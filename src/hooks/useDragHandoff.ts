import { useState, useRef, useEffect } from "react";
import { DragCoordinator } from "@/lib/helper-dnd";
import type { HandoffRequest } from "@/lib/helper-dnd";
import type { FolderMetadata } from "@/types/app";
import type { GridFolder } from "@/components/items/FolderItem";
import { dissolveFolder, updateFolderById } from "@/utils/folderUtils";
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

  // Ref to hold the current handoff handler (set in effect to avoid render-time ref access)
  const handoffHandlerRef = useRef<((request: HandoffRequest) => Promise<void> | void) | null>(null);

  // Wire up the coordinator's onHandoff to call through the ref (once on mount)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Coordinator is mutable by design
    coordinator.onHandoff = (request) => handoffHandlerRef.current?.(request);
  }, [coordinator]);

  // Refs for handoff callback to access current state
  const openFolderRef = useRef(openFolder);
  const foldersRef = useRef(folders);
  const dragGridRef = useRef(dragGrid);
  const saveOrderRef = useRef(saveOrder);
  const setFoldersRef = useRef(setFolders);
  const setOpenFolderRef = useRef(setOpenFolder);

  // Sync refs and handoff handler every render (can't update refs during render)
  useEffect(() => {
    openFolderRef.current = openFolder;
    foldersRef.current = folders;
    dragGridRef.current = dragGrid;
    saveOrderRef.current = saveOrder;
    setFoldersRef.current = setFolders;
    setOpenFolderRef.current = setOpenFolder;

    handoffHandlerRef.current = async (request: HandoffRequest) => {
      const currentOpenFolder = openFolderRef.current;
      const currentDragGrid = dragGridRef.current;
      const currentFolders = foldersRef.current;

      if (!currentOpenFolder || !currentDragGrid.order) return;

      const folder = currentFolders.find((f) => f.id === currentOpenFolder.id);
      if (!folder) return;

      // Remove app from folder
      const updatedAppPaths = folder.appPaths.filter((id) => id !== request.itemId);

      let newOrder: string[];
      let updatedFolders: typeof currentFolders;

      if (updatedAppPaths.length <= 1) {
        // Folder becomes empty or has only 1 app - dissolve folder
        ({ newOrder, updatedFolders } = dissolveFolder(
          currentOpenFolder.id,
          currentDragGrid.order,
          currentFolders,
          [...updatedAppPaths, request.itemId]
        ));
      } else {
        // Folder still has apps - add dragged app to end of main grid
        newOrder = [...currentDragGrid.order, request.itemId];
        updatedFolders = updateFolderById(currentFolders, currentOpenFolder.id, { appPaths: updatedAppPaths });
      }

      // Update state synchronously
      setFoldersRef.current(updatedFolders);
      currentDragGrid.setOrder(newOrder);
      saveOrderRef.current(newOrder, updatedFolders);
      setOpenFolderRef.current(null);
    };
  });

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
