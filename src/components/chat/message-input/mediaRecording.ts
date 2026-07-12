import { v7 as uuidv7 } from "uuid";
import type { Attachment, VoiceSettings } from "@/types";
import { formatBytes } from "@/config/limits";
import { transcribeAudio } from "@/services/api/voiceService";
import { logDevError } from "@/lib/utils/devLogger";
import { saveToOPFS } from "@/utils/opfs";
import type {
  RecordingResources,
  VoiceRecorderOptions,
  VoiceTranslator,
} from "./voiceTypes";

interface MediaRecordingOptions extends VoiceRecorderOptions {
  readonly resources: RecordingResources;
  readonly voice: VoiceSettings;
  readonly maxFileBytes: number;
  setIsTranscribing: React.Dispatch<React.SetStateAction<boolean>>;
  translate: VoiceTranslator;
}

interface RecordedAudioOptions extends MediaRecordingOptions {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly session: number;
}

function isCurrent(options: RecordedAudioOptions): boolean {
  return (
    options.resources.alive.current &&
    options.resources.session.current === options.session
  );
}

function getAudioExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function getRecorderMimeType(): string {
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

async function transcribeRecording(
  options: RecordedAudioOptions,
): Promise<void> {
  options.setIsTranscribing(true);
  try {
    const text = await transcribeAudio(options.blob, options.voice);
    if (text && isCurrent(options)) {
      options.setInput((value) => `${value}${value ? " " : ""}${text}`);
    }
  } catch (error) {
    logDevError("Transcription failed", error);
    if (isCurrent(options)) {
      options.setError(
        error instanceof Error
          ? error.message
          : options.translate("transcriptionFailed"),
      );
    }
  } finally {
    if (isCurrent(options)) options.setIsTranscribing(false);
  }
}

async function attachRecording(options: RecordedAudioOptions): Promise<void> {
  if (!isCurrent(options)) return;
  if (options.blob.size > options.maxFileBytes) {
    options.setError(
      options.translate("attachmentsExceedSize", {
        size: formatBytes(options.maxFileBytes),
      }),
    );
    return;
  }
  const extension = getAudioExtension(options.mimeType);
  const time = new Date().toLocaleTimeString().replace(/:/g, "-");
  const fileName = `Voice Note ${time}.${extension}`;
  const file = new File([options.blob], fileName, { type: options.mimeType });
  const url = await saveToOPFS(file, "chat/audio");
  const attachment: Attachment = {
    id: uuidv7(),
    mimeType: options.mimeType,
    url,
    fileName,
  };
  if (isCurrent(options)) options.append([attachment]);
}

async function processRecording(options: RecordedAudioOptions): Promise<void> {
  try {
    if (options.voice.autoTranscribe) await transcribeRecording(options);
    else await attachRecording(options);
  } catch (error) {
    logDevError("Failed to process audio attachment", error);
    if (isCurrent(options))
      options.setError(options.translate("failedToProcessAudio"));
  }
}

interface ConfigureRecorderOptions extends MediaRecordingOptions {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly session: number;
}

function configureRecorder(options: ConfigureRecorderOptions): void {
  const { recorder, stream, session } = options;
  recorder.ondataavailable = (event) => {
    if (options.resources.session.current !== session || event.data.size === 0)
      return;
    options.resources.chunks.current.push(event.data);
  };
  recorder.onstop = () => {
    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(options.resources.chunks.current, { type: mimeType });
    options.resources.chunks.current = [];
    options.resources.releaseStream(stream);
    if (options.resources.recorder.current === recorder) {
      options.resources.recorder.current = null;
    }
    options.resources.kind.current = null;
    options.resources.clearTimer();
    if (!options.resources.alive.current) return;
    options.resources.setIsRecording(false);
    void processRecording({ ...options, blob, mimeType, session });
  };
}

export async function startMediaRecording(
  options: MediaRecordingOptions,
): Promise<void> {
  const resources = options.resources;
  const session = ++resources.session.current;
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!resources.alive.current || resources.session.current !== session) {
      resources.releaseStream(stream);
      return;
    }
    resources.stream.current = stream;
    const mimeType = getRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    resources.recorder.current = recorder;
    resources.chunks.current = [];
    configureRecorder({ ...options, recorder, stream, session });
    recorder.start();
    resources.kind.current = "media";
    resources.setIsRecording(true);
    resources.startTimer();
  } catch (error) {
    logDevError("Failed to access microphone", error);
    resources.releaseStream(stream);
    resources.recorder.current = null;
    resources.kind.current = null;
    if (resources.alive.current && resources.session.current === session) {
      options.setError(options.translate("failedToAccessMicrophone"));
    }
  }
}
