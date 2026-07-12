import type { LobeAgent } from "@/types";
import { MARKET_LIMITS } from "@/config/limits";
import { normalizeLocalAgent, normalizeLocalAgents } from "@/lib/market/agents";
import {
  clearBrowserAppData,
  clearBrowserAppDataSources,
} from "../../../lib/data/clearAppData";
import { createBrowserAppExportPayload } from "../../../lib/data/appExport";
import type { SettingsSlice, SettingsState } from "./types";

function addCustom(state: SettingsState, agent: LobeAgent) {
  const normalized = normalizeLocalAgent({ ...agent, isCustom: true });
  return normalized
    ? {
        customAgents: normalizeLocalAgents(
          [normalized, ...state.customAgents],
          MARKET_LIMITS.maxCustomAgents,
        ),
      }
    : state;
}

function updateCustom(
  state: SettingsState,
  identifier: string,
  updates: Partial<LobeAgent>,
) {
  let changed = false;
  const agents = state.customAgents.map((agent) => {
    if (agent.identifier !== identifier) return agent;
    const normalized = normalizeLocalAgent({
      ...agent,
      ...updates,
      meta: { ...agent.meta, ...updates.meta },
      isCustom: true,
    });
    if (!normalized) return agent;
    changed = true;
    return normalized;
  });
  return changed
    ? {
        customAgents: normalizeLocalAgents(
          agents,
          MARKET_LIMITS.maxCustomAgents,
        ),
      }
    : state;
}

function updateMarket(
  state: SettingsState,
  identifier: string,
  updates: Partial<LobeAgent>,
) {
  const current = state.agentOverrides[identifier] || {};
  const usedAgents = state.usedAgents.map((agent) =>
    agent.identifier === identifier
      ? normalizeLocalAgent({
          ...agent,
          ...updates,
          meta: { ...agent.meta, ...updates.meta },
        }) || agent
      : agent,
  );
  const override = normalizeLocalAgent({
    identifier,
    ...current,
    ...updates,
    meta: { ...current.meta, ...updates.meta },
  });
  return {
    agentOverrides: {
      ...state.agentOverrides,
      ...(override ? { [identifier]: override } : {}),
    },
    usedAgents: normalizeLocalAgents(usedAgents, MARKET_LIMITS.maxUsedAgents),
  };
}

function removeAgent(state: SettingsState, identifier: string) {
  const { [identifier]: _removed, ...agentOverrides } = state.agentOverrides;
  void _removed;
  return {
    customAgents: state.customAgents.filter(
      (agent) => agent.identifier !== identifier,
    ),
    usedAgents: state.usedAgents.filter(
      (agent) => agent.identifier !== identifier,
    ),
    agentOverrides,
  };
}

function recordUsed(state: SettingsState, agent: LobeAgent) {
  const normalized = normalizeLocalAgent(agent);
  if (!normalized) return state;
  if (
    state.customAgents.some((item) => item.identifier === normalized.identifier)
  ) {
    return state;
  }
  const others = state.usedAgents.filter(
    (item) => item.identifier !== normalized.identifier,
  );
  return {
    usedAgents: normalizeLocalAgents(
      [normalized, ...others],
      MARKET_LIMITS.maxUsedAgents,
    ),
  };
}

function reloadBrowser(): void {
  if (typeof window !== "undefined") window.location.reload();
}

export const createAgentDataSlice: SettingsSlice = (set, get) => ({
  customAgents: [],
  usedAgents: [],
  agentOverrides: {},
  addCustomAgent: (agent) => set((state) => addCustom(state, agent)),
  updateAgent: (id, updates, isCustom) =>
    set((state) =>
      isCustom
        ? updateCustom(state, id, updates)
        : updateMarket(state, id, updates),
    ),
  removeLocalAgent: (id) => set((state) => removeAgent(state, id)),
  recordUsedAgent: (agent) => set((state) => recordUsed(state, agent)),
  resetAgent: (id) =>
    set((state) => {
      const { [id]: _removed, ...agentOverrides } = state.agentOverrides;
      void _removed;
      return { agentOverrides };
    }),
  exportAllData: async () => createBrowserAppExportPayload(),
  clearDataSources: async (sources) => {
    await clearBrowserAppDataSources({ sources, rag: get().rag });
    reloadBrowser();
  },
  clearAllData: async () => {
    await clearBrowserAppData(get().rag);
    reloadBrowser();
  },
});
