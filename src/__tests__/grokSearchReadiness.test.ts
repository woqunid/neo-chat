import { describe, expect, it } from "vitest";
import { getGrokSearchReadiness } from "../components/superadmin/grokSearchReadiness";
import type { AdminGrokSearchConfig } from "../components/superadmin/types";

function makeConfig(
  overrides: Partial<AdminGrokSearchConfig> = {},
): AdminGrokSearchConfig {
  return {
    baseUrl: "",
    apiKey: "",
    model: "",
    hasApiKey: false,
    ...overrides,
  };
}

describe("Grok search form readiness", () => {
  it("allows fetching models before a model is selected", () => {
    const readiness = getGrokSearchReadiness(
      makeConfig({
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key",
      }),
    );

    expect(readiness).toEqual({
      canFetchModels: true,
      canTestConnection: false,
    });
  });

  it("accepts a previously saved API key for fetching models", () => {
    const readiness = getGrokSearchReadiness(
      makeConfig({
        baseUrl: "https://api.example.com/v1",
        hasApiKey: true,
      }),
    );

    expect(readiness.canFetchModels).toBe(true);
  });

  it("requires a model before enabling the connection test", () => {
    const readiness = getGrokSearchReadiness(
      makeConfig({
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key",
        model: "grok-4",
      }),
    );

    expect(readiness.canTestConnection).toBe(true);
  });

  it("rejects whitespace-only URL and key values", () => {
    const readiness = getGrokSearchReadiness(
      makeConfig({ baseUrl: " ", apiKey: " ", model: "grok-4" }),
    );

    expect(readiness).toEqual({
      canFetchModels: false,
      canTestConnection: false,
    });
  });
});
