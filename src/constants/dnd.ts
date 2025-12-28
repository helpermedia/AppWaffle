import type { DndSettings } from "@/types/app";

/**
 * Default drag-and-drop settings
 */
export const DEFAULT_DND_SETTINGS: DndSettings = {
  folderCreationDelay: 1200, // 1.2 seconds - longer dwell time to prevent accidental triggers
  sortingDelay: 150,
  overlapThreshold: 0.6, // 60% overlap required - more deliberate placement needed
};
