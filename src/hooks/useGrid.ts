import { useApps } from "@/hooks/useApps";
import { useDragGrid } from "@/hooks/useDragGrid";
import { useFolders } from "@/hooks/useFolders";
import { useFolderCreation } from "@/hooks/useFolderCreation";
import { useConfig, useDndSettings } from "@/hooks/useConfig";
import { useGridData } from "@/hooks/useGridData";
import { useFolderOperations } from "@/hooks/useFolderOperations";
import { resolveFolderApps } from "@/utils/folderUtils";
import { useDragHandoff } from "@/hooks/useDragHandoff";
import { useDockDrag } from "@/hooks/useDockDrag";
import type { DragMoveInfo, DragEndInfo, DropAnimationInfo } from "@/hooks/useDragGrid";

export type { GridItemUnion } from "@/hooks/useGridData";

export function useGrid() {
  const { apps, folders: physicalFolders } = useApps();
  const { orderConfig, saveOrder } = useConfig();

  // Folders management — seeded from config by useGridData's init pass,
  // then local state is the single source of truth. (A derived fallback to
  // orderConfig here previously caused data loss: creating the first folder
  // of a session flipped the list to just that folder.)
  const { folders, setFolders, createNewFolder } = useFolders([]);

  // Get DnD settings for animation control
  const { overlapThreshold } = useDndSettings();

  // Main drag grid hook (declared before sub-hooks that need it)
  const dragGrid = useDragGrid({
    initialOrder: null,
    onOrderChange(newOrder: string[]) {
      saveOrder(newOrder, folders);
    },
    onDragStart() {
      // A silent teardown path (no end/cancel event) must not leave the
      // previous gesture's handoff state pinned to this item
      dockDrag.reset();
    },
    onDragMove(info: DragMoveInfo) {
      // Dock handoff first: once the pointer is in the Dock zone the
      // gesture goes native and folder-creation logic must stand down.
      // Standing down includes disarming it: a drop-target ring armed just
      // before entering the zone must not survive into a release here —
      // a stale match would create a folder on an aborted Dock drag.
      if (dockDrag.handleDragMove(info)) {
        handleFolderDragCancel();
        return;
      }
      handleFolderDragMove(info);
    },
    onDragEnd(info: DragEndInfo, reorder: () => void, complete: () => void) {
      dockDrag.reset();
      handleFolderDragEnd(info, reorder, complete);
    },
    onDragCancel() {
      dockDrag.reset();
      handleFolderDragCancel();
    },
    getDropAnimationTarget(info: DropAnimationInfo) {
      if (!info.overId || info.overlapRatio < overlapThreshold) {
        return undefined;
      }
      const activeType = gridData.getItemType(info.activeId);
      const overType = gridData.getItemType(info.overId);
      if (activeType === "app" && (overType === "app" || overType === "folder")) {
        return null;
      }
      return undefined;
    },
  });

  // Item building & order initialization
  const gridData = useGridData({
    apps,
    physicalFolders,
    folders,
    orderConfig,
    order: dragGrid.order,
    setOrder: dragGrid.setOrder,
    setFolders,
    activeId: dragGrid.activeId,
  });

  // Launchpad-style drag-to-Dock pinning
  const dockDrag = useDockDrag({
    getEngine: dragGrid.getEngine,
    isPinnable: (id) => gridData.getItemType(id) === "app",
  });

  // Folder CRUD & open/close state
  const folderOps = useFolderOperations({
    folders,
    setFolders,
    createNewFolder,
    appsMap: gridData.appsMap,
    order: dragGrid.order,
    setOrder: dragGrid.setOrder,
    saveOrder,
  });

  // Folder creation DnD detection
  const {
    dropTarget,
    handleDragMove: handleFolderDragMove,
    handleDragEnd: handleFolderDragEnd,
    handleDragCancel: handleFolderDragCancel,
  } = useFolderCreation({
    getItemType: gridData.getItemType,
    onCreateFolder: folderOps.handleCreateFolder,
    onAddToFolder: folderOps.handleAddToFolder,
  });

  // The open folder is fully derived: openFolderId + folders + appsMap are
  // the sources of truth, so icon loads, renames and content changes are
  // always live. When the folder is dissolved this becomes null in the
  // same commit and the modal unmounts.
  const openFolderMeta = folderOps.openFolderId
    ? folders.find((f) => f.id === folderOps.openFolderId)
    : undefined;
  const openFolder = openFolderMeta
    ? {
        id: openFolderMeta.id,
        name: openFolderMeta.name,
        apps: resolveFolderApps(openFolderMeta.appPaths, gridData.appsMap),
      }
    : null;

  // Coordinator for drag handoff between folder and main grid
  const { coordinator } = useDragHandoff({
    openFolderId: folderOps.openFolderId,
    setOpenFolderId: folderOps.setOpenFolderId,
    folders,
    setFolders,
    dragGrid,
    saveOrder,
  });

  return {
    // Data
    items: gridData.items,
    itemIds: gridData.itemIds,
    activeItem: gridData.activeItem,
    openFolder,
    newFolderId: folderOps.newFolderId,

    // DnD
    containerRef: dragGrid.containerRef,
    isDragging: dragGrid.isDragging,
    activeId: dragGrid.activeId,
    cancelDrag: dragGrid.cancelDrag,
    dropTarget,

    // Coordinator for folder handoff
    coordinator,

    // Folder handlers
    handleOpenFolder: folderOps.handleOpenFolder,
    handleCloseFolder: folderOps.handleCloseFolder,
    handleRenameFolder: folderOps.handleRenameFolder,
    handleFolderOrderChange: folderOps.handleFolderOrderChange,
    handleRemoveFromFolder: folderOps.handleRemoveFromFolder,
    getOpenFolderSavedOrder: folderOps.getOpenFolderSavedOrder,
  };
}
