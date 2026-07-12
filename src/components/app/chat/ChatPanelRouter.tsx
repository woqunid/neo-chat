"use client";

import dynamic from "next/dynamic";

import ChatConversation from "./ChatConversation";
import type { ChatAppViewModel, ChatRenderProps } from "./types";

const PluginMarket = dynamic(() => import("@/components/plugin/PluginMarket"), {
  ssr: false,
});
const SkillMarket = dynamic(() => import("@/components/skill/SkillMarket"), {
  ssr: false,
});
const AssistantHub = dynamic(
  () => import("@/components/assistant/AssistantHub"),
  { ssr: false },
);
const KnowledgeBase = dynamic(
  () => import("@/components/knowledge/KnowledgeBase"),
  { ssr: false },
);
const SettingsPage = dynamic(
  () => import("@/components/settings/SettingsPage"),
  { ssr: false },
);

interface ChatPanelRouterProps extends ChatRenderProps {
  model: ChatAppViewModel;
}

export default function ChatPanelRouter({
  model,
  inputRef,
  messagesScrollRef,
  handleMessagesScroll,
  handleMessagesScrollEnd,
  handleMessagesWheel,
  handleMessagesTouchStart,
  handleMessagesTouchMove,
  handleMessagesTouchEnd,
}: ChatPanelRouterProps) {
  const navigation = model.navigation;
  const close = () => navigation.navigateToPanel({ panel: "chat" });

  if (navigation.viewMode === "plugins")
    return <PluginMarket onClose={close} />;
  if (navigation.viewMode === "skills") return <SkillMarket onClose={close} />;
  if (navigation.viewMode === "assistants") {
    return (
      <AssistantHub onClose={close} onSelect={model.panels.onAssistantSelect} />
    );
  }
  if (navigation.viewMode === "knowledge") {
    return <KnowledgeBase onClose={close} />;
  }
  if (navigation.viewMode === "settings") {
    return (
      <SettingsPage
        activeTab={navigation.settingsTab}
        onTabChange={navigation.handleSettingsTabChange}
        onClose={close}
      />
    );
  }
  return (
    <ChatConversation
      model={model}
      inputRef={inputRef}
      messagesScrollRef={messagesScrollRef}
      handleMessagesScroll={handleMessagesScroll}
      handleMessagesScrollEnd={handleMessagesScrollEnd}
      handleMessagesWheel={handleMessagesWheel}
      handleMessagesTouchStart={handleMessagesTouchStart}
      handleMessagesTouchMove={handleMessagesTouchMove}
      handleMessagesTouchEnd={handleMessagesTouchEnd}
    />
  );
}
