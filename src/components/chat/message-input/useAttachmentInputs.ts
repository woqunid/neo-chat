import { useCallback, useId, useRef } from "react";
import type { AttachmentInputIds, AttachmentInputRefs } from "./types";

interface AttachmentInputOptions {
  processFiles: (
    files: File[],
    documentsOnly?: boolean,
    closeMenu?: boolean,
  ) => Promise<void>;
}

export function useAttachmentInputs(options: AttachmentInputOptions) {
  const refs: AttachmentInputRefs = {
    file: useRef<HTMLInputElement>(null),
    image: useRef<HTMLInputElement>(null),
    textFallback: useRef<HTMLInputElement>(null),
  };
  const ids: AttachmentInputIds = {
    file: useId(),
    image: useId(),
    textFallback: useId(),
  };
  const handleSelection = useCallback(
    async (
      event: React.ChangeEvent<HTMLInputElement>,
      documentsOnly: boolean,
    ) => {
      const input = event.currentTarget;
      if (!input.files?.length) return;
      await options.processFiles(Array.from(input.files), documentsOnly, true);
      if (input.value) input.value = "";
    },
    [options],
  );
  const onFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      void handleSelection(event, false);
    },
    [handleSelection],
  );
  const onTextFallbackSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      void handleSelection(event, true);
    },
    [handleSelection],
  );
  return { refs, ids, onFileSelect, onTextFallbackSelect };
}
