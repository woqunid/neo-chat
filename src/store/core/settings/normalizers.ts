import type {
  Plugin,
  PluginConfig,
  SkillCatalog,
  SkillDataLocale,
  TextSkill,
} from "@/types";
import { BUILT_IN_PLUGINS, UNSPLASH_PLUGIN } from "@/config/plugins";
import { MARKET_LIMITS } from "@/config/limits";
import { isPluginAuthRequired } from "../../../lib/plugin/config";
import { hasPluginAuthValue } from "../../../lib/security/localSecretResolvers";
import {
  normalizeCustomSkills,
  normalizeSkillCatalog,
  normalizeTextSkill,
} from "../../../lib/skills";

const BUILT_INS_BY_ID = new Map(
  BUILT_IN_PLUGINS.map((plugin) => [plugin.id, plugin]),
);
const REMOVED_BUILT_IN_IDS = new Set(["image-generation"]);
const SKILL_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_DATA_LOCALES: readonly SkillDataLocale[] = ["en", "zh-CN", "ja"];
const MAX_CACHE_KEY_CHARS = 320;

export const removeRemovedBuiltInPlugins = (
  plugins: readonly Plugin[],
): Plugin[] => plugins.filter((plugin) => !REMOVED_BUILT_IN_IDS.has(plugin.id));

export function refreshBuiltInPluginDefinitions(
  plugins: readonly Plugin[],
): Plugin[] {
  return plugins.map((plugin) => {
    const builtIn = BUILT_INS_BY_ID.get(plugin.id);
    if (!builtIn || !plugin.builtIn) return plugin;
    const refreshed = { ...builtIn, added: plugin.added || builtIn.added };
    return JSON.stringify(plugin) === JSON.stringify(refreshed)
      ? plugin
      : refreshed;
  });
}

export const initPluginConfig = (): PluginConfig => ({
  disabledFunctions: [],
});

export function canAutoActivatePlugin(
  plugin: Plugin,
  config: PluginConfig | undefined,
): boolean {
  return (
    !isPluginAuthRequired(plugin) ||
    hasPluginAuthValue(config?.auth) ||
    plugin.id === UNSPLASH_PLUGIN.id
  );
}

export function normalizeSkillIdRefsForStorage(
  value: unknown,
  maxCount: number = MARKET_LIMITS.maxActiveSkills,
): string[] {
  if (!Array.isArray(value)) return [];
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id =
      typeof item === "string"
        ? item.trim().slice(0, MARKET_LIMITS.maxSkillIdChars)
        : "";
    if (!id || !SKILL_ID_RE.test(id) || seen.has(id)) continue;
    refs.push(id);
    seen.add(id);
    if (refs.length >= maxCount) break;
  }
  return refs;
}

export function normalizeInstalledSkills(
  value: unknown,
  maxCount: number = MARKET_LIMITS.maxSkills,
): TextSkill[] {
  if (!Array.isArray(value)) return [];
  const skills: TextSkill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const skill = normalizeTextSkill(item);
    if (!skill || seen.has(skill.id)) continue;
    skills.push({
      ...skill,
      builtIn: skill.builtIn === true || undefined,
      isCustom: skill.isCustom === true || undefined,
    });
    seen.add(skill.id);
    if (skills.length >= maxCount) break;
  }
  return skills;
}

export const syncCustomSkillsFromInstalled = (skills: readonly TextSkill[]) =>
  normalizeCustomSkills(
    skills.filter((skill) => skill.isCustom && !skill.builtIn),
    MARKET_LIMITS.maxCustomSkills,
  );

export function normalizeSkillCatalogCache(
  value: unknown,
): Partial<Record<SkillDataLocale, SkillCatalog>> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Partial<Record<SkillDataLocale, unknown>>;
  const result: Partial<Record<SkillDataLocale, SkillCatalog>> = {};
  for (const locale of SKILL_DATA_LOCALES) {
    const catalog = normalizeSkillCatalog(raw[locale]);
    if (catalog.skills.length > 0) result[locale] = { ...catalog, locale };
  }
  return result;
}

export function normalizeSkillDefinitionCache(
  value: unknown,
): Record<string, TextSkill> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, TextSkill> = {};
  for (const [cacheKey, item] of Object.entries(value)) {
    const skill = normalizeTextSkill(item);
    if (skill && cacheKey.length <= MAX_CACHE_KEY_CHARS)
      result[cacheKey] = skill;
  }
  return result;
}

export function normalizeTimestampCache(
  value: unknown,
): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, timestamp] of Object.entries(value)) {
    const normalized = Number(timestamp);
    if (
      key &&
      key.length <= MAX_CACHE_KEY_CHARS &&
      Number.isFinite(normalized) &&
      normalized > 0
    ) {
      result[key] = normalized;
    }
  }
  return result;
}

export const SETTINGS_CACHE_KEY_MAX_CHARS = MAX_CACHE_KEY_CHARS;
