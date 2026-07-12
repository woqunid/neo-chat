import "server-only";

import { ApiError, ProviderError } from "../errors";
import { ProviderFactory } from "../providers/base";
import { getGrokSearchTimeoutMs } from "../providers/requestTimeout";
import type { ServerGrokSearchConfig } from "./grokRegistry";
import type { GrokSearchResult } from "./types";
import { runGrokWebSearch } from "./grokWebSearch";

function assertConnectionConfig(config: ServerGrokSearchConfig): void {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new ApiError(
      "Grok web search requires a Base URL, API key, and model",
      { statusCode: 400, code: "GROK_SEARCH_CONFIG_INCOMPLETE" },
    );
  }
}

function upstreamErrorDetails(error: unknown): {
  message: string;
  status?: number;
} {
  if (!(error instanceof Error)) return { message: String(error) };
  const record = error as Error & { status?: unknown; statusCode?: unknown };
  const statusValue = record.status ?? record.statusCode;
  return {
    message: error.message,
    ...(typeof statusValue === "number" ? { status: statusValue } : {}),
  };
}

export async function runGrokSearchWithConfig(
  query: string,
  config: ServerGrokSearchConfig,
  signal?: AbortSignal,
): Promise<GrokSearchResult> {
  signal?.throwIfAborted();
  assertConnectionConfig(config);
  const provider = {
    type: "OpenAI" as const,
    name: "Grok Web Search",
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  };
  await ProviderFactory.assertProviderOutboundAllowed(provider);
  signal?.throwIfAborted();
  const client = ProviderFactory.createOpenAIClient(provider);
  const timeout = getGrokSearchTimeoutMs();

  try {
    return await runGrokWebSearch({
      query,
      model: config.model,
      request: (params) =>
        client.responses.create(params as never, {
          maxRetries: 0,
          ...(timeout > 0 ? { timeout } : {}),
          ...(signal ? { signal } : {}),
        }),
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error;
    }
    if (error instanceof ApiError) throw error;
    const details = upstreamErrorDetails(error);
    throw new ProviderError(
      `Grok web search failed: ${details.message}`,
      "Grok",
      details,
    );
  }
}
