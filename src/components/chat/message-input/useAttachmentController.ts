import { useSettingsStore } from "@/store/core/settingsStore";
import { ATTACHMENT_LIMITS } from "@/config/limits";
import type { Attachment } from "@/types";
import { useAliveRef } from "./useAliveRef";
import { useAttachmentEvents } from "./useAttachmentEvents";
import { useAttachmentFiles } from "./useAttachmentFiles";
import { useAttachmentInputs } from "./useAttachmentInputs";
import { useModelCapabilities } from "./useModelCapabilities";
import type { AttachmentController } from "./types";

interface AttachmentControllerOptions {
  readonly attachmentCount: number;
  readonly selectedModel: string;
  readonly busy: boolean;
  append: (attachments: Attachment[]) => void;
  remove: (id: string) => void;
  setError: (message: string | null) => void;
  closeMenu: () => void;
}

export function useAttachmentController(
  options: AttachmentControllerOptions,
): AttachmentController {
  const rag = useSettingsStore((state) => state.rag);
  const serverConfig = useSettingsStore((state) => state.serverConfig);
  const capabilities = useModelCapabilities(options.selectedModel);
  const alive = useAliveRef();
  const files = useAttachmentFiles({
    ...options,
    capabilities,
    rag,
    alive,
    maxFileBytes:
      serverConfig?.limits?.attachments?.maxFileBytes ??
      ATTACHMENT_LIMITS.maxFileBytes,
  });
  const inputs = useAttachmentInputs(files);
  const events = useAttachmentEvents({
    busy: options.busy || files.isParsing,
    processFiles: files.processFiles,
  });
  return {
    capabilities,
    refs: inputs.refs,
    ids: inputs.ids,
    handlers: { ...inputs, ...events },
    isParsing: files.isParsing,
    isDragActive: events.isDragActive,
    append: options.append,
    remove: options.remove,
  };
}
