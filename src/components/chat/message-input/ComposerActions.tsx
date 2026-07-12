import { Loader2, Mic, SendHorizontal, Square, StopCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";
import { formatRecordingTime } from "@/lib/utils/messageInputHelpers";
import type { VoiceRecorderState } from "./voiceTypes";
import {
  ICON_BUTTON_BASE_CLASS,
  ICON_BUTTON_FOCUS_CLASS,
  INACTIVE_ICON_CLASS,
} from "./styles";

interface ComposerActionsProps {
  readonly inputBusy: boolean;
  readonly disabled: boolean;
  readonly hasDraft: boolean;
  readonly selectedModel: string;
  readonly isGenerating: boolean;
  readonly queuedCount: number;
  readonly voice: VoiceRecorderState;
  send: () => void;
  stop?: () => void;
}

function QueueBadge({ count }: { readonly count: number }) {
  const t = useTranslations("MessageInput");
  if (count === 0) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className="mr-1 hidden rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 md:inline-flex"
    >
      {t("queuedMessages", { count })}
    </span>
  );
}

function WorkingButton() {
  const t = useTranslations("MessageInput");
  return (
    <button
      type="button"
      aria-label={t("working")}
      aria-busy="true"
      className={`${ICON_BUTTON_BASE_CLASS} cursor-not-allowed bg-transparent text-gray-500 dark:text-muted-foreground`}
    >
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
    </button>
  );
}

function SendButton(
  props: Pick<
    ComposerActionsProps,
    "disabled" | "isGenerating" | "selectedModel" | "send"
  >,
) {
  const t = useTranslations("MessageInput");
  const label = props.isGenerating ? t("queueMessage") : t("sendMessage");
  return (
    <Tooltip content={label} position="top">
      <button
        type="button"
        aria-label={
          props.isGenerating ? t("queueMessageAria") : t("sendMessageAria")
        }
        disabled={!props.selectedModel || props.disabled}
        className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} bg-gray-100 text-gray-500 shadow-sm transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-accent dark:text-muted-foreground dark:hover:bg-accent/80`}
        onClick={props.send}
      >
        <SendHorizontal size={16} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

function StopButton({ stop }: { stop: () => void }) {
  const t = useTranslations("MessageInput");
  return (
    <Tooltip content={t("stopGeneration")} position="top">
      <button
        type="button"
        aria-label={t("stopGenerationAria")}
        aria-busy="true"
        className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} group relative overflow-hidden bg-gray-100 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:bg-accent dark:text-muted-foreground dark:hover:bg-red-900/20 dark:hover:text-red-400`}
        onClick={stop}
      >
        <div className="relative h-4 w-4">
          <Loader2
            size={16}
            aria-hidden="true"
            className="absolute inset-0 animate-spin transition-[opacity,transform] duration-300 group-hover:scale-75 group-hover:opacity-0"
          />
          <Square
            size={16}
            fill="currentColor"
            aria-hidden="true"
            className="absolute inset-0 scale-75 opacity-0 transition-[opacity,transform] duration-300 group-hover:scale-100 group-hover:opacity-100"
          />
        </div>
      </button>
    </Tooltip>
  );
}

function VoiceButton({ voice }: { readonly voice: VoiceRecorderState }) {
  const t = useTranslations("MessageInput");
  const tooltip = voice.isRecording
    ? t("stopRecording")
    : voice.voice.autoTranscribe
      ? t("speechToText")
      : t("voiceMessage");
  const ariaLabel = voice.isRecording
    ? t("stopRecordingAria", {
        time: formatRecordingTime(voice.recordingSeconds),
      })
    : voice.voice.autoTranscribe
      ? t("speechToTextAria")
      : t("voiceMessageAria");
  return (
    <div className="relative">
      {voice.isRecording && (
        <div
          className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white shadow-md animate-pulse dark:bg-red-500"
          aria-hidden="true"
        >
          {formatRecordingTime(voice.recordingSeconds)}
        </div>
      )}
      <Tooltip content={tooltip} position="top">
        <button
          type="button"
          aria-label={ariaLabel}
          aria-pressed={voice.isRecording}
          className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} transition-[background-color,color,box-shadow] ${voice.isRecording ? "bg-red-50 text-red-500 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-800" : INACTIVE_ICON_CLASS}`}
          onClick={voice.toggleRecording}
        >
          {voice.isRecording ? (
            <StopCircle size={16} aria-hidden="true" />
          ) : (
            <Mic size={16} aria-hidden="true" />
          )}
        </button>
      </Tooltip>
    </div>
  );
}

function PrimaryAction(props: ComposerActionsProps) {
  if (props.inputBusy) return <WorkingButton />;
  if (props.hasDraft) return <SendButton {...props} />;
  if (props.isGenerating && props.stop) return <StopButton stop={props.stop} />;
  return <VoiceButton voice={props.voice} />;
}

export default function ComposerActions(props: ComposerActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <QueueBadge count={props.queuedCount} />
      <PrimaryAction {...props} />
    </div>
  );
}
