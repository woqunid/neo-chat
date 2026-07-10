import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import {
  AdminGrokSearchSchema,
  mergeAdminGrokSearchConfig,
} from "@/lib/search/grokAdmin";
import { runGrokSearchWithConfig } from "@/lib/search/grokClient";
import { getServerGrokSearchConfig } from "@/lib/search/grokRegistry";

const RequestSchema = z.object({ config: AdminGrokSearchSchema }).strict();
const TEST_QUERY =
  "What is today's date in UTC? Use live web search and cite a source.";

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await readJsonRequestBody(request));
    const existing = await getServerGrokSearchConfig();
    const config = mergeAdminGrokSearchConfig(body.config, existing);
    const result = await runGrokSearchWithConfig(TEST_QUERY, config);
    return NextResponse.json({
      ok: true,
      citationCount: result.sources.length,
    });
  } catch (error) {
    return createApiErrorResponse(error, "Grok web search test failed");
  }
}
