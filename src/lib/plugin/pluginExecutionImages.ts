import {
  GEMINI_IMAGE_PLUGIN_ID,
  OPENAI_IMAGE_PLUGIN_ID,
  OPENAI_RESPONSES_IMAGE_PLUGIN_ID,
} from "./responseNormalizers";
import type { PluginAuthConfig } from "./pluginExecutionTypes";
import {
  getConfiguredModel,
  getTrimmedStringArg,
  removeUndefinedFields,
} from "./pluginExecutionUtils";

export const OPENAI_RESPONSES_IMAGE_FUNCTION = "generate_image_with_responses";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const OPENAI_RESPONSES_MODEL = "gpt-5.5";
const OPENAI_IMAGE_MODEL = "gpt-image-1";
const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 10;

interface ImageRequestInput {
  readonly pluginId: string;
  readonly functionName: string;
  readonly args: Record<string, unknown>;
  readonly authConfig?: PluginAuthConfig;
}

interface PreparedImageRequest {
  readonly requestBody?: BodyInit;
  readonly usesFormDataBody: boolean;
  readonly path?: string;
}

interface OpenAIImageEditInput {
  readonly args: Record<string, unknown>;
  readonly model: string;
  readonly prompt: string;
  readonly images: readonly string[];
}

export type ImageRequestResult =
  { readonly error: string } | PreparedImageRequest;

function getImageCountArg(args: Record<string, unknown>): number | undefined {
  const value = args.n;
  const isAllowed =
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_IMAGE_COUNT &&
    value <= MAX_IMAGE_COUNT;
  return isAllowed ? value : undefined;
}

function getImageInputs(args: Record<string, unknown>): string[] {
  return Array.isArray(args.image)
    ? args.image.filter((item): item is string => typeof item === "string")
    : [];
}

function prepareGeminiImageRequest(
  args: Record<string, unknown>,
  authConfig: PluginAuthConfig | undefined,
): ImageRequestResult {
  const prompt = getTrimmedStringArg(args, "prompt");
  if (!prompt) return { error: "Image generation prompt is required" };

  const imageConfig = removeUndefinedFields({
    aspect_ratio: getTrimmedStringArg(args, "aspect_ratio") || undefined,
    image_size: getTrimmedStringArg(args, "image_size") || undefined,
  });
  const generationConfig = removeUndefinedFields({
    candidate_count: getImageCountArg(args),
    image_config: Object.keys(imageConfig).length ? imageConfig : undefined,
  });
  const images = getImageInputs(args);
  const input = images.length
    ? [
        { type: "text", text: prompt },
        ...images.map((image) => ({
          type: "image",
          uri: image.startsWith("data:") ? undefined : image,
          data: image.startsWith("data:") ? image.split(",").pop() : undefined,
        })),
      ]
    : prompt;
  const body = removeUndefinedFields({
    model:
      getTrimmedStringArg(args, "model") ||
      getConfiguredModel(authConfig) ||
      GEMINI_IMAGE_MODEL,
    input,
    response_modalities: ["image"],
    generation_config: Object.keys(generationConfig).length
      ? generationConfig
      : undefined,
  });
  return { requestBody: JSON.stringify(body), usesFormDataBody: false };
}

function prepareResponsesImageInput(
  prompt: string,
  images: readonly string[],
): string | Record<string, unknown>[] {
  if (!images.length) return prompt;
  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        ...images.map((image) => ({
          type: "input_image",
          image_url: image,
        })),
      ],
    },
  ];
}

function prepareOpenAIResponsesImageRequest(
  args: Record<string, unknown>,
  authConfig: PluginAuthConfig | undefined,
): ImageRequestResult {
  const prompt = getTrimmedStringArg(args, "prompt");
  if (!prompt) return { error: "Image generation prompt is required" };

  const imageTool = removeUndefinedFields({
    type: "image_generation",
    model:
      getTrimmedStringArg(args, "image_model") ||
      getConfiguredModel(authConfig) ||
      undefined,
    action: getTrimmedStringArg(args, "action") || undefined,
    quality: getTrimmedStringArg(args, "quality") || undefined,
    size: getTrimmedStringArg(args, "size") || undefined,
    background: getTrimmedStringArg(args, "background") || undefined,
  });
  const body = {
    model: getTrimmedStringArg(args, "model") || OPENAI_RESPONSES_MODEL,
    input: prepareResponsesImageInput(prompt, getImageInputs(args)),
    tools: [imageTool],
  };
  return { requestBody: JSON.stringify(body), usesFormDataBody: false };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) throw new Error("Image edits require data URL image inputs");

  const mimeType = match[1] || "image/png";
  const binary = atob(match[2] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function appendOptionalFormFields(
  formData: FormData,
  args: Record<string, unknown>,
): void {
  const size = getTrimmedStringArg(args, "size");
  const responseFormat = getTrimmedStringArg(args, "response_format");
  const imageCount = getImageCountArg(args);
  if (size) formData.append("size", size);
  if (responseFormat) formData.append("response_format", responseFormat);
  if (imageCount) formData.append("n", String(imageCount));
}

function prepareOpenAIImageEdit(
  input: OpenAIImageEditInput,
): PreparedImageRequest {
  const formData = new FormData();
  formData.append("model", input.model);
  formData.append("prompt", input.prompt);
  appendOptionalFormFields(formData, input.args);
  input.images.forEach((image, index) => {
    formData.append("image", dataUrlToBlob(image), `image-${index + 1}.png`);
  });
  return {
    requestBody: formData,
    usesFormDataBody: true,
    path: "/images/edits",
  };
}

function prepareOpenAICompatibleImageRequest(
  args: Record<string, unknown>,
  authConfig: PluginAuthConfig | undefined,
): ImageRequestResult {
  const prompt = getTrimmedStringArg(args, "prompt");
  if (!prompt) return { error: "Image generation prompt is required" };

  const images = getImageInputs(args);
  const model =
    getTrimmedStringArg(args, "model") ||
    getConfiguredModel(authConfig) ||
    OPENAI_IMAGE_MODEL;
  if (images.length) {
    return prepareOpenAIImageEdit({ args, model, prompt, images });
  }

  const body = removeUndefinedFields({
    model,
    prompt,
    size: getTrimmedStringArg(args, "size") || undefined,
    response_format: getTrimmedStringArg(args, "response_format") || undefined,
    n: getImageCountArg(args),
  });
  return { requestBody: JSON.stringify(body), usesFormDataBody: false };
}

function prepareOpenAICompatibleSafely(
  input: ImageRequestInput,
): ImageRequestResult {
  try {
    return prepareOpenAICompatibleImageRequest(input.args, input.authConfig);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Image request could not be prepared",
    };
  }
}

export function prepareImageRequest(
  input: ImageRequestInput,
): ImageRequestResult {
  if (input.pluginId === GEMINI_IMAGE_PLUGIN_ID) {
    return prepareGeminiImageRequest(input.args, input.authConfig);
  }
  if (
    input.pluginId === OPENAI_RESPONSES_IMAGE_PLUGIN_ID &&
    input.functionName === OPENAI_RESPONSES_IMAGE_FUNCTION
  ) {
    return prepareOpenAIResponsesImageRequest(input.args, input.authConfig);
  }
  if (
    input.pluginId === OPENAI_IMAGE_PLUGIN_ID &&
    input.functionName !== OPENAI_RESPONSES_IMAGE_FUNCTION
  ) {
    return prepareOpenAICompatibleSafely(input);
  }
  return { usesFormDataBody: false };
}
