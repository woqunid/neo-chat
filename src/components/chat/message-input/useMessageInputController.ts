import { useId, type ForwardedRef } from "react";
import { useTranslations } from "next-intl";
import { isKnowledgeAttachment } from "@/lib/utils/knowledgeAttachments";
import { useAttachmentCollection } from "./useAttachmentCollection";
import { useAttachmentController } from "./useAttachmentController";
import { useComposerDraft } from "./useComposerDraft";
import { useComposerMenus } from "./useComposerMenus";
import { useComposerModals } from "./useComposerModals";
import { useMessageSubmission } from "./useMessageSubmission";
import { useTextPolish } from "./useTextPolish";
import { useTransientError } from "./useTransientError";
import { useVoiceRecorder } from "./useVoiceRecorder";
import type { MessageInputProps, MessageInputRef } from "./types";

function useInputResources(
  props: MessageInputProps,
  ref: ForwardedRef<MessageInputRef>,
) {
  const draft = useComposerDraft(ref);
  const menus = useComposerMenus();
  const modals = useComposerModals();
  const transientError = useTransientError();
  const collection = useAttachmentCollection({
    attachments: draft.attachments,
    setAttachments: draft.setAttachments,
    setError: transientError.setError,
  });
  const voice = useVoiceRecorder({
    append: collection.append,
    setInput: draft.setInput,
    setError: transientError.setError,
  });
  const attachments = useAttachmentController({
    attachmentCount: draft.attachments.length,
    selectedModel: props.selectedModel ?? "",
    busy: props.disabled || voice.isTranscribing,
    append: collection.append,
    remove: collection.remove,
    setError: transientError.setError,
    closeMenu: menus.closeAll,
  });
  const inputBusy =
    props.disabled || voice.isTranscribing || attachments.isParsing;
  return {
    draft,
    menus,
    modals,
    transientError,
    attachments,
    voice,
    inputBusy,
  };
}

export function useMessageInputController(
  props: MessageInputProps,
  ref: ForwardedRef<MessageInputRef>,
) {
  const resources = useInputResources(props, ref);
  const t = useTranslations("MessageInput");
  const polish = useTextPolish({
    input: resources.draft.input,
    busy: resources.inputBusy,
    setInput: resources.draft.setInput,
    setError: resources.transientError.setError,
    getFailureMessage: () => t("polishFailed"),
  });
  const submission = useMessageSubmission({
    input: resources.draft.input,
    attachments: resources.draft.attachments,
    busy: resources.inputBusy,
    selectedModel: props.selectedModel ?? "",
    onSend: props.onSend,
    clear: resources.draft.clear,
  });
  return {
    props,
    ...resources,
    error: resources.transientError.error,
    setError: resources.transientError.setError,
    polish,
    submission,
    sessionConfigBusy: resources.inputBusy || Boolean(props.isGenerating),
    hasDraft: Boolean(
      resources.draft.input.trim() || resources.draft.attachments.length,
    ),
    hasKnowledgeAttachments: resources.draft.attachments.some(
      isKnowledgeAttachment,
    ),
    messageInputId: useId(),
    errorMessageId: useId(),
  };
}

export type MessageInputController = ReturnType<
  typeof useMessageInputController
>;
