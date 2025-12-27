import { use, useEffect, useRef, type ReactNode } from "react";
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

const DEBOUNCE_MS = 500;

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const config = use(configPromise);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge loaded settings with defaults
  const dnd: DndSettings = {
    ...DEFAULT_DND_SETTINGS,
    ...config?.dnd,
  };

  const orderConfig = config?.order ?? null;

  function saveOrder(
    main: string[],
    folders: Record<string, string[]>,
    virtualFolders: VirtualFolderMetadata[]
  ) {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await invoke("save_order", { main, folders, virtualFolders });
      } catch (e) {
        console.error("Failed to save order:", e);
      }
    }, DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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
