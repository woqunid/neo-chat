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
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const textFallbackRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const imageId = useId();
  const textFallbackId = useId();
  const refs: AttachmentInputRefs = {
    file: fileRef,
    image: imageRef,
    textFallback: textFallbackRef,
  };
  const ids: AttachmentInputIds = {
    file: fileId,
    image: imageId,
    textFallback: textFallbackId,
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
