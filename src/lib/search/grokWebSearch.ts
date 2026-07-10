import type { Source } from "../../types";
import { ProviderError } from "../errors";
import { normalizeSearchSources } from "./results";

export interface GrokSearchResult {
  summary: string;
  sources: Source[];
  images: [];
}

export type GrokResponseRequester = (
  request: Record<string, unknown>,
) => Promise<unknown>;

interface GrokWebSearchOptions {
  query: string;
  model: string;
  request: GrokResponseRequester;
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

function collectAnnotationUrls(output: unknown): string[] {
  if (!Array.isArray(output)) return [];
  const urls: string[] = [];
  for (const item of output) {
    const content = asRecord(item)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const annotations = asRecord(part)?.annotations;
      if (!Array.isArray(annotations)) continue;
      for (const annotation of annotations) {
        const record = asRecord(annotation);
        if (record?.type === "url_citation" && typeof record.url === "string") {
          urls.push(record.url);
        }
      }
    }
  }
  return urls;
}

function collectRootCitationUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((citation) => {
    if (typeof citation === "string") return [citation];
    const url = asRecord(citation)?.url;
    return typeof url === "string" ? [url] : [];
  });
}

function collectInlineCitationUrls(text: string): string[] {
  return Array.from(
    text.matchAll(/(?:\[\[\d+\]\]|\[\d+\])\((https?:\/\/[^\s)]+)\)/g),
  ).map((match) => match[1]);
}

function sourceTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Grok citation";
  }
}

function buildSources(urls: string[]): Source[] {
  const seen = new Set<string>();
  const rawSources = urls.flatMap((url) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl || seen.has(normalizedUrl)) return [];
    seen.add(normalizedUrl);
    return [
      {
        title: sourceTitle(normalizedUrl),
        url: normalizedUrl,
        content: "Referenced by the configured Grok web search model.",
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

  const urls = [
    ...collectRootCitationUrls(record?.citations),
    ...collectAnnotationUrls(record?.output),
    ...collectInlineCitationUrls(summary),
  ];
  const sources = buildSources(urls);
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
