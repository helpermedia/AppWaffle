import { use, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, OrderConfig, VirtualFolderMetadata } from "../types/app";

const DEBOUNCE_MS = 500;

// Start loading config immediately at module load (parallel with app loading)
const configPromise: Promise<OrderConfig | null> = invoke<AppConfig>("load_config")
  .then((config) => (config.order.main.length === 0 ? null : config.order))
  .catch((e) => {
    console.error("Failed to load order config:", e);
    return null;
  });

interface UseOrderPersistenceReturn {
  config: OrderConfig | null;
  saveOrder: (
    main: string[],
    folders: Record<string, string[]>,
    virtualFolders: VirtualFolderMetadata[]
  ) => void;
}

export function useOrderPersistence(): UseOrderPersistenceReturn {
  // use() suspends until promise resolves - config is available immediately after
  const config = use(configPromise);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return { config, saveOrder };
}
