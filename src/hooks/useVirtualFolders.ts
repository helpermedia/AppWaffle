import { useState } from "react";
import type { VirtualFolderMetadata } from "@/types/app";
import { createVirtualFolder, isVirtualFolderId } from "@/utils/folderUtils";

interface UseVirtualFoldersReturn {
  virtualFolders: VirtualFolderMetadata[];
  setVirtualFolders: React.Dispatch<React.SetStateAction<VirtualFolderMetadata[]>>;
  createFolder: (appPaths: string[], name?: string) => VirtualFolderMetadata;
  addToFolder: (folderId: string, appPath: string) => void;
  removeFromFolder: (folderId: string, appPath: string) => void;
  deleteFolder: (folderId: string) => void;
  renameFolder: (folderId: string, name: string) => void;
  getFolder: (folderId: string) => VirtualFolderMetadata | undefined;
}

export function useVirtualFolders(
  initialFolders: VirtualFolderMetadata[] = []
): UseVirtualFoldersReturn {
  const [virtualFolders, setVirtualFolders] = useState<VirtualFolderMetadata[]>(initialFolders);

  function createFolder(appPaths: string[], name?: string): VirtualFolderMetadata {
    const newFolder = createVirtualFolder(appPaths, name);
    setVirtualFolders((prev) => [...prev, newFolder]);
    return newFolder;
  }

  function addToFolder(folderId: string, appPath: string) {
    if (!isVirtualFolderId(folderId)) return;

    setVirtualFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId && !folder.appPaths.includes(appPath)
          ? { ...folder, appPaths: [...folder.appPaths, appPath] }
          : folder
      )
    );
  }

  function removeFromFolder(folderId: string, appPath: string) {
    if (!isVirtualFolderId(folderId)) return;

    setVirtualFolders((prev) => {
      const updated = prev.map((folder) =>
        folder.id === folderId
          ? { ...folder, appPaths: folder.appPaths.filter((p) => p !== appPath) }
          : folder
      );
      // Remove empty folders
      return updated.filter((folder) => folder.appPaths.length > 0);
    });
  }

  function deleteFolder(folderId: string) {
    if (!isVirtualFolderId(folderId)) return;
    setVirtualFolders((prev) => prev.filter((folder) => folder.id !== folderId));
  }

  function renameFolder(folderId: string, name: string) {
    if (!isVirtualFolderId(folderId)) return;

    setVirtualFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, name } : folder
      )
    );
  }

  function getFolder(folderId: string): VirtualFolderMetadata | undefined {
    return virtualFolders.find((folder) => folder.id === folderId);
  }

  return {
    virtualFolders,
    setVirtualFolders,
    createFolder,
    addToFolder,
    removeFromFolder,
    deleteFolder,
    renameFolder,
    getFolder,
  };
}
