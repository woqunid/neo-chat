import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanupPluginServiceTestState,
  getFetchCalls,
  jsonResponse,
  mcpPlugin,
  pluginA,
  resetPluginServiceTestState,
  storeMock,
} from "./pluginServiceTestUtils";

beforeEach(resetPluginServiceTestState);
afterEach(cleanupPluginServiceTestState);

it("caches MCP servers separately from OpenAPI plugins", async () => {
  storeMock.state.marketPlugins = [pluginA];
  storeMock.state.marketPluginsTimestamp = Date.now();
  const fetchMock = vi.fn(async () => jsonResponse({ plugins: [mcpPlugin] }));
  vi.stubGlobal("fetch", fetchMock);

  const { fetchMcpServerList, fetchApiGuruList } =
    await import("../services/api/pluginService");
  const mcpServers = await fetchMcpServerList(true);
  const openApiPlugins = await fetchApiGuruList();

  const requestUrl = new URL(
    String(getFetchCalls(fetchMock)[0]?.[0]),
    "http://localhost",
  );
  expect(requestUrl.pathname).toBe("/api/mcp/servers");
  expect(mcpServers).toEqual([expect.objectContaining(mcpPlugin)]);
  expect(openApiPlugins).toEqual([expect.objectContaining(pluginA)]);
  expect(storeMock.state.setMarketMcpServers).toHaveBeenCalledWith([
    expect.objectContaining({ id: mcpPlugin.id, source: "mcp" }),
  ]);
});

it("fetches paged MCP servers from the MCP server route", async () => {
  const fetchMock = vi.fn(async () =>
    jsonResponse({ plugins: [mcpPlugin], nextCursor: "next-cursor" }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { fetchMcpServerPage } = await import("../services/api/pluginService");
  const page = await fetchMcpServerPage({
    cursor: "start-cursor",
    search: "context",
    limit: 1,
  });

  const requestUrl = new URL(
    String(getFetchCalls(fetchMock)[0]?.[0]),
    "http://localhost",
  );
  expect(requestUrl.pathname).toBe("/api/mcp/servers");
  expect(requestUrl.searchParams.get("cursor")).toBe("start-cursor");
  expect(requestUrl.searchParams.get("search")).toBe("context");
  expect(requestUrl.searchParams.get("limit")).toBe("1");
  expect(page).toEqual({
    plugins: [expect.objectContaining(mcpPlugin)],
    nextCursor: "next-cursor",
  });
  expect(storeMock.state.setMarketMcpServers).not.toHaveBeenCalled();
});

it("falls back from the route to direct registry fetching", async () => {
  const fetchMock = createRegistryFallbackFetchMock();
  vi.stubGlobal("fetch", fetchMock);

  const { fetchMcpServerPage } = await import("../services/api/pluginService");
  const page = await fetchMcpServerPage({
    cursor: "start-cursor",
    search: "context",
    limit: 1,
  });

  const routeUrl = new URL(
    String(getFetchCalls(fetchMock)[0]?.[0]),
    "http://localhost",
  );
  const registryUrl = new URL(String(getFetchCalls(fetchMock)[1]?.[0]));
  expect(routeUrl.pathname).toBe("/api/mcp/servers");
  expect(routeUrl.searchParams.get("cursor")).toBe("start-cursor");
  expect(routeUrl.searchParams.get("search")).toBe("context");
  expect(routeUrl.searchParams.get("limit")).toBe("1");
  expect(registryUrl.origin).toBe("https://registry.modelcontextprotocol.io");
  expect(page).toEqual({
    plugins: [
      expect.objectContaining({
        id: mcpPlugin.id,
        title: mcpPlugin.title,
        source: "mcp",
        mcp: expect.objectContaining({
          serverUrl: mcpPlugin.mcp?.serverUrl,
          serverName: mcpPlugin.mcp?.serverName,
        }),
      }),
    ],
    nextCursor: "next-cursor",
  });
  expect(storeMock.state.setMarketMcpServers).not.toHaveBeenCalled();
});

function createRegistryFallbackFetchMock() {
  const fetchMock = vi.fn(async () =>
    fetchMock.mock.calls.length === 1
      ? jsonResponse({ error: "registry unavailable" }, { status: 503 })
      : jsonResponse({
          servers: [
            {
              name: "io.github/context7",
              version: "1.2.3",
              description: "Context-aware docs lookup.",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://mcp.example.com/mcp",
                },
              ],
            },
          ],
          metadata: { nextCursor: "next-cursor" },
        }),
  );
  return fetchMock;
}
