import { createContext } from "react";
import type { FolderMetadata, OrderConfig } from "@/types/app";

export interface ConfigContextValue {
  // Order config (for reading initial state)
  orderConfig: OrderConfig | null;

  // Persistence
  saveOrder: (main: string[], folders: FolderMetadata[]) => void;
}

export const ConfigContext = createContext<ConfigContextValue | null>(null);
