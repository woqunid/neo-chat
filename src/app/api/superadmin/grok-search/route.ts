import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import {
  AdminGrokSearchSchema,
  mergeAdminGrokSearchConfig,
} from "@/lib/search/grokAdmin";
import {
  getServerGrokSearchConfig,
  saveServerGrokSearchConfig,
  toPublicGrokSearchConfig,
} from "@/lib/search/grokRegistry";

export async function GET() {
  try {
    const config = await getServerGrokSearchConfig();
    return NextResponse.json({ config: toPublicGrokSearchConfig(config) });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to load Grok search config");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const input = AdminGrokSearchSchema.parse(
      await readJsonRequestBody(request),
    );
    const existing = await getServerGrokSearchConfig();
    const saved = await saveServerGrokSearchConfig(
      mergeAdminGrokSearchConfig(input, existing),
    );
    return NextResponse.json({ config: toPublicGrokSearchConfig(saved) });
  } catch (error) {
    return createApiErrorResponse(error, "Failed to save Grok search config");
  }
}
