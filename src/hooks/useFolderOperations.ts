import { useState } from "react";
import type { AppInfo, FolderMetadata } from "@/types/app";
import { dissolveFolder, removeAppFromFolder, updateFolderById } from "@/utils/folderUtils";
import { removeFromPages, replaceInPages } from "@/utils/pageUtils";
import { categoryDisplayName } from "@/utils/appUtils";
import type { GridFolder } from "@/components/items/FolderItem";

interface UseFolderOperationsOptions {
  folders: FolderMetadata[];
  setFolders: (folders: FolderMetadata[]) => void;
  createNewFolder: (appPaths: string[], name?: string) => FolderMetadata;
  appsMap: Map<string, AppInfo>;
  /** Current page structure of the main grid (see pageUtils) */
  pages: string[][];
  /** Make a page structure current (persisted by useGrid) */
  setPages: (pages: string[][]) => void;
}

export function useFolderOperations({
  folders,
  setFolders,
  createNewFolder,
  appsMap,
  pages,
  setPages,
}: UseFolderOperationsOptions) {
  // Only the id is state — name/apps of the open folder are derived live in
  // useGrid from folders + appsMap, so there is a single source of truth
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  // Id of a folder created this session whose modal should open in rename
  // mode (Launchpad-style: new folder name is immediately editable)
  const [newFolderId, setNewFolderId] = useState<string | null>(null);

  function handleOpenFolder(folder: GridFolder) {
    setNewFolderId(null);
    setOpenFolderId(folder.id);
  }

  function handleCloseFolder() {
    setNewFolderId(null);
    setOpenFolderId(null);
  }

  function handleRenameFolder(folderId: string, newName: string) {
    const updatedFolders = updateFolderById(folders, folderId, { name: newName });
    setFolders(updatedFolders);
  }

  function handleFolderOrderChange(folderId: string, newOrder: string[]) {
    const updatedFolders = updateFolderById(folders, folderId, { appPaths: newOrder });
    setFolders(updatedFolders);
  }

  function handleCreateFolder(sourceAppId: string, targetAppId: string) {
    // Suggest a name from the apps' App Store category, like Launchpad:
    // prefer the target's category, fall back to the source's
    const suggestedName =
      categoryDisplayName(appsMap.get(targetAppId)?.category) ??
      categoryDisplayName(appsMap.get(sourceAppId)?.category) ??
      undefined;

    const newFolder = createNewFolder([targetAppId, sourceAppId], suggestedName);

    // Open modal in rename mode
    setNewFolderId(newFolder.id);
    setOpenFolderId(newFolder.id);

    // The folder takes the target's slot; the source leaves its page
    const newPages = replaceInPages(removeFromPages(pages, sourceAppId), targetAppId, [
      newFolder.id,
    ]);
    setPages(newPages);
  }

  function handleAddToFolder(folderId: string, appId: string) {
    const existingFolder = folders.find((f) => f.id === folderId);
    if (!existingFolder) return;

    // Add app to folder
    const updatedAppPaths = [...existingFolder.appPaths, appId];
    const updatedFolders = updateFolderById(folders, folderId, { appPaths: updatedAppPaths });

    // Open folder modal
    setOpenFolderId(folderId);

    setFolders(updatedFolders);
    // The app leaves its page
    setPages(removeFromPages(pages, appId));
  }

  function handleRemoveFromFolder(appId: string) {
    if (!openFolderId) return;
    if (!folders.some((f) => f.id === openFolderId)) return;

    const { newPages, updatedFolders, dissolved } = removeAppFromFolder(
      openFolderId, appId, pages, folders,
    );

    setFolders(updatedFolders);
    setPages(newPages);

    if (dissolved) {
      setOpenFolderId(null);
    }
  }

  /** Dissolve a folder back into the grid: its apps take its slot on its
   *  page (context-menu Ungroup) */
  function handleUngroupFolder(folderId: string) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    const { newPages, updatedFolders } = dissolveFolder(
      folderId, pages, folders, folder.appPaths,
    );
    setFolders(updatedFolders);
    setPages(newPages);
  }

  function getOpenFolderSavedOrder(): string[] | undefined {
    if (!openFolderId) return undefined;
    return folders.find((f) => f.id === openFolderId)?.appPaths;
  }

  return {
    openFolderId,
    setOpenFolderId,
    newFolderId,
    handleOpenFolder,
    handleCloseFolder,
    handleRenameFolder,
    handleFolderOrderChange,
    handleRemoveFromFolder,
    handleCreateFolder,
    handleAddToFolder,
    handleUngroupFolder,
    getOpenFolderSavedOrder,
  };
}
