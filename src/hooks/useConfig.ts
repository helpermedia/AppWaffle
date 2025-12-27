import { use } from "react";
import { ConfigContext, type ConfigContextValue } from "@/contexts/config";
import type { DndSettings } from "@/types/app";

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
