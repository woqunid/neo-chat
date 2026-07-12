"use client";

import { useEffect, useRef, useState } from "react";

const WELCOME_EXIT_DURATION_MS = 300;

export type WelcomeState = "visible" | "exiting" | "hidden";

interface UseWelcomeChatStateOptions {
  currentSessionId: string | null;
  isChatEmpty: boolean;
}

function resolveWelcomeState(
  current: WelcomeState,
  isChatEmpty: boolean,
): WelcomeState {
  if (!isChatEmpty && current === "visible") return "exiting";
  if (isChatEmpty && current !== "visible") return "visible";
  return current;
}

export function useWelcomeChatState(options: UseWelcomeChatStateOptions) {
  const [welcomeState, setWelcomeState] = useState<WelcomeState>("hidden");
  const previousSessionIdRef = useRef(options.currentSessionId);

  useEffect(() => {
    if (previousSessionIdRef.current !== options.currentSessionId) {
      previousSessionIdRef.current = options.currentSessionId;
      setWelcomeState(options.isChatEmpty ? "visible" : "hidden");
      return;
    }
    setWelcomeState((current) =>
      resolveWelcomeState(current, options.isChatEmpty),
    );
  }, [options.currentSessionId, options.isChatEmpty]);

  useEffect(() => {
    if (welcomeState !== "exiting") return;
    const timer = setTimeout(
      () => setWelcomeState("hidden"),
      WELCOME_EXIT_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [welcomeState]);

  return {
    welcomeState,
    messageInputVariant: welcomeState === "visible" ? "hero" : "default",
    shouldShowChatTitleBar: welcomeState === "hidden",
  } as const;
}
