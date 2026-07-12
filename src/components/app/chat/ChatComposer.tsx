"use client";

import MessageInput from "@/components/chat/MessageInput";
import { Logo } from "@/components/ui/Icons";
import { useTranslations } from "next-intl";

import type { ChatRenderProps, ComposerModel } from "./types";

interface ChatComposerProps {
  composer: ComposerModel;
  inputRef: ChatRenderProps["inputRef"];
}

function WelcomeBrand({ composer }: { composer: ComposerModel }) {
  const t = useTranslations("ChatApp");
  if (composer.welcomeState === "hidden") return null;
  const exiting = composer.welcomeState === "exiting";
  return (
    <div
      className={`mb-3 md:mb-5 flex items-center gap-3 text-center motion-safe:transition-[opacity,transform] motion-safe:duration-300 ${
        exiting
          ? "pointer-events-none opacity-0 scale-95"
          : "opacity-100 scale-100"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center md:h-11 md:w-11">
        <Logo className="h-10 w-10 md:h-11 md:w-11" />
      </div>
      <h1 className="neoChatWordmark bg-clip-text text-[1.75rem] font-bold leading-none tracking-[0.01em] text-transparent bg-[linear-gradient(to_right,#00DEB9,#03B2DE,#1D88E1)]">
        {t("productName")}
      </h1>
    </div>
  );
}

export default function ChatComposer({
  composer,
  inputRef,
}: ChatComposerProps) {
  const isWelcome = composer.welcomeState === "visible";
  return (
    <div
      className={`absolute left-0 right-0 z-20 px-4 pointer-events-none md:px-8 motion-safe:transition-[bottom,padding-bottom] motion-safe:duration-300 ${
        isWelcome
          ? "bottom-[40vh] pb-0 md:bottom-[32vh] md:pb-0"
          : "bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6"
      }`}
    >
      <div
        className={`flex w-full mx-auto pointer-events-auto flex-col items-center motion-safe:transition-[max-width] motion-safe:duration-300 ${
          isWelcome ? "max-w-2xl" : "max-w-3xl"
        }`}
      >
        <WelcomeBrand composer={composer} />
        <MessageInput
          ref={inputRef}
          variant={composer.variant}
          onSend={composer.onSend}
          onStop={composer.isGenerating ? composer.onStop : undefined}
          disabled={composer.availableModels.length === 0 || composer.disabled}
          isGenerating={composer.isGenerating}
          queuedMessageCount={composer.queuedMessageCount}
          availableModels={composer.availableModels}
          selectedModel={composer.selectedModel}
          onSelectModel={composer.onSelectModel}
          isSearchEnabled={composer.isSearchEnabled}
          onSearchEnabledChange={composer.onSearchEnabledChange}
        />
      </div>
    </div>
  );
}
