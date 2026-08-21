import { useState, useEffect } from "react";
import { isPageGridId } from "@/constants/grid";
import { DragCoordinator } from "@/lib/helper-dnd";
import type { HandoffRequest } from "@/lib/helper-dnd";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { FolderMetadata } from "@/types/app";
import { removeAppFromFolder } from "@/utils/folderUtils";
import { removeFromPages } from "@/utils/pageUtils";
import type { DragEngine } from "@/lib/helper-dnd";

interface DragGridHandle {
  getEngine: () => DragEngine | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/** Places a folder-dragged-out item on the visible page: receives the
 *  pages without the item and returns them with it inserted */
export type PagedFolderInsert = (pagesWithoutItem: string[][], itemId: string) => string[][];

interface UseDragHandoffOptions {
  openFolderId: string | null;
  setOpenFolderId: (id: string | null) => void;
  folders: FolderMetadata[];
  setFolders: (folders: FolderMetadata[]) => void;
  /** Current page structure of the main grid (see pageUtils) */
  pages: string[][];
  /** Make a page structure current (persisted by useGrid) */
  setPages: (pages: string[][]) => void;
  /** The main grid: the handoff target in scroll layout */
  dragGrid: DragGridHandle;
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
  pages,
  setPages,
  dragGrid,
  registerMainGrid,
  pagedFolderInsertRef,
}: UseDragHandoffOptions) {
  const [coordinator] = useState(() => new DragCoordinator({}));

  // Refs for handoff callback to access current state
  const openFolderIdRef = useLatestRef(openFolderId);
  const foldersRef = useLatestRef(folders);
  const pagesRef = useLatestRef(pages);
  const setPagesRef = useLatestRef(setPages);
  const dragGridRef = useLatestRef(dragGrid);
  const setFoldersRef = useLatestRef(setFolders);
  const setOpenFolderIdRef = useLatestRef(setOpenFolderId);

  // Wire up the coordinator's onHandoff (once on mount).
  // All values accessed via stable refs — no need to recreate on every render.
  /* eslint-disable react-hooks/immutability -- Coordinator is mutable by design */
  useEffect(() => {
    coordinator.onHandoff = async (request: HandoffRequest) => {
      const currentOpenFolderId = openFolderIdRef.current;
      const currentFolders = foldersRef.current;

      if (!currentOpenFolderId) return;

      if (!currentFolders.some((f) => f.id === currentOpenFolderId)) return;

      const { newPages, updatedFolders } = removeAppFromFolder(
        currentOpenFolderId,
        request.itemId,
        pagesRef.current,
        currentFolders,
      );

      // Paged layout: the default placement puts the app on the last page
      // or, when the folder dissolved, at the folder's old slot — either
      // can fall outside the visible page, where the adopting engine
      // lives. Re-place it there always.
      const pagedInsert = pagedFolderInsertRef.current;
      const placedPages =
        pagedInsert && isPageGridId(request.toGridId)
          ? pagedInsert(removeFromPages(newPages, request.itemId), request.itemId)
          : newPages;

      setFoldersRef.current(updatedFolders);
      setPagesRef.current(placedPages);
      setOpenFolderIdRef.current(null);
    };
  }, [coordinator, openFolderIdRef, foldersRef, pagesRef, setPagesRef, setFoldersRef, setOpenFolderIdRef, pagedFolderInsertRef]);
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
