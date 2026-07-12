import { NextRequest } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PluginInstallSchema } from "@/lib/api/schemas";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { handlePluginInstall } from "./installHandlers";

export async function POST(request: NextRequest) {
  try {
    const body = PluginInstallSchema.parse(await readJsonRequestBody(request));
    return await handlePluginInstall(body);
  } catch (error) {
    safeServerLogError("Error installing plugin:", error);
    return createApiErrorResponse(error, "Failed to install plugin");
  }
}
