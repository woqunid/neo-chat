import { describe, expect, it } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  decryptOptionalSecretMock,
  pluginAuthSecret as secret,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

describe("plugin execute route: authentication", () => {
  it("adds API key auth to query parameters and keeps response size capped", async () => {
    decryptOptionalSecretMock.mockResolvedValue("secret-value");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({ ok: true }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          auth: { type: "apiKey", name: "token", in: "query" },
          functions: [{ name: "lookup", path: "/items/{id}", method: "GET" }],
        },
        functionDef: { name: "lookup", path: "/items/{id}", method: "GET" },
        args: { id: "abc", q: "neo" },
        authConfig: {
          type: "apiKey",
          addTo: "query",
          key: "token",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://api.example.com/items/abc?q=neo&token=secret-value",
      expect.objectContaining({ method: "GET" }),
      expect.objectContaining({ maxResponseBytes: 2 * 1024 * 1024 }),
    );
  });
});

describe("plugin execute route: authentication", () => {
  it("injects optional Jina reader bearer auth and normalizes markdown content", async () => {
    decryptOptionalSecretMock.mockResolvedValue("jina-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        code: 200,
        data: { content: "# Example\n\nReadable markdown." },
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "jina-web-reader",
        functionName: "read_webpage",
        args: { url: "https://example.com/doc" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://r.jina.ai/https%3A%2F%2Fexample.com%2Fdoc",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer jina-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(await response.json()).toEqual({
      result: "# Example\n\nReadable markdown.",
    });
  });
});

describe("plugin execute route: authentication", () => {
  it("rejects Jina reader requests for blocked nested target URLs", async () => {
    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "jina-web-reader",
        functionName: "read_webpage",
        args: { url: "http://localhost:3000/admin" },
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Jina reader URL is not allowed",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });
});
