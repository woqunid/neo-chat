import type React from "react";
import type { Attachment, VoiceSettings } from "@/types";

export type RecordingKind = "browser" | "media" | null;

export interface RecordingResources {
  readonly recognition: React.MutableRefObject<any>;
  readonly recorder: React.MutableRefObject<MediaRecorder | null>;
  readonly stream: React.MutableRefObject<MediaStream | null>;
  readonly chunks: React.MutableRefObject<Blob[]>;
  readonly kind: React.MutableRefObject<RecordingKind>;
  readonly timer: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  readonly session: React.MutableRefObject<number>;
  readonly alive: React.RefObject<boolean>;
  readonly isRecording: boolean;
  readonly seconds: number;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  setSeconds: React.Dispatch<React.SetStateAction<number>>;
  clearTimer: () => void;
  startTimer: () => void;
  releaseStream: (stream?: MediaStream | null) => void;
}

export interface VoiceRecorderOptions {
  append: (attachments: Attachment[]) => void;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setError: (message: string | null) => void;
}

export type VoiceTranslationKey =
  | "attachmentsExceedSize"
  | "failedToAccessMicrophone"
  | "failedToProcessAudio"
  | "failedToStartRecognition"
  | "transcriptionFailed";

export type VoiceTranslator = (
  key: VoiceTranslationKey,
  values?: { size: string },
) => string;

export interface VoiceRecorderState {
  readonly voice: VoiceSettings;
  readonly isRecording: boolean;
  readonly isTranscribing: boolean;
  readonly recordingSeconds: number;
  toggleRecording: () => void;
}
