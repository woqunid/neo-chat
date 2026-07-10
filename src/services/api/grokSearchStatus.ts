import type { ImageSource, Source } from "../../types";
import { mergeImages, mergeSources } from "../../lib/chat/searchUpdate";
import type { GrokSearchStatusEvent } from "../../lib/search/grokTool";

export interface GrokSearchStatusUpdate {
  isSearching: boolean;
  results: { sources: Source[]; images: ImageSource[] };
  error?: string;
}

function decrementPendingCount(pendingCount: number): number {
  if (pendingCount <= 0) {
    throw new Error("Grok search status completed without a matching start");
  }
  return pendingCount - 1;
}

export function createGrokSearchStatusTracker(
  onUpdate: (update: GrokSearchStatusUpdate) => void,
): (event: GrokSearchStatusEvent) => void {
  let pendingCount = 0;
  let sources: Source[] = [];
  let images: ImageSource[] = [];
  let activeError: string | undefined;

  return (event) => {
    if (event.type === "started") {
      if (pendingCount === 0) {
        sources = [];
        images = [];
        activeError = undefined;
      }
      pendingCount += 1;
    } else if (event.type === "completed") {
      pendingCount = decrementPendingCount(pendingCount);
      sources = mergeSources(sources, event.result.sources);
      images = mergeImages(images, event.result.images);
    } else {
      pendingCount = decrementPendingCount(pendingCount);
      activeError = event.error;
    }

    onUpdate({
      isSearching: pendingCount > 0,
      results: { sources, images },
      ...(activeError ? { error: activeError } : {}),
    });
  };
}
