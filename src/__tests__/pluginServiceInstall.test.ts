import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanupPluginServiceTestState,
  encryptSecretMock,
  getFetchCalls,
  jsonResponse,
  resetPluginServiceTestState,
} from "./pluginServiceTestUtils";

beforeEach(resetPluginServiceTestState);
afterEach(cleanupPluginServiceTestState);

it("surfaces marketplace plugin install API errors", async () => {
  const error = "MCP server requires authentication before tools can be listed";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ error }, { status: 400 })),
  );
  const { installPlugin } = await import("../services/api/pluginService");

  await expect(
    installPlugin({
      id: "mcp:private:1.0.0",
      title: "private",
      description: "",
      logoUrl: "",
      manifestUrl: "",
      source: "mcp",
      functions: [],
      auth: {
        type: "bearer",
        name: "Authorization",
        in: "header",
        required: true,
      },
      mcp: {
        transport: "streamable-http",
        serverUrl: "https://mcp.example.com/mcp",
        serverName: "private",
        serverVersion: "1.0.0",
        toolNameMap: {},
      },
    }),
  ).rejects.toThrow(error);
});

it("installs a custom MCP server without auth", async () => {
  const fetchMock = createInstallFetchMock();
  vi.stubGlobal("fetch", fetchMock);

  const { installCustomMcpServer } =
    await import("../services/api/pluginService");
  const plugin = await installCustomMcpServer({
    name: "Private Docs",
    serverUrl: "https://mcp.example.com/mcp",
  });

  const [requestUrl, requestInit] = getFetchCalls(fetchMock)[0];
  const payload = JSON.parse(String(requestInit?.body || "{}"));
  expect(requestUrl).toBe("/api/plugins/install");
  expect(payload).toMatchObject({
    plugin: {
      id: expect.stringMatching(/^custom-mcp-private-docs-\d+$/),
      source: "mcp",
      title: "Private Docs",
      logoUrl: "/mcp-logo.svg",
      auth: { type: "none", required: false },
      mcp: {
        transport: "streamable-http",
        serverUrl: "https://mcp.example.com/mcp",
        serverName: "Private Docs",
        serverVersion: "custom",
        toolNameMap: {},
      },
    },
  });
  expect(payload.authConfig).toBeUndefined();
  expect(encryptSecretMock).not.toHaveBeenCalled();
  expect(plugin.functions).toEqual([
    expect.objectContaining({ mcpToolName: "search" }),
  ]);
});

it("encrypts a custom MCP bearer token for tool discovery", async () => {
  encryptSecretMock.mockResolvedValue({
    v: 1,
    kid: "test-key",
    alg: "RSA-OAEP-256+A256GCM",
    iv: "iv",
    wrappedKey: "wrappedKey",
    ciphertext: "ciphertext",
    context: "plugin:custom-mcp-private-docs-123:auth",
  });
  vi.spyOn(Date, "now").mockReturnValue(123);
  const fetchMock = createInstallFetchMock();
  vi.stubGlobal("fetch", fetchMock);

  const { installCustomMcpServer } =
    await import("../services/api/pluginService");
  await installCustomMcpServer({
    name: "Private Docs",
    serverUrl: "https://mcp.example.com/mcp",
    bearerToken: "secret-token",
  });

  expect(encryptSecretMock).toHaveBeenCalledWith(
    "secret-token",
    "plugin:custom-mcp-private-docs-123:auth",
  );
  const [, requestInit] = getFetchCalls(fetchMock)[0];
  const payload = JSON.parse(String(requestInit?.body || "{}"));
  expect(payload).toMatchObject({
    plugin: {
      id: "custom-mcp-private-docs-123",
      auth: { type: "bearer", required: true },
    },
    authConfig: {
      type: "bearer",
      key: "Authorization",
      addTo: "header",
      valueSecret: {
        context: "plugin:custom-mcp-private-docs-123:auth",
      },
    },
  });
});

function createInstallFetchMock() {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body || "{}"));
    return jsonResponse({
      plugin: {
        ...payload.plugin,
        functions: [
          {
            name: "mcp_private_docs__search",
            description: "Search docs.",
            parameters: { type: "object", properties: {} },
            mcpToolName: "search",
          },
        ],
      },
    });
  });
}
