import type { Message, Session } from "../../types";
import { normalizeCompressedContentWithMemoryIds } from "../utils/contextCompression";

function getLegacySuppressedIds(session: Session | null | undefined) {
  return Array.from(new Set(session?.memoryContext?.injectedMemoryIds || []));
}

export function getSuppressedMemoryIds(
  session: Session | null | undefined,
  messages: Message[],
): string[] {
  const compression = session?.compression;
  if (!compression) return getLegacySuppressedIds(session);
  const markerIndex = messages.findIndex(
    (message) => message.id === compression.lastCompressedMessageId,
  );
  if (markerIndex < 0) return getLegacySuppressedIds(session);

  const normalized = normalizeCompressedContentWithMemoryIds({
    content: compression.compressedContent,
    memoryIds: compression.includedMemoryIds || [],
  });
  const ids = new Set(normalized.representedMemoryIds);
  const firstUserMessage = messages.find((message) => message.role === "user");
  const representedMessages = [
    ...(firstUserMessage ? [firstUserMessage] : []),
    ...messages.slice(markerIndex + 1),
  ];
  for (const message of representedMessages) {
    for (const id of message.memoryContext?.injectedMemoryIds || []) {
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}
