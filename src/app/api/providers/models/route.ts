import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { ProviderRuntimeConfigSchema } from "@/lib/api/schemas";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { fetchProviderModelIds } from "@/lib/providers/fetchModels";

const ProviderModelsRequestSchema = z.object({
  provider: ProviderRuntimeConfigSchema,
});

export async function POST(request: NextRequest) {
  try {
    const { provider: parsedProvider } = ProviderModelsRequestSchema.parse(
      await readJsonRequestBody(request),
    );
    const provider = await resolveProviderRuntimeConfig(parsedProvider);
    const result = await fetchProviderModelIds(provider);
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }

    return NextResponse.json({ models: result.models });
  } catch (error) {
    safeServerLogError("Provider models error:", error);
    return createApiErrorResponse(error, "Failed to fetch models");
  }
}
