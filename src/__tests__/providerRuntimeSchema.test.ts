import { describe, expect, it } from "vitest";
import { ProviderRuntimeConfigSchema } from "../lib/api/schemas";

describe("provider runtime schema", () => {
  it("accepts supported provider types", () => {
    expect(ProviderRuntimeConfigSchema.parse({ type: "Anthropic" }).type).toBe(
      "Anthropic",
    );
    expect(ProviderRuntimeConfigSchema.parse({ type: "Gemini" }).type).toBe(
      "Gemini",
    );
    expect(ProviderRuntimeConfigSchema.parse({ type: "OpenAI" }).type).toBe(
      "OpenAI",
    );
    expect(
      ProviderRuntimeConfigSchema.parse({ type: "OpenAI Compatible" }).type,
    ).toBe("OpenAI Compatible");
  });
});
