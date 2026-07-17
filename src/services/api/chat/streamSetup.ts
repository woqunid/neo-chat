import { getTaskModel, useSettingsStore } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { getEnabledPluginFunctions } from "@/lib/plugin/resolve";
import { getPluginFunctionRisk } from "../../../lib/plugin/risk";
import { parseModelString, supportsImageGeneration } from "@/lib/utils/model";
import { appendContextToChatInput } from "@/lib/utils/chatInput";
import {
  stripAttachmentsDisplayCacheForModel,
  stripMessagesDisplayCacheForModel,
} from "../../../lib/utils/imageDisplayCache";
import { appendDiagramRequestInstructions } from "../../../lib/chat/diagramPrompt";
import { appendHtmlVisualRequestInstructions } from "../../../lib/chat/htmlVisualPrompt";
import { resolveImageGenerationOptions } from "../../../lib/chat/imageGenerationOptions";
import { prepareGrokSearchPreflight } from "../grokSearchPreflight";
import { searchWithGrok } from "../grokSearchService";
import type { GrokSearchStatusEvent } from "../../../lib/search/grokTool";
import { addInternalMemoryTools } from "./memoryTools";
import { addGrokSearchTool } from "./searchTools";
import {
  resolveModelMetadata,
  usesDirectImageGeneration,
} from "./modelSelection";
import { streamGenerateContent } from "./generationService";
import type { ChatToolDefinition } from "./types";
import { CHAT_TOOL_LIMITS } from "../../../config/limits";
import type {
  PreparedChatRequest,
  StreamChatOptions,
  ToolRuntimeMetadata,
} from "./streamTypes";

interface BuiltTools {
  tools: ChatToolDefinition[];
  runtimeMetadata: Record<string, ToolRuntimeMetadata>;
}

function buildTools(
  options: StreamChatOptions,
  directImageGeneration: boolean,
): BuiltTools {
  const { installedPlugins, pluginConfigs } = useSettingsStore.getState();
  const tools: ChatToolDefinition[] = [];
  const runtimeMetadata: Record<string, ToolRuntimeMetadata> = {};
  const names = new Map<string, string>();
  const reserveName = (name: string, owner: string): boolean => {
    const existing = names.get(name);
    if (existing && existing !== owner) {
      throw new Error(
        `工具名称冲突：${name} 同时由 ${existing} 和 ${owner} 提供。`,
      );
    }
    if (existing) return false;
    names.set(name, owner);
    return true;
  };
  const internalNames = new Set<string>();
  addInternalMemoryTools(tools, internalNames, options.newMessage);
  internalNames.forEach((name) => names.set(name, "internal"));
  if (options.config.useSearch && !directImageGeneration) {
    addGrokSearchTool(tools, internalNames);
    internalNames.forEach((name) => {
      if (!names.has(name)) names.set(name, "internal");
    });
  }
  for (const pluginId of options.activePlugins || []) {
    const plugin = installedPlugins.find((item) => item.id === pluginId);
    if (!plugin) continue;
    for (const fn of getEnabledPluginFunctions(
      plugin,
      pluginConfigs[pluginId],
    )) {
      if (!reserveName(fn.name, plugin.id)) continue;
      if (tools.length >= CHAT_TOOL_LIMITS.maxToolsPerRequest) break;
      tools.push({
        type: "function",
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      });
      runtimeMetadata[fn.name] = {
        pluginId: plugin.id,
        pluginTitle: plugin.title || plugin.id,
        risk: getPluginFunctionRisk(fn),
        isMcp: plugin.source === "mcp",
        trusted:
          plugin.source === "mcp" &&
          pluginConfigs[plugin.id]?.mcp?.trusted === true,
      };
    }
    if (tools.length >= CHAT_TOOL_LIMITS.maxToolsPerRequest) break;
  }
  return { tools, runtimeMetadata };
}

async function resolveSearchMessage(
  options: StreamChatOptions,
  prepared: Pick<
    PreparedChatRequest,
    "selectedModelMetadata" | "directImageGeneration"
  >,
  onStatus: (event: GrokSearchStatusEvent) => void,
): Promise<string> {
  if (!options.config.useSearch || !prepared.directImageGeneration) {
    return options.newMessage;
  }
  const context = await prepareGrokSearchPreflight({
    query: options.newMessage,
    history: options.history,
    attachments: options.attachments,
    metadata: prepared.selectedModelMetadata,
    signal: options.signal,
    search: searchWithGrok,
    onStatus,
  });
  return appendContextToChatInput(options.newMessage, context, {
    separator: "\n\n",
  });
}

async function resolveRequestConfig(
  options: StreamChatOptions,
  prepared: Pick<PreparedChatRequest, "providers" | "selectedModelMetadata">,
) {
  const config = { ...options.config };
  if (
    config.imageCount !== undefined ||
    !supportsImageGeneration(prepared.selectedModelMetadata)
  ) {
    return config;
  }
  const availableModels = prepared.providers
    .filter((item) => item.enabled)
    .flatMap((item) =>
      item.models.map((name) => ({
        id: `${item.id}:${name}`,
        metadata: resolveModelMetadata(name),
      })),
    );
  const imageOptions = await resolveImageGenerationOptions({
    userMessage: options.newMessage,
    selectedModel: options.model,
    selectedModelMetadata: prepared.selectedModelMetadata,
    defaultPromptOptimizationModel: getTaskModel("promptOptimization"),
    availableModels,
    generate: (model, prompt) =>
      streamGenerateContent(model, prompt, {
        onChunk: () => {},
        signal: options.signal,
      }),
  });
  return { ...config, ...imageOptions };
}

export async function prepareChatRequest(
  options: StreamChatOptions,
  onSearchStatus: (event: GrokSearchStatusEvent) => void,
): Promise<PreparedChatRequest> {
  const { providerId, modelName } = parseModelString(options.model);
  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((item) => item.id === providerId)
    : providers.find((item) => item.enabled);
  if (!provider) throw new Error("No provider available");
  const selectedModelMetadata = resolveModelMetadata(modelName);
  const directImageGeneration = usesDirectImageGeneration(
    provider.type,
    selectedModelMetadata,
    modelName,
  );
  const effectiveMessage = await resolveSearchMessage(
    options,
    { selectedModelMetadata, directImageGeneration },
    onSearchStatus,
  );
  const withSkills = options.skillsContext?.trim()
    ? appendContextToChatInput(effectiveMessage, options.skillsContext, {
        separator: "\n\n",
      })
    : effectiveMessage;
  const { tools, runtimeMetadata } = buildTools(options, directImageGeneration);
  const partial = { providers, selectedModelMetadata };
  return {
    options,
    provider,
    providers,
    modelName,
    selectedModelMetadata,
    directImageGeneration,
    tools,
    toolRuntimeMetadata: runtimeMetadata,
    requestHistory: await stripMessagesDisplayCacheForModel(options.history),
    requestMessage: appendDiagramRequestInstructions(
      appendHtmlVisualRequestInstructions(
        withSkills,
        options.userSystemInstruction,
      ),
      options.userSystemInstruction,
    ),
    requestAttachments: await stripAttachmentsDisplayCacheForModel(
      options.attachments,
    ),
    requestConfig: await resolveRequestConfig(options, partial),
  };
}
