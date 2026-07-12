import { useTranslations } from "next-intl";
import type { VoiceSettings } from "@/types";
import { TEXT_INPUT_CLASS } from "./styles";

interface ComposerTextAreaProps {
  readonly id: string;
  readonly errorId: string;
  readonly error: string | null;
  readonly value: string;
  readonly minHeightClass: string;
  readonly disabled: boolean;
  readonly isRecording: boolean;
  readonly voice: VoiceSettings;
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: React.Dispatch<React.SetStateAction<string>>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

function getPlaceholder(
  recording: Pick<ComposerTextAreaProps, "isRecording" | "voice">,
  t: ReturnType<typeof useTranslations<"MessageInput">>,
): string {
  if (!recording.isRecording) return t("askAnything");
  return recording.voice.sttProvider === "browser"
    ? t("listening")
    : t("recording");
}

export default function ComposerTextArea({
  id,
  errorId,
  error,
  value,
  minHeightClass,
  disabled,
  isRecording,
  voice,
  textareaRef,
  onChange,
  onKeyDown,
  onPaste,
}: ComposerTextAreaProps) {
  const t = useTranslations("MessageInput");
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {t("message")}
      </label>
      <textarea
        id={id}
        name="message"
        ref={textareaRef}
        className={`${TEXT_INPUT_CLASS} ${minHeightClass}`}
        placeholder={getPlaceholder({ isRecording, voice }, t)}
        autoComplete="off"
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={disabled}
      />
    </>
  );
}
