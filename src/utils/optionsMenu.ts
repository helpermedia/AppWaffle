import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LayoutMode } from "@/types/app";

// Mirrors appContextMenu: the menu itself is native (show_options_menu,
// with the active layout check-marked) and the choice comes back as an
// "options-menu-action" event. Only one menu can be open at a time, so
// the select callback is swapped into module state before showing.
let onSelect: ((layout: LayoutMode) => void) | null = null;
let actionListener: Promise<unknown> | null = null;

/** Show the native view-options menu at the cursor position */
export async function showOptionsMenu(
  current: LayoutMode,
  select: (layout: LayoutMode) => void
) {
  onSelect = select;

  try {
    actionListener ??= listen<{ layout: LayoutMode }>("options-menu-action", (event) =>
      onSelect?.(event.payload.layout)
    );
    await actionListener;
  } catch (e) {
    actionListener = null; // retry the registration on the next attempt
    console.error("Failed to listen for options menu actions:", e);
    return;
  }

  try {
    // Resolves when the menu is dismissed
    await invoke("show_options_menu", { layout: current });
  } catch (e) {
    console.error("Failed to show options menu:", e);
  }
}
