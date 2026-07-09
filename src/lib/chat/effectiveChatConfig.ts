import type { ChatConfig } from "./types";
import type { ModelMetadata } from "../../types";

export function resolveEffectiveChatRequestConfig({
  chatConfig,
}: {
  chatConfig: ChatConfig;
  selectedModel: string;
  modelMetadata: Record<string, ModelMetadata>;
  customModelMetadata: Record<string, ModelMetadata>;
}): ChatConfig {
  return {
    ...chatConfig,
    useReasoning: false,
    reasoningMode: "off",
  };
}
