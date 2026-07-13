import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PROVIDER_CONFIG_LIMITS } from "@/config/limits";
import {
  createServerProviderId,
  listServerModelProviders,
  saveServerModelProviders,
  toPublicModelProvider,
  type ServerModelProvider,
} from "@/lib/providers/serverRegistry";

const AdminProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(PROVIDER_CONFIG_LIMITS.maxProviderNameChars),
  type: z.enum(["Anthropic", "Gemini", "OpenAI", "OpenAI Compatible"]),
  baseUrl: z.string().max(PROVIDER_CONFIG_LIMITS.maxBaseUrlChars).default(""),
  apiKey: z.string().max(PROVIDER_CONFIG_LIMITS.maxApiKeyChars).optional(),
  models: z.array(z.string()).max(200).default([]),
});

const AdminProvidersSchema = z.object({
  providers: z
    .array(AdminProviderSchema)
    .max(PROVIDER_CONFIG_LIMITS.maxProviders),
});

type AdminProviderInput = z.infer<typeof AdminProviderSchema>;

function mergeProvider(
  input: AdminProviderInput,
  existing: ServerModelProvider | undefined,
): ServerModelProvider {
  const now = new Date().toISOString();
  return {
    id: existing?.id || input.id || createServerProviderId(),
    name: input.name.trim(),
    type: input.type,
    baseUrl: input.baseUrl.trim(),
    apiKey:
      input.apiKey === undefined ? existing?.apiKey || "" : input.apiKey.trim(),
    models: input.models.map((model) => model.trim()).filter(Boolean),
    updatedAt: now,
  };
}

export async function GET() {
  try {
    const providers = await listServerModelProviders();
    return NextResponse.json({
      providers: providers.map(toPublicModelProvider),
    });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to load providers");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = AdminProvidersSchema.parse(await readJsonRequestBody(request));
    const existing = new Map(
      (await listServerModelProviders()).map((provider) => [
        provider.id,
        provider,
      ]),
    );
    const providers = body.providers.map((provider) =>
      mergeProvider(
        provider,
        provider.id ? existing.get(provider.id) : undefined,
      ),
    );
    const saved = await saveServerModelProviders(providers);
    return NextResponse.json({ providers: saved.map(toPublicModelProvider) });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to save providers");
  }
}
