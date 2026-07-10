import type { Attachment, Message, ModelMetadata } from "../../types";
import {
  executeGrokSearchTool,
  type GrokSearchExecutor,
  type GrokSearchStatusEvent,
} from "../../lib/search/grokTool";
import { buildSearchContextForPrompt } from "../../lib/search/context";
import {
  allocateContextBudget,
  trimTextToEstimatedTokens,
} from "../../lib/chat/contextBudget";

interface GrokSearchPreflightOptions {
  query: string;
  history: Message[];
  attachments: Attachment[];
  metadata?: ModelMetadata;
  signal?: AbortSignal;
  search: GrokSearchExecutor;
  onStatus?: (event: GrokSearchStatusEvent) => void;
}

function getAttachmentLength(attachment: Attachment): number {
  return (
    (attachment.fileName?.length || 0) +
    (attachment.data?.length || 0) +
    (attachment.url?.length || 0)
  );
}

function getHistoryLength(history: Message[]): number {
  return history.reduce(
    (sum, message) =>
      sum +
      message.content.length +
      (message.reasoning?.length || 0) +
      (message.attachments?.reduce(
        (total, attachment) => total + getAttachmentLength(attachment),
        0,
      ) || 0),
    0,
  );
}

function fitSearchContext(
  context: string,
  options: GrokSearchPreflightOptions,
): string {
  const budget = allocateContextBudget({
    modelInputTokenLimit: options.metadata?.limit?.context,
    reservedOutputTokens: options.metadata?.limit?.output,
    sources: {
      history: getHistoryLength(options.history),
      attachments: options.attachments.reduce(
        (sum, attachment) => sum + getAttachmentLength(attachment),
        0,
      ),
      search: context.length,
    },
  });
  return trimTextToEstimatedTokens(
    context,
    budget.allocations.search.maxTokens,
  );
}

export async function prepareGrokSearchPreflight(
  options: GrokSearchPreflightOptions,
): Promise<string> {
  const result = await executeGrokSearchTool({
    args: { query: options.query },
    search: options.search,
    signal: options.signal,
    onStatus: options.onStatus,
  });
  return fitSearchContext(buildSearchContextForPrompt(result), options);
}
