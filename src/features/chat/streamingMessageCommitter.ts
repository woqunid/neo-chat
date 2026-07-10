import type { MessageOutputBlock } from "@/types";

export interface FrameScheduler {
  request: (callback: () => void) => number;
  cancel: (frameId: number) => void;
}

export interface StreamingMessageSnapshot {
  content: string;
  reasoning?: string;
  outputBlocks?: MessageOutputBlock[];
}

type StreamingMessagePatch = Partial<StreamingMessageSnapshot>;

interface StreamingMessageCommitterOptions {
  commit: (snapshot: StreamingMessageSnapshot) => void;
  scheduler: FrameScheduler;
}

function mergeSnapshot(
  current: StreamingMessageSnapshot,
  patch: StreamingMessagePatch,
): StreamingMessageSnapshot {
  return {
    content: patch.content ?? current.content,
    reasoning: patch.reasoning ?? current.reasoning,
    outputBlocks: patch.outputBlocks ?? current.outputBlocks,
  };
}

export function createStreamingMessageCommitter({
  commit,
  scheduler,
}: StreamingMessageCommitterOptions) {
  let latest: StreamingMessageSnapshot = { content: "" };
  let hasPendingCommit = false;
  let frameId: number | null = null;

  const commitPending = () => {
    frameId = null;
    if (!hasPendingCommit) return;
    hasPendingCommit = false;
    commit(latest);
  };

  return {
    enqueue(patch: StreamingMessagePatch) {
      latest = mergeSnapshot(latest, patch);
      hasPendingCommit = true;
      if (frameId !== null) return;
      frameId = scheduler.request(commitPending);
    },
    flush() {
      if (frameId !== null) scheduler.cancel(frameId);
      commitPending();
    },
  };
}
