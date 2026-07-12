import { z } from "zod";
import { getPluginExecutionArgsError } from "../plugin/execution";
import {
  EncryptedSecretEnvelopeSchema,
  FunctionParametersSchema,
  JsonLikeSchema,
  ModelNameSchema,
  omitPlainSecretField,
  rejectPlainSecretField,
} from "./schemaPrimitives";

const MAX_CUSTOM_PLUGIN_INPUT_CHARS = 2_000_000;

const PluginFunctionSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    description: z.string().max(2_048).optional(),
    parameters: FunctionParametersSchema.optional(),
    path: z.string().min(1).max(1_024).optional(),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .or(z.enum(["get", "post", "put", "patch", "delete"]))
      .optional(),
    mcpToolName: z.string().min(1).max(256).optional(),
    risk: z.enum(["read", "write", "destructive", "external"]).optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    if (definition.mcpToolName) return;
    if (definition.path && definition.method) return;
    context.addIssue({
      code: "custom",
      message:
        "Plugin function must declare either REST path/method or mcpToolName",
    });
  });

const PluginHeaderMapSchema = z.record(
  z.string().min(1).max(120),
  z.string().max(4_096),
);

const PluginSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().max(300).optional(),
    description: z.string().max(5_000).optional(),
    logoUrl: z.string().max(2_048).optional(),
    manifestUrl: z.string().max(2_048).optional(),
    externalDocsUrl: z.string().max(2_048).optional(),
    baseUrl: z.string().max(2_048).optional(),
    category: z.string().max(120).optional(),
    categories: z.array(z.string().max(120)).max(20).optional(),
    added: z.string().max(120).optional(),
    functions: z.array(PluginFunctionSchema).max(40).optional(),
    source: z.enum(["builtin", "openapi", "mcp"]).optional(),
    mcp: z
      .object({
        transport: z.literal("streamable-http"),
        serverUrl: z.string().min(1).max(2_048),
        serverName: z.string().min(1).max(300),
        serverVersion: z.string().max(120).optional(),
        headers: PluginHeaderMapSchema.optional(),
        toolNameMap: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
    builtIn: z.boolean().optional(),
    auth: z
      .object({
        type: z.enum(["bearer", "apiKey", "basic", "oauth2", "none"]),
        name: z.string().max(120).optional(),
        in: z.enum(["header", "query"]).optional(),
        required: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

const PluginAuthConfigSchema = z
  .object({
    type: z.enum(["bearer", "apiKey", "none", "oauth2"]).optional(),
    value: z.unknown().optional(),
    valueSecret: EncryptedSecretEnvelopeSchema.optional(),
    key: z.string().max(120).optional(),
    addTo: z.enum(["header", "query"]).optional(),
    baseUrl: z.string().max(2_048).optional(),
    model: ModelNameSchema.optional(),
  })
  .strict()
  .superRefine((auth, context) => {
    rejectPlainSecretField(auth.value, context, ["value"], "Plugin auth value");
  })
  .transform((auth) => omitPlainSecretField(auth, "value"))
  .optional();

function addArgsIssue(
  args: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  const error = getPluginExecutionArgsError(args);
  if (!error) return;
  context.addIssue({ code: "custom", path: ["args"], message: error });
}

export const ToolExecutionSchema = z
  .object({
    plugin: PluginSchema,
    functionDef: PluginFunctionSchema,
    args: z.record(z.string(), JsonLikeSchema).default({}),
    authConfig: PluginAuthConfigSchema,
  })
  .strict()
  .superRefine((request, context) => addArgsIssue(request.args, context));

export const PluginExecutionRequestSchema = z
  .object({
    pluginId: z.string().min(1).max(200),
    functionName: z.string().min(1).max(128),
    args: z.record(z.string(), JsonLikeSchema).default({}),
    authConfig: PluginAuthConfigSchema,
    callId: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((request, context) => addArgsIssue(request.args, context));

export const PluginInstallSchema = z
  .object({
    plugin: PluginSchema.partial().optional(),
    customInput: z.string().max(MAX_CUSTOM_PLUGIN_INPUT_CHARS).optional(),
    authConfig: PluginAuthConfigSchema,
  })
  .strict();
