import { useApps } from "@/hooks/useApps";
import { useDragGrid } from "@/hooks/useDragGrid";
import { useFolders } from "@/hooks/useFolders";
import { useFolderCreation } from "@/hooks/useFolderCreation";
import { useConfig, useDndSettings } from "@/hooks/useConfig";
import { useGridData } from "@/hooks/useGridData";
import { useFolderOperations } from "@/hooks/useFolderOperations";
import { useDragHandoff } from "@/hooks/useDragHandoff";
import type { DragMoveInfo, DragEndInfo, DropAnimationInfo } from "@/hooks/useDragGrid";

export type { GridItemUnion } from "@/hooks/useGridData";

export function useGrid() {
  const { apps, folders: physicalFolders } = useApps();
  const { orderConfig, saveOrder } = useConfig();

  // Folders management - all folders are now unified
  const {
    folders: localFolders,
    setFolders,
    createNewFolder,
  } = useFolders([]);

  // Use orderConfig as source of truth until local changes happen
  const folders = localFolders.length > 0
    ? localFolders
    : (orderConfig?.folders ?? []);

  // Get DnD settings for animation control
  const { overlapThreshold } = useDndSettings();

  // Main drag grid hook (declared before sub-hooks that need it)
  const dragGrid = useDragGrid({
    initialOrder: null,
    onOrderChange(newOrder: string[]) {
      saveOrder(newOrder, folders);
    },
    onDragMove(info: DragMoveInfo) {
      handleFolderDragMove(info);
    },
    onDragEnd(info: DragEndInfo, reorder: () => void, complete: () => void) {
      handleFolderDragEnd(info, reorder, complete);
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
  } = useFolderCreation({
    getItemType: gridData.getItemType,
    onCreateFolder: folderOps.handleCreateFolder,
    onAddToFolder: folderOps.handleAddToFolder,
  });

  // Coordinator for drag handoff between folder and main grid
  const { coordinator } = useDragHandoff({
    openFolder: folderOps.openFolder,
    setOpenFolder: folderOps.setOpenFolder,
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
    openFolder: folderOps.openFolder,

    // DnD
    containerRef: dragGrid.containerRef,
    isDragging: dragGrid.isDragging,
    activeId: dragGrid.activeId,
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
