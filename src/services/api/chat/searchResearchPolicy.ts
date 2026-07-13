import { GROK_SEARCH_LIMITS } from "../../../config/limits";
import {
  GROK_WEB_SEARCH_TOOL_NAME,
  parseGrokSearchToolQuery,
  type GrokSearchToolResult,
} from "../../../lib/search/grokTool";
import { getCanonicalSearchUrlKey } from "../../../lib/search/urlKey";
import type { ToolCall } from "../../../types";
import type { ChatToolDefinition } from "./types";

const REPEATED_QUERY_SKIP_MESSAGE =
  "Web search skipped because an equivalent query already ran in this generation.";
const REPEATED_QUERY_STOP_MESSAGE =
  "Web research stopped because an equivalent query already ran in this generation.";
const SEARCH_BUDGET_SKIP_MESSAGE =
  "Web search skipped because the explicit per-generation research budget was reached.";
const SEARCH_BUDGET_STOP_MESSAGE = `Web research reached the explicit limit of ${GROK_SEARCH_LIMITS.maxToolCallsPerGeneration} searches per generation.`;

export interface SearchResearchPolicy {
  reviewToolCall(toolCall: ToolCall): ToolCall;
  recordRound(toolCalls: ToolCall[]): void;
  availableTools(tools: ChatToolDefinition[]): ChatToolDefinition[];
  continuationInstruction(): string;
}

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function skippedToolCall(toolCall: ToolCall, result: string): ToolCall {
  return {
    ...toolCall,
    status: "skipped",
    isError: true,
    result,
  };
}

function getSearchResult(toolCall: ToolCall): GrokSearchToolResult | null {
  if (toolCall.name !== GROK_WEB_SEARCH_TOOL_NAME || toolCall.isError)
    return null;
  const result = toolCall.result;
  if (!result || typeof result !== "object" || !("sources" in result))
    return null;
  return result as GrokSearchToolResult;
}

class DefaultSearchResearchPolicy implements SearchResearchPolicy {
  private readonly queries = new Set<string>();
  private readonly sourceUrls = new Set<string>();
  private acceptedSearches = 0;
  private noProgressRounds = 0;
  private stopReason: string | undefined;

  private stop(reason: string): void {
    this.stopReason ??= reason;
  }

  reviewToolCall(toolCall: ToolCall): ToolCall {
    if (toolCall.name !== GROK_WEB_SEARCH_TOOL_NAME) return toolCall;
    if (this.stopReason) {
      return skippedToolCall(
        toolCall,
        `Web search skipped. ${this.stopReason}`,
      );
    }
    let query: string;
    try {
      query = normalizeQuery(parseGrokSearchToolQuery(toolCall.args));
    } catch {
      return toolCall;
    }
    if (this.queries.has(query)) {
      this.stop(REPEATED_QUERY_STOP_MESSAGE);
      return skippedToolCall(toolCall, REPEATED_QUERY_SKIP_MESSAGE);
    }
    if (this.acceptedSearches >= GROK_SEARCH_LIMITS.maxToolCallsPerGeneration) {
      this.stop(SEARCH_BUDGET_STOP_MESSAGE);
      return skippedToolCall(toolCall, SEARCH_BUDGET_SKIP_MESSAGE);
    }
    this.queries.add(query);
    this.acceptedSearches += 1;
    if (this.acceptedSearches >= GROK_SEARCH_LIMITS.maxToolCallsPerGeneration) {
      this.stop(SEARCH_BUDGET_STOP_MESSAGE);
    }
    return toolCall;
  }

  recordRound(toolCalls: ToolCall[]): void {
    const results = toolCalls
      .map(getSearchResult)
      .filter((item) => item !== null);
    if (results.length === 0) return;
    let newSourceCount = 0;
    for (const result of results) {
      for (const source of result.sources) {
        const key = getCanonicalSearchUrlKey(source.url);
        if (!key || this.sourceUrls.has(key)) continue;
        this.sourceUrls.add(key);
        newSourceCount += 1;
      }
    }
    this.noProgressRounds = newSourceCount > 0 ? 0 : this.noProgressRounds + 1;
    if (this.noProgressRounds >= GROK_SEARCH_LIMITS.maxNoProgressRounds) {
      this.stop(
        "Web research stopped because consecutive searches added no new sources.",
      );
    }
  }

  availableTools(tools: ChatToolDefinition[]): ChatToolDefinition[] {
    if (!this.stopReason) return tools;
    return tools.filter(
      (tool) => tool.function.name !== GROK_WEB_SEARCH_TOOL_NAME,
    );
  }

  continuationInstruction(): string {
    if (!this.stopReason) {
      return "Use the tool results above to answer the user's original request. Only call another tool if a specific external fact is still missing.";
    }
    return `${this.stopReason} Use the available tool results and answer the user's original request now.`;
  }
}

export function createSearchResearchPolicy(): SearchResearchPolicy {
  return new DefaultSearchResearchPolicy();
}
