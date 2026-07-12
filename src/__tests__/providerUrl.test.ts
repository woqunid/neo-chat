import { afterEach, describe, expect, it } from "vitest";
import {
  getProviderApiKey,
  getProviderModelsUrl,
  normalizeProviderBaseUrl,
} from "../lib/security/providerUrl";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("provider runtime URL helpers", () => {
  it("normalizes OpenAI-compatible base URLs without duplicating /v1", () => {
    expect(normalizeProviderBaseUrl("https://api.example.com", "OpenAI")).toBe(
      "https://api.example.com/v1",
    );
    expect(
      normalizeProviderBaseUrl("https://api.example.com/v1/", "OpenAI"),
    ).toBe("https://api.example.com/v1");
  });

  it("normalizes OpenAI Compatible base URLs like OpenAI", () => {
    expect(
      normalizeProviderBaseUrl(
        "https://compat.example.com",
        "OpenAI Compatible",
      ),
    ).toBe("https://compat.example.com/v1");
  });

  it("normalizes Anthropic base URLs and model endpoint", () => {
    expect(normalizeProviderBaseUrl("", "Anthropic")).toBe(
      "https://api.anthropic.com/v1",
    );
    expect(
      normalizeProviderBaseUrl("https://api.anthropic.com", "Anthropic"),
    ).toBe("https://api.anthropic.com/v1");
    expect(getProviderModelsUrl("", "Anthropic")).toBe(
      "https://api.anthropic.com/v1/models",
    );
  });

  it("keeps Gemini SDK base URL at the service root", () => {
    const baseUrl = "https://generativelanguage.googleapis.com";
    expect(normalizeProviderBaseUrl(`${baseUrl}/v1beta`, "Gemini")).toBe(
      baseUrl,
    );
    expect(getProviderModelsUrl(baseUrl, "Gemini")).toBe(
      `${baseUrl}/v1beta/models`,
    );
  });

  it("does not use legacy provider environment variables as API key fallbacks", () => {
    process.env.GEMINI_API_KEY = "gemini-env-secret";
    process.env.API_KEY = "api-env-secret";
    process.env.OPENAI_API_KEY = "openai-env-secret";

    expect(getProviderApiKey({ type: "Gemini" })).toBe("");
    expect(getProviderApiKey({ type: "Anthropic" })).toBe("");
    expect(getProviderApiKey({ type: "OpenAI" })).toBe("");
    expect(getProviderApiKey({ type: "OpenAI Compatible" })).toBe("");
  });
});
