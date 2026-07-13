import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeAdminGrokSearchConfig } from "../lib/search/grokAdmin";
import {
  clearServerGrokSearchConfigForTesting,
  getServerGrokSearchConfig,
  isGrokSearchReady,
  saveServerGrokSearchConfig,
  toPublicGrokSearchConfig,
} from "../lib/search/grokRegistry";

vi.mock("server-only", () => ({}));

const STORED_CONFIG = {
  baseUrl: "https://grok.example.com/v1",
  apiKey: "stored-secret",
  model: "grok-4",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

describe("Grok search registry", () => {
  beforeEach(() => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("MODEL_PROVIDER_STORE", "memory");
    clearServerGrokSearchConfigForTesting();
  });

  afterEach(() => {
    clearServerGrokSearchConfigForTesting();
    vi.unstubAllEnvs();
  });

  it("persists normalized configuration and hides the API key", async () => {
    const saved = await saveServerGrokSearchConfig({
      ...STORED_CONFIG,
      baseUrl: ` ${STORED_CONFIG.baseUrl} `,
      apiKey: ` ${STORED_CONFIG.apiKey} `,
      model: ` ${STORED_CONFIG.model} `,
    });

    expect(saved).toEqual(STORED_CONFIG);
    expect(await getServerGrokSearchConfig()).toEqual(STORED_CONFIG);
    expect(isGrokSearchReady(saved)).toBe(true);
    expect(toPublicGrokSearchConfig(saved)).toEqual({
      baseUrl: STORED_CONFIG.baseUrl,
      model: STORED_CONFIG.model,
      hasApiKey: true,
      updatedAt: STORED_CONFIG.updatedAt,
    });
  });

  it("keeps the stored API key when an admin update leaves it blank", () => {
    const merged = mergeAdminGrokSearchConfig(
      {
        baseUrl: "https://proxy.example.com/v1",
        model: "grok-4-fast",
      },
      STORED_CONFIG,
    );

    expect(merged.apiKey).toBe("stored-secret");
    expect(merged.baseUrl).toBe("https://proxy.example.com/v1");
    expect(merged.model).toBe("grok-4-fast");
  });

  it("does not mark incomplete configuration as ready", () => {
    expect(isGrokSearchReady({ ...STORED_CONFIG, apiKey: "" })).toBe(false);
    expect(isGrokSearchReady(null)).toBe(false);
  });

  it("activates legacy configuration regardless of its enabled flag", async () => {
    const legacyConfig = {
      ...STORED_CONFIG,
      enabled: false,
    };
    globalThis.__neoChatGrokSearchConfig = legacyConfig;

    const config = await getServerGrokSearchConfig();

    expect(config).toEqual(STORED_CONFIG);
    expect(isGrokSearchReady(config)).toBe(true);
  });
});
