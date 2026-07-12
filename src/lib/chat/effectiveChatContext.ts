import type {
  ChatConfig,
  ModelMetadata,
  Plugin,
  PluginConfig,
  RAGConfig,
  Session,
  SystemPersonality,
  Workspace,
} from "../../types";
import type { SkillCatalogEntry } from "../skills/types";
import {
  isPluginAuthRequired,
  normalizeActivePluginIds,
} from "../plugin/config";
import { normalizeSkillIdRefs } from "../skills";
import {
  hasPluginAuthValue,
  hasRagVectorStore,
} from "../security/localSecretResolvers";
import { buildDiagramPromptInstruction } from "./diagramPrompt";
import { buildHtmlVisualPromptInstruction } from "./htmlVisualPrompt";
import { parseModelString, supportsModality } from "../utils/model";

export type CapabilityStatusCode =
  | "ok"
  | "search_unavailable"
  | "rag_unavailable"
  | "plugin_auth_missing"
  | "attachment_unsupported"
  | "audio_unsupported"
  | "reasoning_unsupported";

export interface CapabilityStatus {
  code: CapabilityStatusCode;
  level: "info" | "warning" | "error";
  message: string;
}

export interface ModelCapabilities {
  vision: boolean;
  attachment: boolean;
  audio: boolean;
  reasoning: boolean;
}

export interface EffectiveChatContext {
  sessionId: string | null;
  systemInstruction?: string;
  workspaceFiles: Workspace["files"];
  workspaceKnowledgeCollectionIds: string[];
  activePluginIds: string[];
  activeSkillIds: string[];
  modelCapabilities: ModelCapabilities;
  capabilityStatuses: CapabilityStatus[];
}

export interface ResolveEffectiveChatContextOptions {
  session?: Session | null;
  workspace?: Workspace | null;
  systemPrompt?: string;
  personality?: SystemPersonality;
  enableHtmlVisualPrompt?: boolean;
  now?: Date | number;
  selectedModel: string;
  modelMetadata: Record<string, ModelMetadata>;
  customModelMetadata: Record<string, ModelMetadata>;
  chatConfig: ChatConfig;
  searchAvailable: boolean;
  rag: RAGConfig;
  installedPlugins: Plugin[];
  installedSkills?: SkillCatalogEntry[];
  pluginConfigs: Record<string, PluginConfig>;
  activePlugins: string[];
}

function formatCurrentDateTime(now: Date | number | undefined): string {
  const date =
    now instanceof Date
      ? now
      : typeof now === "number"
        ? new Date(now)
        : new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  return [
    "Current date and time:",
    `- ISO: ${date.toISOString()}`,
    `- Local: ${date.toLocaleString(undefined, { timeZone })}`,
    `- Time zone: ${timeZone}`,
  ].join("\n");
}

const PERSONALITY_INSTRUCTIONS: Record<
  Exclude<SystemPersonality, "default">,
  string
> = {
  professional:
    "Use a professional, precise, and dependable voice. Prioritize accuracy, structure, and practical detail.",
  friendly:
    "Use a warm, approachable, and supportive voice. Explain clearly without becoming overly formal.",
  direct:
    "Be candid and straightforward. State the main answer early and avoid unnecessary preamble.",
  imaginative:
    "Use imaginative framing and playful ideas while staying useful, accurate, and grounded.",
  efficient:
    "Be concise, direct, and practical. Focus on the fastest useful path and skip filler.",
  snarky:
    "Use dry wit sparingly while staying helpful, respectful, and technically accurate.",
};

