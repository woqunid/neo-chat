import { useCallback, useState } from "react";

export function useComposerModals() {
  const [showRemote, setShowRemote] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  return {
    showRemote,
    showKnowledgeBase,
    openRemote: useCallback(() => setShowRemote(true), []),
    closeRemote: useCallback(() => setShowRemote(false), []),
    openKnowledgeBase: useCallback(() => setShowKnowledgeBase(true), []),
    closeKnowledgeBase: useCallback(() => setShowKnowledgeBase(false), []),
  };
}
