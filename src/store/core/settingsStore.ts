import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DefaultModels, ModelMetadata } from "@/types";
import { normalizeProviderBaseUrl } from "@/lib/security/urlPolicy";
import { getDefaultModelSelectValue } from "@/lib/utils/defaultModels";
import {
  STORAGE_KEYS,
  STORAGE_VERSION,
  getAppDbStorage,
} from "../storage/storageConfig";
import { useCoreSettingsStore } from "./coreSettingsStore";
import { createAgentDataSlice } from "./settings/agentDataSlice";
import { createCacheSettingsSlice } from "./settings/cacheSlice";
import { createCoreSettingsSlice } from "./settings/coreSlice";
import { createPluginSlice } from "./settings/pluginSlice";
import { createSkillSlice } from "./settings/skillSlice";
import {
  migrateSettingsState,
  onSettingsRehydrate,
  partializeSettings,
} from "./settings/persistence";
import type { SettingsState } from "./settings/types";

export type { SettingsState } from "./settings/types";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get, store) =>
      ({
        ...createCoreSettingsSlice(set, get, store),
        ...createCacheSettingsSlice(set, get, store),
        ...createPluginSlice(set, get, store),
        ...createSkillSlice(set, get, store),
        ...createAgentDataSlice(set, get, store),
      }) as SettingsState,
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createJSONStorage(getAppDbStorage),
      version: STORAGE_VERSION,
      migrate: migrateSettingsState,
      partialize: partializeSettings,
      onRehydrateStorage: onSettingsRehydrate,
    },
  ),
);

export function formatModelName(
  id: string,
  metadata?: Record<string, ModelMetadata>,
  customMetadata?: Record<string, ModelMetadata>,
): string {
  if (!id) return "";
  const name = customMetadata?.[id]?.name || metadata?.[id]?.name;
  if (name) return name;
  return id
    .replace(/[-_]/g, (match, offset, value) => {
      const surroundedByDigits =
        match === "-" &&
        offset > 0 &&
        offset < value.length - 1 &&
        /\d/.test(value[offset - 1]) &&
        /\d/.test(value[offset + 1]);
      return surroundedByDigits ? match : " ";
    })
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getEffectiveBaseUrl(baseUrl: string, type: string): string {
  return normalizeProviderBaseUrl(baseUrl, type);
}

export function getTaskModel(task: keyof DefaultModels): string {
  const { defaultModels, providers } = useCoreSettingsStore.getState();
  return getDefaultModelSelectValue(defaultModels, task, providers);
}
