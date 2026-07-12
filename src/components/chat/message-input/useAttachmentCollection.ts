import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { Attachment } from "@/types";
import { ATTACHMENT_LIMITS, formatBytes } from "@/config/limits";
import { limitAttachments } from "./attachmentUtils";

interface AttachmentCollectionOptions {
  readonly attachments: Attachment[];
  readonly setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  readonly setError: (message: string | null) => void;
}

export function useAttachmentCollection(options: AttachmentCollectionOptions) {
  const t = useTranslations("MessageInput");
  const append = useCallback(
    (incoming: Attachment[]) => {
      if (incoming.length === 0) return;
      const result = limitAttachments(options.attachments, incoming);
      if (result.failure === "count") {
        options.setError(
          t("attachmentLimitReached", { max: ATTACHMENT_LIMITS.maxCount }),
        );
      } else if (result.failure === "size") {
        options.setError(
          t("attachmentsExceedSize", {
            size: formatBytes(ATTACHMENT_LIMITS.maxTotalBase64Chars),
          }),
        );
      }
      if (result.accepted.length > 0) {
        options.setAttachments((current) => [...current, ...result.accepted]);
      }
    },
    [options, t],
  );
  const remove = useCallback(
    (id: string) => {
      options.setAttachments((current) =>
        current.filter((attachment) => attachment.id !== id),
      );
    },
    [options],
  );
  return { append, remove };
}
