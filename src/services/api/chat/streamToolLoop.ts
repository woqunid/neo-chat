import type { ToolCall } from "@/types";
import { useSettingsStore } from "../../../store/core/settingsStore";
import { executePluginFunction } from "@/utils/pluginUtils";
import { resolvePluginFunction } from "../../../lib/plugin/resolve";
import { getPluginFunctionRisk } from "../../../lib/plugin/risk";
import {
  executeGrokSearchTool,
  GROK_WEB_SEARCH_TOOL_NAME,
} from "../../../lib/search/grokTool";
import { PLUGIN_EXECUTION_LIMITS } from "../../../config/limits";
import { mapWithConcurrency } from "../../../lib/utils/concurrency";
import { searchWithGrok } from "../grokSearchService";
import { compactPluginImageResultForHistory } from "./pluginImageResults";
import { getPluginResultImageAttachments } from "./pluginImageResults";
import { cacheGeneratedImageAttachments } from "../../../lib/utils/generatedImages";
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

function getConfirmationRequest(
  runtime: ChatStreamRuntime,
  toolCall: ToolCall,
) {
  if (
    isInternalMemoryTool(toolCall.name) ||
    toolCall.name === GROK_WEB_SEARCH_TOOL_NAME
  ) {
    return null;
  }
  const state = useSettingsStore.getState();
  const resolved = resolvePluginFunction(
    state.installedPlugins,
    toolCall.name,
    runtime.prepared.options.activePlugins,
  );
  if (!resolved) return null;
  const risk = getPluginFunctionRisk(resolved.functionDef);
  if (risk === "read") return null;
  if (
    resolved.plugin.source === "mcp" &&
    state.pluginConfigs[resolved.plugin.id]?.mcp?.trusted
  ) {
    return null;
  }
  return {
    toolCall: { ...toolCall, risk },
    pluginId: resolved.plugin.id,
    pluginTitle: resolved.plugin.title || resolved.plugin.id,
    risk,
    isMcp: resolved.plugin.source === "mcp",
  };
}

async function confirmToolCalls(
  runtime: ChatStreamRuntime,
  toolCalls: ToolCall[],
): Promise<ToolCall[]> {
  const confirmed: ToolCall[] = [];
  for (const toolCall of toolCalls) {
    const request = getConfirmationRequest(runtime, toolCall);
    if (!request) {
      confirmed.push(toolCall);
      continue;
    }
    const awaiting: ToolCall = {
      ...request.toolCall,
      status: "awaiting_confirmation",
      confirmation: { required: true, state: "pending" },
    };
    runtime.updateToolCall(awaiting);
    const approved = runtime.prepared.options.requestToolConfirmation
      ? await runtime.prepared.options.requestToolConfirmation(request)
      : false;
    if (!approved) {
      const denied: ToolCall = {
        ...awaiting,
        status: "denied",
        isError: true,
        result: "用户拒绝了本次工具调用。",
        confirmation: {
          required: true,
          state: "denied",
          decidedAt: Date.now(),
        },
      };
      runtime.updateToolCall(denied);
      confirmed.push(denied);
      continue;
    }
    const allowed: ToolCall = {
      ...awaiting,
      status: "pending",
      confirmation: {
        required: true,
        state: "approved",
        decidedAt: Date.now(),
      },
    };
    runtime.updateToolCall(allowed);
    confirmed.push(allowed);
  }
  return confirmed;
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
    runtime.prepared.options.sessionId,
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
  const signal = runtime.prepared.options.signal;
  signal?.throwIfAborted();
  try {
    const result = await executeTool(runtime, toolCall);
    const images = getPluginResultImageAttachments(result);
    if (images.length) {
      runtime.appendToolImages(await cacheGeneratedImageAttachments(images));
    }
    const completed = completedToolCall(toolCall, result);
    runtime.updateToolCall(completed);
    return completed;
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error;
    }
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

function skippedForTotalBudget(toolCall: ToolCall): ToolCall {
  return {
    ...toolCall,
    status: "skipped",
    isError: true,
    result:
      "Tool execution skipped because the per-generation total tool-call budget was reached.",
  };
}

function reviewWithinBudget(
  runtime: ChatStreamRuntime,
  pending: ToolCall[],
  remainingBudget: number,
): ToolCall[] {
  let executableCount = 0;
  return pending.map((toolCall) => {
    if (executableCount >= remainingBudget) {
      return skippedForTotalBudget(toolCall);
    }
    const reviewed = runtime.searchResearch.reviewToolCall(toolCall);
    if (reviewed.status !== "skipped") executableCount += 1;
    return reviewed;
  });
}

async function executeWithinBudget(
  runtime: ChatStreamRuntime,
  pending: ToolCall[],
  remainingBudget: number,
): Promise<{ calls: ToolCall[]; attempted: number }> {
  const reviewed = reviewWithinBudget(runtime, pending, remainingBudget);
  const confirmed = await confirmToolCalls(runtime, reviewed);
  const executable = confirmed.filter(
    (toolCall) => toolCall.status !== "skipped" && toolCall.status !== "denied",
  );
  const skipped = confirmed.filter(
    (toolCall) => toolCall.status === "skipped" || toolCall.status === "denied",
  );
  markRunning(runtime, executable);
  skipped.forEach((toolCall) => runtime.updateToolCall(toolCall));
  const executed = await mapWithConcurrency(
    executable,
    PLUGIN_EXECUTION_LIMITS.maxToolConcurrency,
    (toolCall) => executeOne(runtime, toolCall),
  );
  const completed = new Map(
    [...executed, ...skipped].map((toolCall) => [toolCall.id, toolCall]),
  );
  return {
    calls: confirmed.map((toolCall) => completed.get(toolCall.id) || toolCall),
    attempted: executable.length,
  };
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
  let executedToolCallCount = 0;
  for (let round = 0; round <= limit; round += 1) {
    const result = await runChatRound(runtime);
    runtime.commitUsage(result.usage);
    const pending = pendingToolCalls(result.toolCalls);
    if (pending.length === 0) return runtime.committedContent + result.content;
    if (round === limit) {
      return stopAtRoundLimit(runtime, pending, result.content);
    }
    const remainingBudget = Math.max(
      0,
      PLUGIN_EXECUTION_LIMITS.maxTotalToolCalls - executedToolCallCount,
    );
    const execution = await executeWithinBudget(
      runtime,
      pending,
      remainingBudget,
    );
    executedToolCallCount += execution.attempted;
    runtime.searchResearch.recordRound(execution.calls);
    runtime.commitRound(result, execution.calls);
  }
  return runtime.committedContent;
}
