import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface FolderContextMenuCallbacks {
  /** Open the folder through the normal click flow */
  onOpen: () => void;
  /** Open the folder with its name in edit mode */
  onRename: () => void;
  /** Dissolve the folder back into individual grid tiles */
  onUngroup: () => void;
}

type MenuAction = "open" | "rename" | "ungroup";

// Mirrors appContextMenu: the menu itself is native (show_folder_menu) and
// selections come back as "folder-menu-action" events. Only one context
// menu can be open at a time, so the target folder is swapped into module
// state before showing — and kept after dismissal, since the action event
// can arrive after the popup call resolves.
let current: { folderId: string; callbacks: FolderContextMenuCallbacks } | null = null;
let actionListener: Promise<unknown> | null = null;

function handleAction(action: MenuAction, folderId: string) {
  // Every action runs through the tile's callbacks (grid state), so it
  // must still belong to the folder the menu was shown for
  if (!current || current.folderId !== folderId) return;
  const { callbacks } = current;
  if (action === "open") {
    callbacks.onOpen();
  } else if (action === "rename") {
    callbacks.onRename();
  } else {
    callbacks.onUngroup();
  }
}

/** Show the native right-click menu for a folder tile at the cursor position */
export async function showFolderContextMenu(
  folderId: string,
  callbacks: FolderContextMenuCallbacks
) {
  current = { folderId, callbacks };

  try {
    actionListener ??= listen<{ action: MenuAction; folderId: string }>(
      "folder-menu-action",
      (event) => handleAction(event.payload.action, event.payload.folderId)
    );
    await actionListener;
  } catch (e) {
    actionListener = null; // retry the registration on the next attempt
    console.error("Failed to listen for folder menu actions:", e);
    return;
  }

  try {
    // Resolves when the menu is dismissed
    await invoke("show_folder_menu", { folderId });
  } catch (e) {
    console.error("Failed to show folder context menu:", e);
  }
}
