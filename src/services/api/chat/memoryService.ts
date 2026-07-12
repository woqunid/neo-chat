import { useMemoryStore } from "@/store/core/memoryStore";
import { getTaskModel } from "@/store/core/settingsStore";
import type { Message } from "@/types";
import {
  parseMemoryDreamToolCall,
  parseMemoryRecordToolCall,
} from "../../../lib/memory/entities";
import {
  createMemoryDreamPrompt,
  createMemoryExtractionPrompt,
  MEMORY_DREAM_TOOL,
  MEMORY_DREAM_TOOL_NAME,
  MEMORY_RECORD_TOOL,
  MEMORY_RECORD_TOOL_NAME,
} from "../../../lib/memory/tools";
import { MEMORY_LIMITS } from "../../../config/limits";
import { isBrowserMemoryStorePendingHydration } from "./memoryTools";
import { streamGenerateToolCall } from "./generationService";
import { coerceToolDefinition } from "./types";
import { logDevWarn } from "../../../lib/utils/devLogger";

interface MemoryExtractionOptions {
  sessionId: string;
  userMessage: Pick<Message, "id" | "content">;
  assistantMessage: Pick<Message, "id" | "content">;
  signal?: AbortSignal;
}

interface MemoryDreamOptions {
  force?: boolean;
  signal?: AbortSignal;
}

type MemoryState = ReturnType<typeof useMemoryStore.getState>;

function canExtractMemory(
  state: MemoryState,
  options: MemoryExtractionOptions,
): boolean {
  return Boolean(
    !isBrowserMemoryStorePendingHydration(state._hasHydrated) &&
    state.settings.enabled &&
    state.settings.autoRecordEnabled &&
    options.userMessage.content.trim() &&
    options.assistantMessage.content.trim(),
  );
}

async function requestMemoryExtraction(options: MemoryExtractionOptions) {
  return streamGenerateToolCall(
    getTaskModel("memory"),
    createMemoryExtractionPrompt({
      userMessage: options.userMessage.content,
      assistantMessage: options.assistantMessage.content,
    }),
    {
      tools: [coerceToolDefinition(MEMORY_RECORD_TOOL)],
      signal: options.signal,
    },
  );
}

function startDreamWhenNeeded(signal?: AbortSignal): void {
  const state = useMemoryStore.getState();
  const { settings, memories } = state;
  if (!settings.enabled || !settings.dreamEnabled) return;
  if (memories.length <= settings.triggerCount) return;
  void performMemoryDream({ force: false, signal });
}

export const performBackgroundMemoryExtraction = async (
  options: MemoryExtractionOptions,
) => {
  const state = useMemoryStore.getState();
  if (!canExtractMemory(state, options)) return [];
  const toolCall = await requestMemoryExtraction(options);

  if (!toolCall || toolCall.name !== MEMORY_RECORD_TOOL_NAME) return [];

  const memories = parseMemoryRecordToolCall(toolCall.args, {
    source: "ai",
    sourceSessionId: options.sessionId,
    sourceMessageIds: [options.userMessage.id, options.assistantMessage.id],
  });
  if (memories.length === 0) return [];

  const saved = useMemoryStore.getState().upsertMemories(memories);
  startDreamWhenNeeded(options.signal);
  return saved;
};

function canRunDream(state: MemoryState, force: boolean): boolean {
  const { _hasHydrated, settings, memories, dreamStatus } = state;
  return Boolean(
    !isBrowserMemoryStorePendingHydration(_hasHydrated) &&
    settings.enabled &&
    settings.dreamEnabled &&
    !dreamStatus.isRunning &&
    memories.length > settings.targetCount &&
    (force || memories.length > settings.triggerCount),
  );
}

async function requestDreamedMemories(
  state: MemoryState,
  signal?: AbortSignal,
) {
  const targetCount = Math.min(
    state.settings.targetCount,
    MEMORY_LIMITS.targetCount,
  );
  const toolCall = await streamGenerateToolCall(
    getTaskModel("memory"),
    createMemoryDreamPrompt({ memories: state.memories, targetCount }),
    {
      tools: [coerceToolDefinition(MEMORY_DREAM_TOOL)],
      signal,
    },
  );

  if (!toolCall || toolCall.name !== MEMORY_DREAM_TOOL_NAME) {
    throw new Error("Memory dream did not return a valid tool call.");
  }

  const dreamed = parseMemoryDreamToolCall(toolCall.args, { targetCount });
  if (dreamed.length === 0 || dreamed.length > targetCount) {
    throw new Error("Memory dream returned an invalid memory set.");
  }
  return dreamed;
}

export const performMemoryDream = async ({
  force = false,
  signal,
}: MemoryDreamOptions = {}) => {
  const state = useMemoryStore.getState();
  if (!canRunDream(state, force)) return null;

  state.startDream();
  try {
    const dreamed = await requestDreamedMemories(state, signal);
    useMemoryStore.getState().replaceMemories(dreamed);
    useMemoryStore.getState().finishDream();
    return dreamed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useMemoryStore.getState().finishDream(message);
    logDevWarn("Memory dream failed:", error);
    return null;
  }
};
