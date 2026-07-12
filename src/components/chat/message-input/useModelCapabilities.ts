import { useMemo } from "react";
import { useSettingsStore } from "@/store/core/settingsStore";
import { parseModelString, supportsModality } from "@/lib/utils/model";
import type { ModelCapabilities } from "./types";

const EMPTY_CAPABILITIES: ModelCapabilities = Object.freeze({
  vision: false,
  attachment: false,
  audio: false,
  video: false,
});

export function useModelCapabilities(selectedModel: string): ModelCapabilities {
  const modelMetadata = useSettingsStore((state) => state.modelMetadata);
  const customMetadata = useSettingsStore((state) => state.customModelMetadata);

  return useMemo(() => {
    if (!selectedModel) return EMPTY_CAPABILITIES;
    const { modelName } = parseModelString(selectedModel);
    const metadata = customMetadata[modelName] || modelMetadata[modelName];
    return {
      vision: supportsModality(metadata, "image", "input"),
      attachment: metadata?.attachment ?? false,
      audio: supportsModality(metadata, "audio", "input"),
      video: supportsModality(metadata, "video", "input"),
    };
  }, [customMetadata, modelMetadata, selectedModel]);
}
