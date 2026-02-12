import { useState } from "react";
import type { AppInfo, FolderMetadata } from "@/types/app";
import { resolveFolderApps, removeAppFromFolder, updateFolderById } from "@/utils/folderUtils";
import type { GridFolder } from "@/components/items/FolderItem";

interface UseFolderOperationsOptions {
  folders: FolderMetadata[];
  setFolders: (folders: FolderMetadata[]) => void;
  createNewFolder: (appPaths: string[], name?: string) => FolderMetadata;
  appsMap: Map<string, AppInfo>;
  order: string[] | null;
  setOrder: (order: string[]) => void;
  saveOrder: (order: string[], folders: FolderMetadata[]) => void;
}

export function useFolderOperations({
  folders,
  setFolders,
  createNewFolder,
  appsMap,
  order,
  setOrder,
  saveOrder,
}: UseFolderOperationsOptions) {
  const [openFolder, setOpenFolder] = useState<GridFolder | null>(null);

  function handleOpenFolder(folder: GridFolder) {
    setOpenFolder(folder);
  }

  function handleCloseFolder() {
    setOpenFolder(null);
  }

  function handleRenameFolder(folderId: string, newName: string) {
    const updatedFolders = updateFolderById(folders, folderId, { name: newName });
    setFolders(updatedFolders);

    // Update openFolder if it's the one being renamed
    if (openFolder?.id === folderId) {
      setOpenFolder({ ...openFolder, name: newName });
    }

    if (order) {
      saveOrder(order, updatedFolders);
    }
  }

  function handleFolderOrderChange(folderId: string, newOrder: string[]) {
    const updatedFolders = updateFolderById(folders, folderId, { appPaths: newOrder });
    setFolders(updatedFolders);
    if (order) {
      saveOrder(order, updatedFolders);
    }
  }

  function handleCreateFolder(sourceAppId: string, targetAppId: string) {
    if (!order) return;

    const newFolder = createNewFolder([targetAppId, sourceAppId]);
    const resolvedApps = resolveFolderApps(newFolder.appPaths, appsMap);

    // Open modal first
    setOpenFolder({ id: newFolder.id, name: newFolder.name, apps: resolvedApps });

    // Update order - folder goes where target was
    const sourceIndex = order.indexOf(sourceAppId);
    const targetIndex = order.indexOf(targetAppId);
    const newOrder = order.filter((id) => id !== sourceAppId && id !== targetAppId);

    // Adjust insert index: if source was before target, target's position shifts down by 1
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) {
      insertIndex--;
    }
    insertIndex = Math.min(insertIndex, newOrder.length);
    newOrder.splice(insertIndex, 0, newFolder.id);

    const updatedFolders = [...folders, newFolder];
    setOrder(newOrder);
    saveOrder(newOrder, updatedFolders);
  }

  function handleAddToFolder(folderId: string, appId: string) {
    if (!order) return;

    const existingFolder = folders.find((f) => f.id === folderId);
    if (!existingFolder) return;

    // Remove app from main grid
    const newOrder = order.filter((id) => id !== appId);

    // Add app to folder
    const updatedAppPaths = [...existingFolder.appPaths, appId];
    const updatedFolders = updateFolderById(folders, folderId, { appPaths: updatedAppPaths });

    // Open folder modal
    const resolvedApps = resolveFolderApps(updatedAppPaths, appsMap);
    setOpenFolder({ id: folderId, name: existingFolder.name, apps: resolvedApps });

    setFolders(updatedFolders);
    setOrder(newOrder);
    saveOrder(newOrder, updatedFolders);
  }

  function handleRemoveFromFolder(appId: string) {
    if (!openFolder || !order) return;
    if (!folders.some((f) => f.id === openFolder.id)) return;

    const { newOrder, updatedFolders, dissolved } = removeAppFromFolder(
      openFolder.id, appId, order, folders,
    );

    setFolders(updatedFolders);
    setOrder(newOrder);
    saveOrder(newOrder, updatedFolders);

    if (dissolved) {
      setOpenFolder(null);
    } else {
      const folder = updatedFolders.find((f) => f.id === openFolder.id);
      const resolvedApps = folder ? resolveFolderApps(folder.appPaths, appsMap) : [];
      setOpenFolder({ ...openFolder, apps: resolvedApps });
    }
  }

  function getOpenFolderSavedOrder(): string[] | undefined {
    if (!openFolder) return undefined;
    const folder = folders.find((f) => f.id === openFolder.id);
    return folder?.appPaths;
  }

  return {
    openFolder,
    setOpenFolder,
    handleOpenFolder,
    handleCloseFolder,
    handleRenameFolder,
    handleFolderOrderChange,
    handleRemoveFromFolder,
    handleCreateFolder,
    handleAddToFolder,
    getOpenFolderSavedOrder,
  };
}
