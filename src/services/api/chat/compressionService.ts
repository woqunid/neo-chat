import type { Message, Session } from "@/types";
import { getTaskModel, useSettingsStore } from "@/store/core/settingsStore";
import { v7 as uuidv7 } from "uuid";
import { parseModelString } from "@/lib/utils/model";
import {
  createContextCompressionSummaryPrompt,
  mergeCompressedContent,
  normalizeCompressedContent,
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
const generateSummary = async (text: string): Promise<string> => {
  try {
    const summaryModel = getTaskModel("contextCompression");
    const prompt = createContextCompressionSummaryPrompt(text);
    return await streamGenerateContent(summaryModel, prompt, {
      onChunk: () => {},
    });
  } catch (e) {
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
): { startIndex: number; oldContent: string } {
  if (!compression) return { startIndex: 1, oldContent: "" };
  const index = messages.findIndex(
    (message) => message.id === compression.lastCompressedMessageId,
  );
  return {
    startIndex: index < 0 ? 0 : index + 1,
    oldContent: index < 0 ? "" : compression.compressedContent,
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

function serializeMessages(messages: Message[]): string {
  return messages
    .map(({ role, content }) => `[${role.toUpperCase()}]: ${content}`)
    .join("\n\n");
}

async function buildCompressedContent(options: {
  oldContent: string;
  newContent: string;
  model: string;
}): Promise<string> {
  if (modelSupportsAttachments(options.model)) {
    return mergeCompressedContent(options.oldContent, options.newContent);
  }
  const summary = await generateSummary(options.newContent);
  const segment = options.oldContent
    ? `[New Summary Segment]:\n${summary}`
    : summary;
  return mergeCompressedContent(options.oldContent, segment);
}

export const performBackgroundCompression = async (
  allMessages: Message[],
  currentCompression: Session["compression"],
  model: string,
): Promise<Session["compression"] | null> => {
  const { thresholdMessages, keepMessages } = getCompressionConfig();
  const start = getCompressionStart(allMessages, currentCompression);
  const messages = getMessagesToCompress({
    messages: allMessages,
    startIndex: start.startIndex,
    thresholdMessages,
    keepMessages,
  });
  const lastMessage = messages.at(-1);
  if (!lastMessage) return null;
  const compressedContent = await buildCompressedContent({
    oldContent: start.oldContent,
    newContent: serializeMessages(messages),
    model,
  });
  return {
    compressedContent,
    lastCompressedMessageId: lastMessage.id,
  };
};
