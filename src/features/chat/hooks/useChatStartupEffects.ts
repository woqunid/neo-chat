"use client";

import { useEffect, useRef } from "react";

import {
  getSessionPluginPresetSyncKey,
  shouldApplySessionPluginPreset,
  shouldRunSettingsStartupEffects,
} from "@/lib/app/startupEffects";
import { normalizeActivePluginIds } from "@/lib/plugin/config";

import type { ChatShellState } from "../runtimeTypes";

const SESSION_BOOTSTRAP_DELAY_MS = 100;

function usePluginPresetSync(shell: ChatShellState): void {
  const syncedPresetRef = useRef<string | null>(null);
  const session = shell.chat.getCurrentSession();
  const preset = session?.config?.activePlugins;
  const {
    _hasHydrated: settingsHydrated,
    activePlugins,
    installedPlugins,
    pluginConfigs,
    setActivePlugins,
  } = shell.settings;
  const { _hasHydrated: chatHydrated, currentSessionId } = shell.chat;

  useEffect(() => {
    const plugins = normalizeActivePluginIds({
      pluginIds: preset,
      installedPlugins,
      pluginConfigs,
      unauthenticatedAllowedPluginIds: ["unsplash"],
    });
    const key = getSessionPluginPresetSyncKey(currentSessionId, plugins);
    const shouldSync = shouldApplySessionPluginPreset(
      settingsHydrated,
      chatHydrated,
      preset,
      syncedPresetRef.current,
      key,
    );
    if (!shouldSync) return;
    const active = [...activePlugins].sort();
    const desired = [...plugins].sort();
    if (JSON.stringify(active) !== JSON.stringify(desired)) {
      setActivePlugins(plugins);
    }
    syncedPresetRef.current = key;
  }, [
    activePlugins,
    chatHydrated,
    currentSessionId,
    installedPlugins,
    pluginConfigs,
    preset,
    setActivePlugins,
    settingsHydrated,
  ]);
}

function useSettingsStartup(shell: ChatShellState): void {
  const { _hasHydrated, ensureBuiltInPlugins, fetchModelMetadata } =
    shell.settings;
  useEffect(() => {
    if (!shouldRunSettingsStartupEffects(_hasHydrated)) return;
    fetchModelMetadata();
    ensureBuiltInPlugins();
  }, [_hasHydrated, ensureBuiltInPlugins, fetchModelMetadata]);
}

function useSessionBootstrap(shell: ChatShellState): void {
  const {
    _hasHydrated,
    createSession,
    currentSessionId,
    selectSession,
    sessions,
  } = shell.chat;
  useEffect(() => {
    if (!_hasHydrated) return;
    const timer = setTimeout(() => {
      if (sessions.length === 0) {
        createSession();
      } else if (!currentSessionId) {
        selectSession(sessions[0].id);
      }
    }, SESSION_BOOTSTRAP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [_hasHydrated, createSession, currentSessionId, selectSession, sessions]);
}

export function useChatStartupEffects(shell: ChatShellState): void {
  usePluginPresetSync(shell);
  useSettingsStartup(shell);
  useSessionBootstrap(shell);
}
