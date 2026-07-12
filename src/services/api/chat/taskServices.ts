import type { Message } from "@/types";
import { getTaskModel } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { normalizeSessionTitle } from "@/lib/chat/entities";
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

type TaskName = Parameters<typeof getTaskModel>[0];

interface TaskRequestOptions {
  taskName: TaskName;
  path: string;
  body: Record<string, unknown>;
  errorMessage: string;
}

function resolveTaskTarget(taskName: TaskName) {
  const { providers } = useCoreSettingsStore.getState();
  const defaultProvider = providers.find(({ enabled }) => enabled);
  if (!defaultProvider) return null;

  const { providerId, modelName } = parseModelString(getTaskModel(taskName));
  const provider = providerId
    ? providers.find(({ id }) => id === providerId)
    : defaultProvider;
  return provider ? { provider, modelName } : null;
}

async function requestTask<T>(options: TaskRequestOptions): Promise<T | null> {
  const target = resolveTaskTarget(options.taskName);
  if (!target) return null;
  const response = await fetchWithByokRetry(async () =>
    signedApiFetch(options.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: await buildProviderRuntimeConfig(target.provider),
        modelName: target.modelName,
        ...options.body,
      }),
    }),
  );
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, options.errorMessage),
    );
  }
  return readJsonResponseOrThrow<T>(response, options.errorMessage);
}

export const generateChatTitle = async (
  history: Message[],
): Promise<string> => {
  const fallbackTitle = () =>
    normalizeSessionTitle(history.find((m) => m.role === "user")?.content);
  try {
    const data = await requestTask<{ title?: string }>({
      taskName: "titleGeneration",
      path: "/api/chat/generate-title",
      body: { history },
      errorMessage: "Title generation failed",
    });
    return data ? normalizeSessionTitle(data.title) : fallbackTitle();
  } catch (error) {
    logDevError("Title generation error:", error);
    return fallbackTitle();
  }
};

export const generateRelatedQuestions = async (
  history: Message[],
): Promise<string[]> => {
  try {
    const data = await requestTask<{ questions?: string[] }>({
      taskName: "relatedQuestions",
      path: "/api/chat/related-questions",
      body: { history },
      errorMessage: "Related questions generation failed",
    });
    return data?.questions || [];
  } catch (error) {
    logDevError("Related questions error:", error);
    return [];
  }
};

export const generateRAGSearchQueries = async (
  userPrompt: string,
): Promise<string[]> => {
  try {
    const data = await requestTask<{ queries?: string[] }>({
      taskName: "ragQuery",
      path: "/api/chat/rag-queries",
      body: { userMessage: userPrompt },
      errorMessage: "RAG queries generation failed",
    });
    return data?.queries || [userPrompt];
  } catch (error) {
    logDevError("RAG queries error:", error);
    return [userPrompt];
  }
};
