import { RAG_LIMITS } from "../../config/limits";
import type { DocumentParseProvider, RAGConfig } from "../../types";
import { isLocalEncryptedSecretEnvelope } from "../security/localSecrets";

const DEFAULT_RAG_TOP_K = 10;
const DEFAULT_RAG_CHUNK_SIZE = 512;
const DEFAULT_DOCUMENT_PARSE_PROVIDER: DocumentParseProvider = "mineru";

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function trimToLimit(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function isDocumentParseProvider(
  provider: unknown,
): provider is DocumentParseProvider {
  return provider === "mineru" || provider === "llamaParse";
}

export function normalizeDocumentParseProvider(
  provider: unknown,
): DocumentParseProvider {
  return isDocumentParseProvider(provider)
    ? provider
    : DEFAULT_DOCUMENT_PARSE_PROVIDER;
}

export function normalizeRAGConfig(config: unknown): RAGConfig {
  const raw =
    config && typeof config === "object" ? (config as Partial<RAGConfig>) : {};
  const namespace = trimToLimit(raw.namespace, RAG_LIMITS.maxNamespaceChars);

  return {
    enabled: raw.enabled === true,
    url: trimToLimit(raw.url, RAG_LIMITS.maxBaseUrlChars),
    token: trimToLimit(raw.token, RAG_LIMITS.maxTokenChars),
    ...(isLocalEncryptedSecretEnvelope(raw.tokenSecret)
      ? { tokenSecret: raw.tokenSecret }
      : {}),
    topK: clampInteger(
      raw.topK,
      RAG_LIMITS.minTopK,
      RAG_LIMITS.maxTopK,
      DEFAULT_RAG_TOP_K,
    ),
    chunkSize: clampInteger(
      raw.chunkSize,
      RAG_LIMITS.minChunkSize,
      RAG_LIMITS.maxChunkSize,
      DEFAULT_RAG_CHUNK_SIZE,
    ),
    documentParseProvider: normalizeDocumentParseProvider(
      raw.documentParseProvider,
    ),
    mineruApiToken: trimToLimit(
      raw.mineruApiToken,
      RAG_LIMITS.maxMineruApiTokenChars,
    ),
    ...(isLocalEncryptedSecretEnvelope(raw.mineruApiTokenSecret)
      ? { mineruApiTokenSecret: raw.mineruApiTokenSecret }
      : {}),
    llamaParseApiKey: trimToLimit(
      raw.llamaParseApiKey,
      RAG_LIMITS.maxLlamaParseApiKeyChars,
    ),
    ...(isLocalEncryptedSecretEnvelope(raw.llamaParseApiKeySecret)
      ? { llamaParseApiKeySecret: raw.llamaParseApiKeySecret }
      : {}),
    ...(namespace ? { namespace } : {}),
    ...(raw.useDefaultVectorStore !== undefined
      ? { useDefaultVectorStore: raw.useDefaultVectorStore === true }
      : {}),
    ...(raw.useDefaultDocumentProcessing !== undefined
      ? {
          useDefaultDocumentProcessing:
            raw.useDefaultDocumentProcessing === true,
        }
      : {}),
    ...(raw.serverVectorStoreAvailable !== undefined
      ? { serverVectorStoreAvailable: raw.serverVectorStoreAvailable === true }
      : {}),
    ...(raw.serverDocumentProcessingAvailable !== undefined
      ? {
          serverDocumentProcessingAvailable:
            raw.serverDocumentProcessingAvailable === true,
        }
      : {}),
  };
}
