import { startBrowserSpeechRecognition } from "@/services/api/voiceService";
import { logDevError } from "@/lib/utils/devLogger";
import type { VoiceSettings } from "@/types";
import type {
  RecordingResources,
  VoiceRecorderOptions,
  VoiceTranslator,
} from "./voiceTypes";

interface BrowserRecordingOptions extends VoiceRecorderOptions {
  readonly resources: RecordingResources;
  readonly voice: VoiceSettings;
  readonly translate: VoiceTranslator;
}

function isCurrent(resources: RecordingResources, session: number): boolean {
  return resources.alive.current && resources.session.current === session;
}

function finishBrowserRecording(
  resources: RecordingResources,
  session: number,
): void {
  if (!isCurrent(resources, session)) return;
  resources.session.current += 1;
  resources.recognition.current = null;
  resources.kind.current = null;
  resources.clearTimer();
  resources.setIsRecording(false);
}

function createCallbacks(options: BrowserRecordingOptions, session: number) {
  return {
    onTranscript: (text: string) => {
      if (!isCurrent(options.resources, session)) return;
      options.setInput((value) => `${value}${value ? " " : ""}${text}`);
    },
    onError: (error: unknown) => {
      if (!isCurrent(options.resources, session)) return;
      logDevError("Speech recognition error", error);
      finishBrowserRecording(options.resources, session);
    },
    onEnd: () => finishBrowserRecording(options.resources, session),
  };
}

export function startBrowserRecording(options: BrowserRecordingOptions): void {
  const resources = options.resources;
  const session = ++resources.session.current;
  try {
    resources.recognition.current = startBrowserSpeechRecognition(
      options.voice.sttLanguage,
      createCallbacks(options, session),
    );
    resources.kind.current = "browser";
    resources.setIsRecording(true);
    resources.startTimer();
  } catch (error) {
    logDevError("Failed to start browser recording", error);
    resources.recognition.current = null;
    resources.kind.current = null;
    if (!isCurrent(resources, session)) return;
    options.setError(
      error instanceof Error
        ? error.message
        : options.translate("failedToStartRecognition"),
    );
  }
}
