import { BUILT_IN_PLUGINS, UNSPLASH_PLUGIN } from "@/config/plugins";
import { DEFAULT_SYSTEM_SETTINGS } from "@/config/defaults";
import { MARKET_LIMITS } from "@/config/limits";
import {
  normalizeMarketAgents,
  normalizeAgentOverrides,
  normalizeLocalAgents,
} from "@/lib/market/agents";
import { normalizeModelMetadataMap } from "@/lib/providers/metadata";
import { normalizeSystemSettings } from "../../../lib/settings/appConfig";
import { normalizeCustomSkills } from "../../../lib/skills";
import {
  normalizeActivePluginIds,
  normalizePluginConfigs,
} from "../../../lib/plugin/config";
import {
  migratePluginConfigLocalSecrets,
  migrateRAGLocalSecrets,
  migrateVoiceLocalSecrets,
  stripPluginConfigPlainSecrets,
  stripRAGPlainSecrets,
  stripVoicePlainSecrets,
} from "../../../lib/settings/localSecretMigration";
import { logDevError } from "../../../lib/utils/devLogger";
import type { SettingsState } from "./types";
import {
  normalizeInstalledSkills,
  normalizeSkillCatalogCache,
  normalizeSkillDefinitionCache,
  normalizeSkillIdRefsForStorage,
  normalizeTimestampCache,
  removeRemovedBuiltInPlugins,
} from "./normalizers";

function migrateMarket(state: Partial<SettingsState>) {
  return {
    marketPlugins: state.marketPlugins || [],
    marketPluginsTimestamp: state.marketPluginsTimestamp || 0,
    marketMcpServers: state.marketMcpServers || [],
    marketMcpServersTimestamp: state.marketMcpServersTimestamp || 0,
    marketAgents: normalizeMarketAgents(state.marketAgents),
    marketAgentsTimestamp: state.marketAgentsTimestamp || 0,
    marketAgentsLocale: state.marketAgentsLocale || "",
    skillCatalogs: normalizeSkillCatalogCache(state.skillCatalogs),
    skillCatalogTimestamps: normalizeTimestampCache(
      state.skillCatalogTimestamps,
    ),
    skillDefinitions: normalizeSkillDefinitionCache(state.skillDefinitions),
    skillDefinitionTimestamps: normalizeTimestampCache(
      state.skillDefinitionTimestamps,
    ),
  };
}

function migrateSkillsAndAgents(state: Partial<SettingsState>) {
  return {
    installedSkills: normalizeInstalledSkills(
      state.installedSkills && state.installedSkills.length > 0
        ? state.installedSkills
        : state.customSkills,
    ),
    customSkills: normalizeCustomSkills(
      state.customSkills,
      MARKET_LIMITS.maxCustomSkills,
    ),
    activeSkillIds: normalizeSkillIdRefsForStorage(state.activeSkillIds),
    skillAutoSelect:
      typeof state.skillAutoSelect === "boolean" ? state.skillAutoSelect : true,
    customAgents: normalizeLocalAgents(
      state.customAgents,
      MARKET_LIMITS.maxCustomAgents,
    ),
    usedAgents: normalizeLocalAgents(
      state.usedAgents,
      MARKET_LIMITS.maxUsedAgents,
    ),
    agentOverrides: normalizeAgentOverrides(state.agentOverrides),
  };
}

export async function migrateSettingsState(
  persistedState: unknown,
): Promise<SettingsState> {
  const state = persistedState as Partial<SettingsState>;
  const installedPlugins = removeRemovedBuiltInPlugins(
    state.installedPlugins || [...BUILT_IN_PLUGINS],
  );
  const pluginConfigs = await migratePluginConfigLocalSecrets(
    normalizePluginConfigs(state.pluginConfigs, installedPlugins),
  );
  const rag = await migrateRAGLocalSecrets(state.rag);
  const voice = await migrateVoiceLocalSecrets(state.voice);
  return {
    ...state,
    ...migrateMarket(state),
    system: normalizeSystemSettings(state.system, DEFAULT_SYSTEM_SETTINGS),
    modelMetadata: normalizeModelMetadataMap(state.modelMetadata),
    modelMetadataTimestamp: state.modelMetadataTimestamp || 0,
    customModelMetadata: normalizeModelMetadataMap(state.customModelMetadata),
    rag,
    voice,
    activePlugins: normalizeActivePluginIds(
      state.activePlugins,
      installedPlugins,
      pluginConfigs,
      { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
    ),
    installedPlugins,
    pluginConfigs,
    ...migrateSkillsAndAgents(state),
  } as SettingsState;
}

export function partializeSettings(state: SettingsState) {
  return {
    marketPlugins: state.marketPlugins,
    marketPluginsTimestamp: state.marketPluginsTimestamp,
    marketMcpServers: state.marketMcpServers,
    marketMcpServersTimestamp: state.marketMcpServersTimestamp,
    marketAgents: state.marketAgents,
    marketAgentsTimestamp: state.marketAgentsTimestamp,
    marketAgentsLocale: state.marketAgentsLocale,
    skillCatalogs: state.skillCatalogs,
    skillCatalogTimestamps: state.skillCatalogTimestamps,
    skillDefinitions: state.skillDefinitions,
    skillDefinitionTimestamps: state.skillDefinitionTimestamps,
    system: state.system,
    modelMetadata: state.modelMetadata,
    modelMetadataTimestamp: state.modelMetadataTimestamp,
    customModelMetadata: state.customModelMetadata,
    rag: stripRAGPlainSecrets(state.rag),
    voice: stripVoicePlainSecrets(state.voice),
    activePlugins: state.activePlugins,
    installedPlugins: state.installedPlugins,
    pluginConfigs: stripPluginConfigPlainSecrets(state.pluginConfigs),
    installedSkills: state.installedSkills,
    customSkills: state.customSkills,
    activeSkillIds: state.activeSkillIds,
    skillAutoSelect: state.skillAutoSelect,
    customAgents: state.customAgents,
    usedAgents: state.usedAgents,
    agentOverrides: state.agentOverrides,
  };
}

export function onSettingsRehydrate() {
  return (state: SettingsState | undefined, error: unknown) => {
    if (typeof window === "undefined") return;
    if (error) {
      logDevError("Settings hydration failed:", error);
      state?.setHasHydrated(true);
      return;
    }
    state?.setHasHydrated(true);
  };
}
