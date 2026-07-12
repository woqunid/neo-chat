import { useCallback } from "react";
import type { Attachment } from "@/types";
import { shouldSubmitOnEnter } from "@/lib/utils/messageInputHelpers";

interface MessageSubmissionOptions {
  readonly input: string;
  readonly attachments: Attachment[];
  readonly busy: boolean;
  readonly selectedModel: string;
  onSend: (text: string, attachments: Attachment[]) => void;
  clear: () => void;
}

export function useMessageSubmission(options: MessageSubmissionOptions) {
  const send = useCallback(() => {
    const hasDraft = options.input.trim() || options.attachments.length > 0;
    if (!hasDraft || options.busy || !options.selectedModel) return;
    options.onSend(options.input, options.attachments);
    options.clear();
  }, [options]);
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const shouldSubmit = shouldSubmitOnEnter({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
        requiresExplicitSend: window.matchMedia(
          "(pointer: coarse), (max-width: 1023px)",
        ).matches,
      });
      if (!shouldSubmit) return;
      event.preventDefault();
      send();
    },
    [send],
  );
  return { send, onKeyDown };
}
