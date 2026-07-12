import { useCallback, useRef, useState } from "react";
import {
  extractChatAttachmentFilesFromClipboard,
  extractChatAttachmentFilesFromDrop,
} from "@/lib/utils/chatAttachmentFiles";

interface AttachmentEventOptions {
  readonly busy: boolean;
  processFiles: (files: File[], documentsOnly?: boolean) => Promise<void>;
}

function eventHasFiles(types: DOMStringList | readonly string[]): boolean {
  return Array.from(types).includes("Files");
}

function useDragHoverEvents(options: AttachmentEventOptions) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepth = useRef(0);
  const onDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (options.busy || !eventHasFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current += 1;
      setIsDragActive(true);
    },
    [options.busy],
  );
  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (options.busy || !eventHasFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setIsDragActive(true);
    },
    [options.busy],
  );
  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!eventHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragActive(false);
  }, []);
  return {
    isDragActive,
    setIsDragActive,
    dragDepth,
    onDragEnter,
    onDragOver,
    onDragLeave,
  };
}

function useDropEvent(
  options: AttachmentEventOptions,
  drag: ReturnType<typeof useDragHoverEvents>,
) {
  return useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (options.busy) return;
      const files = extractChatAttachmentFilesFromDrop(event.dataTransfer);
      if (files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag.dragDepth.current = 0;
      drag.setIsDragActive(false);
      void options.processFiles(files);
    },
    [drag, options],
  );
}

function usePasteEvent(options: AttachmentEventOptions) {
  return useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (options.busy) return;
      const files = extractChatAttachmentFilesFromClipboard(
        event.clipboardData,
      );
      if (files.length === 0) return;
      event.preventDefault();
      void options.processFiles(files);
    },
    [options],
  );
}

export function useAttachmentEvents(options: AttachmentEventOptions) {
  const drag = useDragHoverEvents(options);
  const onDrop = useDropEvent(options, drag);
  const onPaste = usePasteEvent(options);
  return {
    isDragActive: drag.isDragActive,
    onDragEnter: drag.onDragEnter,
    onDragOver: drag.onDragOver,
    onDragLeave: drag.onDragLeave,
    onDrop,
    onPaste,
  };
}
