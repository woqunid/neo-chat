import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { ATTACHMENT_LIMITS } from "@/config/limits";
import { useSettingsStore } from "@/store/core/settingsStore";
import { startBrowserRecording } from "./browserRecording";
import { startMediaRecording } from "./mediaRecording";
import { useRecordingResources } from "./useRecordingResources";
import type {
  RecordingResources,
  VoiceRecorderOptions,
  VoiceRecorderState,
  VoiceTranslationKey,
  VoiceTranslator,
} from "./voiceTypes";

function stopBrowser(resources: RecordingResources): void {
  resources.session.current += 1;
  try {
    resources.recognition.current?.stop();
  } catch {
    // Recognition can already be inactive when the user stops it.
  }
  resources.recognition.current = null;
}

function stopMedia(resources: RecordingResources): void {
  const recorder = resources.recorder.current;
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    return;
  }
  resources.releaseStream();
  resources.recorder.current = null;
}

function stopRecording(resources: RecordingResources): void {
  if (resources.kind.current === "browser") stopBrowser(resources);
  if (resources.kind.current === "media") stopMedia(resources);
  resources.kind.current = null;
  if (resources.alive.current) resources.setIsRecording(false);
  resources.clearTimer();
}

function useVoiceTranslator(): VoiceTranslator {
  const t = useTranslations("MessageInput");
  return useCallback(
    (key: VoiceTranslationKey, values?: { size: string }) => {
      if (key === "attachmentsExceedSize") {
        return t("attachmentsExceedSize", { size: values?.size ?? "" });
      }
      return t(key);
    },
    [t],
  );
}

interface StartRecordingOptions extends VoiceRecorderOptions {
  readonly resources: RecordingResources;
  readonly translate: VoiceTranslator;
  readonly isTranscribingSetter: React.Dispatch<React.SetStateAction<boolean>>;
}

function useStartRecording(options: StartRecordingOptions): () => void {
  const voice = useSettingsStore((state) => state.voice);
  const serverConfig = useSettingsStore((state) => state.serverConfig);
  return useCallback(() => {
    options.setError(null);
    const shared = { ...options, resources: options.resources, voice };
    if (voice.autoTranscribe && voice.sttProvider === "browser") {
      startBrowserRecording(shared);
      return;
    }
    void startMediaRecording({
      ...shared,
      setIsTranscribing: options.isTranscribingSetter,
      maxFileBytes:
        serverConfig?.limits?.attachments?.maxFileBytes ??
        ATTACHMENT_LIMITS.maxFileBytes,
    });
  }, [options, serverConfig, voice]);
}

export function useVoiceRecorder(
  options: VoiceRecorderOptions,
): VoiceRecorderState {
  const voice = useSettingsStore((state) => state.voice);
  const updateVoice = useSettingsStore((state) => state.updateVoiceSettings);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const resources = useRecordingResources();
  const translate = useVoiceTranslator();
  const start = useStartRecording({
    ...options,
    resources,
    translate,
    isTranscribingSetter: setIsTranscribing,
  });
  const toggleRecording = useCallback(() => {
    if (resources.isRecording) stopRecording(resources);
    else start();
  }, [resources, start]);
  const toggleAutoTranscribe = useCallback(() => {
    updateVoice({ autoTranscribe: !voice.autoTranscribe });
  }, [updateVoice, voice.autoTranscribe]);
  return {
    voice,
    isRecording: resources.isRecording,
    isTranscribing,
    recordingSeconds: resources.seconds,
    toggleRecording,
    toggleAutoTranscribe,
  };
}
