import { normalizeMarketAgents } from "@/lib/market/agents";
import { normalizeSkillCatalog, normalizeTextSkill } from "../../../lib/skills";
import type { SettingsSlice } from "./types";
import { SETTINGS_CACHE_KEY_MAX_CHARS } from "./normalizers";

const createMarketCacheSlice: SettingsSlice = (set) => ({
  marketPlugins: [],
  marketPluginsTimestamp: 0,
  marketMcpServers: [],
  marketMcpServersTimestamp: 0,
  marketAgents: [],
  marketAgentsTimestamp: 0,
  marketAgentsLocale: "",
  setMarketPlugins: (plugins) =>
    set({ marketPlugins: plugins, marketPluginsTimestamp: Date.now() }),
  setMarketMcpServers: (plugins) =>
    set({ marketMcpServers: plugins, marketMcpServersTimestamp: Date.now() }),
  setMarketAgents: (agents, locale = "") =>
    set({
      marketAgents: normalizeMarketAgents(agents),
      marketAgentsTimestamp: Date.now(),
      marketAgentsLocale: locale,
    }),
});

const createSkillCacheSlice: SettingsSlice = (set) => ({
  skillCatalogs: {},
  skillCatalogTimestamps: {},
  skillDefinitions: {},
  skillDefinitionTimestamps: {},
  setSkillCatalog: (locale, catalog) => {
    const normalized = normalizeSkillCatalog(catalog);
    set((state) => ({
      skillCatalogs: {
        ...state.skillCatalogs,
        [locale]: { ...normalized, locale },
      },
      skillCatalogTimestamps: {
        ...state.skillCatalogTimestamps,
        [locale]: Date.now(),
      },
    }));
  },
  setSkillDefinition: (cacheKey, skill) => {
    const normalized = normalizeTextSkill(skill);
    if (!normalized || !cacheKey) return;
    if (cacheKey.length > SETTINGS_CACHE_KEY_MAX_CHARS) return;
    set((state) => ({
      skillDefinitions: { ...state.skillDefinitions, [cacheKey]: normalized },
      skillDefinitionTimestamps: {
        ...state.skillDefinitionTimestamps,
        [cacheKey]: Date.now(),
      },
    }));
  },
});

export const createCacheSettingsSlice: SettingsSlice = (set, get, store) => ({
  ...createMarketCacheSlice(set, get, store),
  ...createSkillCacheSlice(set, get, store),
});
