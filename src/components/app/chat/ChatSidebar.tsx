"use client";

import Sidebar from "@/components/layout/Sidebar";

import type { ChatAppViewModel } from "./types";

interface ChatSidebarProps {
  model: ChatAppViewModel;
}

export default function ChatSidebar({ model }: ChatSidebarProps) {
  const { navigation, sidebar } = model;
  const openPanel = (panel: Parameters<typeof navigation.navigateToPanel>[0]) =>
    navigation.navigateToPanel(panel);

  return (
    <Sidebar
      sessions={sidebar.sessions}
      currentSessionId={sidebar.currentSessionId}
      onSelectSession={sidebar.onSelectSession}
      onNewChat={sidebar.onNewChat}
      onDeleteSession={sidebar.onDeleteSession}
      onRenameSession={sidebar.onRenameSession}
      onTogglePin={sidebar.onTogglePin}
      onDuplicate={sidebar.onDuplicate}
      disableDuplicate={sidebar.isGenerating || sidebar.isSessionLoading}
      onSmartRename={sidebar.onSmartRename}
      isOpen={navigation.isSidebarOpen}
      toggleSidebar={() => navigation.setIsSidebarOpen((open) => !open)}
      isModal={navigation.isSidebarDrawerOpen}
      isNonDesktopViewport={navigation.isNonDesktopViewport}
      onRequestClose={() => navigation.setIsSidebarOpen(false)}
      onOpenPluginMarket={() => openPanel({ panel: "plugins" })}
      isPluginMarketOpen={navigation.viewMode === "plugins"}
      onOpenSkillMarket={() => openPanel({ panel: "skills" })}
      isSkillMarketOpen={navigation.viewMode === "skills"}
      onOpenAssistantHub={() => openPanel({ panel: "assistants" })}
      isAssistantHubOpen={navigation.viewMode === "assistants"}
      onOpenKnowledgeBase={() => openPanel({ panel: "knowledge" })}
      isKnowledgeBaseOpen={navigation.viewMode === "knowledge"}
      onOpenSettings={() =>
        openPanel({ panel: "settings", settingsTab: "system" })
      }
      isSettingsOpen={navigation.viewMode === "settings"}
      onLogoClick={() => openPanel({ panel: "chat" })}
    />
  );
}
