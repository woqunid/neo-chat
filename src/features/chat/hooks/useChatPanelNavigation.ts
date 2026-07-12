"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ChatPanel,
  SettingsTabId,
  parseChatPanelUrlState,
  setChatPanelUrlState,
} from "@/lib/chat/panelUrlState";

const DESKTOP_SIDEBAR_BREAKPOINT = 1024;
const INITIAL_SIDEBAR_OPEN_BREAKPOINT = 768;

type HistoryMode = "push" | "replace";

interface NavigateOptions {
  panel: ChatPanel;
  settingsTab?: SettingsTabId | null;
  historyMode?: HistoryMode;
}

function updateBrowserSearch(params: URLSearchParams, mode: HistoryMode) {
  if (typeof window === "undefined") return;
  const search = params.toString();
  const suffix = `${search ? `?${search}` : ""}${window.location.hash}`;
  const nextUrl = `${window.location.pathname}${suffix}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;
  const method = mode === "replace" ? "replaceState" : "pushState";
  window.history[method](null, "", nextUrl);
}

function usePanelState(isNonDesktopViewport: boolean) {
  const [viewMode, setViewMode] = useState<ChatPanel>("chat");
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("providers");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const updatePanelUrl = useCallback((options: NavigateOptions) => {
    if (typeof window === "undefined") return;
    const params = setChatPanelUrlState(
      new URLSearchParams(window.location.search),
      { panel: options.panel, settingsTab: options.settingsTab },
    );
    updateBrowserSearch(params, options.historyMode ?? "push");
  }, []);

  const navigateToPanel = useCallback(
    (options: NavigateOptions) => {
      const nextTab =
        options.panel === "settings"
          ? (options.settingsTab ?? settingsTab)
          : null;
      setViewMode(options.panel);
      if (nextTab) setSettingsTab(nextTab);
      updatePanelUrl({ ...options, settingsTab: nextTab });
      if (isNonDesktopViewport) setIsSidebarOpen(false);
    },
    [isNonDesktopViewport, settingsTab, updatePanelUrl],
  );

  return {
    viewMode,
    setViewMode,
    settingsTab,
    setSettingsTab,
    isSidebarOpen,
    setIsSidebarOpen,
    navigateToPanel,
    updatePanelUrl,
  };
}

function useViewportState() {
  const [isNonDesktopViewport, setIsNonDesktopViewport] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      setIsNonDesktopViewport(window.innerWidth < DESKTOP_SIDEBAR_BREAKPOINT);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  return isNonDesktopViewport;
}

function usePanelUrlSync(state: ReturnType<typeof usePanelState>): void {
  const { setSettingsTab, setViewMode } = state;
  useEffect(() => {
    const syncPanelFromUrl = () => {
      const parsed = parseChatPanelUrlState(
        new URLSearchParams(window.location.search),
      );
      setViewMode(parsed.panel);
      setSettingsTab(parsed.settingsTab ?? "providers");
      if (parsed.needsReplace) {
        updateBrowserSearch(parsed.normalizedSearchParams, "replace");
      }
    };
    syncPanelFromUrl();
    window.addEventListener("popstate", syncPanelFromUrl);
    return () => window.removeEventListener("popstate", syncPanelFromUrl);
  }, [setSettingsTab, setViewMode]);
}

function useDrawerIsolation(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return useMemo<React.HTMLAttributes<HTMLElement> & { inert?: boolean }>(
    () => (isOpen ? { inert: true, "aria-hidden": true } : {}),
    [isOpen],
  );
}

export function useChatPanelNavigation() {
  const isNonDesktopViewport = useViewportState();
  const state = usePanelState(isNonDesktopViewport);
  usePanelUrlSync(state);
  const isSidebarDrawerOpen = state.isSidebarOpen && isNonDesktopViewport;
  const mainInertProps = useDrawerIsolation(isSidebarDrawerOpen);
  const setIsSidebarOpen = state.setIsSidebarOpen;

  useEffect(() => {
    if (window.innerWidth > INITIAL_SIDEBAR_OPEN_BREAKPOINT) {
      setIsSidebarOpen(true);
    }
  }, [setIsSidebarOpen]);

  const handleSettingsTabChange = useCallback(
    (tab: SettingsTabId) => {
      state.setSettingsTab(tab);
      if (state.viewMode !== "settings") return;
      state.updatePanelUrl({ panel: "settings", settingsTab: tab });
    },
    [state],
  );

  return {
    ...state,
    isNonDesktopViewport,
    isSidebarDrawerOpen,
    mainInertProps,
    handleSettingsTabChange,
  };
}
