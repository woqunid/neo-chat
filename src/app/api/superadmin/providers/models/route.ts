import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PROVIDER_CONFIG_LIMITS } from "@/config/limits";
import { assertProviderAdminRequest } from "@/lib/security/providerAdminAccess";
import {
  getServerModelProvider,
  toModelProviderRuntime,
} from "@/lib/providers/serverRegistry";
import { fetchProviderModelIds } from "@/lib/providers/fetchModels";

const AdminFetchModelsSchema = z.object({
  provider: z.object({
    id: z.string().optional(),
    name: z
      .string()
      .max(PROVIDER_CONFIG_LIMITS.maxProviderNameChars)
      .optional(),
    type: z.enum(["Anthropic", "Gemini", "OpenAI", "OpenAI Compatible"]),
    baseUrl: z.string().max(PROVIDER_CONFIG_LIMITS.maxBaseUrlChars).default(""),
    apiKey: z.string().max(PROVIDER_CONFIG_LIMITS.maxApiKeyChars).optional(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    await assertProviderAdminRequest(request);
    const body = AdminFetchModelsSchema.parse(
      await readJsonRequestBody(request),
    );
    const existing = await getServerModelProvider(body.provider.id);
    const provider = {
      ...(existing ? toModelProviderRuntime(existing) : {}),
      type: body.provider.type,
      name: body.provider.name || existing?.name,
      baseUrl: body.provider.baseUrl || existing?.baseUrl,
      apiKey: body.provider.apiKey?.trim() || existing?.apiKey || "",
    };
    const result = await fetchProviderModelIds(provider);
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json({ models: result.models });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to fetch models");
  }
}
