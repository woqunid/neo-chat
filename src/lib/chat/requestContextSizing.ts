import type { Attachment, Message, ToolCall } from "../../types";

export const REQUEST_CHARS_PER_TOKEN = 4;

export function serializeContextValue(value: unknown): string {
  if (value === undefined) return "";
  return JSON.stringify(value) || "";
}

export function getAttachmentChars(attachment: Attachment): number {
  return (
    (attachment.data?.length || 0) +
    (attachment.url?.length || 0) +
    attachment.fileName.length +
    attachment.mimeType.length
  );
}

export function getMessageTextChars(message: Message): number {
  return message.content.length;
}

export function getHistoryAttachmentChars(history: Message[]): number {
  return history.reduce(
    (sum, message) =>
      sum +
      (message.attachments || []).reduce(
        (attachmentSum, attachment) =>
          attachmentSum + getAttachmentChars(attachment),
        0,
      ),
    0,
  );
}

export function getHistoryToolChars(history: Message[]): number {
  return history.reduce(
    (sum, message) =>
      sum +
      (message.toolCalls || []).reduce(
        (toolSum, toolCall) => toolSum + serializeContextValue(toolCall).length,
        0,
      ),
    0,
  );
}

export function getToolBaseChars(toolCall: ToolCall): number {
  return serializeContextValue({
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args,
    status: toolCall.status,
  }).length;
}
