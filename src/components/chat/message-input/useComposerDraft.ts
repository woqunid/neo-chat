import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import type { Attachment } from "@/types";
import type { ComposerDraft, MessageInputRef } from "./types";

function resizeTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function useComposerDraft(
  ref: ForwardedRef<MessageInputRef>,
): ComposerDraft {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const clear = useCallback(() => {
    setInput("");
    setAttachments([]);
    resizeTextarea(textareaRef.current);
  }, []);

  useEffect(() => resizeTextarea(textareaRef.current), [input]);
  useImperativeHandle(ref, () => ({
    setValue: (value) => {
      setInput(value);
      requestAnimationFrame(() => resizeTextarea(textareaRef.current));
    },
    focus: () => textareaRef.current?.focus(),
    setAttachments,
  }));

  return { input, attachments, textareaRef, setInput, setAttachments, clear };
}
