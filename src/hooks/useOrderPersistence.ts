import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, OrderConfig } from "../types/app";

const DEBOUNCE_MS = 500;

// Start loading config immediately at module load (parallel with app loading)
let configPromise: Promise<OrderConfig | null> | null = null;

function loadConfigFromDisk(): Promise<OrderConfig | null> {
  if (!configPromise) {
    configPromise = invoke<AppConfig>("load_config")
      .then((config) => (config.order.main.length === 0 ? null : config.order))
      .catch((e) => {
        console.error("Failed to load order config:", e);
        return null;
      });
  }
  return configPromise;
}

// Start loading immediately when module is imported
loadConfigFromDisk();

interface UseOrderPersistenceReturn {
  config: OrderConfig | null;
  configLoaded: boolean;
  saveOrder: (main: string[], folders: Record<string, string[]>) => void;
}

export function useOrderPersistence(): UseOrderPersistenceReturn {
  const [config, setConfig] = useState<OrderConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadConfigFromDisk().then((result) => {
      setConfig(result);
      setConfigLoaded(true);
    });
  }, []);

  function saveOrder(main: string[], folders: Record<string, string[]>) {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await invoke("save_order", { main, folders });
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

  return { config, configLoaded, saveOrder };
}
