import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  grokConfig: null as null | {
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    updatedAt: string;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/search/grokRegistry", () => ({
  getServerGrokSearchConfig: vi.fn(async () => mocks.grokConfig),
  isGrokSearchReady: vi.fn((config) =>
    Boolean(config?.enabled && config.baseUrl && config.apiKey && config.model),
  ),
}));

describe("service health status", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mocks.grokConfig = null;
  });

  it("publishes non-sensitive hosted health status", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("ACCESS_PASSWORD", "access-secret");
    vi.stubEnv("BYOK_PRIVATE_KEY_PEM", "private-key-secret");
    vi.stubEnv("RATE_LIMIT_STORE", "upstash");
    vi.stubEnv("DOCUMENT_PARSE_JOB_STORE", "upstash");
    vi.stubEnv("PLUGIN_REGISTRY_STORE", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.internal");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-secret");
    vi.stubEnv("DEFAULT_PROVIDER_API_KEY", "provider-secret");
    vi.stubEnv("DEFAULT_RAG_BASE_URL", "https://rag.internal");
    vi.stubEnv("DEFAULT_RAG_TOKEN", "rag-secret");
    vi.stubEnv("DEFAULT_DOCUMENT_PARSE_PROVIDER", "mineru");
    vi.stubEnv("DEFAULT_MINERU_API_TOKEN", "mineru-secret");
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    vi.stubEnv("DEFAULT_VOICE_PROVIDER", "elevenlabs");
    vi.stubEnv("DEFAULT_ELEVENLABS_API_KEY", "voice-secret");
    vi.stubEnv("DEFAULT_ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5");
    mocks.grokConfig = {
      baseUrl: "https://grok.internal/v1",
      apiKey: "grok-secret",
      model: "grok-4",
      enabled: true,
      updatedAt: "2026-07-10T00:00:00.000Z",
    };

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });
    const serialized = JSON.stringify(health);

    expect(health.deploymentMode).toBe("hosted");
    expect(health.services.byok.status).toBe("available");
    expect(health.services.apiProof.status).toBe("available");
    expect(health.services.rateLimitStore.status).toBe("available");
    expect(health.services.pluginRegistry.status).toBe("available");
    expect(health.services.defaultModel.status).toBe("available");
    expect(health.services.search.status).toBe("available");
    expect(health.services.rag.status).toBe("available");
    expect(health.services.voice.status).toBe("available");
    for (const secret of [
      "access-secret",
      "private-key-secret",
      "redis-secret",
      "redis.internal",
      "provider-secret",
      "grok-secret",
      "grok.internal",
      "rag-secret",
      "mineru-secret",
      "llama-secret",
      "voice-secret",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("does not mark voice configured when the default voice provider is unset", async () => {
    vi.stubEnv("DEFAULT_ELEVENLABS_API_KEY", "voice-secret");
    vi.stubEnv("DEFAULT_ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.voice).toMatchObject({
      status: "unconfigured",
      code: "VOICE_UNCONFIGURED",
    });
  });

  it("marks Mineru no-token document parsing as available by default", async () => {
    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.rag).toMatchObject({
      status: "available",
      code: "RAG_CONFIGURED",
    });
  });

  it("marks hosted missing shared stores as policy blocked", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("RATE_LIMIT_STORE", "memory");
    vi.stubEnv("DOCUMENT_PARSE_JOB_STORE", "memory");
    vi.stubEnv("PLUGIN_REGISTRY_STORE", "memory");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.rateLimitStore).toMatchObject({
      status: "policy_blocked",
      code: "SHARED_STORE_REQUIRED",
    });
    expect(health.services.pluginRegistry).toMatchObject({
      status: "policy_blocked",
      code: "SHARED_STORE_REQUIRED",
    });
  });

  it("marks public deployments left in local mode as policy blocked", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://chat.example.com");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.hostedMode).toMatchObject({
      status: "policy_blocked",
      code: "PUBLIC_LOCAL_MODE",
    });
  });

  it("keeps localhost local mode marked as local only", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.hostedMode).toMatchObject({
      status: "local_only",
      code: "LOCAL_MODE",
    });
  });

  it("marks hosted API request proof as missing when BYOK is not configured", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("BYOK_PRIVATE_KEY_PEM", "");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = await getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.apiProof).toMatchObject({
      status: "missing_key",
      code: "API_PROOF_BYOK_MISSING",
    });
  });
});
