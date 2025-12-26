import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, OrderConfig } from "../types/app";

const DEBOUNCE_MS = 500;

interface UseOrderPersistenceReturn {
  loadOrder: () => Promise<OrderConfig | null>;
  saveOrder: (main: string[], folders: Record<string, string[]>) => void;
}

export function useOrderPersistence(): UseOrderPersistenceReturn {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadOrder(): Promise<OrderConfig | null> {
    try {
      const config = await invoke<AppConfig>("load_config");
      if (config.order.main.length === 0) {
        return null;
      }
      return config.order;
    } catch (e) {
      console.error("Failed to load order config:", e);
      return null;
    }
  }

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

  return { loadOrder, saveOrder };
}
