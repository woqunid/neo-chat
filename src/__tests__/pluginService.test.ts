import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanupPluginServiceTestState,
  getFetchCalls,
  jsonResponse,
  pluginA,
  pluginB,
  resetPluginServiceTestState,
  storeMock,
} from "./pluginServiceTestUtils";

const FRESH_CACHE_AGE_HOURS = 48;
const EXPIRED_CACHE_AGE_HOURS = 73;
const HOUR_MS = 60 * 60 * 1000;

beforeEach(resetPluginServiceTestState);
afterEach(cleanupPluginServiceTestState);

it("returns valid cached OpenAPI plugins without fetching", async () => {
  storeMock.state.marketPlugins = [pluginA];
  storeMock.state.marketPluginsTimestamp = Date.now();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { fetchApiGuruList } = await import("../services/api/pluginService");
  const plugins = await fetchApiGuruList();

  expect(plugins).toEqual([expect.objectContaining(pluginA)]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps OpenAPI plugins cached for 72 hours", async () => {
  storeMock.state.marketPlugins = [pluginA];
  storeMock.state.marketPluginsTimestamp =
    Date.now() - FRESH_CACHE_AGE_HOURS * HOUR_MS;
  const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
  vi.stubGlobal("fetch", fetchMock);

  const { fetchApiGuruList } = await import("../services/api/pluginService");
  const plugins = await fetchApiGuruList();

  expect(plugins).toEqual([expect.objectContaining(pluginA)]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refreshes OpenAPI plugins after 72 hours", async () => {
  storeMock.state.marketPlugins = [pluginA];
  storeMock.state.marketPluginsTimestamp =
    Date.now() - EXPIRED_CACHE_AGE_HOURS * HOUR_MS;
  const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
  vi.stubGlobal("fetch", fetchMock);

  const { fetchApiGuruList } = await import("../services/api/pluginService");
  const plugins = await fetchApiGuruList();

  expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/list");
  expect(plugins).toEqual([expect.objectContaining(pluginB)]);
});

it("force refresh bypasses OpenAPI cache and stores plugins", async () => {
  storeMock.state.marketPlugins = [pluginA];
  storeMock.state.marketPluginsTimestamp = Date.now();
  const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
  vi.stubGlobal("fetch", fetchMock);

  const { fetchApiGuruList } = await import("../services/api/pluginService");
  const plugins = await fetchApiGuruList(true);

  expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/list");
  expect(plugins).toEqual([expect.objectContaining(pluginB)]);
  expect(storeMock.state.setMarketPlugins).toHaveBeenCalledWith([
    expect.objectContaining(pluginB),
  ]);
});

it("uses stale OpenAPI cache when refreshing fails", async () => {
  storeMock.state.marketPlugins = [pluginA];
  storeMock.state.marketPluginsTimestamp =
    Date.now() - EXPIRED_CACHE_AGE_HOURS * HOUR_MS;
  const fetchMock = vi.fn(async () =>
    jsonResponse({ error: "failed" }, { status: 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { fetchApiGuruList } = await import("../services/api/pluginService");
  const plugins = await fetchApiGuruList();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(plugins).toEqual([expect.objectContaining(pluginA)]);
});

it("reuses an in-flight OpenAPI plugin list request", async () => {
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { fetchApiGuruList } = await import("../services/api/pluginService");
  const first = fetchApiGuruList();
  const second = fetchApiGuruList();
  resolveFetch?.(jsonResponse({ plugins: [pluginA] }));

  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(first).resolves.toEqual([expect.objectContaining(pluginA)]);
  await expect(second).resolves.toEqual([expect.objectContaining(pluginA)]);
});
