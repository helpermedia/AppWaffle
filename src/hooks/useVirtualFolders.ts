import { useState } from "react";
import type { VirtualFolderMetadata } from "@/types/app";
import { createVirtualFolder, isVirtualFolderId } from "@/utils/folderUtils";

interface UseVirtualFoldersReturn {
  virtualFolders: VirtualFolderMetadata[];
  setVirtualFolders: React.Dispatch<React.SetStateAction<VirtualFolderMetadata[]>>;
  createFolder: (appPaths: string[], name?: string) => VirtualFolderMetadata;
  renameFolder: (folderId: string, name: string) => void;
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

  function renameFolder(folderId: string, name: string) {
    if (!isVirtualFolderId(folderId)) return;

    setVirtualFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, name } : folder
      )
    );
  }

  return {
    virtualFolders,
    setVirtualFolders,
    createFolder,
    renameFolder,
  };
}
