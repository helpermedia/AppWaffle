import { useApps } from "@/hooks/useApps";
import { useDragGrid } from "@/hooks/useDragGrid";
import { useFolders } from "@/hooks/useFolders";
import { useFolderCreation } from "@/hooks/useFolderCreation";
import { useConfig, useDndSettings } from "@/hooks/useConfig";
import { useGridData } from "@/hooks/useGridData";
import { useFolderOperations } from "@/hooks/useFolderOperations";
import { resolveFolderApps } from "@/utils/folderUtils";
import { useDragHandoff } from "@/hooks/useDragHandoff";
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

  // Live view of the open folder: openFolder state is a point-in-time
  // snapshot, so late-loading icons and content changes would never show.
  // Re-resolve from folders + appsMap each render; fall back to the
  // snapshot briefly while a folder is dissolving.
  const openFolderSnapshot = folderOps.openFolder;
  const openFolderMeta = openFolderSnapshot
    ? folders.find((f) => f.id === openFolderSnapshot.id)
    : undefined;
  const openFolder = openFolderMeta
    ? {
        id: openFolderMeta.id,
        name: openFolderMeta.name,
        apps: resolveFolderApps(openFolderMeta.appPaths, gridData.appsMap),
      }
    : openFolderSnapshot;

  // Coordinator for drag handoff between folder and main grid
  const { coordinator } = useDragHandoff({
    openFolder,
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
    openFolder,

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
