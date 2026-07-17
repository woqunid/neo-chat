import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PluginAuthConfigSchema } from "@/lib/api/pluginSchemas";
import {
  discoverMcpServer,
  readMcpResource,
  subscribeMcpResource,
  unsubscribeMcpResource,
} from "@/lib/mcp/client";
import { resolveMcpPluginRequest } from "@/lib/mcp/pluginRequest";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const RootSchema = z
  .object({
    uri: z.string().min(1).max(2_048),
    name: z.string().max(300).optional(),
  })
  .strict();

const RequestSchema = z
  .object({
    pluginId: z.string().min(1).max(200),
    action: z.enum(["list", "read", "subscribe", "unsubscribe"]),
    uri: z.string().min(1).max(2_048).optional(),
    authConfig: PluginAuthConfigSchema,
    roots: z.array(RootSchema).max(50).optional(),
    sessionId: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.action !== "list" && !body.uri) {
      context.addIssue({
        code: "custom",
        path: ["uri"],
        message: "Resource URI is required",
      });
    }
  });

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await readJsonRequestBody(request));
    const { plugin, authConfig } = await resolveMcpPluginRequest(body);
    const options = {
      serverUrl: plugin.mcp!.serverUrl,
      staticHeaders: plugin.mcp!.headers,
      authConfig,
      roots: body.roots,
      sessionKey: body.sessionId
        ? `${body.sessionId}:${plugin.id}:resources`
        : undefined,
      signal: request.signal,
    };
    if (body.action === "read") {
      const result = await readMcpResource({ ...options, uri: body.uri! });
      return NextResponse.json({ result });
    }
    if (body.action === "subscribe") {
      await subscribeMcpResource({ ...options, uri: body.uri! });
      return NextResponse.json({ success: true });
    }
    if (body.action === "unsubscribe") {
      await unsubscribeMcpResource({ ...options, uri: body.uri! });
      return NextResponse.json({ success: true });
    }
    const discovery = await discoverMcpServer(options);
    return NextResponse.json({
      resources: discovery.resources,
      resourceTemplates: discovery.resourceTemplates,
      capabilities: discovery.capabilities,
    });
  } catch (error) {
    safeServerLogError("Error handling MCP resource request:", error);
    return createApiErrorResponse(error, "MCP resource request failed");
  }
}
