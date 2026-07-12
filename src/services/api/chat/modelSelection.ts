import { useSettingsStore } from "@/store/core/settingsStore";
import type { ModelMetadata } from "../../../types";
import {
  supportsImageGeneration,
  supportsTextOutput,
} from "../../../lib/utils/model";
import { isOpenAIProviderType } from "../../../lib/providers/providerTypes";

export function resolveModelMetadata(
  modelName: string,
): ModelMetadata | undefined {
  const { modelMetadata, customModelMetadata } = useSettingsStore.getState();
  return customModelMetadata?.[modelName] || modelMetadata?.[modelName];
}

export function usesDirectImageGeneration(
  providerType: unknown,
  metadata: ModelMetadata | undefined,
  modelName: string,
): boolean {
  return Boolean(
    isOpenAIProviderType(providerType) &&
    supportsImageGeneration(metadata) &&
    (!supportsTextOutput(metadata) ||
      modelName.toLowerCase().startsWith("gpt-image-")),
  );
}
