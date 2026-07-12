import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_COMPRESSION_LIMITS } from "../config/limits";
import type { Message } from "../types";

const mocks = vi.hoisted(() => ({
  getTaskModel: vi.fn(() => "provider:model"),
  settingsGetState: vi.fn(),
  streamGenerateContent: vi.fn(),
}));

vi.mock("@/store/core/settingsStore", () => ({
  getTaskModel: mocks.getTaskModel,
  useSettingsStore: { getState: mocks.settingsGetState },
}));

vi.mock("../services/api/chat/generationService", () => ({
  streamGenerateContent: mocks.streamGenerateContent,
}));

vi.mock("@/lib/utils/model", () => ({
  parseModelString: (model: string) => ({
    providerId: model.split(":")[0],
    modelName: model.split(":")[1],
  }),
}));

vi.mock("@/lib/utils/contextCompression", async () =>
  vi.importActual("../lib/utils/contextCompression"),
);

vi.mock("@/lib/utils/devLogger", () => ({
  logDevWarn: vi.fn(),
}));

const { performBackgroundCompression } =
  await import("../services/api/chat/compressionService");

function message(id: string, content = id): Message {
  return { id, role: "user", content, timestamp: 1 };
}

describe("background compression consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settingsGetState.mockReturnValue({
      system: { compressionThreshold: 1, historyKeepCount: 1 },
      modelMetadata: { model: { attachment: true } },
      customModelMetadata: {},
    });
  });

  it("advances the marker only through the last whole message", async () => {
    const messages = [
      message("preserved-first"),
      message("included", "a".repeat(90_000)),
      message("not-included", "b".repeat(90_000)),
      message("candidate-3"),
      message("candidate-4"),
      message("tail-1"),
      message("tail-2"),
    ];
    const result = await performBackgroundCompression(
      messages,
      undefined,
      "provider:model",
    );
    expect(result?.lastCompressedMessageId).toBe("included");
    expect(result?.compressedContent).not.toContain("b".repeat(100));
  });

  it("does not advance when the first candidate cannot fit", async () => {
    const messages = [
      message("preserved-first"),
      message(
        "oversized",
        "x".repeat(CONTEXT_COMPRESSION_LIMITS.maxSummarySourceChars + 1),
      ),
      message("candidate-2"),
      message("candidate-3"),
      message("candidate-4"),
      message("tail-1"),
      message("tail-2"),
    ];
    await expect(
      performBackgroundCompression(messages, undefined, "provider:model"),
    ).resolves.toBeNull();
  });

  it("propagates AbortError instead of storing a fallback", async () => {
    mocks.settingsGetState.mockReturnValue({
      system: { compressionThreshold: 1, historyKeepCount: 1 },
      modelMetadata: { model: { attachment: false } },
      customModelMetadata: {},
    });
    mocks.streamGenerateContent.mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );
    const messages = [
      message("preserved-first"),
      message("candidate-1"),
      message("candidate-2"),
      message("candidate-3"),
      message("candidate-4"),
      message("tail-1"),
      message("tail-2"),
    ];
    await expect(
      performBackgroundCompression(
        messages,
        undefined,
        "provider:model",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
