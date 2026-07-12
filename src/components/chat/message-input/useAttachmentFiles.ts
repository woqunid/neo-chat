import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Attachment, RAGConfig } from "@/types";
import {
  getChatAttachmentFileSelectionMessage,
  selectChatAttachmentFiles,
} from "@/lib/utils/chatAttachmentFiles";
import { logDevError } from "@/lib/utils/devLogger";
import { createFileAttachment, usesNativeAttachment } from "./attachmentUtils";
import type { ModelCapabilities } from "./types";

interface AttachmentFilesOptions {
  readonly attachmentCount: number;
  readonly capabilities: ModelCapabilities;
  readonly maxFileBytes: number;
  readonly rag: RAGConfig;
  readonly alive: React.RefObject<boolean>;
  append: (attachments: Attachment[]) => void;
  setError: (message: string | null) => void;
  closeMenu: () => void;
}

interface ProcessBatchOptions extends AttachmentFilesOptions {
  readonly files: File[];
  readonly documentsOnly: boolean;
  readonly runId: number;
  readonly currentRun: React.RefObject<number>;
  onFileError: (file: File, native: boolean, error: unknown) => void;
}

function isCurrent(options: ProcessBatchOptions): boolean {
  return options.alive.current && options.currentRun.current === options.runId;
}

async function processBatch(
  options: ProcessBatchOptions,
): Promise<Attachment[] | null> {
  const attachments: Attachment[] = [];
  for (const file of options.files) {
    const fileOptions = {
      file,
      capabilities: options.capabilities,
      documentsOnly: options.documentsOnly,
      rag: options.rag,
    };
    const native = usesNativeAttachment(fileOptions);
    try {
      const attachment = await createFileAttachment(fileOptions);
      if (!isCurrent(options)) return null;
      attachments.push(attachment);
    } catch (error) {
      if (!isCurrent(options)) return null;
      options.onFileError(file, native, error);
    }
  }
  return attachments;
}

function useFileErrorHandler(options: AttachmentFilesOptions) {
  const t = useTranslations("MessageInput");
  return useCallback(
    (file: File, native: boolean, error: unknown) => {
      logDevError(
        native ? "Error reading file" : "Error parsing document",
        error,
      );
      options.setError(
        t(native ? "failedToReadFile" : "failedToParseDocument", {
          fileName: file.name,
        }),
      );
    },
    [options, t],
  );
}

export function useAttachmentFiles(options: AttachmentFilesOptions) {
  const [isParsing, setIsParsing] = useState(false);
  const currentRun = useRef(0);
  const onFileError = useFileErrorHandler(options);
  const processFiles = useCallback(
    async (files: File[], documentsOnly = false, closeMenu = false) => {
      if (files.length === 0) return;
      const runId = ++currentRun.current;
      const selection = selectChatAttachmentFiles(
        options.attachmentCount,
        files,
        {
          maxFileBytes: options.maxFileBytes,
        },
      );
      const message = getChatAttachmentFileSelectionMessage(selection, {
        maxFileBytes: options.maxFileBytes,
      });
      if (message) options.setError(message);
      setIsParsing(true);
      try {
        const created = await processBatch({
          ...options,
          files: selection.accepted,
          documentsOnly,
          runId,
          currentRun,
          onFileError,
        });
        if (!created) return;
        options.append(created);
        if (closeMenu) options.closeMenu();
      } finally {
        if (options.alive.current && currentRun.current === runId) {
          setIsParsing(false);
        }
      }
    },
    [onFileError, options],
  );
  return { isParsing, processFiles };
}
