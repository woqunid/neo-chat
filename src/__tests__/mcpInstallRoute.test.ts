import { beforeEach, expect, it } from "vitest";
import {
  createMcpPlugin,
  createRegistryMcpResponse,
  listMcpToolsMock,
  postPluginInstall,
  registerServerPluginMock,
  resetMcpInstallRouteMocks,
  safeFetchJsonMock,
} from "./mcpInstallRouteTestUtils";

beforeEach(resetMcpInstallRouteMocks);

it("lists tools and registers a marketplace MCP server", async () => {
  listMcpToolsMock.mockResolvedValue([
    {
      name: "resolve-library-id",
      description: "Resolve package docs.",
      inputSchema: {
        type: "object",
        properties: { libraryName: { type: "string" } },
        required: ["libraryName"],
      },
    },
  ]);

  const response = await postPluginInstall({ plugin: createMcpPlugin() });

  expect(response.status).toBe(200);
  expect(listMcpToolsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      serverUrl: "https://mcp.example.com/mcp",
      staticHeaders: { "X-Client": "neo-chat" },
    }),
  );
  expect(registerServerPluginMock).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "mcp",
      functions: [
        expect.objectContaining({
          name: "mcp_io_github_context7__resolve_library_id",
          mcpToolName: "resolve-library-id",
        }),
      ],
      mcp: expect.objectContaining({
        headers: { "X-Client": "neo-chat" },
        toolNameMap: {
          mcp_io_github_context7__resolve_library_id: "resolve-library-id",
        },
      }),
    }),
  );
  await expect(response.json()).resolves.toMatchObject({
    plugin: {
      source: "mcp",
      functions: [
        {
          name: "mcp_io_github_context7__resolve_library_id",
          mcpToolName: "resolve-library-id",
        },
      ],
    },
  });
});

it("trusts registry metadata over client marketplace endpoint data", async () => {
  listMcpToolsMock.mockResolvedValue([
    {
      name: "resolve-library-id",
      description: "Resolve package docs.",
      inputSchema: { type: "object", properties: {} },
    },
  ]);
  safeFetchJsonMock.mockResolvedValueOnce({
    response: new Response("{}", { status: 200 }),
    data: createRegistryMcpResponse(),
  });
  const plugin = createMcpPlugin({
    description: "Tampered client metadata.",
    mcp: {
      serverUrl: "https://attacker.example/mcp",
      headers: { "X-Client": "attacker", "X-Injected": "true" },
    },
  });

  const response = await postPluginInstall({ plugin });

  expect(response.status).toBe(200);
  expect(safeFetchJsonMock).toHaveBeenCalledTimes(1);
  expect(listMcpToolsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      serverUrl: "https://mcp.example.com/mcp",
      staticHeaders: { "X-Client": "neo-chat" },
    }),
  );
  expect(registerServerPluginMock).toHaveBeenCalledWith(
    expect.objectContaining({
      description: "Context-aware docs lookup.",
      mcp: expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        headers: { "X-Client": "neo-chat" },
      }),
    }),
  );
});

it("rejects marketplace MCP servers that do not expose tools", async () => {
  listMcpToolsMock.mockResolvedValue([]);
  safeFetchJsonMock.mockResolvedValueOnce({
    response: new Response("{}", { status: 200 }),
    data: createRegistryMcpResponse({
      name: "empty",
      version: "1.0.0",
      description: "",
    }),
  });
  const plugin = createMcpPlugin({
    id: "mcp:empty:1.0.0",
    title: "empty",
    description: "",
    manifestUrl: "https://registry.modelcontextprotocol.io/v0.1/servers/empty",
    mcp: { serverName: "empty", serverVersion: "1.0.0" },
  });

  const response = await postPluginInstall({ plugin });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: "MCP server does not expose any supported tools",
  });
  expect(registerServerPluginMock).not.toHaveBeenCalled();
});
