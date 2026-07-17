import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverMcpServer: vi.fn(),
  readMcpResource: vi.fn(),
  subscribeMcpResource: vi.fn(),
  unsubscribeMcpResource: vi.fn(),
  getMcpPrompt: vi.fn(),
  completeMcpPromptArgument: vi.fn(),
  resolveMcpPluginRequest: vi.fn(),
}));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/api/pluginSchemas", async () =>
  vi.importActual("../lib/api/pluginSchemas"),
);
vi.mock("@/lib/mcp/client", () => ({
  discoverMcpServer: mocks.discoverMcpServer,
  readMcpResource: mocks.readMcpResource,
  subscribeMcpResource: mocks.subscribeMcpResource,
  unsubscribeMcpResource: mocks.unsubscribeMcpResource,
  getMcpPrompt: mocks.getMcpPrompt,
  completeMcpPromptArgument: mocks.completeMcpPromptArgument,
}));
vi.mock("@/lib/mcp/pluginRequest", () => ({
  resolveMcpPluginRequest: mocks.resolveMcpPluginRequest,
}));
vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

const plugin = {
  id: "mcp:test",
  source: "mcp",
  title: "Test MCP",
  mcp: {
    transport: "streamable-http",
    serverUrl: "https://mcp.example.com/mcp",
    serverName: "Test MCP",
    headers: { "X-Client": "neo-chat" },
  },
};

function createRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.resolveMcpPluginRequest.mockResolvedValue({
    plugin,
    authConfig: { type: "bearer", value: "secret" },
  });
});

describe("MCP Resources 路由", () => {
  it("列出资源、模板和能力并传递 Roots 与会话隔离键", async () => {
    mocks.discoverMcpServer.mockResolvedValue({
      resources: [{ uri: "file:///docs", name: "Docs" }],
      resourceTemplates: [{ uriTemplate: "file:///{name}", name: "File" }],
      capabilities: { resources: true },
    });
    const { POST } = await import("../app/api/mcp/resources/route");
    const request = createRequest("/api/mcp/resources", {
      pluginId: plugin.id,
      action: "list",
      sessionId: "chat-1",
      roots: [{ uri: "file:///workspace", name: "Workspace" }],
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.discoverMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        staticHeaders: { "X-Client": "neo-chat" },
        authConfig: { type: "bearer", value: "secret" },
        roots: [{ uri: "file:///workspace", name: "Workspace" }],
        sessionKey: "chat-1:mcp:test:resources",
      }),
    );
    await expect(response.json()).resolves.toEqual({
      resources: [{ uri: "file:///docs", name: "Docs" }],
      resourceTemplates: [{ uriTemplate: "file:///{name}", name: "File" }],
      capabilities: { resources: true },
    });
  });

  it("读取并订阅资源，缺少 URI 时返回 400", async () => {
    mocks.readMcpResource.mockResolvedValue({
      contents: [{ uri: "file:///docs", text: "hello" }],
    });
    const { POST } = await import("../app/api/mcp/resources/route");
    const readResponse = await POST(
      createRequest("/api/mcp/resources", {
        pluginId: plugin.id,
        action: "read",
        uri: "file:///docs",
      }) as never,
    );
    const subscribeResponse = await POST(
      createRequest("/api/mcp/resources", {
        pluginId: plugin.id,
        action: "subscribe",
        uri: "file:///docs",
      }) as never,
    );
    const invalidResponse = await POST(
      createRequest("/api/mcp/resources", {
        pluginId: plugin.id,
        action: "read",
      }) as never,
    );

    await expect(readResponse.json()).resolves.toEqual({
      result: { contents: [{ uri: "file:///docs", text: "hello" }] },
    });
    expect(mocks.subscribeMcpResource).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///docs" }),
    );
    expect(subscribeResponse.status).toBe(200);
    expect(invalidResponse.status).toBe(400);
  });
});

describe("MCP Prompts 路由", () => {
  it("获取 Prompt 并请求参数补全", async () => {
    mocks.getMcpPrompt.mockResolvedValue({
      messages: [{ role: "user", content: { type: "text", text: "Hi" } }],
    });
    mocks.completeMcpPromptArgument.mockResolvedValue(["react", "react-dom"]);
    const { POST } = await import("../app/api/mcp/prompts/route");
    const getResponse = await POST(
      createRequest("/api/mcp/prompts", {
        pluginId: plugin.id,
        action: "get",
        name: "explain",
        args: { topic: "react" },
        sessionId: "chat-1",
      }) as never,
    );
    const completeResponse = await POST(
      createRequest("/api/mcp/prompts", {
        pluginId: plugin.id,
        action: "complete",
        name: "explain",
        argumentName: "topic",
        value: "rea",
      }) as never,
    );

    expect(mocks.getMcpPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "explain",
        args: { topic: "react" },
        sessionKey: "chat-1:mcp:test:prompts",
      }),
    );
    await expect(getResponse.json()).resolves.toEqual({
      result: {
        messages: [{ role: "user", content: { type: "text", text: "Hi" } }],
      },
    });
    expect(mocks.completeMcpPromptArgument).toHaveBeenCalledWith(
      expect.objectContaining({
        promptName: "explain",
        argumentName: "topic",
        value: "rea",
      }),
    );
    await expect(completeResponse.json()).resolves.toEqual({
      values: ["react", "react-dom"],
    });
  });
});
