import { vi } from "vitest";
import type { Plugin } from "../types";

const mocks = vi.hoisted(() => ({
  encryptSecret: vi.fn(),
  store: {
    state: {} as {
      marketPlugins: Plugin[];
      marketPluginsTimestamp: number;
      marketMcpServers: Plugin[];
      marketMcpServersTimestamp: number;
      setMarketPlugins: ReturnType<typeof vi.fn>;
      setMarketMcpServers: ReturnType<typeof vi.fn>;
    },
  },
}));

export const encryptSecretMock = mocks.encryptSecret;
export const storeMock = mocks.store;

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: { getState: () => mocks.store.state },
}));

vi.mock("../lib/utils/devLogger", () => ({
  logDevError: vi.fn(),
  logDevInfo: vi.fn(),
  logDevWarn: vi.fn(),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

vi.mock("../lib/byok/client", () => ({
  encryptSecret: mocks.encryptSecret,
}));

export const pluginA: Plugin = {
  id: "example.com:alpha",
  title: "Alpha",
  description: "Alpha plugin",
  logoUrl: "",
  manifestUrl: "https://example.com/alpha.json",
  functions: [],
};

export const pluginB: Plugin = {
  id: "example.com:beta",
  title: "Beta",
  description: "Beta plugin",
  logoUrl: "",
  manifestUrl: "https://example.com/beta.json",
  functions: [],
};

export const mcpPlugin: Plugin = {
  id: "mcp:io.github/context7:1.2.3",
  title: "io.github/context7",
  description: "Context-aware docs lookup.",
  logoUrl: "/mcp-logo.svg",
  manifestUrl:
    "https://registry.modelcontextprotocol.io/v0.1/servers/io.github%2Fcontext7/versions/1.2.3",
  source: "mcp",
  functions: [],
  category: "MCP",
  categories: ["MCP"],
  auth: { type: "none", required: false },
  mcp: {
    transport: "streamable-http",
    serverUrl: "https://mcp.example.com/mcp",
    serverName: "io.github/context7",
    serverVersion: "1.2.3",
    toolNameMap: {},
  },
};

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function getFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
}

export function resetPluginServiceTestState(): void {
  vi.resetModules();
  encryptSecretMock.mockReset();
  storeMock.state = {
    marketPlugins: [],
    marketPluginsTimestamp: 0,
    marketMcpServers: [],
    marketMcpServersTimestamp: 0,
    setMarketPlugins: vi.fn((plugins: Plugin[]) => {
      storeMock.state.marketPlugins = plugins;
      storeMock.state.marketPluginsTimestamp = Date.now();
    }),
    setMarketMcpServers: vi.fn((plugins: Plugin[]) => {
      storeMock.state.marketMcpServers = plugins;
      storeMock.state.marketMcpServersTimestamp = Date.now();
    }),
  };
}

export function cleanupPluginServiceTestState(): void {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
}
