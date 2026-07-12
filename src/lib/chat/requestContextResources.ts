import type { Attachment, Message, ToolCall } from "../../types";
import {
  getAttachmentChars,
  getToolBaseChars,
  serializeContextValue,
} from "./requestContextSizing";

export const ATTACHMENT_OMISSION_NOTICE =
  "\n[Historical attachment omitted to fit the context budget.]";
export const TOOL_OMISSION_NOTICE =
  "\n[Older tool calls omitted to fit the context budget.]";

const MAX_TOOL_ARGUMENT_CHARS = 300;
const TOOL_ARGUMENT_SUMMARY_CHARS = 260;

export function boundHistoricalAttachments(
  history: Message[],
  maxChars: number,
): Message[] {
  let remaining = maxChars;
  return history
    .slice()
    .reverse()
    .map((message) => {
      if (!message.attachments?.length) return message;
      const kept: Attachment[] = [];
      let omitted = 0;
      for (const attachment of message.attachments.slice().reverse()) {
        const size = getAttachmentChars(attachment);
        if (size > remaining) {
          omitted += 1;
          continue;
        }
        kept.unshift(attachment);
        remaining -= size;
      }
      return {
        ...message,
        content:
          omitted > 0
            ? `${ATTACHMENT_OMISSION_NOTICE}\n${message.content}`
            : message.content,
        attachments: kept.length > 0 ? kept : undefined,
      };
    })
    .reverse();
}

function boundToolArgs(toolCall: ToolCall): ToolCall {
  const serializedArgs = serializeContextValue(toolCall.args);
  if (serializedArgs.length <= MAX_TOOL_ARGUMENT_CHARS) return toolCall;
  return {
    ...toolCall,
    args: {
      summary: serializedArgs.slice(0, TOOL_ARGUMENT_SUMMARY_CHARS),
      truncated: true,
    },
  };
}

function truncateToolResult(toolCall: ToolCall, maxChars: number): string {
  const header =
    `[Tool result truncated to context budget]\nTool: ${toolCall.name}\n` +
    `Arguments: ${serializeContextValue(toolCall.args)}\nResult:\n`;
  if (maxChars <= header.length) return header.slice(0, Math.max(0, maxChars));
  const original =
    typeof toolCall.result === "string"
      ? toolCall.result
      : serializeContextValue(toolCall.result);
  return `${header}${original.slice(0, maxChars - header.length)}`;
}

interface BoundToolCallResult {
  toolCall?: ToolCall;
  remaining: number;
}

function boundToolCall(
  toolCall: ToolCall,
  remaining: number,
): BoundToolCallResult {
  const baseCall = boundToolArgs(toolCall);
  const baseChars = getToolBaseChars(baseCall);
  if (remaining <= 0 || baseChars > remaining) return { remaining };
  const afterBase = remaining - baseChars;
  if (toolCall.result === undefined) {
    return { toolCall: baseCall, remaining: afterBase };
  }
  const resultText =
    typeof toolCall.result === "string"
      ? toolCall.result
      : serializeContextValue(toolCall.result);
  if (resultText.length <= afterBase) {
    return {
      toolCall: { ...baseCall, result: toolCall.result },
      remaining: afterBase - resultText.length,
    };
  }
  const result = truncateToolResult(baseCall, afterBase);
  return {
    toolCall: { ...baseCall, result },
    remaining: Math.max(0, afterBase - result.length),
  };
}

function boundMessageToolCalls(
  message: Message,
  initialRemaining: number,
): { message: Message; remaining: number } {
  if (!message.toolCalls?.length)
    return { message, remaining: initialRemaining };
  const kept: ToolCall[] = [];
  let remaining = initialRemaining;
  let omitted = false;
  for (const toolCall of message.toolCalls.slice().reverse()) {
    const bounded = boundToolCall(toolCall, remaining);
    remaining = bounded.remaining;
    if (bounded.toolCall) kept.unshift(bounded.toolCall);
    else omitted = true;
  }
  return {
    message: {
      ...message,
      content: omitted
        ? `${TOOL_OMISSION_NOTICE}\n${message.content}`
        : message.content,
      toolCalls: kept.length > 0 ? kept : undefined,
    },
    remaining,
  };
}

export function boundToolResults(
  history: Message[],
  maxChars: number,
): Message[] {
  const bounded: Message[] = [];
  let remaining = maxChars;
  for (const message of history.slice().reverse()) {
    const result = boundMessageToolCalls(message, remaining);
    bounded.unshift(result.message);
    remaining = result.remaining;
  }
  return bounded;
}
