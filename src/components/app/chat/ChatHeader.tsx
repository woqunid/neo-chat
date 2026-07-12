"use client";

import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import Tooltip from "@/components/ui/Tooltip";

import type { ChatAppViewModel } from "./types";

interface ChatHeaderProps {
  model: ChatAppViewModel;
}

function SidebarToggle({ model }: ChatHeaderProps) {
  const t = useTranslations("ChatApp");
  const { navigation } = model;
  const isOpen = navigation.isSidebarOpen;
  return (
    <Tooltip
      content={isOpen ? t("closeSidebar") : t("openSidebar")}
      position="right"
      className="md:hidden"
    >
      <button
        type="button"
        aria-label={isOpen ? t("closeSidebarAria") : t("openSidebarAria")}
        onClick={() => navigation.setIsSidebarOpen((open) => !open)}
        className="p-2 -ml-2 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {isOpen ? (
          <PanelLeftClose size={16} aria-hidden="true" />
        ) : (
          <PanelLeftOpen size={16} aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}

function NewChatButton({ model }: ChatHeaderProps) {
  const t = useTranslations("ChatApp");
  if (model.navigation.isSidebarOpen) return <div className="min-w-10" />;
  return (
    <Tooltip content={t("newChat")} position="left">
      <button
        type="button"
        aria-label={t("newChatAria")}
        onClick={model.sidebar.onNewChat}
        className="p-2 -mr-2 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <MessageSquarePlus size={16} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

export default function ChatHeader({ model }: ChatHeaderProps) {
  const t = useTranslations("ChatApp");
  return (
    <header className="relative z-10 flex h-14 items-center justify-between px-4 md:px-6">
      <div className="flex min-w-10 items-center">
        <SidebarToggle model={model} />
      </div>
      {model.conversation.shouldShowTitle && (
        <div className="absolute left-1/2 top-1/2 max-w-[50%] -translate-x-1/2 -translate-y-1/2 truncate text-center font-bold text-foreground">
          {model.conversation.currentSession?.title || t("newChat")}
        </div>
      )}
      <div className="flex items-center justify-end min-w-10">
        <NewChatButton model={model} />
      </div>
    </header>
  );
}
