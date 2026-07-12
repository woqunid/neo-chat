import { MARKET_LIMITS } from "../../config/limits";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function trimString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

export function normalizePluginCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const categories: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const category = trimString(item, MARKET_LIMITS.maxPluginCategoryChars);
    const key = category.toLowerCase();
    if (!category || seen.has(key)) continue;
    categories.push(category);
    seen.add(key);
    if (categories.length >= MARKET_LIMITS.maxPluginCategories) break;
  }
  return categories;
}
