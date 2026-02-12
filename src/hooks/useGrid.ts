import { useState, useRef, useEffect } from "react";
import { useApps } from "@/hooks/useApps";
import { useDragGrid } from "@/hooks/useDragGrid";
import { useFolders } from "@/hooks/useFolders";
import { useFolderCreation } from "@/hooks/useFolderCreation";
import { useConfig, useDndSettings } from "@/hooks/useConfig";
import { isFolderId, resolveFolderApps, resolveOrderToAppItems, convertPhysicalFolders, dissolveFolder, updateFolderById } from "@/utils/folderUtils";
import { DragCoordinator } from "@/lib/helper-dnd";
import type { HandoffRequest } from "@/lib/helper-dnd";
import type { GridItem } from "@/components/items/AppItem";
import type { GridFolder } from "@/components/items/FolderItem";
import type { DragMoveInfo, DragEndInfo, DropAnimationInfo } from "@/hooks/useDragGrid";

export type GridItemUnion =
  | { type: "app"; data: GridItem }
  | { type: "folder"; data: GridFolder };

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

  const [openFolder, setOpenFolder] = useState<GridFolder | null>(null);

  // Coordinator for drag handoff between folder and main grid
  const [coordinator] = useState(() => new DragCoordinator({}));

  // Ref to hold the current handoff handler (set in effect to avoid render-time ref access)
  const handoffHandlerRef = useRef<((request: HandoffRequest) => Promise<void> | void) | null>(null);

  // Wire up the coordinator's onHandoff to call through the ref (once on mount)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Coordinator is mutable by design
    coordinator.onHandoff = (request) => handoffHandlerRef.current?.(request);
  }, [coordinator]);

  // Create apps map for resolving folder apps
  // Include both top-level apps AND apps from physical folders (for initial conversion)
  const appsMap = new Map([
    ...apps.map((app) => [app.path, app] as const),
    ...physicalFolders.flatMap((folder) => folder.apps.map((app) => [app.path, app] as const)),
  ]);

  // Build items array from order (needs to be defined before useFolderCreation)
  function buildItems(order: string[] | null): GridItemUnion[] {
    if (!order) return [];
    const foldersMap = new Map(folders.map((f) => [f.id, f]));
    const resolvedApps = new Map(
      resolveOrderToAppItems(order, appsMap).map((item) => [item.id, item])
    );

    return order
      .map((id): GridItemUnion | null => {
        const appItem = resolvedApps.get(id);
        if (appItem) return { type: "app", data: appItem };

        if (isFolderId(id)) {
          const folder = foldersMap.get(id);
          if (folder) {
            return {
              type: "folder",
              data: { id, name: folder.name, apps: resolveFolderApps(folder.appPaths, appsMap) },
            };
          }
        }

        return null;
      })
      .filter((item): item is GridItemUnion => item !== null);
  }

  // Get item type for folder creation hook
  function getItemType(id: string): "app" | "folder" | null {
    if (appsMap.has(id)) return "app";
    if (isFolderId(id)) return "folder";
    return null;
  }

  // Handle folder creation (app dropped on app)
  function handleCreateFolder(sourceAppId: string, targetAppId: string) {
    const currentOrder = dragGrid.order;
    if (!currentOrder) return;

    const newFolder = createNewFolder([targetAppId, sourceAppId]);
    const resolvedApps = resolveFolderApps(newFolder.appPaths, appsMap);

    // Open modal first
    setOpenFolder({ id: newFolder.id, name: newFolder.name, apps: resolvedApps });

    // Update order - folder goes where target was
    const sourceIndex = currentOrder.indexOf(sourceAppId);
    const targetIndex = currentOrder.indexOf(targetAppId);
    const newOrder = currentOrder.filter((id) => id !== sourceAppId && id !== targetAppId);

    // Adjust insert index: if source was before target, target's position shifts down by 1
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) {
      insertIndex--;
    }
    insertIndex = Math.min(insertIndex, newOrder.length);
    newOrder.splice(insertIndex, 0, newFolder.id);

    const updatedFolders = [...folders, newFolder];
    dragGrid.setOrder(newOrder);
    saveOrder(newOrder, updatedFolders);
  }

  // Handle adding app to folder
  function handleAddToFolder(folderId: string, appId: string) {
    const currentOrder = dragGrid.order;
    if (!currentOrder) return;

    const existingFolder = folders.find((f) => f.id === folderId);
    if (!existingFolder) return;

    // Remove app from main grid
    const newOrder = currentOrder.filter((id) => id !== appId);

    // Add app to folder
    const updatedAppPaths = [...existingFolder.appPaths, appId];
    const updatedFolders = updateFolderById(folders, folderId, { appPaths: updatedAppPaths });

    // Open folder modal
    const resolvedApps = resolveFolderApps(updatedAppPaths, appsMap);
    setOpenFolder({ id: folderId, name: existingFolder.name, apps: resolvedApps });

    setFolders(updatedFolders);
    dragGrid.setOrder(newOrder);
    saveOrder(newOrder, updatedFolders);
  }

  // Folder creation hook for DnD detection
  const {
    dropTarget,
    handleDragMove: handleFolderDragMove,
    handleDragEnd: handleFolderDragEnd,
  } = useFolderCreation({
    getItemType,
    onCreateFolder: handleCreateFolder,
    onAddToFolder: handleAddToFolder,
  });

  // Save when order changes from reordering
  function handleMainOrderChange(newOrder: string[]) {
    saveOrder(newOrder, folders);
  }

  // Combined drag move handler
  function handleDragMove(info: DragMoveInfo) {
    handleFolderDragMove(info);
  }

  // Combined drag end handler
  function handleDragEnd(info: DragEndInfo, reorder: () => void, complete: () => void) {
    handleFolderDragEnd(info, reorder, complete);
  }

  // Get DnD settings for animation control
  const { overlapThreshold } = useDndSettings();

  // Determine drop animation target - skip animation for folder actions
  function handleGetDropAnimationTarget(info: DropAnimationInfo) {
    if (!info.overId || info.overlapRatio < overlapThreshold) {
      // No significant overlap, use default reorder animation
      return undefined;
    }

    // Check if this will be a folder action
    const activeType = getItemType(info.activeId);
    const overType = getItemType(info.overId);

    // App over app (potential folder creation) or app over folder (add to folder)
    // Skip animation - ghost will be destroyed immediately
    if (activeType === "app" && (overType === "app" || overType === "folder")) {
      return null;
    }

    // Default animation
    return undefined;
  }

  // Main drag grid hook
  const dragGrid = useDragGrid({
    initialOrder: null,
    onOrderChange: handleMainOrderChange,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    getDropAnimationTarget: handleGetDropAnimationTarget,
  });

  // Refs for handoff callback to access current state
  const openFolderRef = useRef(openFolder);
  const foldersRef = useRef(folders);
  const dragGridRef = useRef(dragGrid);
  const saveOrderRef = useRef(saveOrder);
  const setFoldersRef = useRef(setFolders);

  useEffect(() => {
    openFolderRef.current = openFolder;
    foldersRef.current = folders;
    dragGridRef.current = dragGrid;
    saveOrderRef.current = saveOrder;
    setFoldersRef.current = setFolders;
  });

  // Set up the actual handoff handler in an effect (can't update refs during render)
  useEffect(() => {
    handoffHandlerRef.current = async (request: HandoffRequest) => {
    const currentOpenFolder = openFolderRef.current;
    const currentDragGrid = dragGridRef.current;
    const currentFolders = foldersRef.current;

    if (!currentOpenFolder || !currentDragGrid.order) return;

    const folder = currentFolders.find((f) => f.id === currentOpenFolder.id);
    if (!folder) return;

    // Remove app from folder
    const updatedAppPaths = folder.appPaths.filter((id) => id !== request.itemId);

    // Calculate insertion index based on pointer position (approximate)
    // We'll insert at the end for now; the user can drag to final position
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
    setOpenFolder(null);
    };
  }); // No deps - uses refs which always have current values

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

  // Initialize order once apps/folders load
  if (dragGrid.order === null && (apps.length > 0 || physicalFolders.length > 0)) {
    // Check if we have saved folders or need to convert physical folders
    const savedFolders = orderConfig?.folders ?? [];
    const effectiveFolders = savedFolders.length > 0
      ? savedFolders
      : convertPhysicalFolders(physicalFolders);

    // If we converted physical folders, save them
    if (savedFolders.length === 0 && effectiveFolders.length > 0) {
      setFolders(effectiveFolders);
    }

    const allIds = new Set([
      ...apps.map((a) => a.path),
      ...effectiveFolders.map((f) => f.id),
    ]);

    if (orderConfig?.main && orderConfig.main.length > 0) {
      // Use saved order, filter out removed items, append new items
      const validSavedOrder = orderConfig.main.filter((id) => allIds.has(id));
      const newItems = [...allIds].filter((id) => !orderConfig.main.includes(id));
      dragGrid.setOrder([...validSavedOrder, ...newItems]);
    } else {
      // First launch - use default order
      dragGrid.setOrder([
        ...apps.map((app) => app.path),
        ...effectiveFolders.map((f) => f.id),
      ]);
    }
  }

  // Build items from current order
  const items = buildItems(dragGrid.order);

  const activeItem = dragGrid.activeId
    ? items.find((i) => i.data.id === dragGrid.activeId) ?? null
    : null;

  // Get IDs for rendering
  const itemIds = items.map((item) => item.data.id);

  function handleOpenFolder(folder: GridFolder) {
    setOpenFolder(folder);
  }

  function handleFolderOrderChange(folderId: string, newOrder: string[]) {
    // Update folder's app order
    const updatedFolders = updateFolderById(folders, folderId, { appPaths: newOrder });
    setFolders(updatedFolders);
    if (dragGrid.order) {
      saveOrder(dragGrid.order, updatedFolders);
    }
  }

  function handleCloseFolder() {
    setOpenFolder(null);
  }

  function handleRenameFolder(folderId: string, newName: string) {
    // Compute updated folders from current folders (which may come from orderConfig)
    const updatedFolders = updateFolderById(folders, folderId, { name: newName });

    // Update local state
    setFolders(updatedFolders);

    // Update openFolder if it's the one being renamed
    if (openFolder?.id === folderId) {
      setOpenFolder({ ...openFolder, name: newName });
    }

    // Persist the change
    if (dragGrid.order) {
      saveOrder(dragGrid.order, updatedFolders);
    }
  }

  // Get saved order for open folder
  function getOpenFolderSavedOrder(): string[] | undefined {
    if (!openFolder) return undefined;
    const folder = folders.find((f) => f.id === openFolder.id);
    return folder?.appPaths;
  }

  // Handle removing app from folder (dragged outside)
  function handleRemoveFromFolder(appId: string) {
    if (!openFolder || !dragGrid.order) return;

    const folder = folders.find((f) => f.id === openFolder.id);
    if (!folder) return;

    // Remove app from folder
    const updatedAppPaths = folder.appPaths.filter((id) => id !== appId);

    // If folder would be empty or have only 1 app, dissolve it
    if (updatedAppPaths.length <= 1) {
      const { newOrder, updatedFolders } = dissolveFolder(
        openFolder.id,
        dragGrid.order,
        folders,
        [...updatedAppPaths, appId]
      );

      setFolders(updatedFolders);
      dragGrid.setOrder(newOrder);
      saveOrder(newOrder, updatedFolders);
      setOpenFolder(null);
    } else {
      // Folder still has apps, just remove this one
      const updatedFolders = updateFolderById(folders, openFolder.id, { appPaths: updatedAppPaths });

      // Add app back to main grid (at end)
      const newOrder = [...dragGrid.order, appId];

      // Update open folder view
      const resolvedApps = resolveFolderApps(updatedAppPaths, appsMap);
      setOpenFolder({ ...openFolder, apps: resolvedApps });

      setFolders(updatedFolders);
      dragGrid.setOrder(newOrder);
      saveOrder(newOrder, updatedFolders);
    }
  }

  return {
    // Data
    items,
    itemIds,
    activeItem,
    openFolder,

    // DnD - new system
    containerRef: dragGrid.containerRef,
    isDragging: dragGrid.isDragging,
    activeId: dragGrid.activeId,
    dropTarget,

    // Coordinator for folder handoff
    coordinator,

    // Folder handlers
    handleOpenFolder,
    handleCloseFolder,
    handleRenameFolder,
    handleFolderOrderChange,
    handleRemoveFromFolder,
    getOpenFolderSavedOrder,
  };
}
