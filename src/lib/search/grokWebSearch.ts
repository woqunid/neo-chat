import type { GrokSearchResult, Source } from "../../types";
import { ProviderError } from "../errors";
import { normalizeSearchSources } from "./results";

export type { GrokSearchResult } from "./types";

export type GrokResponseRequester = (
  request: Record<string, unknown>,
) => Promise<unknown>;

interface GrokWebSearchOptions {
  query: string;
  model: string;
  request: GrokResponseRequester;
}

interface CitationCandidate {
  url: string;
  label?: string;
  startIndex?: number;
  endIndex?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return "";
      const content = Array.isArray(record.content) ? record.content : [];
      return content
        .map((part) => {
          const partRecord = asRecord(part);
          return typeof partRecord?.text === "string" ? partRecord.text : "";
        })
        .join("");
    })
    .join("");
}

function collectAnnotationCitations(output: unknown): CitationCandidate[] {
  if (!Array.isArray(output)) return [];
  const citations: CitationCandidate[] = [];
  for (const item of output) {
    const content = asRecord(item)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const annotations = asRecord(part)?.annotations;
      if (!Array.isArray(annotations)) continue;
      for (const annotation of annotations) {
        const record = asRecord(annotation);
        if (record?.type === "url_citation" && typeof record.url === "string") {
          citations.push({
            url: record.url,
            ...(typeof record.title === "string"
              ? { label: record.title }
              : {}),
            ...(typeof record.start_index === "number"
              ? { startIndex: record.start_index }
              : {}),
            ...(typeof record.end_index === "number"
              ? { endIndex: record.end_index }
              : {}),
          });
        }
      }
    }
  }
  return citations;
}

function collectRootCitations(value: unknown): CitationCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((citation) => {
    if (typeof citation === "string") return [{ url: citation }];
    const url = asRecord(citation)?.url;
    return typeof url === "string" ? [{ url }] : [];
  });
}

function collectInlineCitations(text: string): CitationCandidate[] {
  return Array.from(
    text.matchAll(/(?:\[\[(\d+)\]\]|\[(\d+)\])\((https?:\/\/[^\s)]+)\)/g),
  ).map((match) => ({
    url: match[3],
    label: match[1] || match[2],
  }));
}

function sourceTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Grok citation";
  }
}

function citationMetadata(
  citation: CitationCandidate,
): Record<string, unknown> {
  return {
    provider: "grok",
    ...(citation.label ? { citationLabel: citation.label } : {}),
    ...(citation.startIndex !== undefined
      ? { citationStartIndex: citation.startIndex }
      : {}),
    ...(citation.endIndex !== undefined
      ? { citationEndIndex: citation.endIndex }
      : {}),
  };
}

function buildSources(citations: CitationCandidate[]): Source[] {
  const seen = new Set<string>();
  const rawSources = citations.flatMap((citation) => {
    const normalizedUrl = citation.url.trim();
    if (!normalizedUrl || seen.has(normalizedUrl)) return [];
    seen.add(normalizedUrl);
    return [
      {
        title: sourceTitle(normalizedUrl),
        url: normalizedUrl,
        content: "Encountered by the configured Grok web search model.",
        metadata: citationMetadata(citation),
      },
    ];
  });
  return normalizeSearchSources(rawSources);
}

export function parseGrokSearchResponse(response: unknown): GrokSearchResult {
  const record = asRecord(response);
  const summary = (
    typeof record?.output_text === "string"
      ? record.output_text
      : extractText(record?.output)
  ).trim();
  if (!summary) {
    throw new ProviderError("Grok search returned no research summary", "Grok");
  }

  const citations = [
    ...collectAnnotationCitations(record?.output),
    ...collectInlineCitations(summary),
    ...collectRootCitations(record?.citations),
  ];
  const sources = buildSources(citations);
  if (sources.length === 0) {
    throw new ProviderError("Grok search returned no web citations", "Grok");
  }
  return { summary, sources, images: [] };
}

function buildSearchPrompt(query: string): string {
  return [
    "Search the live web for the request below.",
    "Return a concise factual research brief with inline citations for web-backed claims.",
    "Do not answer from memory when current web evidence is unavailable.",
    "",
    query.trim(),
  ].join("\n");
}

export async function runGrokWebSearch({
  query,
  model,
  request,
}: GrokWebSearchOptions): Promise<GrokSearchResult> {
  const response = await request({
    model,
    input: [{ role: "user", content: buildSearchPrompt(query) }],
    tools: [{ type: "web_search" }],
  });
  return parseGrokSearchResponse(response);
}
