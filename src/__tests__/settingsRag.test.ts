import { describe, expect, it } from "vitest";
import { RAG_LIMITS } from "../config/limits";
import { normalizeRAGConfig } from "../lib/settings/rag";

describe("RAG settings normalization", () => {
  it("normalizes credentials, namespace, and numeric ranges", () => {
    const rag = normalizeRAGConfig({
      enabled: "true",
      url: ` https://rag.example/${"u".repeat(RAG_LIMITS.maxBaseUrlChars)}`,
      token: ` ${"t".repeat(RAG_LIMITS.maxTokenChars + 10)}`,
      topK: 500,
      chunkSize: 1,
      llamaParseApiKey: " llama-key ",
      namespace: ` ns-${"x".repeat(RAG_LIMITS.maxNamespaceChars)}`,
    });

    expect(rag.enabled).toBe(false);
    expect(rag.url).toHaveLength(RAG_LIMITS.maxBaseUrlChars);
    expect(rag.token).toHaveLength(RAG_LIMITS.maxTokenChars);
    expect(rag.topK).toBe(RAG_LIMITS.maxTopK);
    expect(rag.chunkSize).toBe(RAG_LIMITS.minChunkSize);
    expect(rag.documentParseProvider).toBe("mineru");
    expect(rag.llamaParseApiKey).toBe("llama-key");
    expect(rag.mineruApiToken).toBe("");
    expect(rag.namespace).toHaveLength(RAG_LIMITS.maxNamespaceChars);
  });

  it("uses stable defaults for malformed values", () => {
    const rag = normalizeRAGConfig({
      enabled: true,
      topK: Number.NaN,
      chunkSize: "nope",
      namespace: "",
    });

    expect(rag.enabled).toBe(true);
    expect(rag.topK).toBe(10);
    expect(rag.chunkSize).toBe(512);
    expect(rag.documentParseProvider).toBe("mineru");
    expect(rag.namespace).toBeUndefined();
  });

  it("normalizes document parser provider and Mineru token", () => {
    const rag = normalizeRAGConfig({
      documentParseProvider: "llamaParse",
      mineruApiToken: " mineru-token ",
    });

    expect(rag.documentParseProvider).toBe("llamaParse");
    expect(rag.mineruApiToken).toBe("mineru-token");
  });
});
