import "server-only";

import { z } from "zod";
import {
  PROVIDER_CONFIG_LIMITS,
  PROVIDER_MODEL_LIMITS,
} from "../../config/limits";
import type { ServerGrokSearchConfig } from "./grokRegistry";

export const AdminGrokSearchSchema = z
  .object({
    baseUrl: z.string().max(PROVIDER_CONFIG_LIMITS.maxBaseUrlChars),
    apiKey: z.string().max(PROVIDER_CONFIG_LIMITS.maxApiKeyChars).optional(),
    model: z.string().max(PROVIDER_MODEL_LIMITS.maxModelIdChars),
  })
  .strict();

export type AdminGrokSearchInput = z.infer<typeof AdminGrokSearchSchema>;

export function mergeAdminGrokSearchConfig(
  input: AdminGrokSearchInput,
  existing: ServerGrokSearchConfig | null,
): ServerGrokSearchConfig {
  return {
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey?.trim() || existing?.apiKey || "",
    model: input.model.trim(),
    updatedAt: new Date().toISOString(),
  };
}
