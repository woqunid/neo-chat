import { useCallback, useEffect, useRef, useState } from "react";
import { stopMediaStreamTracks } from "@/lib/utils/mediaRecording";
import { useAliveRef } from "./useAliveRef";
import type { RecordingResources } from "./voiceTypes";

type CleanupResources = Pick<
  RecordingResources,
  | "session"
  | "clearTimer"
  | "recognition"
  | "recorder"
  | "chunks"
  | "kind"
  | "releaseStream"
>;

function stopRecognition(recognition: any): void {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch {
    // Speech recognition can already be inactive during teardown.
  }
}

function cleanup(resources: CleanupResources): void {
  resources.session.current += 1;
  resources.clearTimer();
  stopRecognition(resources.recognition.current);
  resources.recognition.current = null;
  const recorder = resources.recorder.current;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state !== "inactive") recorder.stop();
  }
  resources.recorder.current = null;
  resources.chunks.current = [];
  resources.kind.current = null;
  resources.releaseStream();
}

function useRecordingCleanup(resources: RecordingResources): void {
  const {
    session,
    recognition,
    recorder,
    chunks,
    kind,
    clearTimer,
    releaseStream,
  } = resources;
  useEffect(() => {
    const cleanupResources = {
      session,
      recognition,
      recorder,
      chunks,
      kind,
      clearTimer,
      releaseStream,
    };
    return () => cleanup(cleanupResources);
  }, [chunks, clearTimer, kind, recognition, recorder, releaseStream, session]);
}

export function useRecordingResources(): RecordingResources {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recognition = useRef<any>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const kind = useRef<"browser" | "media" | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const session = useRef(0);
  const alive = useAliveRef();
  const clearTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  const startTimer = useCallback(() => {
    clearTimer();
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
  }, [clearTimer]);
  const releaseStream = useCallback((target = stream.current) => {
    stopMediaStreamTracks(target);
    if (!target || stream.current === target) stream.current = null;
  }, []);
  const resources = {
    recognition,
    recorder,
    stream,
    chunks,
    kind,
    timer,
    session,
    alive,
    isRecording,
    seconds,
    setIsRecording,
    setSeconds,
    clearTimer,
    startTimer,
    releaseStream,
  };
  useRecordingCleanup(resources);
  return resources;
}
