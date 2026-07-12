import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../types";

const mocks = vi.hoisted(() => ({
  settingsState: {} as Record<string, unknown>,
  memoryState: {} as Record<string, unknown>,
  coreState: {} as Record<string, unknown>,
}));

vi.mock("@/utils/pluginUtils", () => ({
  executePluginFunction: vi.fn(),
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
  supportsImageGeneration: vi.fn(() => false),
  supportsTextOutput: vi.fn(() => true),
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
  searchWithGrok: vi.fn(),
}));

function message(id: string, role: Message["role"], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

function completedResponse(): Response {
  return new Response(
    'data: {"type":"content","content":"ok"}\n\n' + 'data: {"type":"done"}\n\n',
    {
      headers: { "content-type": "text/event-stream" },
    },
  );
}

describe("chat service request context budget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.settingsState = {
      installedPlugins: [],
      pluginConfigs: {},
      modelMetadata: {
        "gpt-4": { limit: { context: 1_200, output: 200 } },
      },
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

  it("sends only the latest complete history turn", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(completedResponse());
    const history = [
      message("old-user", "user", "o".repeat(3_000)),
      message("old-model", "model", "o".repeat(3_000)),
      message("new-user", "user", "latest question"),
      message("new-model", "model", "latest answer"),
    ];
    const { streamChatResponse } = await import("../services/api/chatService");

    await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      history,
      "current input",
      [],
      {},
      () => undefined,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.history.map((item: Message) => item.id)).toEqual([
      "new-user",
      "new-model",
    ]);
  });
});
