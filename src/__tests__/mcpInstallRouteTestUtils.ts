import { vi } from "vitest";
import type { Plugin, PluginMcpMetadata } from "../lib/plugin/types";

const mocks = vi.hoisted(() => ({
  listMcpTools: vi.fn(),
  registerServerPlugin: vi.fn(),
  decryptOptionalSecret: vi.fn(),
  safeFetchJson: vi.fn(),
}));

export const listMcpToolsMock = mocks.listMcpTools;
export const registerServerPluginMock = mocks.registerServerPlugin;
export const decryptOptionalSecretMock = mocks.decryptOptionalSecret;
export const safeFetchJsonMock = mocks.safeFetchJson;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));
vi.mock("@/lib/mcp/client", () => ({ listMcpTools: mocks.listMcpTools }));
vi.mock("@/lib/plugin/serverRegistry", () => ({
  registerServerPlugin: mocks.registerServerPlugin,
}));
vi.mock("../lib/byok/server", () => ({
  decryptOptionalSecret: mocks.decryptOptionalSecret,
}));
vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchJson: mocks.safeFetchJson,
}));
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/plugin/openapi", async () =>
  vi.importActual("../lib/plugin/openapi"),
);
vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

interface McpPluginOverrides extends Omit<Partial<Plugin>, "mcp"> {
  mcp?: Partial<PluginMcpMetadata>;
}

export function createMcpPlugin(overrides: McpPluginOverrides = {}): Plugin {
  const mcp: PluginMcpMetadata = {
    transport: "streamable-http",
    serverUrl: "https://mcp.example.com/mcp",
    serverName: "io.github/context7",
    serverVersion: "1.2.3",
    headers: { "X-Client": "neo-chat" },
    toolNameMap: {},
    ...overrides.mcp,
  };
  return {
    id: "mcp:io.github/context7:1.2.3",
    source: "mcp",
    title: "io.github/context7",
    description: "Context-aware docs lookup.",
    logoUrl: "",
    manifestUrl:
      "https://registry.modelcontextprotocol.io/v0.1/servers/io.github%2Fcontext7/versions/1.2.3",
    functions: [],
    auth: { type: "none", required: false },
    ...overrides,
    mcp,
  };
}

export function createSecretEnvelope(context: string) {
  return {
    v: 1,
    kid: "test-key",
    alg: "RSA-OAEP-256+A256GCM",
    iv: "iv",
    wrappedKey: "wrappedKey",
    ciphertext: "ciphertext",
    context,
  };
}

export function createRegistryMcpResponse(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    server: {
      name: "io.github/context7",
      version: "1.2.3",
      description: "Context-aware docs lookup.",
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [{ name: "X-Client", value: "neo-chat" }],
        },
      ],
      ...overrides,
    },
  };
}

export function resetMcpInstallRouteMocks(): void {
  vi.resetModules();
  listMcpToolsMock.mockReset();
  registerServerPluginMock.mockReset();
  decryptOptionalSecretMock.mockReset();
  safeFetchJsonMock.mockReset();
  decryptOptionalSecretMock.mockResolvedValue(undefined);
  safeFetchJsonMock.mockResolvedValue({
    response: new Response("{}", { status: 200 }),
    data: createRegistryMcpResponse(),
  });
}

export async function postPluginInstall(body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/plugins/install/route");
  const request = new Request("http://localhost/api/plugins/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
  return POST(request);
}
