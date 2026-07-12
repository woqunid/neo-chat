import { MARKET_LIMITS } from "../../config/limits";
import {
  asRecord,
  normalizePluginCategories,
  trimString,
} from "./pluginPrimitives";

const API_GURU_OVERSAMPLE_FACTOR = 2;
const EXCLUDED_API_GURU_PROVIDERS = ["amazonaws", "azure", "google"];

function isExcludedProvider(key: string): boolean {
  return EXCLUDED_API_GURU_PROVIDERS.some((provider) => key.includes(provider));
}

function getPreferredVersion(
  entry: Record<string, unknown>,
): Record<string, unknown> | null {
  const versions = asRecord(entry.versions);
  if (!versions) return null;
  const preferred = trimString(entry.preferred, 200);
  return asRecord(versions[preferred]);
}

function normalizeEntry(
  key: string,
  value: unknown,
): Record<string, unknown> | null {
  if (isExcludedProvider(key)) return null;
  const entry = asRecord(value);
  if (!entry) return null;
  const version = getPreferredVersion(entry);
  if (!version) return null;
  const info = asRecord(version.info) || {};
  const logo = asRecord(info["x-logo"]) || {};
  const externalDocs = asRecord(version.externalDocs) || {};
  const categories = normalizePluginCategories(info["x-apisguru-categories"]);
  return {
    id: key,
    title: info.title,
    description: info.description,
    logoUrl: logo.url,
    manifestUrl: version.swaggerUrl,
    externalDocsUrl: externalDocs.url,
    category: categories[0],
    categories,
    added: entry.added,
  };
}

export function getApiGuruPluginCandidates(value: unknown): unknown[] {
  const entries = asRecord(value);
  if (!entries) return [];
  const plugins: unknown[] = [];

  for (const [key, entryValue] of Object.entries(entries)) {
    const plugin = normalizeEntry(key, entryValue);
    if (plugin) plugins.push(plugin);
    if (
      plugins.length >=
      MARKET_LIMITS.maxPlugins * API_GURU_OVERSAMPLE_FACTOR
    ) {
      break;
    }
  }
  return plugins;
}
