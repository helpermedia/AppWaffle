import { useState, useEffect } from "react";
import { isPageGridId } from "@/constants/grid";
import { DragCoordinator } from "@/lib/helper-dnd";
import type { HandoffRequest } from "@/lib/helper-dnd";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { FolderMetadata } from "@/types/app";
import { removeAppFromFolder } from "@/utils/folderUtils";
import type { DragEngine } from "@/lib/helper-dnd";

interface DragGridHandle {
  order: string[] | null;
  setOrder: (order: string[]) => void;
  getEngine: () => DragEngine | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/** Places a folder-dragged-out item into the visible page's window:
 *  receives the order without the item and returns it inserted */
export type PagedFolderInsert = (idsWithoutItem: string[], itemId: string) => string[];

interface UseDragHandoffOptions {
  openFolderId: string | null;
  setOpenFolderId: (id: string | null) => void;
  folders: FolderMetadata[];
  setFolders: (folders: FolderMetadata[]) => void;
  dragGrid: DragGridHandle;
  saveOrder: (order: string[], folders: FolderMetadata[]) => void;
  /** False in paged layout: the hidden main grid must not be a handoff
   *  candidate there — the current page registers itself instead */
  registerMainGrid: boolean;
  /** Set while the paged layout is active (see PagedFolderInsert) */
  pagedFolderInsertRef: React.RefObject<PagedFolderInsert | null>;
}

export function useDragHandoff({
  openFolderId,
  setOpenFolderId,
  folders,
  setFolders,
  dragGrid,
  saveOrder,
  registerMainGrid,
  pagedFolderInsertRef,
}: UseDragHandoffOptions) {
  const [coordinator] = useState(() => new DragCoordinator({}));

  // Refs for handoff callback to access current state
  const openFolderIdRef = useLatestRef(openFolderId);
  const foldersRef = useLatestRef(folders);
  const dragGridRef = useLatestRef(dragGrid);
  const saveOrderRef = useLatestRef(saveOrder);
  const setFoldersRef = useLatestRef(setFolders);
  const setOpenFolderIdRef = useLatestRef(setOpenFolderId);

  // Wire up the coordinator's onHandoff (once on mount).
  // All values accessed via stable refs — no need to recreate on every render.
  /* eslint-disable react-hooks/immutability -- Coordinator is mutable by design */
  useEffect(() => {
    coordinator.onHandoff = async (request: HandoffRequest) => {
      const currentOpenFolderId = openFolderIdRef.current;
      const currentDragGrid = dragGridRef.current;
      const currentFolders = foldersRef.current;

      if (!currentOpenFolderId || !currentDragGrid.order) return;

      if (!currentFolders.some((f) => f.id === currentOpenFolderId)) return;

      const { newOrder, updatedFolders } = removeAppFromFolder(
        currentOpenFolderId,
        request.itemId,
        currentDragGrid.order,
        currentFolders,
      );

      // Paged layout: the default placement puts the app at the end of
      // the order (the last page) or, when the folder dissolved, right of
      // the folder's old slot — either can fall outside the visible page,
      // where the adopting engine lives. Re-place it there always.
      const pagedInsert = pagedFolderInsertRef.current;
      const placedOrder =
        pagedInsert && isPageGridId(request.toGridId)
          ? pagedInsert(
              newOrder.filter((id) => id !== request.itemId),
              request.itemId,
            )
          : newOrder;

      setFoldersRef.current(updatedFolders);
      currentDragGrid.setOrder(placedOrder);
      saveOrderRef.current(placedOrder, updatedFolders);
      setOpenFolderIdRef.current(null);
    };
  }, [coordinator, openFolderIdRef, foldersRef, dragGridRef, saveOrderRef, setFoldersRef, setOpenFolderIdRef, pagedFolderInsertRef]);
  /* eslint-enable react-hooks/immutability */

  // Register main grid with coordinator once its engine exists (it does by
  // the time this runs: useDragGrid's effect is registered first). Read via
  // the ref so this effect doesn't re-run on every render — unregistering
  // the active grid mid-drag would clear the coordinator's active state.
  // (A layout change can't happen mid-drag: the options menu needs a click.)
  useEffect(() => {
    if (!registerMainGrid) return;

    const engine = dragGridRef.current.getEngine();
    const container = dragGridRef.current.containerRef.current;
    if (!engine || !container) {
      // This effect only retries on layout changes: if the engine isn't
      // ready here (e.g., its creation effect gained deps), handoff is dead.
      console.warn("useDragHandoff: main grid engine not ready, handoff disabled");
      return;
    }

    coordinator.register({ id: "main-grid", engine, container });
    return () => {
      coordinator.unregister("main-grid");
    };
  }, [coordinator, dragGridRef, registerMainGrid]);

  return { coordinator };
}
