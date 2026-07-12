import type { Plugin, PluginConfig } from "@/types";
import { BUILT_IN_PLUGINS, UNSPLASH_PLUGIN } from "@/config/plugins";
import {
  isPluginAuthRequired,
  normalizeActivePluginIds,
  normalizePluginConfig,
  normalizePluginConfigs,
} from "../../../lib/plugin/config";
import { hasPluginAuthValue } from "../../../lib/security/localSecretResolvers";
import type { SettingsSlice, SettingsState } from "./types";
import {
  canAutoActivatePlugin,
  initPluginConfig,
  refreshBuiltInPluginDefinitions,
  removeRemovedBuiltInPlugins,
} from "./normalizers";

const ACTIVE_OPTIONS = {
  unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id],
};

function addPlugin(state: SettingsState, plugin: Plugin) {
  if (state.installedPlugins.some((item) => item.id === plugin.id))
    return state;
  const installedPlugins = [...state.installedPlugins, plugin];
  const config = normalizePluginConfig(
    state.pluginConfigs[plugin.id] || initPluginConfig(),
    plugin.functions?.map((item) => item.name),
  );
  const pluginConfigs = normalizePluginConfigs(
    { ...state.pluginConfigs, [plugin.id]: config },
    installedPlugins,
  );
  return {
    installedPlugins,
    activePlugins: normalizeActivePluginIds(
      canAutoActivatePlugin(plugin, config)
        ? [...state.activePlugins, plugin.id]
        : state.activePlugins,
      installedPlugins,
      pluginConfigs,
      ACTIVE_OPTIONS,
    ),
    pluginConfigs,
  };
}

function removePlugin(state: SettingsState, pluginId: string) {
  const plugin = state.installedPlugins.find((item) => item.id === pluginId);
  if (plugin?.builtIn) return state;
  const { [pluginId]: _removed, ...pluginConfigs } = state.pluginConfigs;
  void _removed;
  return {
    installedPlugins: state.installedPlugins.filter(
      (item) => item.id !== pluginId,
    ),
    activePlugins: state.activePlugins.filter((id) => id !== pluginId),
    pluginConfigs,
  };
}

function togglePlugin(state: SettingsState, pluginId: string) {
  const plugin = state.installedPlugins.find((item) => item.id === pluginId);
  if (!plugin) return state;
  const active = state.activePlugins.includes(pluginId);
  const missingAuth =
    !active &&
    isPluginAuthRequired(plugin) &&
    !hasPluginAuthValue(state.pluginConfigs[pluginId]?.auth) &&
    pluginId !== UNSPLASH_PLUGIN.id;
  if (missingAuth) return state;
  return {
    activePlugins: normalizeActivePluginIds(
      active
        ? state.activePlugins.filter((id) => id !== pluginId)
        : [...state.activePlugins, pluginId],
      state.installedPlugins,
      state.pluginConfigs,
      ACTIVE_OPTIONS,
    ),
  };
}

function updateConfig(
  state: SettingsState,
  pluginId: string,
  config: Partial<PluginConfig>,
) {
  const plugin = state.installedPlugins.find((item) => item.id === pluginId);
  if (!plugin) return state;
  const pluginConfigs = normalizePluginConfigs(
    {
      ...state.pluginConfigs,
      [pluginId]: normalizePluginConfig(
        { ...state.pluginConfigs[pluginId], ...config },
        plugin.functions?.map((item) => item.name),
      ),
    },
    state.installedPlugins,
  );
  return {
    pluginConfigs,
    activePlugins: normalizeActivePluginIds(
      state.activePlugins,
      state.installedPlugins,
      pluginConfigs,
      ACTIVE_OPTIONS,
    ),
  };
}

function toggleFunction(
  state: SettingsState,
  pluginId: string,
  functionName: string,
) {
  const plugin = state.installedPlugins.find((item) => item.id === pluginId);
  if (!plugin?.functions?.some((item) => item.name === functionName))
    return state;
  const current = state.pluginConfigs[pluginId] || initPluginConfig();
  const disabled = current.disabledFunctions || [];
  const disabledFunctions = disabled.includes(functionName)
    ? disabled.filter((item) => item !== functionName)
    : [...disabled, functionName];
  return {
    pluginConfigs: {
      ...state.pluginConfigs,
      [pluginId]: normalizePluginConfig(
        { ...current, disabledFunctions },
        plugin.functions.map((item) => item.name),
      ),
    },
  };
}

function ensureBuiltIns(state: SettingsState) {
  const retained = refreshBuiltInPluginDefinitions(
    removeRemovedBuiltInPlugins(state.installedPlugins),
  );
  const missing = BUILT_IN_PLUGINS.filter(
    (plugin) => !retained.some((item) => item.id === plugin.id),
  );
  const changed =
    retained.length !== state.installedPlugins.length ||
    retained.some((plugin, index) => plugin !== state.installedPlugins[index]);
  if (missing.length === 0 && !changed) return state;
  const installedPlugins = [...retained, ...missing];
  const nextConfigs = normalizePluginConfigs(state.pluginConfigs, retained);
  for (const plugin of missing) {
    if (!nextConfigs[plugin.id]) nextConfigs[plugin.id] = initPluginConfig();
  }
  const pluginConfigs = normalizePluginConfigs(nextConfigs, installedPlugins);
  return {
    installedPlugins,
    pluginConfigs,
    activePlugins: normalizeActivePluginIds(
      state.activePlugins,
      installedPlugins,
      pluginConfigs,
      ACTIVE_OPTIONS,
    ),
  };
}

export const createPluginSlice: SettingsSlice = (set) => ({
  activePlugins: [],
  installedPlugins: [...BUILT_IN_PLUGINS],
  pluginConfigs: {},
  addInstalledPlugin: (plugin) => set((state) => addPlugin(state, plugin)),
  removeInstalledPlugin: (id) => set((state) => removePlugin(state, id)),
  setActivePlugins: (ids) =>
    set((state) => ({
      activePlugins: normalizeActivePluginIds(
        ids,
        state.installedPlugins,
        state.pluginConfigs,
        ACTIVE_OPTIONS,
      ),
    })),
  togglePluginActive: (id) => set((state) => togglePlugin(state, id)),
  updatePluginConfig: (id, config) =>
    set((state) => updateConfig(state, id, config)),
  togglePluginFunction: (id, name) =>
    set((state) => toggleFunction(state, id, name)),
  ensureBuiltInPlugins: () => set((state) => ensureBuiltIns(state)),
});
