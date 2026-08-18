import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppInfo } from "@/types/app";

export interface AppContextMenuCallbacks {
  /** Launch the app through the normal click flow (pulse + fade + quit) */
  onOpen: () => void;
  /** Fade out and quit the launcher — for actions that hand off to Finder */
  onCloseApp: () => void;
}

type MenuAction = "open" | "show-in-finder" | "get-info" | "quick-look";

const ACTION_COMMANDS = {
  "show-in-finder": "reveal_app",
  "get-info": "show_get_info",
  "quick-look": "quick_look",
} as const;

// The menu itself is native (an NSMenu with SF Symbol icons, built by the
// show_app_menu command); selections come back as "app-menu-action" events.
// Only one context menu can be open at a time, so the target app is swapped
// into module state before showing — and kept after dismissal, since the
// action event can arrive after the popup call resolves.
let current: { app: AppInfo; callbacks: AppContextMenuCallbacks } | null = null;
let actionListener: Promise<unknown> | null = null;

function handleAction(action: MenuAction, path: string) {
  if (action === "open") {
    // The launch callback carries the tile's animation state, so it must
    // still belong to the app the menu was shown for
    if (current && current.app.path === path) {
      current.callbacks.onOpen();
    }
    return;
  }
  const command = ACTION_COMMANDS[action];
  invoke(command, { path }).catch((e) => console.error(`${command} failed:`, e));
  // Quick Look floats its panel above the launcher and returns focus on
  // close (backend keeps the launcher alive); the other actions hand off
  // to Finder, so the launcher closes
  if (action !== "quick-look") {
    current?.callbacks.onCloseApp();
  }
}

/** Show the native right-click menu for an app tile at the cursor position */
export async function showAppContextMenu(app: AppInfo, callbacks: AppContextMenuCallbacks) {
  current = { app, callbacks };

  try {
    actionListener ??= listen<{ action: MenuAction; path: string }>(
      "app-menu-action",
      (event) => handleAction(event.payload.action, event.payload.path)
    );
    await actionListener;
  } catch (e) {
    actionListener = null; // retry the registration on the next attempt
    console.error("Failed to listen for menu actions:", e);
    return;
  }

  try {
    // Resolves when the menu is dismissed
    await invoke("show_app_menu", { path: app.path });
  } catch (e) {
    console.error("Failed to show context menu:", e);
  }
}
