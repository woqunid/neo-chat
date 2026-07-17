import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "../types";
import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";

const mocks = vi.hoisted(() => ({
  executePluginFunction: vi.fn(),
  runChatRound: vi.fn(),
}));

vi.mock("@/utils/pluginUtils", () => ({
  executePluginFunction: mocks.executePluginFunction,
}));

vi.mock("../store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ installedPlugins: [], pluginConfigs: {} }),
  },
}));

vi.mock("../services/api/chat/streamRound", () => ({
  runChatRound: mocks.runChatRound,
}));

vi.mock("../services/api/chat/memoryTools", () => ({
  executeMemorySearchTool: vi.fn(),
  isInternalMemoryTool: vi.fn(() => false),
}));

vi.mock("../lib/search/grokTool", () => ({
  executeGrokSearchTool: vi.fn(),
  GROK_WEB_SEARCH_TOOL_NAME: "grok_web_search",
}));

vi.mock("../services/api/grokSearchService", () => ({
  searchWithGrok: vi.fn(),
}));

const { runToolRounds } = await import("../services/api/chat/streamToolLoop");

function toolCall(index: number): ToolCall {
  return {
    id: `tool-${index}`,
    name: "plugin_tool",
    args: {},
    status: "pending",
  };
}

function createRuntime() {
  const searchResearch = {
    reviewToolCall: (toolCall: ToolCall) => toolCall,
    recordRound: vi.fn(),
  };
  return {
    prepared: {
      options: { activePlugins: [], signal: new AbortController().signal },
    },
    committedContent: "",
    commitUsage: vi.fn(),
    updateToolCall: vi.fn(),
    commitRound: vi.fn(),
    trackGrokEvent: vi.fn(),
    searchResearch,
  };
}

describe("stream tool loop budgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executePluginFunction.mockResolvedValue({ ok: true });
  });

  it("enforces the configured total call budget", async () => {
    const calls = Array.from({ length: 105 }, (_, index) => toolCall(index));
    mocks.runChatRound
      .mockResolvedValueOnce({ content: "", reasoning: "", toolCalls: calls })
      .mockResolvedValueOnce({ content: "done", reasoning: "", toolCalls: [] });
    const runtime = createRuntime();

    await runToolRounds(runtime as never);

    expect(mocks.executePluginFunction).toHaveBeenCalledTimes(
      PLUGIN_EXECUTION_LIMITS.maxTotalToolCalls,
    );
    const committedCalls = runtime.commitRound.mock.calls[0][1] as ToolCall[];
    expect(committedCalls).toHaveLength(105);
    expect(
      committedCalls.slice(PLUGIN_EXECUTION_LIMITS.maxTotalToolCalls),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "skipped", isError: true }),
      ]),
    );
  });

  it("limits peak plugin execution concurrency to four", async () => {
    let active = 0;
    let peak = 0;
    mocks.executePluginFunction.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      active -= 1;
      return { ok: true };
    });
    mocks.runChatRound
      .mockResolvedValueOnce({
        content: "",
        reasoning: "",
        toolCalls: Array.from({ length: 12 }, (_, index) => toolCall(index)),
      })
      .mockResolvedValueOnce({ content: "done", reasoning: "", toolCalls: [] });

    await runToolRounds(createRuntime() as never);
    expect(peak).toBe(4);
  });

  it("commits usage from every model round", async () => {
    mocks.runChatRound
      .mockResolvedValueOnce({
        content: "",
        reasoning: "",
        toolCalls: [toolCall(1)],
        usage: { usage: { total_tokens: 10 } },
      })
      .mockResolvedValueOnce({
        content: "done",
        reasoning: "",
        toolCalls: [],
        usage: { usage: { total_tokens: 20 } },
      });
    const runtime = createRuntime();

    await runToolRounds(runtime as never);

    expect(runtime.commitUsage).toHaveBeenNthCalledWith(1, {
      usage: { total_tokens: 10 },
    });
    expect(runtime.commitUsage).toHaveBeenNthCalledWith(2, {
      usage: { total_tokens: 20 },
    });
  });

  it("propagates cancellation without starting queued calls", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Aborted", "AbortError"));
    mocks.runChatRound.mockResolvedValueOnce({
      content: "",
      reasoning: "",
      toolCalls: [toolCall(1), toolCall(2)],
    });
    const runtime = createRuntime();
    runtime.prepared.options.signal = controller.signal;

    await expect(runToolRounds(runtime as never)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mocks.executePluginFunction).not.toHaveBeenCalled();
  });
});
