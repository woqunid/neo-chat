import { boundHistoryForRequest } from "../../../lib/chat/requestContextBudget";
import { generateImage } from "./imageService";
import { ChatStreamRuntime } from "./streamRuntime";

export async function runDirectImageRequest(
  runtime: ChatStreamRuntime,
): Promise<string | null> {
  const prepared = runtime.prepared;
  if (!prepared.directImageGeneration) return null;
  boundHistoryForRequest([], {
    newMessage: runtime.requestMessage,
    attachments: runtime.requestAttachments,
    systemInstruction: prepared.options.userSystemInstruction,
    tools: prepared.tools,
    modelInputTokenLimit: prepared.selectedModelMetadata?.limit?.context,
    reservedOutputTokens: prepared.selectedModelMetadata?.limit?.output,
  });
  const loadingId = runtime.output.appendImageGenerationStatus();
  runtime.emitBlocks();
  let result: Awaited<ReturnType<typeof generateImage>>;
  try {
    result = await generateImage(
      prepared.options.model,
      runtime.requestMessage,
      {
        imageCount: runtime.requestConfig.imageCount,
        attachments: runtime.requestAttachments,
      },
      prepared.options.signal,
    );
  } catch (error) {
    if (runtime.output.clearImageGenerationStatus(loadingId)) {
      runtime.emitBlocks();
    }
    throw error;
  }
  runtime.output.clearImageGenerationStatus(loadingId);
  if (result.images.length > 0) {
    result.images.forEach((image) => runtime.output.appendImage(image));
    runtime.emitContent("", "");
    return runtime.committedContent;
  }
  runtime.output.appendText(result.message);
  runtime.emitContent(result.message, "");
  return runtime.committedContent + result.message;
}
