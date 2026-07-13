import type { MessageOutputBlock, ToolCall } from "../../types";
import { mergeImages, mergeSources } from "./searchUpdate";

type ResearchBlock = Extract<
  MessageOutputBlock,
  { type: "reasoning" | "search" | "tool_group" }
>;

function isResearchBlock(block: MessageOutputBlock): block is ResearchBlock {
  return (
    block.type === "reasoning" ||
    block.type === "search" ||
    block.type === "tool_group"
  );
}

function mergeToolCalls(
  existing: ToolCall[],
  incoming: ToolCall[],
): ToolCall[] {
  const merged = new Map(existing.map((toolCall) => [toolCall.id, toolCall]));
  for (const toolCall of incoming) {
    merged.set(toolCall.id, { ...merged.get(toolCall.id), ...toolCall });
  }
  return [...merged.values()];
}

function mergeResearchBlock(
  current: ResearchBlock,
  incoming: ResearchBlock,
): ResearchBlock {
  if (current.type !== incoming.type) return current;
  if (current.type === "reasoning" && incoming.type === "reasoning") {
    return {
      ...current,
      content: `${current.content}\n\n${incoming.content}`,
      durationMs: (current.durationMs || 0) + (incoming.durationMs || 0),
    };
  }
  if (current.type === "tool_group" && incoming.type === "tool_group") {
    return {
      ...current,
      toolCalls: mergeToolCalls(current.toolCalls, incoming.toolCalls),
    };
  }
  if (current.type === "search" && incoming.type === "search") {
    return {
      ...current,
      isSearching: Boolean(current.isSearching || incoming.isSearching),
      error: incoming.error || current.error,
      sources: mergeSources(current.sources, incoming.sources),
      images: mergeImages(current.images, incoming.images),
    };
  }
  return current;
}

function collapseResearchRun(blocks: ResearchBlock[]): ResearchBlock[] {
  const order: ResearchBlock["type"][] = [];
  const merged = new Map<ResearchBlock["type"], ResearchBlock>();
  for (const block of blocks) {
    const current = merged.get(block.type);
    const previousIndex = order.indexOf(block.type);
    if (previousIndex !== -1) order.splice(previousIndex, 1);
    order.push(block.type);
    merged.set(
      block.type,
      current ? mergeResearchBlock(current, block) : block,
    );
  }
  return order
    .map((type) => merged.get(type))
    .filter((block) => block !== undefined);
}

export function collapseResearchBlocksForDisplay(
  blocks: MessageOutputBlock[],
): MessageOutputBlock[] {
  const output: MessageOutputBlock[] = [];
  let researchRun: ResearchBlock[] = [];
  const flush = () => {
    output.push(...collapseResearchRun(researchRun));
    researchRun = [];
  };
  for (const block of blocks) {
    if (isResearchBlock(block)) researchRun.push(block);
    else {
      flush();
      output.push(block);
    }
  }
  flush();
  return output;
}
