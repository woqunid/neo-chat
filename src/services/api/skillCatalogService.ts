import type {
  SkillCatalog,
  SkillCatalogEntry,
  SkillDataLocale,
  TextSkill,
} from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import {
  normalizeSkillCatalog,
  normalizeTextSkill,
  resolveSkillDataLocale,
} from "../../lib/skills";
import { readJsonResponseOrThrow } from "../../lib/api/client";
import { logDevWarn } from "../../lib/utils/devLogger";
import { CACHE_CONFIG } from "../../config/api";

const catalogRequests = new Map<string, Promise<SkillCatalog>>();
const definitionRequests = new Map<string, Promise<TextSkill>>();

function getCatalogPath(locale: SkillDataLocale): string {
  if (locale === "zh-CN") return "/data/skills/skills.metadata.zh-CN.json";
  if (locale === "ja") return "/data/skills/skills.metadata.ja.json";
  return "/data/skills/skills.metadata.json";
}

function getCachedSkillCatalog(locale: SkillDataLocale): SkillCatalog | null {
  const { skillCatalogs, skillCatalogTimestamps } = useSettingsStore.getState();
  const catalog = skillCatalogs?.[locale];
  const timestamp = skillCatalogTimestamps?.[locale] || 0;
  if (!catalog || !timestamp || Date.now() - timestamp >= CACHE_CONFIG.skills) {
    return null;
  }
  const normalized = normalizeSkillCatalog(catalog);
  return normalized.skills.length > 0 ? { ...normalized, locale } : null;
}

function getCachedSkillDefinition(cacheKey: string): TextSkill | null {
  const { skillDefinitions, skillDefinitionTimestamps } =
    useSettingsStore.getState();
  const skill = skillDefinitions?.[cacheKey];
  const timestamp = skillDefinitionTimestamps?.[cacheKey] || 0;
  if (!skill || !timestamp || Date.now() - timestamp >= CACHE_CONFIG.skills) {
    return null;
  }
  return normalizeTextSkill(skill);
}

async function requestSkillCatalog(options: {
  dataLocale: SkillDataLocale;
  forceRefresh: boolean;
}): Promise<SkillCatalog> {
  const response = await fetch(getCatalogPath(options.dataLocale), {
    cache: options.forceRefresh ? "no-store" : "default",
  });
  if (!response.ok) throw new Error("Failed to fetch skills catalog");
  const data = await readJsonResponseOrThrow(
    response,
    "Failed to fetch skills catalog",
  );
  const catalog = normalizeSkillCatalog(data);
  useSettingsStore.getState().setSkillCatalog?.(options.dataLocale, catalog);
  return catalog;
}

export async function fetchSkillCatalog(
  locale?: string,
  forceRefresh = false,
): Promise<SkillCatalog> {
  const dataLocale = resolveSkillDataLocale(locale);
  if (!forceRefresh) {
    const cachedCatalog = getCachedSkillCatalog(dataLocale);
    if (cachedCatalog) return cachedCatalog;
    const activeRequest = catalogRequests.get(dataLocale);
    if (activeRequest) return activeRequest;
  }
  const request = requestSkillCatalog({ dataLocale, forceRefresh });
  catalogRequests.set(dataLocale, request);
  try {
    return await request;
  } catch (error) {
    catalogRequests.delete(dataLocale);
    if (dataLocale === "en") throw error;
    logDevWarn("Failed to load localized skills catalog:", error);
    return fetchSkillCatalog("en", forceRefresh);
  }
}

async function requestSkillDefinition(options: {
  entry: SkillCatalogEntry;
  cacheKey: string;
  forceRefresh: boolean;
}): Promise<TextSkill> {
  const response = await fetch(`/data/skills/${options.entry.file}`, {
    cache: options.forceRefresh ? "no-store" : "default",
  });
  if (!response.ok) throw new Error("Failed to fetch skill definition");
  const data = await readJsonResponseOrThrow(
    response,
    "Failed to fetch skill definition",
  );
  const skill = normalizeTextSkill(data);
  if (!skill) throw new Error("Invalid skill definition");
  const definition = { ...skill, builtIn: true };
  useSettingsStore
    .getState()
    .setSkillDefinition?.(options.cacheKey, definition);
  return definition;
}

export async function fetchSkillDefinition(
  entry: SkillCatalogEntry,
  locale?: string,
  forceRefresh = false,
): Promise<TextSkill | null> {
  const customSkill = normalizeTextSkill(entry);
  if (customSkill?.content && !entry.file) return customSkill;
  if (!entry.file) return null;
  const dataLocale = resolveSkillDataLocale(locale);
  const cacheKey = `${dataLocale}:${entry.file}`;
  if (!forceRefresh) {
    const cachedSkill = getCachedSkillDefinition(cacheKey);
    if (cachedSkill) return { ...cachedSkill, builtIn: true };
    const activeRequest = definitionRequests.get(cacheKey);
    if (activeRequest) return activeRequest;
  }
  const request = requestSkillDefinition({ entry, cacheKey, forceRefresh });
  definitionRequests.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    definitionRequests.delete(cacheKey);
    logDevWarn("Failed to load skill definition:", error);
    return null;
  }
}
