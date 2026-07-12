"use client";

import { RefObject, useEffect, useRef } from "react";

import type { MessageInputRef } from "@/components/chat/MessageInput";
import type { Workspace } from "@/types";

interface WorkspaceAttachmentOptions {
  activeMessagesLength: number;
  currentSessionId: string | null;
  currentWorkspaceId?: string;
  inputRef: RefObject<MessageInputRef | null>;
  workspaces: Workspace[];
}

function findWorkspaceFiles(options: WorkspaceAttachmentOptions) {
  if (!options.currentWorkspaceId) return [];
  return (
    options.workspaces.find(
      (workspace) => workspace.id === options.currentWorkspaceId,
    )?.files ?? []
  );
}

export function useWorkspaceAttachmentHydration(
  options: WorkspaceAttachmentOptions,
): void {
  const inputSessionRef = useRef(options.currentSessionId);
  const hydratedSessionRef = useRef<string | null>(null);
  const {
    activeMessagesLength,
    currentSessionId,
    currentWorkspaceId,
    inputRef,
    workspaces,
  } = options;

  useEffect(() => {
    const sessionChanged = inputSessionRef.current !== currentSessionId;
    if (sessionChanged) {
      inputSessionRef.current = currentSessionId;
      hydratedSessionRef.current = null;
    }
    const input = inputRef.current;
    if (!input) return;
    if (!currentSessionId || activeMessagesLength > 0) {
      hydratedSessionRef.current = null;
      if (sessionChanged) input.setAttachments([]);
      return;
    }
    if (hydratedSessionRef.current === currentSessionId) return;
    input.setAttachments(
      findWorkspaceFiles({
        activeMessagesLength,
        currentSessionId,
        currentWorkspaceId,
        inputRef,
        workspaces,
      }),
    );
    hydratedSessionRef.current = currentSessionId;
  }, [
    activeMessagesLength,
    currentSessionId,
    currentWorkspaceId,
    inputRef,
    workspaces,
  ]);
}
