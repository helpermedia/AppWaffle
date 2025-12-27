import { createContext } from "react";
import type { DndSettings, FolderMetadata, OrderConfig } from "@/types/app";

export interface ConfigContextValue {
  // DnD settings
  dnd: DndSettings;

  // Order config (for reading initial state)
  orderConfig: OrderConfig | null;

  // Persistence
  saveOrder: (main: string[], folders: FolderMetadata[]) => void;
}

export const ConfigContext = createContext<ConfigContextValue | null>(null);
