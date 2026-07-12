import { v7 as uuidv7 } from "uuid";
import type { Attachment, ToolCall } from "@/types";
import { createMessageOutputBlockBuilder } from "../../../lib/chat/messageOutputBlocks";
import type { GrokSearchStatusEvent } from "../../../lib/search/grokTool";
import type {
  ChatRoundResult,
  PreparedChatRequest,
  SearchStatusResults,
} from "./streamTypes";

export class ChatStreamRuntime {
  readonly output: ReturnType<typeof createMessageOutputBlockBuilder>;
  readonly allToolCalls: ToolCall[] = [];
  committedContent = "";
  committedReasoning = "";
  requestHistory: PreparedChatRequest["requestHistory"];
  requestMessage: string;
  requestAttachments: Attachment[];
  requestConfig: PreparedChatRequest["requestConfig"];

  constructor(
    readonly prepared: PreparedChatRequest,
    output = createMessageOutputBlockBuilder(),
    private readonly onGrokStatus?: (event: GrokSearchStatusEvent) => void,
  ) {
    this.output = output;
    this.requestHistory = prepared.requestHistory;
    this.requestMessage = prepared.requestMessage;
    this.requestAttachments = prepared.requestAttachments;
    this.requestConfig = prepared.requestConfig;
  }

  trackGrokEvent(event: GrokSearchStatusEvent): void {
    this.onGrokStatus?.(event);
  }

  emitBlocks(): void {
    this.prepared.options.onOutputBlocks?.(this.output.getBlocks());
  }

  emitContent(content: string, reasoning: string): void {
    this.prepared.options.onChunk(
      this.committedContent + content,
      this.committedReasoning + reasoning,
      this.output.getBlocks(),
    );
  }

  trackSearch(isSearching: boolean, results?: SearchStatusResults): void {
    this.output.upsertSearch({ isSearching, results });
    this.prepared.options.onSearchStatus?.(isSearching, results);
    this.emitBlocks();
  }

  upsertToolCall(toolCall: ToolCall): void {
    const index = this.allToolCalls.findIndex(
      (item) => item.id === toolCall.id,
    );
    if (index === -1) this.allToolCalls.push(toolCall);
    else
      this.allToolCalls[index] = { ...this.allToolCalls[index], ...toolCall };
    this.prepared.options.onToolUpdate?.([...this.allToolCalls]);
  }

  updateToolCall(toolCall: ToolCall): void {
    this.output.updateToolCall(toolCall);
    this.emitBlocks();
    this.upsertToolCall(toolCall);
  }

  commitRound(result: ChatRoundResult, toolCalls: ToolCall[]): void {
    if (result.content) this.committedContent += `${result.content}\n\n`;
    if (result.reasoning) this.committedReasoning += `${result.reasoning}\n\n`;
    this.requestHistory = [
      ...this.requestHistory,
      {
        id: uuidv7(),
        role: "user",
        content: this.requestMessage,
        attachments: this.requestAttachments,
        timestamp: Date.now(),
      },
      {
        id: uuidv7(),
        role: "model",
        content: result.content,
        reasoning: result.reasoning,
        toolCalls,
        timestamp: Date.now(),
      },
    ];
    this.requestMessage =
      "Use the tool results above to answer the user's original request. Only call another tool if more external data is required.";
    this.requestAttachments = [];
  }
}
