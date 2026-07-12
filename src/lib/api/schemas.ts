import { z } from "zod";
import {
  API_INPUT_LIMITS,
  ATTACHMENT_LIMITS,
  CHAT_CONFIG_LIMITS,
  IMAGE_GENERATION_LIMITS,
  PLUGIN_EXECUTION_LIMITS,
  getAttachmentsPayloadChars,
} from "../../config/limits";
import { getRemoteAttachmentUrlError } from "../security/remoteAttachment";
import {
  AttachmentSchema,
  FunctionParametersSchema,
  JsonLikeSchema,
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
  addAttachmentFileSizeIssues,
} from "./schemaPrimitives";
export {
  AttachmentSchema,
  EncryptedSecretEnvelopeSchema,
  FunctionParametersSchema,
  JsonLikeSchema,
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
  addAttachmentFileSizeIssues,
  omitPlainSecretField,
  rejectPlainSecretField,
} from "./schemaPrimitives";

const ReasoningModeSchema = z.enum(["off", "auto", "low", "medium", "high"]);

export const ToolCallSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(128),
    args: z.record(z.string(), JsonLikeSchema).default({}),
    status: z
      .enum(["pending", "running", "success", "error", "skipped"])
      .optional(),
    result: JsonLikeSchema.optional(),
    isError: z.boolean().optional(),
  })
  .transform((toolCall) => ({
    ...toolCall,
    status:
      toolCall.status ||
      (toolCall.isError
        ? "error"
        : toolCall.result !== undefined
          ? "success"
          : "pending"),
  }));

export const SkillInvocationSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().min(1).max(160),
    description: z.string().max(2_048).optional(),
    category: z.string().min(1).max(120),
    mode: z.enum(["manual", "auto"]),
  })
  .strict();

export const MessageSchema = z.object({
  id: z.string().default(""),
  role: z.enum(["user", "model"]),
  content: z.string().max(2_000_000).default(""),
  reasoning: z.string().max(2_000_000).optional(),
  timestamp: z.number().default(0),
  attachments: z.array(AttachmentSchema).max(20).optional(),
  toolCalls: z
    .array(ToolCallSchema)
    .max(PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls)
    .optional(),
  skillInvocations: z.array(SkillInvocationSchema).max(20).optional(),
  model: ModelNameSchema.optional(),
});

const ToolSchema = z
  .object({
    type: z.literal("function"),
    function: z
      .object({
        name: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/),
        description: z.string().max(2_048).optional(),
        parameters: FunctionParametersSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const ChatRequestSchema = z
  .object({
    provider: ProviderRuntimeConfigSchema,
    modelName: ModelNameSchema,
    history: z.array(MessageSchema).max(400),
    newMessage: z.string().max(API_INPUT_LIMITS.maxChatTextChars),
    attachments: z
      .array(AttachmentSchema)
      .max(ATTACHMENT_LIMITS.maxCount)
      .optional(),
    config: z
      .object({
        temperature: z
          .number()
          .min(CHAT_CONFIG_LIMITS.minTemperature)
          .max(CHAT_CONFIG_LIMITS.maxTemperature)
          .optional(),
        useReasoning: z.boolean().optional(),
        reasoningMode: ReasoningModeSchema.optional(),
        useSearch: z.boolean().optional(),
        useRAG: z.boolean().optional(),
        imageCount: z
          .number()
          .int()
          .min(IMAGE_GENERATION_LIMITS.minCount)
          .max(IMAGE_GENERATION_LIMITS.maxCount)
          .optional(),
      })
      .strict()
      .optional(),
    systemInstruction: z
      .string()
      .max(API_INPUT_LIMITS.maxSystemInstructionChars)
      .optional(),
    tools: z.array(ToolSchema).max(64).optional(),
    enableImageGeneration: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    const attachments = request.attachments || [];
    const totalPayloadChars = getAttachmentsPayloadChars(attachments);

    if (totalPayloadChars > ATTACHMENT_LIMITS.maxTotalBase64Chars) {
      ctx.addIssue({
        code: "custom",
        path: ["attachments"],
        message: "Attachment payload is too large",
      });
    }

    addAttachmentFileSizeIssues(attachments, ctx, ["attachments"]);

    attachments.forEach((attachment, index) => {
      if (!attachment.url) return;

      const remoteUrlError = getRemoteAttachmentUrlError(attachment.url);
      if (remoteUrlError) {
        ctx.addIssue({
          code: "custom",
          path: ["attachments", index, "url"],
          message: remoteUrlError,
        });
      }
    });
  });

export const SimpleGenerateRequestSchema = z
  .object({
    provider: ProviderRuntimeConfigSchema,
    modelName: ModelNameSchema,
    prompt: z.string().min(1).max(API_INPUT_LIMITS.maxSimplePromptChars),
  })
  .strict();

export const AuxiliaryGenerateRequestSchema = z
  .object({
    provider: ProviderRuntimeConfigSchema,
    modelName: ModelNameSchema,
    history: z.array(MessageSchema).max(100).optional(),
    userMessage: z
      .string()
      .max(API_INPUT_LIMITS.maxAuxiliaryTextChars)
      .optional(),
  })
  .strict();

export {
  PluginExecutionRequestSchema,
  PluginInstallSchema,
  ToolExecutionSchema,
} from "./pluginSchemas";

export {
  DocumentParseSchema,
  ImageGenerateRequestSchema,
  RAGQuerySchema,
  RAGUpsertSchema,
  VoiceSynthesizeRequestSchema,
  VoiceTranscribeRequestSchema,
} from "./contentSchemas";
