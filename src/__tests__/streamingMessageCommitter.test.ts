import { describe, expect, it, vi } from "vitest";
import {
  createStreamingMessageCommitter,
  type FrameScheduler,
  type StreamingMessageSnapshot,
} from "../features/chat/streamingMessageCommitter";

const FRAME_ID = 7;

function createSchedulerHarness() {
  let scheduledCallback: (() => void) | null = null;
  const scheduler: FrameScheduler = {
    request: vi.fn((callback) => {
      scheduledCallback = callback;
      return FRAME_ID;
    }),
    cancel: vi.fn(),
  };

  return {
    scheduler,
    runFrame() {
      if (!scheduledCallback) throw new Error("No frame was scheduled");
      const callback = scheduledCallback;
      scheduledCallback = null;
      callback();
    },
  };
}

describe("streaming message committer", () => {
  it("commits only the latest stream snapshot in one frame", () => {
    const harness = createSchedulerHarness();
    const commit = vi.fn<(snapshot: StreamingMessageSnapshot) => void>();
    const committer = createStreamingMessageCommitter({
      commit,
      scheduler: harness.scheduler,
    });

    committer.enqueue({ content: "hel" });
    committer.enqueue({ content: "hello", reasoning: "checked" });

    expect(harness.scheduler.request).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    harness.runFrame();
    expect(commit).toHaveBeenCalledWith({
      content: "hello",
      reasoning: "checked",
      outputBlocks: undefined,
    });
  });

  it("flushes the final pending snapshot before completion", () => {
    const harness = createSchedulerHarness();
    const commit = vi.fn<(snapshot: StreamingMessageSnapshot) => void>();
    const committer = createStreamingMessageCommitter({
      commit,
      scheduler: harness.scheduler,
    });

    committer.enqueue({ content: "answer" });
    committer.enqueue({
      outputBlocks: [{ id: "text", type: "text", content: "answer" }],
    });
    committer.flush();

    expect(harness.scheduler.cancel).toHaveBeenCalledWith(FRAME_ID);
    expect(commit).toHaveBeenCalledWith({
      content: "answer",
      reasoning: undefined,
      outputBlocks: [{ id: "text", type: "text", content: "answer" }],
    });
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
