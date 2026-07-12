import type { ToolCall } from "@/types";
import { executePluginFunction } from "@/utils/pluginUtils";
import {
  executeGrokSearchTool,
  GROK_WEB_SEARCH_TOOL_NAME,
} from "../../../lib/search/grokTool";
import { PLUGIN_EXECUTION_LIMITS } from "../../../config/limits";
import { searchWithGrok } from "../grokSearchService";
import { compactPluginImageResultForHistory } from "./pluginImageResults";
import { executeMemorySearchTool, isInternalMemoryTool } from "./memoryTools";
import { runChatRound } from "./streamRound";
import { ChatStreamRuntime } from "./streamRuntime";

function pendingToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.filter(
    (toolCall) =>
      toolCall.name &&
      (toolCall.status === "pending" ||
        toolCall.status === "running" ||
        toolCall.result === undefined),
  );
}

async function executeTool(
  runtime: ChatStreamRuntime,
  toolCall: ToolCall,
): Promise<unknown> {
  if (isInternalMemoryTool(toolCall.name)) {
    return executeMemorySearchTool(toolCall.args);
  }
  if (toolCall.name === GROK_WEB_SEARCH_TOOL_NAME) {
    return executeGrokSearchTool({
      args: toolCall.args,
      search: searchWithGrok,
      signal: runtime.prepared.options.signal,
      onStatus: (event) => runtime.trackGrokEvent(event),
    });
  }
  return executePluginFunction(
    toolCall.name,
    toolCall.args,
    toolCall.auth,
    runtime.prepared.options.activePlugins,
    runtime.prepared.options.signal,
  );
}

function completedToolCall(toolCall: ToolCall, result: unknown): ToolCall {
  const isError = Boolean(
    result && typeof result === "object" && "error" in result,
  );
  return {
    ...toolCall,
    status: isError ? "error" : "success",
    isError,
    result: isError ? result : compactPluginImageResultForHistory(result),
  };
}

async function executeOne(
  runtime: ChatStreamRuntime,
  toolCall: ToolCall,
): Promise<ToolCall> {
  try {
    const completed = completedToolCall(
      toolCall,
      await executeTool(runtime, toolCall),
    );
    runtime.updateToolCall(completed);
    return completed;
  } catch (error) {
    const failed: ToolCall = {
      ...toolCall,
      status: "error",
      isError: true,
      result: error instanceof Error ? error.message : String(error),
    };
    runtime.updateToolCall(failed);
    return failed;
  }
}

function markRunning(runtime: ChatStreamRuntime, calls: ToolCall[]): void {
  calls.forEach((toolCall) => {
    runtime.updateToolCall({ ...toolCall, status: "running" });
  });
}

function stopAtRoundLimit(
  runtime: ChatStreamRuntime,
  calls: ToolCall[],
  content: string,
): string {
  calls.forEach((toolCall) => {
    runtime.updateToolCall({
      ...toolCall,
      status: "skipped",
      isError: true,
      result:
        "Tool execution skipped because the maximum tool-call rounds were reached.",
    });
  });
  const limit = PLUGIN_EXECUTION_LIMITS.maxToolRounds;
  return (
    runtime.committedContent +
    content +
    `\n\n[Tool Error] Tool execution stopped after reaching the ${limit} tool-call rounds limit.`
  );
}

export async function runToolRounds(
  runtime: ChatStreamRuntime,
): Promise<string> {
  const limit = PLUGIN_EXECUTION_LIMITS.maxToolRounds;
  for (let round = 0; round <= limit; round += 1) {
    const result = await runChatRound(runtime);
    const pending = pendingToolCalls(result.toolCalls);
    if (pending.length === 0) return runtime.committedContent + result.content;
    if (round === limit) {
      return stopAtRoundLimit(runtime, pending, result.content);
    }
    markRunning(runtime, pending);
    const executed = await Promise.all(
      pending.map((toolCall) => executeOne(runtime, toolCall)),
    );
    runtime.commitRound(result, executed);
  }
  return runtime.committedContent;
}
