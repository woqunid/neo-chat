import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PluginAuthConfigSchema } from "@/lib/api/pluginSchemas";
import {
  completeMcpPromptArgument,
  discoverMcpServer,
  getMcpPrompt,
} from "@/lib/mcp/client";
import { resolveMcpPluginRequest } from "@/lib/mcp/pluginRequest";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const RequestSchema = z
  .object({
    pluginId: z.string().min(1).max(200),
    action: z.enum(["list", "get", "complete"]),
    name: z.string().min(1).max(300).optional(),
    args: z.record(z.string(), z.string().max(20_000)).optional(),
    argumentName: z.string().min(1).max(300).optional(),
    value: z.string().max(20_000).optional(),
    authConfig: PluginAuthConfigSchema,
    roots: z
      .array(
        z
          .object({
            uri: z.string().min(1).max(2_048),
            name: z.string().max(300).optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    sessionId: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.action !== "list" && !body.name) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "Prompt name is required",
      });
    }
    if (body.action === "complete" && !body.argumentName) {
      context.addIssue({
        code: "custom",
        path: ["argumentName"],
        message: "Prompt argument name is required",
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
        ? `${body.sessionId}:${plugin.id}:prompts`
        : undefined,
      signal: request.signal,
    };
    if (body.action === "get") {
      const result = await getMcpPrompt({
        ...options,
        name: body.name!,
        args: body.args,
      });
      return NextResponse.json({ result });
    }
    if (body.action === "complete") {
      const values = await completeMcpPromptArgument({
        ...options,
        promptName: body.name!,
        argumentName: body.argumentName!,
        value: body.value || "",
      });
      return NextResponse.json({ values });
    }
    const discovery = await discoverMcpServer(options);
    return NextResponse.json({
      prompts: discovery.prompts,
      capabilities: discovery.capabilities,
    });
  } catch (error) {
    safeServerLogError("Error handling MCP prompt request:", error);
    return createApiErrorResponse(error, "MCP prompt request failed");
  }
}
