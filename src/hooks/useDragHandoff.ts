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
  /* eslint-disable react-hooks/immutability -- Coordinator is mutable by design */
  useEffect(() => {
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
  /* eslint-enable react-hooks/immutability */

  // Register main grid with coordinator once its engine exists (it does by
  // the time this runs: useDragGrid's effect is registered first). Read via
  // the ref so this effect doesn't re-run on every render — unregistering
  // the active grid mid-drag would clear the coordinator's active state.
  useEffect(() => {
    const engine = dragGridRef.current.getEngine();
    const container = dragGridRef.current.containerRef.current;
    if (!engine || !container) {
      // This effect runs once and never retries: if the engine isn't ready
      // here (e.g., its creation effect gained deps), handoff is dead.
      console.warn("useDragHandoff: main grid engine not ready, handoff disabled");
      return;
    }

    coordinator.register({ id: "main-grid", engine, container });
    return () => {
      coordinator.unregister("main-grid");
    };
  }, [coordinator, dragGridRef]);

  return { coordinator };
}
