import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { readChatAppSources } from "./helpers/chatAppSources";

const CHAT_DIR = resolve(process.cwd(), "src/components/chat");
const COMPOSER_DIR = resolve(CHAT_DIR, "message-input");

function readComposerSource(name: string): string {
  return readFileSync(resolve(COMPOSER_DIR, name), "utf8");
}

function getComposerFiles(): string[] {
  return readdirSync(COMPOSER_DIR)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => resolve(COMPOSER_DIR, name));
}

interface CompositionSources {
  readonly facade: string;
  readonly source: string;
  readonly view: string;
  readonly toolbar: string;
  readonly attachmentMenu: string;
  readonly pluginData: string;
  readonly attachmentTray: string;
}

function expectFacadeAndLayout(sources: CompositionSources): void {
  expect(sources.facade).toContain("MessageInputView");
  expect(sources.facade).toContain("useMessageInputController");
  expect(sources.facade).toContain(
    "const controller = useMessageInputController(props, ref)",
  );
  expect(sources.facade).toContain(
    "<MessageInputView controller={controller} />",
  );
  expect(sources.facade).not.toContain("controller={useMessageInputController");
  expect(sources.view).toContain("MessageInputAttachmentTray");
  expect(sources.view).toContain("glass-shell relative flex w-full flex-col");
  expect(sources.view).toContain('hero ? "min-h-[5em]" : "min-h-[2em]"');
  expect(sources.view).toContain('hero ? "mb-0 md:mb-18" : ""');
  expect(sources.attachmentMenu).toContain(
    "aria-pressed={props.hasKnowledgeAttachments}",
  );
  expect(sources.attachmentMenu).toContain(
    "controller.refs.textFallback.current?.click()",
  );
  expect(sources.attachmentMenu).toContain('<span>{t("knowledgeBase")}</span>');
  expect(sources.pluginData).toContain('plugin.source === "mcp"');
}

function expectCompilerSafeHooks(): void {
  const inputs = readComposerSource("useAttachmentInputs.ts");
  expect(inputs).toContain("const fileRef = useRef<HTMLInputElement>(null)");
  expect(inputs).toContain("const fileId = useId()");
  expect(inputs).not.toContain("file: useRef<");
  expect(inputs).not.toContain("file: useId()");
}

function expectForkFeatures(sources: CompositionSources): void {
  expect(sources.source).toContain('t("mcpServers")');
  expect(sources.source).toContain("normalizeSkillIdRefs");
  expect(sources.source).toContain("createChatDocumentAttachment");
  expect(sources.source).toContain("extractChatAttachmentFilesFromDrop");
  expect(sources.source).toContain("extractChatAttachmentFilesFromClipboard");
  expect(sources.source).toContain('t("dropFilesTitle")');
  expect(sources.source).toContain("PencilSparkles");
  expect(sources.source).not.toContain("reasoningOptions");
  expect(sources.source).not.toContain("showReasoningSelect");
  expect(sources.source).not.toContain("<Lightbulb");
  expect(sources.source).not.toContain("enableHtmlVisualPrompt");
  expect(sources.source).not.toContain("showMobileTools");
  expect(sources.attachmentTray).toContain("AttachmentPreviewCard");
  expect(sources.attachmentTray).toContain("resolveObjectUrlWithLifecycle");
  expect(sources.attachmentTray).not.toContain("h-16 w-16");
}

function expectToolbarOrder(toolbar: string): void {
  expect(toolbar.indexOf("<SearchButton")).toBeLessThan(
    toolbar.indexOf("<ModelSelector"),
  );
  expect(toolbar.indexOf("<ModelSelector")).toBeLessThan(
    toolbar.indexOf("<PolishButton"),
  );
  expect(toolbar.indexOf("<PolishButton")).toBeLessThan(
    toolbar.indexOf("<ComposerActions"),
  );
}

it("keeps fork behavior across the facade and focused modules", () => {
  const facade = readFileSync(resolve(CHAT_DIR, "MessageInput.tsx"), "utf8");
  const source = getComposerFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const view = readComposerSource("MessageInputView.tsx");
  const toolbar = readComposerSource("ComposerToolbar.tsx");
  const attachmentMenu = readComposerSource("AttachmentMenu.tsx");
  const pluginData = readComposerSource("usePluginMenuData.ts");
  const attachmentTray = readFileSync(
    resolve(CHAT_DIR, "MessageInputAttachmentTray.tsx"),
    "utf8",
  );

  const sources = {
    facade,
    source,
    view,
    toolbar,
    attachmentMenu,
    pluginData,
    attachmentTray,
  };
  expectFacadeAndLayout(sources);
  expectCompilerSafeHooks();
  expectForkFeatures(sources);
  expectToolbarOrder(toolbar);
});

it("keeps the composer editable while generation is queued", () => {
  const chatApp = readChatAppSources();
  const types = readComposerSource("types.ts");
  const controller = readComposerSource("useMessageInputController.ts");
  const actions = readComposerSource("ComposerActions.tsx");
  const model = readComposerSource("ModelSelector.tsx");
  const polish = readComposerSource("PolishButton.tsx");

  expect(chatApp).toContain("queuedMessagesRef");
  expect(chatApp).toContain("enqueueChatMessage");
  expect(chatApp).toContain(
    "disabled={composer.availableModels.length === 0 || composer.disabled}",
  );
  expect(chatApp).toContain("isGenerating={composer.isGenerating}");
  expect(chatApp).toContain("queuedMessageCount={composer.queuedMessageCount}");
  expect(chatApp).not.toContain(
    "disabled={isGenerating || availableModels.length === 0}",
  );
  expect(types).toContain("isGenerating?: boolean");
  expect(types).toContain("queuedMessageCount?: number");
  expect(controller).toContain(
    "props.disabled || voice.isTranscribing || attachments.isParsing",
  );
  expect(controller).toContain(
    "sessionConfigBusy: resources.inputBusy || Boolean(props.isGenerating)",
  );
  expect(model).toContain("disabled={props.busy}");
  expect(polish).toContain(
    "disabled={props.busy || props.polishing || !props.hasText}",
  );
  expect(actions).toContain('t("queueMessage")');
  expect(actions).toContain('t("queuedMessages", { count })');
});
