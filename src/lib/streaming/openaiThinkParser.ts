export type ThinkTagStreamEvent = {
  type: "content" | "reasoning";
  content: string;
};

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

function splitBeforePotentialTagPrefix(value: string, tag: string) {
  const lower = value.toLowerCase();
  for (
    let length = Math.min(tag.length - 1, lower.length);
    length > 0;
    length--
  ) {
    if (tag.startsWith(lower.slice(-length))) {
      return { ready: value.slice(0, -length), pending: value.slice(-length) };
    }
  }
  return { ready: value, pending: "" };
}

function pushEvent(
  events: ThinkTagStreamEvent[],
  type: ThinkTagStreamEvent["type"],
  content: string,
): void {
  if (content) events.push({ type, content });
}

export function createThinkTagStreamParser() {
  let buffer = "";
  let insideThink = false;

  const consume = (input: string): ThinkTagStreamEvent[] => {
    buffer += input;
    const events: ThinkTagStreamEvent[] = [];
    while (buffer) {
      const tag = insideThink ? THINK_CLOSE_TAG : THINK_OPEN_TAG;
      const type = insideThink ? "reasoning" : "content";
      const index = buffer.toLowerCase().indexOf(tag);
      if (index !== -1) {
        pushEvent(events, type, buffer.slice(0, index));
        buffer = buffer.slice(index + tag.length);
        insideThink = !insideThink;
        continue;
      }
      const { ready, pending } = splitBeforePotentialTagPrefix(buffer, tag);
      pushEvent(events, type, ready);
      buffer = pending;
      break;
    }
    return events;
  };

  const flush = (): ThinkTagStreamEvent[] => {
    const content = buffer;
    buffer = "";
    return content
      ? [{ type: insideThink ? "reasoning" : "content", content }]
      : [];
  };
  return { consume, flush };
}
