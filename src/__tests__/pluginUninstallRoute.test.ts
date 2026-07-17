import { beforeEach, describe, expect, it, vi } from "vitest";

const unregisterServerPluginMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/plugin/serverRegistry", () => ({
  unregisterServerPlugin: unregisterServerPluginMock,
}));
vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/plugins/uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  unregisterServerPluginMock.mockReset();
});

describe("插件卸载路由", () => {
  it("删除服务端插件注册记录", async () => {
    const { POST } = await import("../app/api/plugins/uninstall/route");
    const response = await POST(
      createRequest({ pluginId: "mcp:test" }) as never,
    );

    expect(response.status).toBe(200);
    expect(unregisterServerPluginMock).toHaveBeenCalledWith("mcp:test");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("拒绝空插件标识", async () => {
    const { POST } = await import("../app/api/plugins/uninstall/route");
    const response = await POST(createRequest({ pluginId: "" }) as never);

    expect(response.status).toBe(400);
    expect(unregisterServerPluginMock).not.toHaveBeenCalled();
  });
});
