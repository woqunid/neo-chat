import { describe, expect, it, vi } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

describe("plugin execute route: common requests", () => {
  it("rejects unresolved path parameters before outbound fetch", async () => {
    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          functions: [{ name: "lookup", path: "/items/{id}", method: "GET" }],
        },
        functionDef: { name: "lookup", path: "/items/{id}", method: "GET" },
        args: {},
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Plugin path parameters are missing",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });

  it("rejects legacy plugin payloads in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          functions: [{ name: "lookup", path: "/items/{id}", method: "GET" }],
        },
        functionDef: { name: "lookup", path: "/items/{id}", method: "GET" },
        args: { id: "abc" },
      }) as any,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Legacy plugin execution payloads are disabled in hosted mode",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });

  it("executes registered plugin functions with the new id/name payload", async () => {
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({ temp: 21 }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "weather-gpt",
        functionName: "getCurrentWeather",
        args: { location: "Shanghai" },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://weathergpt.vercel.app/api/weather?location=Shanghai",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
  });
});
