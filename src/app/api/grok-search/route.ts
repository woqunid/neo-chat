import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GROK_SEARCH_LIMITS } from "@/config/limits";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { ApiError } from "@/lib/errors";
import { runGrokSearchWithConfig } from "@/lib/search/grokClient";
import {
  getServerGrokSearchConfig,
  isGrokSearchReady,
} from "@/lib/search/grokRegistry";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const GrokSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(GROK_SEARCH_LIMITS.maxQueryChars),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const body = GrokSearchRequestSchema.parse(
      await readJsonRequestBody(request),
    );
    const config = await getServerGrokSearchConfig();
    if (!isGrokSearchReady(config)) {
      throw new ApiError("Grok web search is not configured or enabled", {
        statusCode: 503,
        code: "GROK_SEARCH_UNAVAILABLE",
      });
    }
    return NextResponse.json(
      await runGrokSearchWithConfig(body.query, config, request.signal),
    );
  } catch (error) {
    safeServerLogError("Grok search error:", error);
    return createApiErrorResponse(error, "Grok web search failed");
  }
}
