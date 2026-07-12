import AttachmentMenu from "./AttachmentMenu";
import ComposerActions from "./ComposerActions";
import ModelSelector from "./ModelSelector";
import PluginMenu from "./PluginMenu";
import PolishButton from "./PolishButton";
import SearchButton from "./SearchButton";
import SkillMenu from "./SkillMenu";
import type { MessageInputController } from "./useMessageInputController";

function ToolbarTools({
  controller,
}: {
  readonly controller: MessageInputController;
}) {
  const searchChange = controller.props.onSearchEnabledChange;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
      <AttachmentMenu
        controller={controller.attachments}
        open={controller.menus.isOpen("attach")}
        busy={controller.inputBusy}
        hasKnowledgeAttachments={controller.hasKnowledgeAttachments}
        setOpen={(open) => controller.menus.setOpen("attach", open)}
        openKnowledgeBase={controller.modals.openKnowledgeBase}
        openRemoteFile={controller.modals.openRemote}
      />
      <SkillMenu
        open={controller.menus.isOpen("skill")}
        busy={controller.sessionConfigBusy}
        setOpen={(open) => controller.menus.setOpen("skill", open)}
      />
      <PluginMenu
        open={controller.menus.isOpen("plugin")}
        busy={controller.sessionConfigBusy}
        setOpen={(open) => controller.menus.setOpen("plugin", open)}
      />
      {searchChange && (
        <SearchButton
          enabled={controller.props.isSearchEnabled ?? false}
          busy={controller.sessionConfigBusy}
          onChange={searchChange}
        />
      )}
    </div>
  );
}

function ToolbarActions({
  controller,
}: {
  readonly controller: MessageInputController;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ModelSelector
        models={controller.props.availableModels ?? []}
        selectedModel={controller.props.selectedModel ?? ""}
        open={controller.menus.isOpen("model")}
        busy={controller.inputBusy}
        setOpen={(open) => controller.menus.setOpen("model", open)}
        onSelect={controller.props.onSelectModel}
      />
      <PolishButton
        hasText={Boolean(controller.draft.input.trim())}
        busy={controller.inputBusy}
        polishing={controller.polish.isPolishing}
        polish={controller.polish.polish}
      />
      <ComposerActions
        inputBusy={controller.inputBusy}
        disabled={controller.props.disabled}
        hasDraft={controller.hasDraft}
        selectedModel={controller.props.selectedModel ?? ""}
        isGenerating={controller.props.isGenerating ?? false}
        queuedCount={controller.props.queuedMessageCount ?? 0}
        voice={controller.voice}
        send={controller.submission.send}
        stop={controller.props.onStop}
      />
    </div>
  );
}

export default function ComposerToolbar({
  controller,
}: {
  readonly controller: MessageInputController;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1 p-1 md:flex-nowrap md:gap-2 md:p-2">
      <ToolbarTools controller={controller} />
      <ToolbarActions controller={controller} />
    </div>
  );
}
