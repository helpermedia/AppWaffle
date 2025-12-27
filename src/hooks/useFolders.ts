import { useState } from "react";
import type { FolderMetadata } from "@/types/app";
import { createFolder } from "@/utils/folderUtils";

interface UseFoldersReturn {
  folders: FolderMetadata[];
  setFolders: React.Dispatch<React.SetStateAction<FolderMetadata[]>>;
  createNewFolder: (appPaths: string[], name?: string) => FolderMetadata;
  renameFolder: (folderId: string, name: string) => void;
}

export function useFolders(
  initialFolders: FolderMetadata[] = []
): UseFoldersReturn {
  const [folders, setFolders] = useState<FolderMetadata[]>(initialFolders);

  function createNewFolder(appPaths: string[], name?: string): FolderMetadata {
    const newFolder = createFolder(appPaths, name);
    setFolders((prev) => [...prev, newFolder]);
    return newFolder;
  }

  function renameFolder(folderId: string, name: string) {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, name } : folder
      )
    );
  }

  return {
    folders,
    setFolders,
    createNewFolder,
    renameFolder,
  };
}
