import type { Message } from "@/types";

const TRANSCRIPT_HISTORY_HOSTS = new Set(["hyueapi.com", "new.hyueapi.com"]);

export function requiresTranscriptHistory(host: string | undefined): boolean {
  return Boolean(host && TRANSCRIPT_HISTORY_HOSTS.has(host));
}

export function createTranscriptChatMessages({
  history,
  newMessage,
  attachments,
  systemInstruction,
}: {
  history: Message[];
  newMessage: string;
  attachments?: any[];
  systemInstruction?: string;
}) {
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  const content: any[] = [
    { type: "text", text: createTranscriptPrompt(history, newMessage) },
  ];
  if (attachments?.length) {
    content.push(...attachments);
  }
  messages.push({ role: "user", content });

  return messages;
}

function createTranscriptPrompt(
  history: Message[],
  newMessage: string,
): string {
  const transcript = history
    .map(formatTranscriptMessage)
    .filter(Boolean)
    .join("\n\n");

  if (!transcript) return newMessage;

  return [
    "Previous conversation:",
    transcript,
    "",
    "Current user message:",
    newMessage,
  ].join("\n");
}

function formatTranscriptMessage(message: Message): string {
  const label = message.role === "user" ? "User" : "Assistant";
  const content = message.content.trim();
  if (content) return `${label}: ${content}`;
  if (message.reasoning?.trim()) return `${label}: [reasoning-only response]`;
  return "";
}
