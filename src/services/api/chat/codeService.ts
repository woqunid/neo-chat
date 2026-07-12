import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { parseModelString } from "@/lib/utils/model";
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

export const executeCode = async (
  modelString: string,
  code: string,
): Promise<string> => {
  const { providerId, modelName } = parseModelString(modelString);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) throw new Error("No provider found");

  try {
    const response = await fetchWithByokRetry(async () =>
      signedApiFetch("/api/chat/execute-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(provider),
          modelName,
          code,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Code execution failed"),
      );
    }

    const data = await readJsonResponseOrThrow<{
      output?: string;
      error?: string;
    }>(response, "Code execution failed");
    return data.output || data.error || "No output.";
  } catch (error) {
    logDevError("Code execution error:", error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};
