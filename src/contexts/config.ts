import { createContext } from "react";
import type { FolderMetadata, LayoutMode, OrderConfig } from "@/types/app";

export interface ConfigContextValue {
  // Order config (for reading initial state)
  orderConfig: OrderConfig | null;

  // Persistence
  saveOrder: (main: string[], folders: FolderMetadata[]) => void;

  // View settings
  layout: LayoutMode;
  setLayout: (layout: LayoutMode) => void;
}

export const ConfigContext = createContext<ConfigContextValue | null>(null);