export function buildResponsePersonalizationInstruction({
  personality,
}: {
  personality?: SystemPersonality;
}): string {
  const instruction =
    personality && personality !== "default"
      ? PERSONALITY_INSTRUCTIONS[personality]
      : "";

  if (!instruction) return "";

  return [
    "<response-personalization>",
    instruction,
    "</response-personalization>",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSystemInstruction({
  systemPrompt,
  personality,
  workspacePrompt,
  sessionInstruction,
  enableHtmlVisualPrompt,
  now,
}: {
  systemPrompt?: string;
  personality?: SystemPersonality;
  workspacePrompt?: string;
  sessionInstruction?: string;
  enableHtmlVisualPrompt?: boolean;
  now?: Date | number;
}) {
  const sections: string[] = [];
  const seen = new Set<string>();
  for (const value of [systemPrompt, workspacePrompt, sessionInstruction]) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    sections.push(trimmed);
  }
  const personalizationInstruction = buildResponsePersonalizationInstruction({
    personality,
  });
  if (personalizationInstruction) {
    sections.push(personalizationInstruction);
  }
  sections.push(
    buildDiagramPromptInstruction({
      enhanced: Boolean(enableHtmlVisualPrompt),
    }),
  );
  if (enableHtmlVisualPrompt) {
    sections.push(buildHtmlVisualPromptInstruction());
  }
  sections.push(formatCurrentDateTime(now));
  return sections.join("\n\n");
}

function getModelCapabilities({
  selectedModel,
  modelMetadata,
  customModelMetadata,
}: Pick<
  ResolveEffectiveChatContextOptions,
  "selectedModel" | "modelMetadata" | "customModelMetadata"
>): ModelCapabilities {
  const { modelName } = parseModelString(selectedModel);
  const meta = customModelMetadata[modelName] || modelMetadata[modelName];
  const lower = modelName.toLowerCase();
  const reasoningByName =
    lower.includes("thinking") ||
    lower.includes("reasoner") ||
    lower.includes("o1") ||
    lower.includes("r1");

  return {
    vision: supportsModality(meta, "image", "input"),
    attachment: meta?.attachment ?? false,
    audio: supportsModality(meta, "audio", "input"),
    reasoning: meta?.reasoning ?? reasoningByName,
  };
}

function getPluginContext(options: ResolveEffectiveChatContextOptions): {
  requestedPluginIds: string[];
  activePluginIds: string[];
} {
  const requestedPluginIds =
    options.session?.config?.activePlugins || options.activePlugins;
  const activePluginIds = normalizeActivePluginIds({
    pluginIds: requestedPluginIds,
    installedPlugins: options.installedPlugins,
    pluginConfigs: options.pluginConfigs,
    unauthenticatedAllowedPluginIds: ["unsplash"],
  });
  return { requestedPluginIds, activePluginIds };
}

function getActiveSkillIds(
  options: ResolveEffectiveChatContextOptions,
): string[] {
  const requestedSkillIds =
    options.session?.config?.activeSkills ||
    options.workspace?.activeSkills ||
    [];
  return normalizeSkillIdRefs(requestedSkillIds, options.installedSkills || []);
}

function getAvailabilityStatuses(
  options: ResolveEffectiveChatContextOptions,
): CapabilityStatus[] {
  const statuses: CapabilityStatus[] = [];
  if (options.chatConfig.useSearch && !options.searchAvailable) {
    statuses.push({
      code: "search_unavailable",
      level: "warning",
      message: "Search is enabled but Grok web search is not configured.",
    });
  }
  if (
    options.chatConfig.useRAG &&
    (!options.rag.enabled || !hasRagVectorStore(options.rag))
  ) {
    statuses.push({
      code: "rag_unavailable",
      level: "warning",
      message:
        "RAG is enabled but the vector endpoint or token is not configured.",
    });
  }
  return statuses;
}

function getPluginAuthStatuses(options: {
  requestedPluginIds: string[];
  installedPlugins: Plugin[];
  pluginConfigs: Record<string, PluginConfig>;
}): CapabilityStatus[] {
  const statuses: CapabilityStatus[] = [];
  for (const pluginId of options.requestedPluginIds) {
    const plugin = options.installedPlugins.find(
      (item) => item.id === pluginId,
    );
    if (!plugin || !isPluginAuthRequired(plugin) || pluginId === "unsplash") {
      continue;
    }
    if (hasPluginAuthValue(options.pluginConfigs[pluginId]?.auth)) continue;
    statuses.push({
      code: "plugin_auth_missing",
      level: "warning",
      message: `Plugin "${plugin.title || plugin.id}" is active but missing authentication.`,
    });
  }
  return statuses;
}

function getCapabilityStatuses(
  options: ResolveEffectiveChatContextOptions,
  requestedPluginIds: string[],
): CapabilityStatus[] {
  const statuses = [
    ...getAvailabilityStatuses(options),
    ...getPluginAuthStatuses({
      requestedPluginIds,
      installedPlugins: options.installedPlugins,
      pluginConfigs: options.pluginConfigs,
    }),
  ];
  return statuses.length
    ? statuses
    : [{ code: "ok", level: "info", message: "Ready" }];
}

function getContextMetadata(options: ResolveEffectiveChatContextOptions) {
  return {
    sessionId: options.session?.id || null,
    workspaceFiles: options.workspace?.files || [],
    workspaceKnowledgeCollectionIds:
      options.workspace?.knowledgeCollectionIds || [],
  };
}

export function resolveEffectiveChatContext(
  options: ResolveEffectiveChatContextOptions,
): EffectiveChatContext {
  const pluginContext = getPluginContext(options);
  const modelCapabilities = getModelCapabilities({
    selectedModel: options.selectedModel,
    modelMetadata: options.modelMetadata,
    customModelMetadata: options.customModelMetadata,
  });
  return {
    ...getContextMetadata(options),
    systemInstruction: buildSystemInstruction({
      systemPrompt: options.systemPrompt,
      personality: options.personality,
      workspacePrompt: options.workspace?.systemPrompt,
      sessionInstruction: options.session?.systemInstruction,
      enableHtmlVisualPrompt: options.enableHtmlVisualPrompt,
      now: options.now,
    }),
    activePluginIds: pluginContext.activePluginIds,
    activeSkillIds: getActiveSkillIds(options),
    modelCapabilities,
    capabilityStatuses: getCapabilityStatuses(
      options,
      pluginContext.requestedPluginIds,
    ),
  };
}
