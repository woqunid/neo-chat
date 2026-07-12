import type { ProviderConfig } from "../providers/base";
import { ProviderFactory } from "../providers/base";
import { ANTHROPIC_PROVIDER_TYPE } from "../providers/providerTypes";
import { isOpenAIProviderType } from "../providers/providerTypes";
import { generateAnthropicMessage } from "../streaming/anthropic";

interface SimpleGenerationInput {
  prompt: string;
  signal?: AbortSignal;
}

function getResponsesOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;
  const output = Array.isArray(response?.output) ? response.output : [];
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) =>
      typeof content?.text === "string" ? content.text : "",
    )
    .join("");
}

async function generateOpenAIText(
  provider: ProviderConfig,
  modelName: string,
  input: SimpleGenerationInput,
): Promise<string> {
  const client = ProviderFactory.createOpenAIClient(provider);
  const request = { model: modelName, input: input.prompt, temperature: 0.7 };
  const response = input.signal
    ? await client.responses.create(request, { signal: input.signal })
    : await client.responses.create(request);
  return getResponsesOutputText(response);
}

async function generateCompatibleText(
  provider: ProviderConfig,
  modelName: string,
  input: SimpleGenerationInput,
): Promise<string> {
  const client = ProviderFactory.createOpenAIClient(provider);
  const request = {
    model: modelName,
    messages: [{ role: "user" as const, content: input.prompt }],
    temperature: 0.7,
  };
  const response = input.signal
    ? await client.chat.completions.create(request, { signal: input.signal })
    : await client.chat.completions.create(request);
  return response.choices[0]?.message?.content || "";
}

export async function handleSimpleGeneration(
  provider: ProviderConfig,
  modelName: string,
  input: SimpleGenerationInput,
): Promise<string> {
  input.signal?.throwIfAborted();
  await ProviderFactory.assertProviderOutboundAllowed(provider, input.signal);
  input.signal?.throwIfAborted();

  if (provider.type === ANTHROPIC_PROVIDER_TYPE) {
    return generateAnthropicMessage({
      provider,
      model: modelName,
      messages: [
        { role: "user", content: [{ type: "text", text: input.prompt }] },
      ],
      signal: input.signal,
    });
  }
  if (provider.type === "OpenAI") {
    return generateOpenAIText(provider, modelName, input);
  }
  if (isOpenAIProviderType(provider.type)) {
    return generateCompatibleText(provider, modelName, input);
  }

  const client = ProviderFactory.createGeminiClient(provider);
  const request: any = {
    model: modelName,
    contents: { parts: [{ text: input.prompt }] },
  };
  if (input.signal) request.config = { abortSignal: input.signal };
  const result = await client.models.generateContent(request);
  return result.text || "";
}
