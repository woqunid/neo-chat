import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/store/core/settingsStore";
import type { Plugin } from "@/types";
import type { PluginMarketController } from "./types";
import { getCategories } from "./utils";
import { useMarketFilters } from "./useMarketFilters";
import { useMarketListing } from "./useMarketListing";
import { usePluginInstaller } from "./usePluginInstaller";
import { useVisiblePlugins } from "./useVisiblePlugins";

type MarketFilters = ReturnType<typeof useMarketFilters>;

function advanceMarketPage(filters: MarketFilters, totalPages: number): void {
  if (filters.source !== "mcp") {
    filters.setPage((current) => Math.min(totalPages, current + 1));
    return;
  }
  if (!filters.mcpNextCursor) return;
  filters.setMcpPageCursors((current) => [
    ...current.slice(0, filters.page),
    filters.mcpNextCursor,
  ]);
  filters.setPage((current) => current + 1);
}

export function usePluginMarket(): PluginMarketController {
  const t = useTranslations("Plugin");
  const tConfig = useTranslations("Config");
  const store = useSettingsStore();
  const filters = useMarketFilters();
  const listing = useMarketListing({
    _hasHydrated: store._hasHydrated,
    source: filters.source,
    search: filters.search,
    page: filters.page,
    mcpPageCursors: filters.mcpPageCursors,
    onMcpNextCursor: filters.setMcpNextCursor,
    loadFailed: t("loadFailed"),
    refreshFailed: t("refreshFailed"),
  });
  const visible = useVisiblePlugins({
    source: filters.source,
    search: filters.search,
    categories: filters.categories,
    page: filters.page,
    mcpNextCursor: filters.mcpNextCursor,
    available: listing.available,
    installed: store.installedPlugins,
    tConfig,
  });
  const installer = usePluginInstaller(store, t("installFailed"));
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [customModal, setCustomModal] = useState<"plugin" | "mcp" | null>(null);
  return {
    ...filters.controller,
    ...listing.controller,
    ...visible,
    ...installer,
    error: installer.installError || listing.controller.error,
    categories: getCategories(listing.available),
    activePluginIds: store.activePlugins,
    pluginConfigs: store.pluginConfigs,
    selectedPlugin,
    setSelectedPlugin,
    customModal,
    setCustomModal,
    nextPage: () => advanceMarketPage(filters, visible.totalPages),
  };
}
