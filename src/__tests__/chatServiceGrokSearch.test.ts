import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROK_SEARCH_LIMITS } from "../config/limits";

const mocks = vi.hoisted(() => ({
  executePluginFunction: vi.fn(),
  searchWithGrok: vi.fn(),
  supportsImageGeneration: vi.fn(() => false),
  supportsTextOutput: vi.fn(() => true),
  settingsState: {} as Record<string, unknown>,
  memoryState: {} as Record<string, unknown>,
  coreState: {} as Record<string, unknown>,
}));

vi.mock("@/utils/pluginUtils", () => ({
  executePluginFunction: mocks.executePluginFunction,
}));

vi.mock("@/store/core/settingsStore", () => ({
  getTaskModel: vi.fn(() => "openai:gpt-task"),
  useSettingsStore: { getState: () => mocks.settingsState },
}));

vi.mock("@/store/core/coreSettingsStore", () => ({
  useCoreSettingsStore: { getState: () => mocks.coreState },
}));

vi.mock("@/store/core/memoryStore", () => ({
  useMemoryStore: { getState: () => mocks.memoryState },
}));

vi.mock("@/lib/plugin/resolve", () => ({
  getEnabledPluginFunctions: vi.fn(() => []),
}));

vi.mock("@/lib/utils/model", () => ({
  parseModelString: vi.fn((model: string) => {
    const [providerId, modelName] = model.split(":");
    return { providerId, modelName };
  }),
  supportsImageGeneration: mocks.supportsImageGeneration,
  supportsTextOutput: mocks.supportsTextOutput,
}));

vi.mock("@/lib/chat/entities", () => ({
  normalizeSessionTitle: vi.fn((title?: string) => title || "New Chat"),
}));

vi.mock("@/lib/utils/chatInput", () => ({
  appendContextToChatInput: vi.fn(
    (message: string, context: string) => `${message}\n\n${context}`,
  ),
  clampChatInputText: vi.fn((message: string) => message),
}));

vi.mock("@/lib/chat/htmlVisualPrompt", async () =>
  vi.importActual("../lib/chat/htmlVisualPrompt"),
);

vi.mock("@/lib/utils/contextCompression", () => ({
  createContextCompressionSummaryPrompt: vi.fn((text: string) => text),
  mergeCompressedContent: vi.fn((content: string) => content),
  normalizeCompressedContent: vi.fn((content: string) => content),
  textToBase64: vi.fn((text: string) => text),
}));

vi.mock("@/lib/utils/devLogger", () => ({
  logDevError: vi.fn(),
  logDevWarn: vi.fn(),
}));

