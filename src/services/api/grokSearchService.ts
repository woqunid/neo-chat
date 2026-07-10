import type { ImageSource, Source } from "@/types";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../lib/api/client";
import {
  normalizeImageSources,
  normalizeSearchSources,
} from "../../lib/search/results";
import { logDevError } from "../../lib/utils/devLogger";

export interface GrokSearchResult {
  summary: string;
  sources: Source[];
  images: ImageSource[];
}

export async function searchWithGrok(
  query: string,
  signal?: AbortSignal,
): Promise<GrokSearchResult> {
  try {
    const response = await signedApiFetch("/api/grok-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Grok web search failed"),
      );
    }
    const data = await readJsonResponseOrThrow<{
      summary?: unknown;
      sources?: Source[];
      images?: ImageSource[];
    }>(response, "Grok web search returned invalid JSON");
    if (typeof data.summary !== "string" || !data.summary.trim()) {
      throw new Error("Grok web search returned no research summary");
    }
    return {
      summary: data.summary.trim(),
      sources: normalizeSearchSources(data.sources),
      images: normalizeImageSources(data.images),
    };
  } catch (error) {
    logDevError("Grok search error:", error);
    throw error;
  }
}
