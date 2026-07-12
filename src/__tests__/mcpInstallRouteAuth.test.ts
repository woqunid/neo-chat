import { beforeEach, expect, it } from "vitest";
import {
  createMcpPlugin,
  createRegistryMcpResponse,
  createSecretEnvelope,
  decryptOptionalSecretMock,
  listMcpToolsMock,
  postPluginInstall,
  registerServerPluginMock,
  resetMcpInstallRouteMocks,
  safeFetchJsonMock,
} from "./mcpInstallRouteTestUtils";

const CUSTOM_PLUGIN_ID = "custom-mcp-private-123456";

beforeEach(resetMcpInstallRouteMocks);

it("uses install-time bearer auth for a custom MCP server", async () => {
  decryptOptionalSecretMock.mockResolvedValue("secret-token");
  listMcpToolsMock.mockResolvedValue([PRIVATE_SEARCH_TOOL]);
  const response = await postPluginInstall(createPrivateInstallPayload());

  expect(response.status).toBe(200);
  expectSecretDecrypted();
  expectAuthenticatedToolListing();
  expectPrivatePluginRegistered();
  await expectPrivatePluginResponse(response);
});

it("rejects required MCP auth before unauthenticated tool listing", async () => {
  safeFetchJsonMock.mockResolvedValueOnce({
    response: new Response("{}", { status: 200 }),
    data: createRegistryMcpResponse({
      name: "private",
      version: "1.0.0",
      description: "",
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [
            {
              name: "Authorization",
              value: "{token}",
              isRequired: true,
              isSecret: true,
            },
          ],
        },
      ],
    }),
  });
  const plugin = createMcpPlugin({
    id: "mcp:private:1.0.0",
    title: "private",
    description: "",
    manifestUrl:
      "https://registry.modelcontextprotocol.io/v0.1/servers/private",
    auth: {
      type: "bearer",
      name: "Authorization",
      in: "header",
      required: true,
    },
    mcp: { serverName: "private", serverVersion: "1.0.0" },
  });

  const response = await postPluginInstall({ plugin });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: "MCP server requires authentication before tools can be listed",
  });
  expect(listMcpToolsMock).not.toHaveBeenCalled();
  expect(registerServerPluginMock).not.toHaveBeenCalled();
});

const PRIVATE_SEARCH_TOOL = {
  name: "private-search",
  description: "Search private data.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

function createPrivateInstallPayload() {
  const plugin = createMcpPlugin({
    id: CUSTOM_PLUGIN_ID,
    title: "Private MCP",
    description: "Custom private MCP server.",
    manifestUrl: "",
    category: "MCP",
    categories: ["MCP"],
    auth: {
      type: "bearer",
      name: "Authorization",
      in: "header",
      required: true,
    },
    mcp: {
      serverName: "Private MCP",
      serverVersion: "custom",
      headers: undefined,
    },
  });
  const valueSecret = createSecretEnvelope(`plugin:${CUSTOM_PLUGIN_ID}:auth`);
  return {
    plugin,
    authConfig: {
      type: "bearer",
      key: "Authorization",
      addTo: "header",
      valueSecret,
    },
  };
}

function expectSecretDecrypted(): void {
  const context = `plugin:${CUSTOM_PLUGIN_ID}:auth`;
  expect(decryptOptionalSecretMock).toHaveBeenCalledWith(
    expect.objectContaining({ context }),
    context,
  );
}

function expectAuthenticatedToolListing(): void {
  expect(listMcpToolsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      serverUrl: "https://mcp.example.com/mcp",
      authConfig: {
        type: "bearer",
        key: "Authorization",
        addTo: "header",
        value: "secret-token",
      },
    }),
  );
}

function expectPrivatePluginRegistered(): void {
  expect(registerServerPluginMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: CUSTOM_PLUGIN_ID,
      source: "mcp",
      auth: expect.objectContaining({ type: "bearer", required: true }),
      functions: [
        expect.objectContaining({
          name: "mcp_Private_MCP__private_search",
          mcpToolName: "private-search",
        }),
      ],
    }),
  );
}

async function expectPrivatePluginResponse(response: Response): Promise<void> {
  await expect(response.json()).resolves.toMatchObject({
    plugin: {
      id: CUSTOM_PLUGIN_ID,
      source: "mcp",
      functions: [
        {
          name: "mcp_Private_MCP__private_search",
          mcpToolName: "private-search",
        },
      ],
    },
  });
}
