import type React from "react";
import type { Attachment, Plugin, TextSkill } from "@/types";
import type { ModelInfo } from "@/services/api/chatService";

export type MessageInputVariant = "default" | "hero";

export interface MessageInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  disabled: boolean;
  availableModels?: ModelInfo[];
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
  isSearchEnabled?: boolean;
  onSearchEnabledChange?: (enabled: boolean) => void;
  isGenerating?: boolean;
  queuedMessageCount?: number;
  variant?: MessageInputVariant;
}

export interface MessageInputRef {
  setValue: (value: string) => void;
  focus: () => void;
  setAttachments: (attachments: Attachment[]) => void;
}

export interface ModelCapabilities {
  readonly vision: boolean;
  readonly attachment: boolean;
  readonly audio: boolean;
  readonly video: boolean;
}

export type ComposerMenuName = "attach" | "skill" | "plugin" | "model";

export interface ComposerMenuState {
  readonly openMenu: ComposerMenuName | null;
  isOpen: (menu: ComposerMenuName) => boolean;
  setOpen: (menu: ComposerMenuName, open: boolean) => void;
  closeAll: () => void;
}

export interface ComposerDraft {
  readonly input: string;
  readonly attachments: Attachment[];
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  clear: () => void;
}

export interface AttachmentInputRefs {
  readonly file: React.RefObject<HTMLInputElement | null>;
  readonly image: React.RefObject<HTMLInputElement | null>;
  readonly textFallback: React.RefObject<HTMLInputElement | null>;
}

export interface AttachmentInputIds {
  readonly file: string;
  readonly image: string;
  readonly textFallback: string;
}

export interface AttachmentHandlers {
  readonly onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onTextFallbackSelect: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  readonly onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  readonly onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  readonly onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  readonly onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  readonly onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export interface AttachmentController {
  readonly capabilities: ModelCapabilities;
  readonly refs: AttachmentInputRefs;
  readonly ids: AttachmentInputIds;
  readonly handlers: AttachmentHandlers;
  readonly isParsing: boolean;
  readonly isDragActive: boolean;
  append: (attachments: Attachment[]) => void;
  remove: (id: string) => void;
}

export interface PluginSourceGroups {
  readonly plugins: Plugin[];
  readonly mcp: Plugin[];
}

export interface SkillMenuData {
  readonly skills: TextSkill[];
  readonly activeIds: string[];
  readonly activeSet: ReadonlySet<string>;
  toggle: (skillId: string) => void;
}

export interface MessageInputBusyState {
  readonly input: boolean;
  readonly sessionConfig: boolean;
}
