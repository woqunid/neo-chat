import type { StateCreator } from "zustand";
import type {
  LobeAgent,
  ModelMetadata,
  Plugin,
  PluginConfig,
  RAGConfig,
  SkillCatalog,
  SkillDataLocale,
  SystemSettings,
  TextSkill,
  VoiceSettings,
} from "@/types";
import type { PublicServerConfig } from "@/lib/defaultConfig/shared";
import type { AgentMarketLocale } from "@/lib/market/agentLocale";
import type { AppExportPayload } from "@/lib/data/appExport";
import type { BrowserAppDataSource } from "@/lib/data/clearAppData";

export interface SettingsState {
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  serverConfig: PublicServerConfig | null;
  applyServerConfig: (config: PublicServerConfig) => void;
  marketPlugins: Plugin[];
  marketPluginsTimestamp: number;
  marketMcpServers: Plugin[];
  marketMcpServersTimestamp: number;
  marketAgents: LobeAgent[];
  marketAgentsTimestamp: number;
  marketAgentsLocale: AgentMarketLocale | "";
  skillCatalogs: Partial<Record<SkillDataLocale, SkillCatalog>>;
  skillCatalogTimestamps: Partial<Record<SkillDataLocale, number>>;
  skillDefinitions: Record<string, TextSkill>;
  skillDefinitionTimestamps: Record<string, number>;
  setMarketPlugins: (plugins: Plugin[]) => void;
  setMarketMcpServers: (plugins: Plugin[]) => void;
  setMarketAgents: (
    agents: LobeAgent[],
    locale?: AgentMarketLocale | "",
  ) => void;
  setSkillCatalog: (locale: SkillDataLocale, catalog: SkillCatalog) => void;
  setSkillDefinition: (cacheKey: string, skill: TextSkill) => void;
  system: SystemSettings;
  updateSystemSettings: (settings: Partial<SystemSettings>) => void;
  modelMetadata: Record<string, ModelMetadata>;
  modelMetadataTimestamp: number;
  customModelMetadata: Record<string, ModelMetadata>;
  setCustomModelMetadata: (id: string, meta: ModelMetadata) => void;
  fetchModelMetadata: (forceRefresh?: boolean) => Promise<void>;
  rag: RAGConfig;
  updateRAGConfig: (config: Partial<RAGConfig>) => void;
  voice: VoiceSettings;
  updateVoiceSettings: (settings: Partial<VoiceSettings>) => void;
  activePlugins: string[];
  installedPlugins: Plugin[];
  pluginConfigs: Record<string, PluginConfig>;
  addInstalledPlugin: (plugin: Plugin) => void;
  removeInstalledPlugin: (pluginId: string) => void;
  setActivePlugins: (pluginIds: string[]) => void;
  togglePluginActive: (pluginId: string) => void;
  updatePluginConfig: (pluginId: string, config: Partial<PluginConfig>) => void;
  togglePluginFunction: (pluginId: string, functionName: string) => void;
  ensureBuiltInPlugins: () => void;
  installedSkills: TextSkill[];
  customSkills: TextSkill[];
  activeSkillIds: string[];
  skillAutoSelect: boolean;
  installSkill: (skill: TextSkill) => void;
  uninstallSkill: (skillId: string) => void;
  updateInstalledSkill: (skillId: string, skill: Partial<TextSkill>) => void;
  addCustomSkill: (skill: TextSkill) => void;
  updateCustomSkill: (skillId: string, skill: Partial<TextSkill>) => void;
  removeCustomSkill: (skillId: string) => void;
  setActiveSkillIds: (skillIds: string[]) => void;
  toggleSkillActive: (skillId: string) => void;
  setSkillAutoSelect: (enabled: boolean) => void;
  customAgents: LobeAgent[];
  usedAgents: LobeAgent[];
  agentOverrides: Record<string, Partial<LobeAgent>>;
  addCustomAgent: (agent: LobeAgent) => void;
  updateAgent: (
    identifier: string,
    updates: Partial<LobeAgent>,
    isCustom: boolean,
  ) => void;
  removeLocalAgent: (identifier: string) => void;
  recordUsedAgent: (agent: LobeAgent) => void;
  resetAgent: (identifier: string) => void;
  exportAllData: () => Promise<AppExportPayload>;
  clearDataSources: (sources: BrowserAppDataSource[]) => Promise<void>;
  clearAllData: () => Promise<void>;
}

export type SettingsSlice = StateCreator<
  SettingsState,
  [],
  [],
  Partial<SettingsState>
>;
