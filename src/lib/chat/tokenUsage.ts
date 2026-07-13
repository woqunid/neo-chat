import type { ChatUsagePayload } from "../../services/api/chat/streamTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addUsageValues(current: unknown, incoming: unknown): unknown {
  if (typeof incoming === "number") {
    return (typeof current === "number" ? current : 0) + incoming;
  }
  if (!isRecord(incoming)) return incoming;
  const currentRecord = isRecord(current) ? current : {};
  return Object.fromEntries(
    [...new Set([...Object.keys(currentRecord), ...Object.keys(incoming)])].map(
      (key) => [
        key,
        key in incoming
          ? addUsageValues(currentRecord[key], incoming[key])
          : currentRecord[key],
      ],
    ),
  );
}

export function accumulateChatUsage(
  current: ChatUsagePayload | undefined,
  incoming: ChatUsagePayload | undefined,
): ChatUsagePayload | undefined {
  if (!incoming) return current;
  return {
    ...(current || {}),
    ...(incoming.usage
      ? { usage: addUsageValues(current?.usage, incoming.usage) }
      : {}),
    ...(incoming.usageMetadata
      ? {
          usageMetadata: addUsageValues(
            current?.usageMetadata,
            incoming.usageMetadata,
          ),
        }
      : {}),
  };
}
