import { use, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, FolderMetadata, LayoutMode, OrderConfig } from "@/types/app";
import { ConfigContext, type ConfigContextValue } from "./config";

// Start loading config immediately at module load (parallel with app loading)
const configPromise: Promise<AppConfig | null> = invoke<AppConfig>("load_config").catch((e) => {
  console.error("Failed to load config:", e);
  return null;
});

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const config = use(configPromise);

  // No saved pages (or only empty ones) means "no saved arrangement yet",
  // not a saved empty grid — treat it as absent so the grid seeds
  // alphabetically
  const orderConfig: OrderConfig | null =
    config && config.order.pages.some((page) => page.length > 0) ? config.order : null;

  const [layout, setLayoutState] = useState<LayoutMode>(config?.settings.layout ?? "scroll");

  // Update order in Rust memory (no disk I/O); Rust saves to disk on
  // window close for safety. Rejected whenever the backend holds no config
  // (the file failed to load, see load_config): every change is then
  // discarded, so each one says so rather than vanishing silently.
  function saveOrder(pages: string[][], folders: FolderMetadata[]) {
    invoke("update_order", { pages, folders }).catch((e) =>
      console.error("Failed to save order:", e)
    );
  }

  // Settings persist immediately (unlike order): changes are rare and the
  // app quits on any focus loss. The backend also snapshots the value, so
  // a failed write here retries on the exit-time save.
  function setLayout(layout: LayoutMode) {
    setLayoutState(layout);
    invoke("set_layout", { layout }).catch((e) =>
      console.error("Failed to save settings:", e)
    );
  }

  const value: ConfigContextValue = {
    orderConfig,
    saveOrder,
    layout,
    setLayout,
  };

  return (
    <ConfigContext value={value}>
      {children}
    </ConfigContext>
  );
}
