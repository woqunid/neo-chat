import type { useChatGenerationController } from "./hooks/useChatGenerationController";
import type { useChatShellState } from "./hooks/useChatShellState";

export type ChatShellState = ReturnType<typeof useChatShellState>;
export type ChatGenerationController = ReturnType<
  typeof useChatGenerationController
>;
