import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMcpToolRequestMock = vi.hoisted(() => vi.fn());
const decryptOptionalSecretMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);

vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));

vi.mock("../lib/mcp/executor", () => ({
  executeMcpToolRequest: executeMcpToolRequestMock,
}));

vi.mock("@/lib/byok/server", () => ({
  decryptOptionalSecret: decryptOptionalSecretMock,
}));

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchText: vi.fn(),
}));

vi.mock("@/lib/security/deployment", async () =>
  vi.importActual("../lib/security/deployment"),
);

vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

function createRequest(body: unknown, signal?: AbortSignal) {
  return new Request("http://localhost/api/plugins/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function registerTestMcpPlugin(options?: {
  parameters?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}): Promise<void> {
  const { registerServerPlugin } = await import("../lib/plugin/serverRegistry");
  await registerServerPlugin({
    id: "mcp:io.github/context7:1.2.3",
    title: "io.github/context7",
    description: "",
    logoUrl: "",
    manifestUrl: "",
    source: "mcp",
    functions: [
      {
        name: "mcp_io_github_context7__resolve_library_id",
        mcpToolName: "resolve-library-id",
        description: "Resolve package docs.",
        parameters: options?.parameters || { type: "object", properties: {} },
        outputSchema: options?.outputSchema,
        risk: "external",
      },
    ],
    auth: { type: "none", required: false },
    mcp: {
      transport: "streamable-http",
      serverUrl: "https://mcp.example.com/mcp",
      serverName: "io.github/context7",
      serverVersion: "1.2.3",
      headers: { "X-Client": "neo-chat" },
      toolNameMap: {
        mcp_io_github_context7__resolve_library_id: "resolve-library-id",
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  executeMcpToolRequestMock.mockReset();
  decryptOptionalSecretMock.mockReset();
});

describe("MCP plugin execute route", () => {
  it("dispatches MCP plugin execution through the MCP executor", async () => {
    const controller = new AbortController();
    executeMcpToolRequestMock.mockResolvedValue({
      structuredContent: { answer: "ok" },
    });

    await registerTestMcpPlugin();

    const { POST } = await import("../app/api/plugins/execute/route");
    const request = createRequest(
      {
        pluginId: "mcp:io.github/context7:1.2.3",
        functionName: "mcp_io_github_context7__resolve_library_id",
        args: { libraryName: "react" },
      },
      controller.signal,
    );
    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(executeMcpToolRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        toolName: "resolve-library-id",
        args: { libraryName: "react" },
        signal: request.signal,
        staticHeaders: {
          "X-Client": "neo-chat",
        },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      result: { structuredContent: { answer: "ok" } },
    });
  });

  it("rejects arguments that violate the MCP input schema", async () => {
    await registerTestMcpPlugin({
      parameters: {
        type: "object",
        required: ["libraryName"],
        additionalProperties: false,
        properties: { libraryName: { type: "string", minLength: 2 } },
      },
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "mcp:io.github/context7:1.2.3",
        functionName: "mcp_io_github_context7__resolve_library_id",
        args: { libraryName: 1 },
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(executeMcpToolRequestMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "MCP_ARGUMENT_SCHEMA_INVALID",
    });
  });

  it("forwards outputSchema and session roots to the MCP executor", async () => {
    const outputSchema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    await registerTestMcpPlugin({ outputSchema });
    executeMcpToolRequestMock.mockResolvedValue({
      structuredContent: { answer: "ok" },
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "mcp:io.github/context7:1.2.3",
        functionName: "mcp_io_github_context7__resolve_library_id",
        args: {},
        mcpSessionId: "chat-1",
        mcpRoots: [{ uri: "file:///workspace", name: "Workspace" }],
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(executeMcpToolRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outputSchema,
        roots: [{ uri: "file:///workspace", name: "Workspace" }],
        sessionKey: "chat-1:mcp:io.github/context7:1.2.3",
      }),
    );
  });

  it("uses the MCP executor for the first legacy call after a service restart", async () => {
    executeMcpToolRequestMock.mockResolvedValue({ content: [] });
    const plugin = {
      id: "mcp:restart-test",
      title: "Restart Test",
      description: "",
      logoUrl: "",
      manifestUrl: "",
      source: "mcp",
      functions: [
        {
          name: "mcp_restart_tool",
          mcpToolName: "restart-tool",
          description: "Restart tool",
          parameters: { type: "object", properties: {} },
          risk: "external",
        },
      ],
      auth: { type: "none", required: false },
      mcp: {
        transport: "streamable-http",
        serverUrl: "https://mcp.example.com/mcp",
        serverName: "Restart Test",
        toolNameMap: { mcp_restart_tool: "restart-tool" },
      },
    };

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin,
        functionDef: plugin.functions[0],
        args: {},
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(executeMcpToolRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        toolName: "restart-tool",
      }),
    );
  });
});
