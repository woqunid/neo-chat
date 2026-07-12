import { FileUp, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ICON_BUTTON_FOCUS_CLASS } from "./styles";

interface ComposerStatusProps {
  readonly error: string | null;
  readonly errorId: string;
  readonly isParsing: boolean;
  readonly isDragActive: boolean;
  dismissError: () => void;
}

function ErrorToast(
  props: Pick<ComposerStatusProps, "error" | "errorId" | "dismissError">,
) {
  const t = useTranslations("MessageInput");
  if (!props.error) return null;
  return (
    <div
      id={props.errorId}
      role="status"
      aria-live="polite"
      className="absolute -top-10 left-0 right-0 z-50 flex justify-center animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-red-500">
        <button
          type="button"
          aria-label={t("dismissError")}
          className={`rounded-full p-0.5 transition-colors hover:bg-white/15 ${ICON_BUTTON_FOCUS_CLASS}`}
          onClick={props.dismissError}
        >
          <X size={12} aria-hidden="true" />
        </button>
        <span>{props.error}</span>
      </div>
    </div>
  );
}

function ParsingStatus({ visible }: { readonly visible: boolean }) {
  const t = useTranslations("MessageInput");
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute -top-10 left-0 right-0 z-50 flex justify-center animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-muted dark:text-foreground">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        <span>{t("parsingDocument")}</span>
      </div>
    </div>
  );
}

function DragOverlay({ visible }: { readonly visible: boolean }) {
  const t = useTranslations("MessageInput");
  if (!visible) return null;
  return (
    <div
      className="absolute inset-1 z-40 flex flex-col items-center justify-center rounded-lg border border-dashed border-brand/60 bg-white/85 text-center shadow-sm backdrop-blur-md dark:bg-background/85"
      aria-hidden="true"
    >
      <FileUp size={20} className="mb-2 text-brand" />
      <div className="text-sm font-semibold text-foreground">
        {t("dropFilesTitle")}
      </div>
      <div className="mt-1 max-w-60 text-xs text-muted-foreground">
        {t("dropFilesHint")}
      </div>
    </div>
  );
}

export default function ComposerStatus(props: ComposerStatusProps) {
  return (
    <>
      <ErrorToast {...props} />
      <ParsingStatus visible={!props.error && props.isParsing} />
      <DragOverlay visible={props.isDragActive} />
    </>
  );
}
