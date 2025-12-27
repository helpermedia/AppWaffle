import { use, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, DndSettings, VirtualFolderMetadata } from "@/types/app";
import { DEFAULT_DND_SETTINGS } from "@/constants/dnd";
import { ConfigContext, type ConfigContextValue } from "./config";

// Start loading config immediately at module load (parallel with app loading)
const configPromise: Promise<AppConfig | null> = invoke<AppConfig>("load_config")
  .then((config) => (config.order.main.length === 0 ? null : config))
  .catch((e) => {
    console.error("Failed to load config:", e);
    return null;
  });

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const config = use(configPromise);

  // Merge loaded settings with defaults
  const dnd: DndSettings = {
    ...DEFAULT_DND_SETTINGS,
    ...config?.dnd,
  };

  const orderConfig = config?.order ?? null;

  // Update order in Rust memory (no disk I/O)
  // Rust saves to disk on window close for safety
  function saveOrder(
    main: string[],
    folders: Record<string, string[]>,
    virtualFolders: VirtualFolderMetadata[]
  ) {
    invoke("update_order", { main, folders, virtualFolders });
  }

  const value: ConfigContextValue = {
    dnd,
    orderConfig,
    saveOrder,
  };

  return (
    <ConfigContext value={value}>
      {children}
    </ConfigContext>
  );
}
