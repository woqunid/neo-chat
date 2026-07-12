import type { Attachment, Message } from "../../types";
import { allocateContextBudget } from "./contextBudget";
import { selectHistoryTurns } from "./requestContextHistory";
import {
  ATTACHMENT_OMISSION_NOTICE,
  boundHistoricalAttachments,
  boundToolResults,
} from "./requestContextResources";
import {
  getAttachmentChars,
  getHistoryAttachmentChars,
  getHistoryToolChars,
  getMessageTextChars,
  REQUEST_CHARS_PER_TOKEN,
  serializeContextValue,
} from "./requestContextSizing";

export class ContextBudgetExceededError extends Error {
  readonly code = "CONTEXT_BUDGET_EXCEEDED";
  readonly recoverable = true;

  constructor() {
    super(
      "The current message, attachments, instructions, and tools exceed this model's input limit.",
    );
    this.name = "ContextBudgetExceededError";
  }
}

export interface RequestContextBudgetOptions {
  newMessage: string;
  attachments: Attachment[];
  modelInputTokenLimit?: number;
  reservedOutputTokens?: number;
  systemInstruction?: string;
  tools?: unknown[];
}

function getRequestedHistoryChars(history: Message[]): number {
  return history.reduce(
    (sum, message) =>
      sum +
      getMessageTextChars(message) +
      (message.attachments?.length || 0) * ATTACHMENT_OMISSION_NOTICE.length,
    0,
  );
}

function getFixedRequestChars(options: RequestContextBudgetOptions): number {
  return (
    options.newMessage.length +
    (options.systemInstruction?.length || 0) +
    serializeContextValue(options.tools || []).length +
    options.attachments.reduce(
      (sum, attachment) => sum + getAttachmentChars(attachment),
      0,
    )
  );
}

function getResourceBudgets(
  remainingRequestChars: number,
  attachmentMaxTokens: number,
  toolMaxTokens: number,
) {
  const attachmentBudget = Math.min(
    attachmentMaxTokens * REQUEST_CHARS_PER_TOKEN,
    remainingRequestChars,
  );
  const toolBudget = Math.min(
    toolMaxTokens * REQUEST_CHARS_PER_TOKEN,
    Math.max(0, remainingRequestChars - attachmentBudget),
  );
  return {
    attachmentBudget,
    toolBudget,
    historyBudget: Math.max(
      0,
      remainingRequestChars - attachmentBudget - toolBudget,
    ),
  };
}

export function boundHistoryForRequest(
  history: Message[],
  options: RequestContextBudgetOptions,
): Message[] {
  const budget = allocateContextBudget({
    modelInputTokenLimit: options.modelInputTokenLimit,
    reservedOutputTokens: options.reservedOutputTokens,
    sources: {
      history: getRequestedHistoryChars(history),
      attachments: getHistoryAttachmentChars(history),
      tools: getHistoryToolChars(history),
    },
  });
  const fixedChars = getFixedRequestChars(options);
  const availableChars = budget.totalAvailableTokens * REQUEST_CHARS_PER_TOKEN;
  if (fixedChars > availableChars) throw new ContextBudgetExceededError();
  if (history.length === 0) return [];

  const resourceBudgets = getResourceBudgets(
    availableChars - fixedChars,
    budget.allocations.attachments.maxTokens,
    budget.allocations.tools.maxTokens,
  );
  const sanitized = boundToolResults(
    boundHistoricalAttachments(history, resourceBudgets.attachmentBudget),
    resourceBudgets.toolBudget,
  );
  return selectHistoryTurns(sanitized, resourceBudgets.historyBudget);
}
