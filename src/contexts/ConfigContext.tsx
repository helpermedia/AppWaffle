import { createContext, use, useEffect, useRef, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, DndSettings, OrderConfig, VirtualFolderMetadata } from "@/types/app";
import { DEFAULT_DND_SETTINGS } from "@/constants/dnd";

// Start loading config immediately at module load (parallel with app loading)
const configPromise: Promise<AppConfig | null> = invoke<AppConfig>("load_config")
  .then((config) => (config.order.main.length === 0 ? null : config))
  .catch((e) => {
    console.error("Failed to load config:", e);
    return null;
  });

interface ConfigContextValue {
  // DnD settings
  dnd: DndSettings;

  // Order config (for reading initial state)
  orderConfig: OrderConfig | null;

  // Persistence
  saveOrder: (
    main: string[],
    folders: Record<string, string[]>,
    virtualFolders: VirtualFolderMetadata[]
  ) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

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

export function useConfig(): ConfigContextValue {
  const context = use(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider");
  }
  return context;
}

export function useDndSettings(): DndSettings {
  return useConfig().dnd;
}
