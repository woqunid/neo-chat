import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { unregisterServerPlugin } from "@/lib/plugin/serverRegistry";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const PluginUninstallSchema = z
  .object({ pluginId: z.string().min(1).max(200) })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const { pluginId } = PluginUninstallSchema.parse(
      await readJsonRequestBody(request),
    );
    await unregisterServerPlugin(pluginId);
    return NextResponse.json({ success: true });
  } catch (error) {
    safeServerLogError("Error uninstalling plugin:", error);
    return createApiErrorResponse(error, "Failed to uninstall plugin");
  }
}
