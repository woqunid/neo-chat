import { afterEach, beforeEach, vi } from "vitest";

export const safeFetchTextMock = vi.fn();
export const decryptOptionalSecretMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../../lib/api/middleware"),
);

vi.mock("@/lib/api/schemas", async () =>
  vi.importActual("../../lib/api/schemas"),
);

vi.mock("@/lib/byok/shared", async () =>
  vi.importActual("../../lib/byok/shared"),
);

vi.mock("@/lib/plugin/manifest", async () =>
  vi.importActual("../../lib/plugin/manifest"),
);

vi.mock("@/lib/plugin/config", async () =>
  vi.importActual("../../lib/plugin/config"),
);

vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../../lib/security/urlPolicy"),
);

vi.mock("@/lib/security/deployment", async () =>
  vi.importActual("../../lib/security/deployment"),
);

vi.mock("@/lib/utils/safeServerLog", async () =>
  vi.importActual("../../lib/utils/safeServerLog"),
);

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchText: safeFetchTextMock,
}));

vi.mock("../../lib/byok/server", () => ({
  decryptOptionalSecret: decryptOptionalSecretMock,
}));

export const pluginAuthSecret = {
  v: 1,
  kid: "kid",
  alg: "RSA-OAEP-256+A256GCM",
  iv: "iv",
  wrappedKey: "wrapped",
  ciphertext: "ciphertext",
  context: "plugin:test-plugin:auth",
} as const;

export function createPluginExecuteRequest(body: unknown): Request {
  return new Request("http://localhost/api/plugins/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function mockPluginJsonResponse(data: unknown): void {
  safeFetchTextMock.mockResolvedValue({
    response: new Response(null, { status: 200 }),
    text: JSON.stringify(data),
  });
}

export async function executePluginRequest(body: unknown): Promise<Response> {
  const { POST } = await import("../../app/api/plugins/execute/route");
  return POST(createPluginExecuteRequest(body) as any);
}

export function readLastPluginRequestBody<T>(): T {
  return JSON.parse(
    safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string,
  ) as T;
}

export function setupPluginExecuteRouteTests(): void {
  beforeEach(() => {
    safeFetchTextMock.mockReset();
    decryptOptionalSecretMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
}
