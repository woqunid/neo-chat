import type { Message, MessageOutputBlock } from "./types";
import { getMessageOutputBlocks } from "./messageOutputBlocks";

export type ExportableMessageOutputBlock = Extract<
  MessageOutputBlock,
  { type: "text" | "image" }
>;

const isExportableBlock = (
  block: MessageOutputBlock,
): block is ExportableMessageOutputBlock =>
  block.type === "text" || block.type === "image";

export function createMessageExportSnapshot(message: Message): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    outputBlocks: getMessageOutputBlocks(message).filter(isExportableBlock),
  };
}
