import type { Message, MessageGenerationStatus } from "@/types";

const ACTIVE_GENERATION_STATUSES = new Set<MessageGenerationStatus>([
  "pending",
  "streaming",
]);

export function isMessageGenerationActive(message: Message): boolean {
  return (
    message.role === "model" &&
    !!message.generationStatus &&
    ACTIVE_GENERATION_STATUSES.has(message.generationStatus)
  );
}

export function createStoppedGenerationUpdate(
  message: Message,
  stoppedAt: number,
): Partial<Message> {
  return {
    generationStatus: "aborted",
    ...(message.timing
      ? {}
      : {
          timing: {
            startTime: message.timestamp,
            endTime: stoppedAt,
            duration: stoppedAt - message.timestamp,
          },
        }),
  };
}
