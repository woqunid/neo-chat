import { NextRequest } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { handlePluginExecution } from "./executeHandlers";

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted || (error instanceof Error && error.name === "AbortError")
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonRequestBody(request);
    return await handlePluginExecution(body, request.signal);
  } catch (error) {
    if (isAbort(error, request.signal)) {
      return new Response(null, { status: 499 });
    }
    safeServerLogError("Error executing plugin function:", error);
    return createApiErrorResponse(error, "Plugin execution failed");
  }
}
