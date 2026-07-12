import type { Plugin } from "@/types";

export const ITEMS_PER_PAGE = 20;
export const CUSTOM_PLUGIN_INPUT_MAX_CHARS = 2_000_000;

export const ENDPOINT_PLACEHOLDERS: Record<string, string> = {
  "openai-image-generation": "https://api.example.com/v1",
  "gemini-image-generation": "https://generativelanguage.googleapis.com",
  "openai-responses-image-processing": "https://api.openai.com/v1",
};

export const ENDPOINT_CONFIG_PLUGIN_IDS = new Set(
  Object.keys(ENDPOINT_PLACEHOLDERS),
);

export const MODEL_PLACEHOLDERS: Record<string, string> = {
  "agnes-image-generation": "agnes-image-2.1-flash",
  "agnes-video-generation": "agnes-video-v2.0",
  "gemini-image-generation": "gemini-3.1-flash-image",
  "openai-image-generation": "gpt-image-1",
  "openai-responses-image-processing": "gpt-image-1.5",
};

export const MODEL_CONFIG_PLUGIN_IDS = new Set(Object.keys(MODEL_PLACEHOLDERS));

export function getEndpointPlaceholder(
  pluginId: string,
  fallback: string,
): string {
  return ENDPOINT_PLACEHOLDERS[pluginId] || fallback;
}

export function getModelPlaceholder(
  pluginId: string,
  fallback: string,
): string {
  return MODEL_PLACEHOLDERS[pluginId] || fallback;
}

export function formatCategoryName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatToolName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getCategories(plugins: Plugin[]): string[] {
  const categories = new Set<string>();
  for (const plugin of plugins) {
    for (const category of plugin.categories || []) categories.add(category);
    if (!plugin.categories?.length && plugin.category) {
      categories.add(plugin.category);
    }
  }
  return Array.from(categories).sort();
}

export function matchesPluginSearch(plugin: Plugin, search: string): boolean {
  const query = search.toLowerCase();
  return (
    plugin.title.toLowerCase().includes(query) ||
    plugin.description.toLowerCase().includes(query)
  );
}

export function matchesCategories(plugin: Plugin, selected: string[]): boolean {
  if (!selected.length) return true;
  return selected.some(
    (category) =>
      plugin.categories?.includes(category) || plugin.category === category,
  );
}

export function sortPluginsByAdded(plugins: Plugin[]): Plugin[] {
  return [...plugins].sort((left, right) => {
    const leftTime = left.added ? new Date(left.added).getTime() : 0;
    const rightTime = right.added ? new Date(right.added).getTime() : 0;
    return rightTime - leftTime;
  });
}
