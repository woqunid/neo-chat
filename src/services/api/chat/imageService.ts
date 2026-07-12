import type { Attachment } from "@/types";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { parseModelString } from "@/lib/utils/model";
import { stripAttachmentsDisplayCacheForModel } from "../../../lib/utils/imageDisplayCache";
import { cacheGeneratedImageAttachments } from "../../../lib/utils/generatedImages";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../../lib/api/client";
import {
  buildProviderRuntimeConfig,
  fetchWithByokRetry,
} from "../../../lib/byok/client";
import { logDevError } from "../../../lib/utils/devLogger";

async function requestImageGeneration(options: {
  provider: Parameters<typeof buildProviderRuntimeConfig>[0];
  modelName: string;
  prompt: string;
  imageCount?: number;
  attachments?: Attachment[];
  signal?: AbortSignal;
}): Promise<Response> {
  const attachments = options.attachments
    ? await stripAttachmentsDisplayCacheForModel(options.attachments)
    : undefined;
  return fetchWithByokRetry(async () =>
    signedApiFetch("/api/chat/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: await buildProviderRuntimeConfig(options.provider),
        modelName: options.modelName,
        prompt: options.prompt,
        imageCount: options.imageCount,
        attachments,
      }),
      signal: options.signal,
    }),
  );
}

export const generateImage = async (
  modelString: string,
  prompt: string,
  options: { imageCount?: number; attachments?: Attachment[] } = {},
  signal?: AbortSignal,
): Promise<{ images: Attachment[]; message: string }> => {
  const { providerId, modelName } = parseModelString(modelString);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) throw new Error("No provider found");

  try {
    const response = await requestImageGeneration({
      provider,
      modelName,
      prompt,
      imageCount: options.imageCount,
      attachments: options.attachments,
      signal,
    });
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Image generation failed"),
      );
    }

    const data = await readJsonResponseOrThrow<{
      images?: Attachment[];
      message?: string;
    }>(response, "Image generation failed");
    const images = await cacheGeneratedImageAttachments(data.images || []);
    return {
      images,
      message: data.message || "No images generated.",
    };
  } catch (error) {
    logDevError("Image generation error:", error);
    throw error;
  }
};
