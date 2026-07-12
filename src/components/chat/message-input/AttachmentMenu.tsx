import { FileUp, ImageUp, Library, Link, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AttachmentController } from "./types";
import {
  ICON_BUTTON_BASE_CLASS,
  ICON_BUTTON_FOCUS_CLASS,
  INACTIVE_ICON_CLASS,
} from "./styles";

interface AttachmentMenuProps {
  readonly controller: AttachmentController;
  readonly open: boolean;
  readonly busy: boolean;
  readonly hasKnowledgeAttachments: boolean;
  setOpen: (open: boolean) => void;
  openKnowledgeBase: () => void;
  openRemoteFile: () => void;
}

function AttachmentInputs({
  ids,
  fileInputRef,
  imageInputRef,
  textFallbackInputRef,
  handlers,
}: Pick<AttachmentController, "ids" | "handlers"> & {
  readonly fileInputRef: React.RefObject<HTMLInputElement | null>;
  readonly imageInputRef: React.RefObject<HTMLInputElement | null>;
  readonly textFallbackInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations("MessageInput");
  return (
    <>
      <input
        id={ids.file}
        name="chat-attachments"
        aria-label={t("uploadFilesAria")}
        type="file"
        ref={fileInputRef}
        onChange={handlers.onFileSelect}
        className="hidden"
        multiple
        accept="*/*"
      />
      <input
        id={ids.image}
        name="chat-images"
        aria-label={t("uploadImagesAria")}
        type="file"
        ref={imageInputRef}
        onChange={handlers.onFileSelect}
        className="hidden"
        multiple
        accept="image/*"
      />
      <input
        id={ids.textFallback}
        name="chat-text-attachments"
        aria-label={t("uploadTextFilesAria")}
        type="file"
        ref={textFallbackInputRef}
        onChange={handlers.onTextFallbackSelect}
        className="hidden"
        multiple
        accept="text/*,application/json,application/xml,application/javascript,application/xhtml+xml,application/x-yaml,application/sql,application/graphql,application/ld+json,application/x-sh,application/x-httpd-php,application/typescript,.csv,.doc,.docx,.md,.markdown,.pdf,.ppt,.pptx,.txt,.xls,.xlsx"
      />
    </>
  );
}

function AttachmentTrigger(props: AttachmentMenuProps) {
  const t = useTranslations("MessageInput");
  const active = props.open || props.hasKnowledgeAttachments;
  return (
    <Tooltip content={t("attach")} position="top">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("attachFiles")}
          aria-pressed={props.hasKnowledgeAttachments}
          className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} transition-colors ${active ? "bg-gray-100 text-gray-800 dark:bg-accent dark:text-foreground" : INACTIVE_ICON_CLASS}`}
          disabled={props.busy}
        >
          <Paperclip size={16} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
    </Tooltip>
  );
}

function UploadItems({ controller }: Pick<AttachmentMenuProps, "controller">) {
  const t = useTranslations("MessageInput");
  const capabilities = controller.capabilities;
  const openFilePicker = () => {
    if (capabilities.attachment || capabilities.audio || capabilities.video) {
      controller.refs.file.current?.click();
      return;
    }
    controller.refs.textFallback.current?.click();
  };
  return (
    <>
      <DropdownMenuItem onSelect={openFilePicker}>
        <FileUp size={14} className="text-blue-500" aria-hidden="true" />
        <span>{t("uploadFile")}</span>
      </DropdownMenuItem>
      {capabilities.vision && (
        <DropdownMenuItem
          onSelect={() => controller.refs.image.current?.click()}
        >
          <ImageUp size={14} className="text-green-500" aria-hidden="true" />
          <span>{t("uploadImage")}</span>
        </DropdownMenuItem>
      )}
    </>
  );
}

function SourceItems(props: AttachmentMenuProps) {
  const t = useTranslations("MessageInput");
  const capabilities = props.controller.capabilities;
  const supportsRemote = Object.values(capabilities).some(Boolean);
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={props.openKnowledgeBase}
        disabled={props.busy}
      >
        <Library
          size={14}
          className="text-purple-500 dark:text-purple-400"
          aria-hidden="true"
        />
        <span>{t("knowledgeBase")}</span>
      </DropdownMenuItem>
      {supportsRemote && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={props.openRemoteFile}>
            <Link size={14} className="text-purple-500" aria-hidden="true" />
            <span>{t("remoteFile")}</span>
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

export default function AttachmentMenu(props: AttachmentMenuProps) {
  return (
    <div className="relative">
      <AttachmentInputs
        ids={props.controller.ids}
        fileInputRef={props.controller.refs.file}
        imageInputRef={props.controller.refs.image}
        textFallbackInputRef={props.controller.refs.textFallback}
        handlers={props.controller.handlers}
      />
      <DropdownMenu open={props.open} onOpenChange={props.setOpen}>
        <AttachmentTrigger {...props} />
        <DropdownMenuContent side="top" align="start" className="w-48">
          <UploadItems controller={props.controller} />
          <SourceItems {...props} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
