import { useTranslations } from "next-intl";
import MessageInputAttachmentTray from "../MessageInputAttachmentTray";
import ComposerStatus from "./ComposerStatus";
import ComposerTextArea from "./ComposerTextArea";
import ComposerToolbar from "./ComposerToolbar";
import MessageInputModals from "./MessageInputModals";
import type { MessageInputController } from "./useMessageInputController";

function ComposerBody({
  controller,
}: {
  readonly controller: MessageInputController;
}) {
  const t = useTranslations("MessageInput");
  const hero = controller.props.variant === "hero";
  return (
    <>
      <ComposerStatus
        error={controller.error}
        errorId={controller.errorMessageId}
        isParsing={controller.attachments.isParsing}
        isDragActive={controller.attachments.isDragActive}
        dismissError={() => controller.setError(null)}
      />
      <MessageInputAttachmentTray
        attachments={controller.draft.attachments}
        onRemove={controller.attachments.remove}
        ariaLabel={t("attachedFiles")}
      />
      <ComposerTextArea
        id={controller.messageInputId}
        errorId={controller.errorMessageId}
        error={controller.error}
        value={controller.draft.input}
        minHeightClass={hero ? "min-h-[5em]" : "min-h-[2em]"}
        disabled={controller.inputBusy}
        isRecording={controller.voice.isRecording}
        voice={controller.voice.voice}
        textareaRef={controller.draft.textareaRef}
        onChange={controller.draft.setInput}
        onKeyDown={controller.submission.onKeyDown}
        onPaste={controller.attachments.handlers.onPaste}
      />
      <ComposerToolbar controller={controller} />
    </>
  );
}

export default function MessageInputView({
  controller,
}: {
  readonly controller: MessageInputController;
}) {
  const hero = controller.props.variant === "hero";
  return (
    <div
      className={`glass-shell relative flex w-full flex-col rounded-xl border transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-blue-400/50 focus-within:ring-2 focus-within:ring-blue-100/50 dark:focus-within:ring-blue-900/30 ${hero ? "mb-0 md:mb-18" : ""}`}
      aria-busy={controller.inputBusy}
      onDragEnter={controller.attachments.handlers.onDragEnter}
      onDragOver={controller.attachments.handlers.onDragOver}
      onDragLeave={controller.attachments.handlers.onDragLeave}
      onDrop={controller.attachments.handlers.onDrop}
    >
      <MessageInputModals
        showRemote={controller.modals.showRemote}
        showKnowledgeBase={controller.modals.showKnowledgeBase}
        capabilities={controller.attachments.capabilities}
        append={controller.attachments.append}
        closeRemote={controller.modals.closeRemote}
        closeKnowledgeBase={controller.modals.closeKnowledgeBase}
      />
      <ComposerBody controller={controller} />
    </div>
  );
}
