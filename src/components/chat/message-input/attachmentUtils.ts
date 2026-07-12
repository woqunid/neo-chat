import { v7 as uuidv7 } from "uuid";
import type { Attachment, RAGConfig } from "@/types";
import {
  ATTACHMENT_LIMITS,
  getAttachmentPayloadChars,
  getAttachmentsPayloadChars,
} from "@/config/limits";
import { isNativeMediaFile } from "@/lib/utils/messageInputHelpers";
import { createChatDocumentAttachment } from "@/lib/utils/documentAttachments";
import { ensureImageDisplayCache } from "@/lib/utils/imageDisplayCache";
import { saveToOPFS } from "@/utils/opfs";
import type { ModelCapabilities } from "./types";

export type AttachmentLimitFailure = "count" | "size" | null;

export interface AttachmentLimitResult {
  readonly accepted: Attachment[];
  readonly failure: AttachmentLimitFailure;
}

interface CreateFileAttachmentOptions {
  readonly file: File;
  readonly capabilities: ModelCapabilities;
  readonly documentsOnly: boolean;
  readonly rag: RAGConfig;
}

export function limitAttachments(
  existing: Attachment[],
  incoming: Attachment[],
): AttachmentLimitResult {
  const accepted: Attachment[] = [];
  let payloadChars = getAttachmentsPayloadChars(existing);
  let failure: AttachmentLimitFailure = null;

  for (const attachment of incoming) {
    if (existing.length + accepted.length >= ATTACHMENT_LIMITS.maxCount) {
      failure ??= "count";
      continue;
    }
    const nextChars = getAttachmentPayloadChars(attachment);
    if (payloadChars + nextChars > ATTACHMENT_LIMITS.maxTotalBase64Chars) {
      failure ??= "size";
      continue;
    }
    payloadChars += nextChars;
    accepted.push(attachment);
  }
  return { accepted, failure };
}

function canAttachNatively(
  file: File,
  capabilities: ModelCapabilities,
): boolean {
  if (!isNativeMediaFile(file)) return false;
  if (capabilities.attachment) return true;
  if (file.type.startsWith("image/")) return capabilities.vision;
  if (file.type.startsWith("audio/")) return capabilities.audio;
  return file.type.startsWith("video/") && capabilities.video;
}

function getMediaPrefix(file: File): string {
  if (file.type.startsWith("audio/")) return "chat/audio";
  if (file.type.startsWith("video/")) return "chat/video";
  return "chat/files";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function createNativeAttachment(file: File): Promise<Attachment> {
  const mimeType = file.type || "application/octet-stream";
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    const url = await saveToOPFS(file, getMediaPrefix(file));
    return { id: uuidv7(), mimeType, url, fileName: file.name };
  }
  const dataUrl = await readFileAsDataUrl(file);
  const attachment = {
    id: uuidv7(),
    mimeType,
    data: dataUrl.split(",")[1],
    fileName: file.name,
  };
  if (!mimeType.startsWith("image/")) return attachment;
  return ensureImageDisplayCache(attachment, { prefix: "chat/images" });
}

export function usesNativeAttachment(
  options: CreateFileAttachmentOptions,
): boolean {
  return (
    !options.documentsOnly &&
    canAttachNatively(options.file, options.capabilities)
  );
}

export async function createFileAttachment(
  options: CreateFileAttachmentOptions,
): Promise<Attachment> {
  if (usesNativeAttachment(options)) {
    return createNativeAttachment(options.file);
  }
  const result = await createChatDocumentAttachment(options.file, {
    id: uuidv7(),
    rag: options.rag,
    saveOriginalFile: saveToOPFS,
  });
  return result.attachment;
}
