import { z } from "zod";
import {
  API_INPUT_LIMITS,
  ATTACHMENT_LIMITS,
  getAttachmentPayloadBytes,
  getRuntimeMaxAttachmentFileBytes,
} from "../../config/limits";
import { BYOK_ALG } from "../byok/shared";

const Base64UrlStringSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const EncryptedSecretEnvelopeSchema = z.object({
  v: z.literal(1),
  kid: z.string().min(1).max(128),
  alg: z.literal(BYOK_ALG),
  iv: Base64UrlStringSchema.min(1).max(1_024),
  wrappedKey: Base64UrlStringSchema.min(1).max(16_384),
  ciphertext: Base64UrlStringSchema.min(1).max(65_536),
  context: z.string().min(1).max(200),
});

export function rejectPlainSecretField(
  value: unknown,
  context: z.RefinementCtx,
  path: string[],
  label: string,
): void {
  if (typeof value !== "string" || !value.trim()) return;
  context.addIssue({
    code: "custom",
    path,
    message: `${label} must be sent as an encrypted BYOK secret`,
  });
}

export function omitPlainSecretField<
  T extends Record<string, unknown>,
  K extends string,
>(value: T, field: K): Omit<T, K> {
  const next = { ...value };
  delete next[field];
  return next as Omit<T, K>;
}

export const ProviderRuntimeConfigSchema = z
  .object({
    type: z.enum(["Anthropic", "OpenAI", "Gemini", "OpenAI Compatible"]),
    source: z.enum(["server-default", "server-provider"]).optional(),
    providerId: z.string().max(200).optional(),
    apiKey: z.unknown().optional(),
    apiKeySecret: EncryptedSecretEnvelopeSchema.optional(),
    baseUrl: z.string().max(2_048).optional(),
    name: z.string().max(120).optional(),
  })
  .strict()
  .superRefine((provider, context) =>
    rejectPlainSecretField(
      provider.apiKey,
      context,
      ["apiKey"],
      "Provider API key",
    ),
  )
  .transform((provider) => omitPlainSecretField(provider, "apiKey"));

export const JsonLikeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonLikeSchema),
    z.record(z.string(), JsonLikeSchema),
  ]),
);

export const ModelNameSchema = z
  .string()
  .min(1)
  .max(API_INPUT_LIMITS.maxModelNameChars);

export const AttachmentSchema = z.object({
  id: z.string().default(""),
  mimeType: z.string().min(1).max(ATTACHMENT_LIMITS.maxMimeTypeChars),
  data: z.string().max(ATTACHMENT_LIMITS.maxBase64Chars).optional(),
  url: z.string().max(ATTACHMENT_LIMITS.maxUrlChars).optional(),
  fileName: z.string().min(1).max(ATTACHMENT_LIMITS.maxFileNameChars),
});

export function addAttachmentFileSizeIssues(
  attachments: Array<z.infer<typeof AttachmentSchema>>,
  context: z.RefinementCtx,
  path: string[],
): void {
  const maxFileBytes = getRuntimeMaxAttachmentFileBytes();
  attachments.forEach((attachment, index) => {
    if (getAttachmentPayloadBytes(attachment) <= maxFileBytes) return;
    context.addIssue({
      code: "custom",
      path: [...path, index, "data"],
      message: "Attachment file is too large",
    });
  });
}

export const FunctionParametersSchema = z
  .object({
    type: z.string().optional(),
    properties: z.record(z.string(), JsonLikeSchema).optional(),
    required: z.array(z.string()).optional(),
  })
  .passthrough();
