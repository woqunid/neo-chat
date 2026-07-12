import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LobeAgent, Plugin } from "../types";
import type { SettingsState } from "../store/core/settingsStore";

vi.mock("server-only", () => ({}));
vi.mock("@/config/api", async () => vi.importActual("../config/api"));
vi.mock("@/config/defaults", async () => vi.importActual("../config/defaults"));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/config/plugins", async () => vi.importActual("../config/plugins"));
vi.mock("@/lib/defaultConfig/shared", async () =>
  vi.importActual("../lib/defaultConfig/shared"),
);
vi.mock("@/lib/market/agents", async () =>
  vi.importActual("../lib/market/agents"),
);
vi.mock("@/lib/providers/config", async () =>
  vi.importActual("../lib/providers/config"),
);
vi.mock("@/lib/providers/metadata", async () =>
  vi.importActual("../lib/providers/metadata"),
);
vi.mock("@/lib/providers/providerTypes", async () =>
  vi.importActual("../lib/providers/providerTypes"),
);
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/utils/defaultModels", async () =>
  vi.importActual("../lib/utils/defaultModels"),
);

const ACTION_KEYS = [
  "setHasHydrated",
  "applyServerConfig",
  "setMarketPlugins",
  "setMarketMcpServers",
  "setMarketAgents",
  "setSkillCatalog",
  "setSkillDefinition",
  "updateSystemSettings",
  "setCustomModelMetadata",
  "fetchModelMetadata",
  "updateRAGConfig",
  "updateVoiceSettings",
  "addInstalledPlugin",
  "removeInstalledPlugin",
  "setActivePlugins",
  "togglePluginActive",
  "updatePluginConfig",
  "togglePluginFunction",
  "ensureBuiltInPlugins",
  "installSkill",
  "uninstallSkill",
  "updateInstalledSkill",
  "addCustomSkill",
  "updateCustomSkill",
  "removeCustomSkill",
  "setActiveSkillIds",
  "toggleSkillActive",
  "setSkillAutoSelect",
  "addCustomAgent",
  "updateAgent",
  "removeLocalAgent",
  "recordUsedAgent",
  "resetAgent",
  "exportAllData",
  "clearDataSources",
  "clearAllData",
] as const satisfies readonly (keyof SettingsState)[];

const createAgent = (identifier: string): LobeAgent => ({
  identifier,
  meta: {
    avatar: "bot",
    title: identifier,
    description: `${identifier} description`,
    tags: [],
    category: "General",
  },
  createdAt: "",
  homepage: "",
  author: "",
});

const getSettingsStore = async () =>
  (await import("../store/core/settingsStore")).useSettingsStore;

beforeEach(async () => {
  const store = await getSettingsStore();
  store.setState(store.getInitialState(), true);
});

afterEach(() => vi.restoreAllMocks());

describe("settings store facade", () => {
  it("exposes every action after composing the split slices", async () => {
    const state = (await getSettingsStore()).getState();
    for (const key of ACTION_KEYS) expect(state[key]).toBeTypeOf("function");
  });

  it("updates the MCP market cache and timestamp", async () => {
    const now = Date.UTC(2026, 0, 1);
    const server = {
      id: "mcp-test",
      title: "MCP Test",
      description: "Test server",
      source: "mcp",
    } as Plugin;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const store = await getSettingsStore();

    store.getState().setMarketMcpServers([server]);

    expect(store.getState()).toMatchObject({
      marketMcpServers: [server],
      marketMcpServersTimestamp: now,
    });
  });
});

describe("settings store custom agents", () => {
  it("adds, updates, and removes custom agents", async () => {
    const agent = createAgent("custom-agent");
    const store = await getSettingsStore();
    store.getState().addCustomAgent(agent);
    store
      .getState()
      .updateAgent(
        agent.identifier,
        { meta: { ...agent.meta, title: "Updated" } },
        true,
      );

    expect(store.getState().customAgents[0]).toMatchObject({
      identifier: agent.identifier,
      isCustom: true,
      meta: { title: "Updated" },
    });

    store.getState().removeLocalAgent(agent.identifier);
    expect(store.getState().customAgents).toEqual([]);
  });
});

describe("settings store market agents", () => {
  it("records market-agent overrides and resets them", async () => {
    const agent = createAgent("market-agent");
    const store = await getSettingsStore();
    store.getState().recordUsedAgent(agent);
    store
      .getState()
      .updateAgent(
        agent.identifier,
        { meta: { ...agent.meta, title: "Local title" } },
        false,
      );

    expect(store.getState()).toMatchObject({
      usedAgents: [{ meta: { title: "Local title" } }],
      agentOverrides: {
        [agent.identifier]: { meta: { title: "Local title" } },
      },
    });

    store.getState().resetAgent(agent.identifier);
    expect(store.getState().agentOverrides).toEqual({});
  });
});