vi.mock("../lib/byok/client", () => ({
  buildProviderRuntimeConfig: vi.fn(async (provider) => provider),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

vi.mock("../services/api/grokSearchService", () => ({
  searchWithGrok: mocks.searchWithGrok,
}));

const SEARCH_RESULT = {
  summary: "The current release is 5.0.",
  sources: [
    {
      title: "Release notes",
      url: "https://example.com/releases/5",
      content: "Version 5.0 is current.",
    },
  ],
  images: [],
};

const encoder = new TextEncoder();

function sseResponse(events: unknown[]): Response {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

interface SearchRoundOptions {
  id: string;
  query: string;
  finalContent: string;
}

function mockSearchRounds(options: SearchRoundOptions) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(async () =>
      sseResponse([
        {
          type: "tool_call",
          toolCall: {
            id: options.id,
            name: "grok_web_search",
            args: { query: options.query },
            status: "pending",
          },
        },
        { type: "done" },
      ]),
    )
    .mockImplementationOnce(async () =>
      sseResponse([
        { type: "content", content: options.finalContent },
        { type: "done" },
      ]),
    );
}

function getRequestBody(
  fetchMock: ReturnType<typeof mockSearchRounds>,
  index: number,
) {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body));
}

async function runSearchChat(
  message: string,
  onSearchStatus?: (isSearching: boolean, results?: unknown) => void,
) {
  const { streamChatResponse } = await import("../services/api/chatService");
  return streamChatResponse(
    "session-1",
    "openai:gpt-4",
    [],
    message,
    [],
    { useSearch: true },
    () => undefined,
    undefined,
    onSearchStatus,
  );
}

describe("chat service Grok search tool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.executePluginFunction.mockReset();
    mocks.searchWithGrok.mockReset();
    mocks.supportsImageGeneration.mockReturnValue(false);
    mocks.supportsTextOutput.mockReturnValue(true);
    mocks.settingsState = {
      installedPlugins: [],
      pluginConfigs: {},
      modelMetadata: {},
      customModelMetadata: {},
    };
    mocks.memoryState = {
      _hasHydrated: true,
      settings: { enabled: false, searchEnabled: false },
    };
    mocks.coreState = {
      providers: [
        {
          id: "openai",
          enabled: true,
          type: "OpenAI",
          name: "OpenAI",
          apiKey: "test-key",
          models: ["gpt-4"],
        },
      ],
    };
  });

  it("returns structured Grok results to the text model", async () => {
    mocks.searchWithGrok.mockResolvedValue(SEARCH_RESULT);
    const updates: Array<{ isSearching: boolean; results?: unknown }> = [];
    const fetchMock = mockSearchRounds({
      id: "call_grok_search",
      query: "current product release",
      finalContent: "Version 5.0 is current.",
    });

    const result = await runSearchChat(
      "What is the current release?",
      (isSearching, results) => updates.push({ isSearching, results }),
    );
    const firstBody = getRequestBody(fetchMock, 0);
    const secondBody = getRequestBody(fetchMock, 1);

    expect(result).toBe("Version 5.0 is current.");
    expect(firstBody.newMessage).toBe("What is the current release?");
    expect(firstBody.tools.map((tool: any) => tool.function.name)).toContain(
      "grok_web_search",
    );
    expect(secondBody.history[1].toolCalls[0]).toMatchObject({
      id: "call_grok_search",
      status: "success",
      result: { query: "current product release", ...SEARCH_RESULT },
    });
    expect(mocks.searchWithGrok).toHaveBeenCalledWith(
      "current product release",
      undefined,
    );
    expect(updates.map((update) => update.isSearching)).toEqual([true, false]);
  });

  it("returns Grok failures as explicit tool errors", async () => {
    mocks.searchWithGrok.mockRejectedValue(new Error("Grok upstream failed"));
    const fetchMock = mockSearchRounds({
      id: "call_failed_search",
      query: "current news",
      finalContent: "The web search failed.",
    });

    const result = await runSearchChat("Find current news");
    const secondBody = getRequestBody(fetchMock, 1);

    expect(result).toBe("The web search failed.");
    expect(secondBody.history[1].toolCalls[0]).toMatchObject({
      id: "call_failed_search",
      status: "error",
      isError: true,
      result: "Grok upstream failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("removes Grok from the final synthesis request after the search budget", async () => {
    mocks.searchWithGrok.mockImplementation(async (query: string) => ({
      summary: `Summary for ${query}`,
      sources: [
        {
          title: query,
          url: `https://example.com/${encodeURIComponent(query)}`,
          content: `Evidence for ${query}`,
        },
      ],
      images: [],
    }));
    let round = 0;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        const currentRound = round;
        round += 1;
        if (currentRound === GROK_SEARCH_LIMITS.maxToolCallsPerGeneration) {
          return sseResponse([
            { type: "content", content: "Combined answer." },
            { type: "done" },
          ]);
        }
        return sseResponse([
          {
            type: "tool_call",
            toolCall: {
              id: `search-${currentRound}`,
              name: "grok_web_search",
              args: { query: `query ${currentRound}` },
              status: "pending",
            },
          },
          { type: "done" },
        ]);
      });

    await expect(runSearchChat("Research this topic")).resolves.toBe(
      "Combined answer.",
    );

    expect(mocks.searchWithGrok).toHaveBeenCalledTimes(
      GROK_SEARCH_LIMITS.maxToolCallsPerGeneration,
    );
    expect(fetchMock).toHaveBeenCalledTimes(
      GROK_SEARCH_LIMITS.maxToolCallsPerGeneration + 1,
    );
    const finalBody = JSON.parse(
      String(
        fetchMock.mock.calls[GROK_SEARCH_LIMITS.maxToolCallsPerGeneration]?.[1]
          ?.body,
      ),
    );
    expect(
      finalBody.tools.map((tool: any) => tool.function.name),
    ).not.toContain("grok_web_search");
    expect(finalBody.newMessage).toContain("explicit limit");
  });
});
