import { describe, expect, it } from "vitest";
import {
  createStoppedGenerationUpdate,
  isMessageGenerationActive,
} from "../lib/chat/messageGenerationStatus";
import type { Message, MessageGenerationStatus } from "../types";

const createModelMessage = (
  generationStatus?: MessageGenerationStatus,
): Message => ({
  id: generationStatus || "none",
  role: "model",
  content: "",
  timestamp: 1_000,
  ...(generationStatus ? { generationStatus } : {}),
});

describe("message generation status", () => {
  it("treats only pending and streaming model messages as active", () => {
    expect(isMessageGenerationActive(createModelMessage("pending"))).toBe(true);
    expect(isMessageGenerationActive(createModelMessage("streaming"))).toBe(
      true,
    );
    expect(isMessageGenerationActive(createModelMessage("aborted"))).toBe(
      false,
    );
    expect(isMessageGenerationActive(createModelMessage("completed"))).toBe(
      false,
    );
    expect(isMessageGenerationActive(createModelMessage("failed"))).toBe(false);
    expect(isMessageGenerationActive(createModelMessage())).toBe(false);
  });

  it("creates an explicit aborted update with timing for stopped messages", () => {
    expect(
      createStoppedGenerationUpdate(createModelMessage("pending"), 1_250),
    ).toEqual({
      generationStatus: "aborted",
      timing: {
        startTime: 1_000,
        endTime: 1_250,
        duration: 250,
      },
    });
  });
});
