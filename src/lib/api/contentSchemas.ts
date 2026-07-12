import { z } from "zod";
import {
  ATTACHMENT_LIMITS,
  IMAGE_GENERATION_LIMITS,
  getAttachmentsPayloadChars,
} from "../../config/limits";
import { getRemoteAttachmentUrlError } from "../security/remoteAttachment";
import {
  AttachmentSchema,
  EncryptedSecretEnvelopeSchema,
  JsonLikeSchema,
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
  addAttachmentFileSizeIssues,
  omitPlainSecretField,
  rejectPlainSecretField,
} from "./schemaPrimitives";

const MAX_RAG_TEXT_CHARS = 200_000;
const MAX_RAG_ITEMS = 1_000;
const MAX_RAG_RESULTS = 50;
const MAX_NAMESPACE_CHARS = 200;
const MAX_URL_CHARS = 2_048;
const MAX_IMAGE_PROMPT_CHARS = 8_000;
const MAX_VOICE_TEXT_CHARS = 10_000;
const MAX_VOICE_ID_CHARS = 120;

function requireCustomRagCredentials(
  request: {
    readonly useDefault?: boolean;
    readonly url?: string;
    readonly tokenSecret?: unknown;
  },
  context: z.RefinementCtx,
): void {
  if (request.useDefault || (request.url?.trim() && request.tokenSecret))
    return;
  context.addIssue({
    code: "custom",
    path: ["tokenSecret"],
    message: "RAG URL and token are required",
  });
}

export const RAGQuerySchema = z
  .object({
    text: z.string().min(1).max(MAX_RAG_TEXT_CHARS),
    namespace: z.string().max(MAX_NAMESPACE_CHARS).optional(),
    url: z.string().max(MAX_URL_CHARS).optional(),
    token: z.unknown().optional(),
    tokenSecret: EncryptedSecretEnvelopeSchema.optional(),
    useDefault: z.boolean().optional(),
    topK: z.coerce.number().int().min(1).max(MAX_RAG_RESULTS).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    rejectPlainSecretField(request.token, context, ["token"], "RAG token");
    requireCustomRagCredentials(request, context);
  })
  .transform((request) => omitPlainSecretField(request, "token"));

export const RAGUpsertSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          data: z.string().min(1).max(MAX_RAG_TEXT_CHARS),
          metadata: z.record(z.string(), JsonLikeSchema).optional(),
        }),
      )
      .max(MAX_RAG_ITEMS),
    namespace: z.string().max(MAX_NAMESPACE_CHARS).optional(),
    url: z.string().max(MAX_URL_CHARS).optional(),
    token: z.unknown().optional(),
    tokenSecret: EncryptedSecretEnvelopeSchema.optional(),
    useDefault: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    rejectPlainSecretField(request.token, context, ["token"], "RAG token");
    requireCustomRagCredentials(request, context);
  })
  .transform((request) => omitPlainSecretField(request, "token"));

export const DocumentParseSchema = z
  .object({
    file: z.instanceof(File),
    provider: z.enum(["mineru", "llamaParse"]).default("mineru"),
    apiKey: z.unknown().optional(),
    apiToken: z.unknown().optional(),
    apiKeySecret: EncryptedSecretEnvelopeSchema.optional(),
    useDefault: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    rejectPlainSecretField(
      request.apiKey,
      context,
      ["apiKey"],
      "Document parse API key",
    );
    rejectPlainSecretField(
      request.apiToken,
      context,
      ["apiToken"],
      "Document parse API token",
    );
    if (
      !request.useDefault &&
      request.provider === "llamaParse" &&
      !request.apiKeySecret
    ) {
      context.addIssue({
        code: "custom",
        path: ["apiKeySecret"],
        message: "Document parse API key is required",
      });
    }
  })
  .transform((request) =>
    omitPlainSecretField(omitPlainSecretField(request, "apiKey"), "apiToken"),
  );

function addImageAttachmentIssues(
  attachments: z.infer<typeof AttachmentSchema>[],
  context: z.RefinementCtx,
): void {
  if (
    getAttachmentsPayloadChars(attachments) >
    ATTACHMENT_LIMITS.maxTotalBase64Chars
  ) {
    context.addIssue({
      code: "custom",
      path: ["attachments"],
      message: "Attachment payload is too large",
    });
  }
  addAttachmentFileSizeIssues(attachments, context, ["attachments"]);
  attachments.forEach((attachment, index) => {
    if (!attachment.url) return;
    const error = getRemoteAttachmentUrlError(attachment.url);
    if (!error) return;
    context.addIssue({
      code: "custom",
      path: ["attachments", index, "url"],
      message: error,
    });
  });
}

export const ImageGenerateRequestSchema = z
  .object({
    provider: ProviderRuntimeConfigSchema,
    modelName: ModelNameSchema,
    prompt: z.string().min(1).max(MAX_IMAGE_PROMPT_CHARS),
    imageCount: z
      .number()
      .int()
      .min(IMAGE_GENERATION_LIMITS.minCount)
      .max(IMAGE_GENERATION_LIMITS.maxCount)
      .optional(),
    attachments: z
      .array(AttachmentSchema)
      .max(ATTACHMENT_LIMITS.maxCount)
      .optional(),
  })
  .strict()
  .superRefine((request, context) =>
    addImageAttachmentIssues(request.attachments || [], context),
  );

const VoiceProviderSchema = z.enum([
  "default",
  "elevenlabs",
  "mimo",
  "browser",
  "model",
]);

export const VoiceSynthesizeRequestSchema = z
  .object({
    text: z.string().min(1).max(MAX_VOICE_TEXT_CHARS),
    provider: VoiceProviderSchema,
    apiKey: z.unknown().optional(),
    apiKeySecret: EncryptedSecretEnvelopeSchema.optional(),
    voiceId: z.string().max(MAX_VOICE_ID_CHARS).optional(),
    modelId: z.string().max(MAX_VOICE_ID_CHARS).optional(),
    modelProvider: ProviderRuntimeConfigSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    rejectPlainSecretField(
      request.apiKey,
      context,
      ["apiKey"],
      "Voice API key",
    );
    if (request.provider !== "elevenlabs" || request.voiceId?.trim()) return;
    context.addIssue({
      code: "custom",
      path: ["voiceId"],
      message: "ElevenLabs voice ID is required",
    });
  })
  .transform((request) => omitPlainSecretField(request, "apiKey"));

export const VoiceTranscribeRequestSchema = z
  .object({
    provider: VoiceProviderSchema,
    apiKey: z.unknown().optional(),
    apiKeySecret: EncryptedSecretEnvelopeSchema.optional(),
    modelId: z.string().max(MAX_VOICE_ID_CHARS).optional(),
    modelProvider: ProviderRuntimeConfigSchema.optional(),
    language: z.enum(["auto", "en", "zh", "ja"]).optional(),
  })
  .strict()
  .superRefine((request, context) =>
    rejectPlainSecretField(
      request.apiKey,
      context,
      ["apiKey"],
      "Voice API key",
    ),
  )
  .transform((request) => omitPlainSecretField(request, "apiKey"));
