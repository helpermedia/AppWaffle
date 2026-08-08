import { use } from "react";
import { ConfigContext, type ConfigContextValue } from "@/contexts/config";
import { DEFAULT_DND_SETTINGS } from "@/constants/dnd";
import type { DndSettings } from "@/types/app";

export function useConfig(): ConfigContextValue {
  const context = use(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within ConfigProvider");
  }
  return context;
}

export function useDndSettings(): DndSettings {
  return DEFAULT_DND_SETTINGS;
}
