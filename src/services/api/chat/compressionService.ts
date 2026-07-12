import type { Message, Session } from "@/types";
import { getTaskModel, useSettingsStore } from "@/store/core/settingsStore";
import { v7 as uuidv7 } from "uuid";
import { parseModelString } from "@/lib/utils/model";
import {
  createContextCompressionSummaryPrompt,
  buildCompressionSource,
  mergeCompressedContentWithMemoryIds,
  normalizeCompressedContent,
  normalizeCompressedContentWithMemoryIds,
  textToBase64,
} from "@/lib/utils/contextCompression";
import { logDevWarn } from "../../../lib/utils/devLogger";
import { streamGenerateContent } from "./generationService";

const MESSAGES_PER_TURN = 2;
const DEFAULT_THRESHOLD_TURNS = 12;
const DEFAULT_KEEP_TURNS = 4;
const SUMMARY_FALLBACK_LENGTH = 1000;

const getCompressionConfig = () => {
  const { system } = useSettingsStore.getState();
  return {
    thresholdMessages:
      (system.compressionThreshold || DEFAULT_THRESHOLD_TURNS) *
      MESSAGES_PER_TURN,
    keepMessages:
      (system.historyKeepCount || DEFAULT_KEEP_TURNS) * MESSAGES_PER_TURN,
  };
};

// Generate summary using backend API
const generateSummary = async (
  text: string,
  signal?: AbortSignal,
): Promise<string> => {
  try {
    const summaryModel = getTaskModel("contextCompression");
    const prompt = createContextCompressionSummaryPrompt(text);
    return await streamGenerateContent(summaryModel, prompt, {
      onChunk: () => {},
      signal,
    });
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      throw e;
    }
    logDevWarn("Summary generation failed, returning raw truncation", e);
    return normalizeCompressedContent(
      `${text.slice(0, SUMMARY_FALLBACK_LENGTH)}... [Summary Failed]`,
    );
  }
};

function hasItems(value: readonly unknown[] | undefined): boolean {
  return Boolean(value?.length);
}

function isValidHistoryMessage(message: Message): boolean {
  if (message.role === "user") return true;
  if (message.role !== "model") return false;
  return [
    message.content.trim(),
    message.reasoning,
    hasItems(message.attachments),
    hasItems(message.searchSources),
    hasItems(message.toolCalls),
    hasItems(message.outputBlocks),
  ].some(Boolean);
}

function modelSupportsAttachments(model: string): boolean {
  const { modelMetadata, customModelMetadata } = useSettingsStore.getState();
  const { modelName } = parseModelString(model);
  const metadata = customModelMetadata[modelName] || modelMetadata[modelName];
  return metadata ? (metadata.attachment ?? false) : true;
}

function createCompressedMessage(content: string, model: string): Message {
  const normalized = normalizeCompressedContent(content);
  const base = {
    id: uuidv7(),
    role: "model" as const,
    timestamp: Date.now(),
  };
  if (!modelSupportsAttachments(model)) {
    return {
      ...base,
      content:
        "The context has been compressed. To retrieve previous conversation " +
        `content, please read the following conversation summary:\n\n${normalized}`,
    };
  }
  return {
    ...base,
    content:
      "The context has been compressed. If you need to view the previous " +
      "conversation, please read the attached content.",
    attachments: [
      {
        id: uuidv7(),
        mimeType: "text/plain",
        fileName: "conversation_history.txt",
        data: textToBase64(normalized),
      },
    ],
  };
}

function getUncompressedTail(
  messages: Message[],
  lastCompressedMessageId: string,
): Message[] | null {
  const index = messages.findIndex(
    (message) => message.id === lastCompressedMessageId,
  );
  return index < 0 ? null : messages.slice(index + 1);
}

export const prepareHistoryForLLM = async (
  allMessages: Message[],
  compression: Session["compression"],
  model: string,
): Promise<Message[]> => {
  const validMessages = allMessages.filter(isValidHistoryMessage);
  if (!compression) return validMessages;
  const tail = getUncompressedTail(
    validMessages,
    compression.lastCompressedMessageId,
  );
  if (!tail) return validMessages;
  const firstUserMessage = validMessages.find(({ role }) => role === "user");
  const prefix = firstUserMessage ? [firstUserMessage] : [];
  return [
    ...prefix,
    createCompressedMessage(compression.compressedContent, model),
    ...tail,
  ];
};

function getCompressionStart(
  messages: Message[],
  compression: Session["compression"],
): { startIndex: number; oldContent: string; oldMemoryIds: string[] } {
  if (!compression) {
    return { startIndex: 1, oldContent: "", oldMemoryIds: [] };
  }
  const index = messages.findIndex(
    (message) => message.id === compression.lastCompressedMessageId,
  );
  if (index < 0) return { startIndex: 0, oldContent: "", oldMemoryIds: [] };
  const normalized = normalizeCompressedContentWithMemoryIds({
    content: compression.compressedContent,
    memoryIds: compression.includedMemoryIds || [],
  });
  return {
    startIndex: index + 1,
    oldContent: normalized.content,
    oldMemoryIds: normalized.representedMemoryIds,
  };
}

function getMessagesToCompress(options: {
  messages: Message[];
  startIndex: number;
  thresholdMessages: number;
  keepMessages: number;
}): Message[] {
  const uncompressed = options.messages.slice(options.startIndex);
  const requiredCount = options.thresholdMessages + options.keepMessages;
  if (uncompressed.length < requiredCount) return [];
  return uncompressed.slice(0, uncompressed.length - options.keepMessages);
}

async function buildNextCompressedContent(options: {
  sourceText: string;
  model: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (modelSupportsAttachments(options.model)) return options.sourceText;
  return generateSummary(options.sourceText, options.signal);
}

export const performBackgroundCompression = async (
  allMessages: Message[],
  currentCompression: Session["compression"],
  model: string,
  signal?: AbortSignal,
): Promise<Session["compression"] | null> => {
  const { thresholdMessages, keepMessages } = getCompressionConfig();
  const start = getCompressionStart(allMessages, currentCompression);
  const messages = getMessagesToCompress({
    messages: allMessages,
    startIndex: start.startIndex,
    thresholdMessages,
    keepMessages,
  });
  const source = buildCompressionSource(messages);
  if (!source.lastIncludedMessageId) return null;
  const generatedContent = await buildNextCompressedContent({
    sourceText: source.text,
    model,
    signal,
  });
  const nextContent =
    start.oldContent && !modelSupportsAttachments(model)
      ? `[New Summary Segment]:\n${generatedContent}`
      : generatedContent;
  const merged = mergeCompressedContentWithMemoryIds({
    previousContent: start.oldContent,
    previousMemoryIds: start.oldMemoryIds,
    nextContent,
    nextMemoryIds: source.includedMemoryIds,
  });
  return {
    compressedContent: merged.content,
    lastCompressedMessageId: source.lastIncludedMessageId,
    includedMemoryIds: merged.representedMemoryIds,
  };
};
