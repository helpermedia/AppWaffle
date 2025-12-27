import { useState, useEffect, useRef } from "react";
import { exit } from "@tauri-apps/plugin-process";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useApps } from "@/hooks/useApps";
import { useSortableGrid } from "@/hooks/useSortableGrid";
import { useOrderPersistence } from "@/hooks/useOrderPersistence";
import { useVirtualFolders } from "@/hooks/useVirtualFolders";
import { useFolderCreation } from "@/hooks/useFolderCreation";
import { isVirtualFolderId, resolveVirtualFolderApps } from "@/utils/folderUtils";
import { AppItem, type GridItem } from "@/components/items/AppItem";
import { AppItemOverlay } from "@/components/items/AppItemOverlay";
import { FolderItem, FolderItemOverlay, type GridFolder } from "@/components/items/FolderItem";
import { FolderModal } from "@/components/FolderModal";

// Union type for grid items
type GridItemUnion =
  | { type: "app"; data: GridItem }
  | { type: "folder"; data: GridFolder; isVirtual: boolean };

// Open folder state includes isVirtual flag for behavior differences
interface OpenFolderState {
  data: GridFolder;
  isVirtual: boolean;
}

export function AppWaffle() {
  const { apps, folders } = useApps();
  const { config, saveOrder } = useOrderPersistence();

  // Virtual folders management - initialize empty, will populate from config
  const {
    virtualFolders: localVirtualFolders,
    setVirtualFolders,
    createFolder: createVirtualFolder,
    addToFolder: addToVirtualFolder,
  } = useVirtualFolders([]);

  // Use config as source of truth until local changes happen
  const virtualFolders = localVirtualFolders.length > 0
    ? localVirtualFolders
    : (config?.virtualFolders ?? []);

  // Track local folder order changes (merged with config)
  const [localFolderOrders, setLocalFolderOrders] = useState<Record<string, string[]>>({});
  // Merge config folders with local changes
  const folderOrders = { ...config?.folders, ...localFolderOrders };

  // Save when order changes from reordering
  function handleMainOrderChange(newOrder: string[]) {
    saveOrder(newOrder, folderOrders, virtualFolders);
  }

  const { order, setOrder, activeId, sensors, handleDragStart, handleDragEnd } =
    useSortableGrid({
      initialOrder: null,
      enableKeyboard: true,
      onOrderChange: handleMainOrderChange,
    });

  const [openFolder, setOpenFolder] = useState<OpenFolderState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  // Create apps map for resolving virtual folder apps
  const appsMap = new Map(apps.map((app) => [app.path, app]));

  // Build items array from order
  const items: GridItemUnion[] = (() => {
    if (!order) return [];
    const foldersMap = new Map(folders.map((folder) => [folder.path, folder]));
    const virtualFoldersMap = new Map(virtualFolders.map((vf) => [vf.id, vf]));

    return order
      .map((id): GridItemUnion | null => {
        // Check if it's an app
        const app = appsMap.get(id);
        if (app) return { type: "app", data: { ...app, id } };

        // Check if it's a physical folder
        const folder = foldersMap.get(id);
        if (folder) {
          return {
            type: "folder",
            data: { id, name: folder.name, apps: folder.apps },
            isVirtual: false,
          };
        }

        // Check if it's a virtual folder
        if (isVirtualFolderId(id)) {
          const virtualFolder = virtualFoldersMap.get(id);
          if (virtualFolder) {
            const resolvedApps = resolveVirtualFolderApps(virtualFolder.appPaths, appsMap);
            return {
              type: "folder",
              data: { id, name: virtualFolder.name, apps: resolvedApps },
              isVirtual: true,
            };
          }
        }

        return null;
      })
      .filter((item): item is GridItemUnion => item !== null);
  })();

  // Get item type for folder creation hook
  function getItemType(id: string): "app" | "folder" | "virtual-folder" | null {
    const item = items.find((i) => i.data.id === id);
    if (!item) return null;
    if (item.type === "app") return "app";
    return item.isVirtual ? "virtual-folder" : "folder";
  }

  // Handle folder creation (app dropped on app)
  function handleCreateFolder(sourceAppId: string, targetAppId: string) {
    if (!order) return;

    const newFolder = createVirtualFolder([targetAppId, sourceAppId]);

    // Calculate new order once - remove both apps, insert folder at target's position
    const targetIndex = order.indexOf(targetAppId);
    const newOrder = order.filter((id) => id !== sourceAppId && id !== targetAppId);
    const insertIndex = Math.min(targetIndex, newOrder.length);
    newOrder.splice(insertIndex, 0, newFolder.id);

    // Calculate updated virtual folders
    const updatedVirtualFolders = [...virtualFolders, newFolder];

    // Update state and save (using calculated values, not stale state)
    setOrder(newOrder);
    saveOrder(newOrder, folderOrders, updatedVirtualFolders);

    // Open the new folder immediately
    const resolvedApps = resolveVirtualFolderApps(newFolder.appPaths, appsMap);
    setOpenFolder({
      data: { id: newFolder.id, name: newFolder.name, apps: resolvedApps },
      isVirtual: true,
    });
  }

  // Handle adding app to folder
  function handleAddToFolder(folderId: string, appId: string) {
    if (!order) return;

    if (isVirtualFolderId(folderId)) {
      // Calculate new order - remove app from main grid
      const newOrder = order.filter((id) => id !== appId);

      // Calculate updated virtual folders - add app to folder
      const updatedFolders = virtualFolders.map((vf) =>
        vf.id === folderId ? { ...vf, appPaths: [...vf.appPaths, appId] } : vf
      );

      // Update state and save
      addToVirtualFolder(folderId, appId);
      setOrder(newOrder);
      saveOrder(newOrder, folderOrders, updatedFolders);
    }
    // Note: Adding to physical folders is not supported (filesystem folders)
  }

  // Folder creation hook for DnD detection
  const { dropTarget, handleDragOver, handleDragEnd: handleFolderDragEnd } = useFolderCreation({
    getItemType,
    onCreateFolder: handleCreateFolder,
    onAddToFolder: handleAddToFolder,
  });

  // Initialize order once apps/folders load (config already loaded via use())
  if (order === null && (apps.length > 0 || folders.length > 0)) {
    const allPaths = new Set([
      ...apps.map((a) => a.path),
      ...folders.map((f) => f.path),
      ...virtualFolders.map((vf) => vf.id),
    ]);

    if (config?.main && config.main.length > 0) {
      // Use saved order, filter out removed items, append new items
      const validSavedOrder = config.main.filter((p) => allPaths.has(p));
      const newItems = [...allPaths].filter((p) => !config.main.includes(p));
      setOrder([...validSavedOrder, ...newItems]);
    } else {
      // First launch - use alphabetical order
      setOrder([
        ...apps.map((app) => app.path),
        ...folders.map((folder) => folder.path),
        ...virtualFolders.map((vf) => vf.id),
      ]);
    }
  }

  const activeItem = activeId ? items.find((i) => i.data.id === activeId) ?? null : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !openFolder) {
        exit(0);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFolder]);

  // Get IDs for SortableContext
  const itemIds = items.map((item) => item.data.id);

  function handleOpenFolder(folder: GridFolder, isVirtual: boolean) {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    setOpenFolder({ data: folder, isVirtual });
  }

  function handleFolderOrderChange(folderId: string, newOrder: string[]) {
    if (openFolder?.isVirtual) {
      // Update virtual folder app order
      const updatedVirtualFolders = virtualFolders.map((vf) =>
        vf.id === folderId ? { ...vf, appPaths: newOrder } : vf
      );
      setVirtualFolders(updatedVirtualFolders);
      if (order) {
        saveOrder(order, folderOrders, updatedVirtualFolders);
      }
    } else {
      // Physical folder order
      const newFolderOrders = { ...folderOrders, [folderId]: newOrder };
      setLocalFolderOrders(newFolderOrders);
      if (order) {
        saveOrder(order, newFolderOrders, virtualFolders);
      }
    }
  }

  const handleCloseFolder = () => {
    setOpenFolder(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = savedScrollTop.current;
      }
    });
  };

  // Combined drag end handler
  function onDragEnd(event: Parameters<typeof handleDragEnd>[0]) {
    handleFolderDragEnd(event, () => {
      handleDragEnd(event);
    });
  }

  // Get saved order for open folder
  function getOpenFolderSavedOrder(): string[] | undefined {
    if (!openFolder) return undefined;
    if (openFolder.isVirtual) {
      const vf = virtualFolders.find((f) => f.id === openFolder.data.id);
      return vf?.appPaths;
    }
    return folderOrders[openFolder.data.id];
  }

  return (
    <div ref={scrollRef} className="w-full h-full p-20 overflow-auto">
      {openFolder && (
        <FolderModal
          folder={openFolder.data}
          savedOrder={getOpenFolderSavedOrder()}
          onOrderChange={(newOrder) => handleFolderOrderChange(openFolder.data.id, newOrder)}
          onClose={handleCloseFolder}
        />
      )}

      <div className={openFolder ? "hidden" : undefined}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={itemIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-7 gap-4 place-items-center max-w-7xl mx-auto">
              {items.map((item) => {
                const isDropTarget = dropTarget?.id === item.data.id;
                const dropAction = isDropTarget ? dropTarget.action : undefined;

                if (item.type === "app") {
                  return (
                    <AppItem
                      key={item.data.id}
                      item={item.data}
                      isDragActive={activeItem !== null}
                      dropAction={dropAction}
                    />
                  );
                } else {
                  return (
                    <FolderItem
                      key={item.data.id}
                      item={item.data}
                      isDragActive={activeItem !== null}
                      dropAction={dropAction}
                      onOpen={(folder) => handleOpenFolder(folder, item.isVirtual)}
                    />
                  );
                }
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeItem?.type === "app" && <AppItemOverlay item={activeItem.data} />}
            {activeItem?.type === "folder" && <FolderItemOverlay item={activeItem.data} />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
