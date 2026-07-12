import type {
  AppliedSkill,
  AppliedSkillInvocation,
  SkillCatalogEntry,
  TextSkill,
} from "@/types";
import {
  buildSkillPromptContext,
  createSkillInvocations,
  createSkillSelectionTool,
  createSkillSelectionToolPrompt,
  mergeBuiltInAndCustomSkills,
  normalizeSkillIdRefs,
  normalizeTextSkill,
  parseSkillSelectionToolCall,
  recallSkillCandidates,
  selectSkillsForMessage,
} from "../../lib/skills";
import { logDevWarn } from "../../lib/utils/devLogger";
import { streamGenerateToolCall } from "./chatService";
import { fetchSkillCatalog, fetchSkillDefinition } from "./skillCatalogService";

export { fetchSkillCatalog, fetchSkillDefinition };

export async function getMergedSkills({
  installedSkills,
  customSkills = [],
  locale,
  forceRefresh = false,
}: {
  installedSkills?: readonly TextSkill[];
  customSkills?: readonly TextSkill[];
  locale?: string;
  forceRefresh?: boolean;
} = {}): Promise<SkillCatalogEntry[]> {
  if (installedSkills) {
    return mergeBuiltInAndCustomSkills([], installedSkills);
  }

  try {
    const catalog = await fetchSkillCatalog(locale, forceRefresh);
    return mergeBuiltInAndCustomSkills(catalog.skills, customSkills);
  } catch (error) {
    logDevWarn("Failed to load built-in skills:", error);
    return mergeBuiltInAndCustomSkills([], customSkills);
  }
}

export function getRecommendedSkillsForInput({
  message,
  skills,
  limit = 6,
}: {
  message: string;
  skills: readonly SkillCatalogEntry[];
  locale?: string;
  limit?: number;
}) {
  return recallSkillCandidates({ message, skills, limit }).map(
    (candidate) => candidate.skill,
  );
}

interface ResolveSkillsOptions {
  message: string;
  selectedModel: string;
  locale?: string;
  installedSkills?: readonly TextSkill[];
  customSkills?: readonly TextSkill[];
  activeSkillIds: readonly string[];
  autoSelect: boolean;
  signal?: AbortSignal;
}

interface ResolvedSkills {
  appliedSkills: AppliedSkill[];
  invocations: AppliedSkillInvocation[];
  context: string;
}

function buildResolvedSkills(appliedSkills: AppliedSkill[]): ResolvedSkills {
  return {
    appliedSkills,
    invocations: createSkillInvocations(appliedSkills),
    context: buildSkillPromptContext({ skills: appliedSkills }),
  };
}

function normalizeUniqueSkills(options: ResolveSkillsOptions): TextSkill[] {
  const skills: TextSkill[] = [];
  const seenSkillIds = new Set<string>();
  const candidates = [
    ...(options.installedSkills || []),
    ...(options.customSkills || []),
  ];
  for (const item of candidates) {
    const skill = normalizeTextSkill(item);
    if (!skill || seenSkillIds.has(skill.id)) continue;
    seenSkillIds.add(skill.id);
    skills.push(skill);
  }
  return skills;
}

function getActiveSkills(options: {
  skills: TextSkill[];
  activeSkillIds: readonly string[];
}): { activeSkills: TextSkill[]; skillsById: Map<string, TextSkill> } {
  const activeIds = normalizeSkillIdRefs(
    options.activeSkillIds,
    options.skills,
  );
  const skills = options.skills;
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const activeSkills = activeIds
    .map((id) => skillsById.get(id))
    .filter((skill): skill is TextSkill => Boolean(skill));
  return { activeSkills, skillsById };
}

async function selectSkillIdsWithModel(options: {
  message: string;
  selectedModel: string;
  activeSkills: TextSkill[];
  signal?: AbortSignal;
}): Promise<string[] | null> {
  try {
    const toolCall = await streamGenerateToolCall(
      options.selectedModel,
      createSkillSelectionToolPrompt({
        message: options.message,
        skills: options.activeSkills,
      }),
      {
        tools: [createSkillSelectionTool({ skills: options.activeSkills })],
        signal: options.signal,
      },
    );
    const selection = parseSkillSelectionToolCall(
      toolCall,
      options.activeSkills,
    );
    return selection?.selectedSkillIds || null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    logDevWarn("Skill selection tool call failed:", error);
    return null;
  }
}

async function selectAppliedSkills(options: {
  request: ResolveSkillsOptions;
  activeSkills: TextSkill[];
  skillsById: Map<string, TextSkill>;
}): Promise<AppliedSkill[]> {
  const selectedSkillIds = await selectSkillIdsWithModel({
    message: options.request.message,
    selectedModel: options.request.selectedModel,
    activeSkills: options.activeSkills,
    signal: options.request.signal,
  });
  if (selectedSkillIds) {
    return selectedSkillIds
      .map((id) => options.skillsById.get(id))
      .filter((skill): skill is TextSkill => Boolean(skill))
      .map((skill) => ({ skill, mode: "auto" }));
  }
  const fallbackSelection = await selectSkillsForMessage({
    message: options.request.message,
    skills: options.activeSkills,
    manualSkillIds: [],
    autoSelect: true,
  });
  return fallbackSelection
    .map(({ skill }) => options.skillsById.get(skill.id))
    .filter((skill): skill is TextSkill => Boolean(skill))
    .map((skill) => ({ skill, mode: "auto" }));
}

export async function resolveSkillsForMessage(
  options: ResolveSkillsOptions,
): Promise<ResolvedSkills> {
  const skills = normalizeUniqueSkills(options);
  const active = getActiveSkills({
    skills,
    activeSkillIds: options.activeSkillIds,
  });
  if (active.activeSkills.length === 0) return buildResolvedSkills([]);
  if (!options.autoSelect) {
    const applied = active.activeSkills.map((skill) => ({
      skill,
      mode: "manual" as const,
    }));
    return buildResolvedSkills(applied);
  }
  const applied = await selectAppliedSkills({
    request: options,
    activeSkills: active.activeSkills,
    skillsById: active.skillsById,
  });
  return buildResolvedSkills(applied);
}
