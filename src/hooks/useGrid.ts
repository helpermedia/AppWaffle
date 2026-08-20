import { useRef, useState } from "react";
import { useApps } from "@/hooks/useApps";
import { useDragGrid } from "@/hooks/useDragGrid";
import { useFolders } from "@/hooks/useFolders";
import { useFolderCreation } from "@/hooks/useFolderCreation";
import { useConfig, useDndSettings } from "@/hooks/useConfig";
import { useGridData } from "@/hooks/useGridData";
import { useFolderOperations } from "@/hooks/useFolderOperations";
import { resolveFolderApps } from "@/utils/folderUtils";
import { useDragHandoff, type PagedFolderInsert } from "@/hooks/useDragHandoff";
import { useDockDrag } from "@/hooks/useDockDrag";
import type { DragMoveInfo, DragEndInfo, DropAnimationInfo } from "@/hooks/useDragGrid";
import type { DragEngine, DropAnimationTarget } from "@/lib/helper-dnd";

export type { GridItemUnion } from "@/hooks/useGridData";

/** Drag behavior shared between the main grid and the paged layout's
 *  page engines (dock handoff, folder creation, drop animation) */
export interface PageDragHandlers {
  onDragStart: () => void;
  /** Returns true while the Dock session owns the gesture, so page-level
   *  behavior (the flip dwell) can stand down with folder creation */
  onDragMove: (info: DragMoveInfo) => boolean;
  onDragEnd: (info: DragEndInfo, reorder: () => void, complete: () => void) => void;
  onDragCancel: () => void;
  getDropAnimationTarget: (info: DropAnimationInfo) => DropAnimationTarget | null | undefined;
}

export function useGrid() {
  const { apps, folders: physicalFolders } = useApps();
  const { orderConfig, saveOrder, layout } = useConfig();

  // Folders management — seeded from config by useGridData's init pass,
  // then local state is the single source of truth. (A derived fallback to
  // orderConfig here previously caused data loss: creating the first folder
  // of a session flipped the list to just that folder.)
  const { folders, setFolders, createNewFolder } = useFolders([]);

  // Get DnD settings for animation control
  const { overlapThreshold } = useDndSettings();

  // While a page engine owns the gesture (paged layout), dock pinning must
  // read the ghost from that engine, not from the hidden main grid's
  const activePageEngineRef = useRef<(() => DragEngine | null) | null>(null);
  const [setActivePageEngine] = useState(
    () =>
      (getEngine: (() => DragEngine | null) | null) => {
        activePageEngineRef.current = getEngine;
      }
  );

  // Drag behavior shared by the main grid and the paged layout's page
  // engines. Everything here is id-based and reads its collaborators
  // lazily, so it works regardless of which engine owns the gesture.
  const sharedDragHandlers: PageDragHandlers = {
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
        return true;
      }
      handleFolderDragMove(info);
      return false;
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
  };

  // Main drag grid hook (declared before sub-hooks that need it)
  const dragGrid = useDragGrid({
    initialOrder: null,
    onOrderChange(newOrder: string[]) {
      saveOrder(newOrder, folders);
    },
    ...sharedDragHandlers,
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
    getEngine: () => activePageEngineRef.current?.() ?? dragGrid.getEngine(),
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

  /** Commit an externally-built main order (paged-layout reorders): the
   *  master order state lives in the main grid's hook even while the paged
   *  view renders it, so pages splice their slice back through here. */
  function handleMainOrderChange(newOrder: string[]) {
    dragGrid.setOrder(newOrder);
    saveOrder(newOrder, folders);
  }

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

  // While the paged layout is active, PagedGrid registers how a folder
  // drag-out lands in the visible page's window (scroll layout: null,
  // the default append-at-end applies)
  const pagedFolderInsertRef = useRef<PagedFolderInsert | null>(null);
  const [setPagedFolderInsert] = useState(
    () =>
      (insert: PagedFolderInsert | null) => {
        pagedFolderInsertRef.current = insert;
      }
  );

  // Coordinator for drag handoff out of the folder modal. The main grid
  // participates only in scroll layout; in paged layout the current page
  // registers instead (PagedGrid), so a drag-out always has exactly one
  // candidate target.
  const { coordinator } = useDragHandoff({
    openFolderId: folderOps.openFolderId,
    setOpenFolderId: folderOps.setOpenFolderId,
    folders,
    setFolders,
    dragGrid,
    saveOrder,
    registerMainGrid: layout !== "paged",
    pagedFolderInsertRef,
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

    // Paged layout integration: order commit, shared drag behavior, and
    // the bridges that route dock pinning and folder drag-out to pages
    handleMainOrderChange,
    pageDragHandlers: sharedDragHandlers,
    setActivePageEngine,
    setPagedFolderInsert,

    // Folder handlers
    handleOpenFolder: folderOps.handleOpenFolder,
    handleCloseFolder: folderOps.handleCloseFolder,
    handleRenameFolder: folderOps.handleRenameFolder,
    handleFolderOrderChange: folderOps.handleFolderOrderChange,
    handleRemoveFromFolder: folderOps.handleRemoveFromFolder,
    getOpenFolderSavedOrder: folderOps.getOpenFolderSavedOrder,
  };
}
