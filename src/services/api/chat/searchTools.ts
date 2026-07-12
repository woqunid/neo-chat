import {
  GROK_WEB_SEARCH_TOOL,
  GROK_WEB_SEARCH_TOOL_NAME,
} from "../../../lib/search/grokTool";
import type { ChatToolDefinition } from "./types";

export function addGrokSearchTool(
  tools: ChatToolDefinition[],
  toolNames: Set<string>,
): void {
  tools.push(GROK_WEB_SEARCH_TOOL as ChatToolDefinition);
  toolNames.add(GROK_WEB_SEARCH_TOOL_NAME);
}
