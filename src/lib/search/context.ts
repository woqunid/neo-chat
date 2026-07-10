import type { ImageSource, Source } from "../../types";

interface SearchContextInput {
  summary?: string;
  sources?: Source[];
  images?: ImageSource[];
}

function formatSources(sources: Source[], includeContent: boolean): string {
  return sources
    .map((source, index) => {
      const lines = [
        `[${index + 1}]`,
        `Title: ${source.title}`,
        `URL: ${source.url}`,
      ];
      if (includeContent) lines.push(`Content:\n${source.content}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatImages(images: ImageSource[]): string {
  return images
    .map((image, index) => {
      const description = image.description || `Search image ${index + 1}`;
      return `[image ${index + 1}]\nDescription: ${description}\nURL: ${image.url}\nMarkdown: ![${description}](${image.url})`;
    })
    .join("\n\n");
}

export function buildSearchContextForPrompt(input: SearchContextInput): string {
  const summary = input.summary?.trim() || "";
  const sources = input.sources || [];
  const images = input.images || [];
  if (!summary && sources.length === 0 && images.length === 0) return "";

  const sourceContext = formatSources(sources, !summary);
  const imageContext = formatImages(images);
  return [
    "--- Grok Web Research ---",
    "Use this live web research as external context. Cite sources as [1], [2], and so on.",
    summary ? "Research brief:" : "",
    summary,
    sourceContext ? "Sources:" : "",
    sourceContext,
    imageContext ? "Images:" : "",
    imageContext,
    "--- End Grok Web Research ---",
  ]
    .filter(Boolean)
    .join("\n");
}
