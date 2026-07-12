import { useCallback, useRef, useState } from "react";
import { getTaskModel } from "@/store/core/settingsStore";
import { polishTextContent } from "@/services/artifactService";
import { logDevError } from "@/lib/utils/devLogger";
import { useAliveRef } from "./useAliveRef";

const loadChatService = () => import("@/services/api/chatService");

interface TextPolishOptions {
  readonly input: string;
  readonly busy: boolean;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setError: (message: string | null) => void;
  getFailureMessage: () => string;
}

interface PolishRunOptions extends TextPolishOptions {
  readonly runId: number;
  readonly runRef: React.MutableRefObject<number>;
  readonly alive: React.RefObject<boolean>;
  setPolishing: (value: boolean) => void;
}

function isCurrent(options: PolishRunOptions): boolean {
  return options.alive.current && options.runRef.current === options.runId;
}

async function runTextPolish(options: PolishRunOptions): Promise<void> {
  let replacement = "";
  try {
    const { streamGenerateContent } = await loadChatService();
    await streamGenerateContent(
      getTaskModel("promptOptimization"),
      polishTextContent(options.input),
      {
        onChunk: (text) => {
          if (!isCurrent(options)) return;
          replacement = text;
          options.setInput(text);
        },
      },
    );
    if (!isCurrent(options) || replacement.trim()) return;
    options.setInput(options.input);
    options.setError(options.getFailureMessage());
  } catch (error) {
    logDevError("Failed to polish input text", error);
    if (!isCurrent(options)) return;
    options.setInput(options.input);
    options.setError(options.getFailureMessage());
  } finally {
    if (isCurrent(options)) options.setPolishing(false);
  }
}

export function useTextPolish(options: TextPolishOptions) {
  const [isPolishing, setPolishing] = useState(false);
  const runRef = useRef(0);
  const alive = useAliveRef();
  const polish = useCallback(() => {
    if (!options.input.trim() || options.busy || isPolishing) return;
    const runId = ++runRef.current;
    setPolishing(true);
    options.setError(null);
    void runTextPolish({
      ...options,
      runId,
      runRef,
      alive,
      setPolishing,
    });
  }, [alive, isPolishing, options]);
  return { isPolishing, polish };
}
