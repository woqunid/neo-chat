import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { fetchProviderModelIds } from "@/lib/providers/fetchModels";
import {
  AdminGrokSearchSchema,
  mergeAdminGrokSearchConfig,
} from "@/lib/search/grokAdmin";
import { getServerGrokSearchConfig } from "@/lib/search/grokRegistry";

const RequestSchema = z.object({ config: AdminGrokSearchSchema }).strict();

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await readJsonRequestBody(request));
    const existing = await getServerGrokSearchConfig();
    const config = mergeAdminGrokSearchConfig(body.config, existing);
    const result = await fetchProviderModelIds({
      type: "OpenAI Compatible",
      name: "Grok Web Search",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json({ models: result.models });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to fetch Grok models");
  }
}
