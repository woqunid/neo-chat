import type { Attachment } from "@/types";
import RemoteFileModal from "@/components/modals/RemoteFileModal";
import KnowledgeSelectionModal from "@/components/knowledge/KnowledgeSelectionModal";
import type { ModelCapabilities } from "./types";

interface MessageInputModalsProps {
  readonly showRemote: boolean;
  readonly showKnowledgeBase: boolean;
  readonly capabilities: ModelCapabilities;
  append: (attachments: Attachment[]) => void;
  closeRemote: () => void;
  closeKnowledgeBase: () => void;
}

export default function MessageInputModals(props: MessageInputModalsProps) {
  return (
    <>
      {props.showRemote && (
        <RemoteFileModal
          onClose={props.closeRemote}
          onAttach={(attachment) => props.append([attachment])}
          capabilities={props.capabilities}
        />
      )}
      {props.showKnowledgeBase && (
        <KnowledgeSelectionModal
          onClose={props.closeKnowledgeBase}
          onSelect={props.append}
        />
      )}
    </>
  );
}
