import { useMemo } from "react";
import {
  localizePluginMeta,
  type ConfigPluginKey,
} from "@/lib/plugin/localizedMeta";
import type { Plugin } from "@/types";
import type { MarketSource } from "./types";
import {
  ITEMS_PER_PAGE,
  matchesCategories,
  matchesPluginSearch,
  sortPluginsByAdded,
} from "./utils";

interface Options {
  source: MarketSource;
  search: string;
  categories: string[];
  page: number;
  mcpNextCursor: string;
  available: Plugin[];
  installed: Plugin[];
  tConfig: (key: ConfigPluginKey) => string;
}

function getTotalPages(options: Options, pluginCount: number): number {
  if (options.source === "mcp") {
    return Math.max(1, options.page + (options.mcpNextCursor ? 1 : 0));
  }
  return Math.max(1, Math.ceil(pluginCount / ITEMS_PER_PAGE));
}

function getAvailablePlugins(options: Options, plugins: Plugin[]): Plugin[] {
  if (options.source === "mcp") return plugins;
  const start = (options.page - 1) * ITEMS_PER_PAGE;
  return plugins.slice(start, options.page * ITEMS_PER_PAGE);
}

export function useVisiblePlugins(options: Options) {
  const installedPlugins = useMemo(
    () =>
      options.installed
        .map((plugin) => localizePluginMeta(plugin, options.tConfig))
        .filter(
          (plugin) =>
            (options.source === "mcp"
              ? plugin.source === "mcp"
              : plugin.source !== "mcp") &&
            matchesPluginSearch(plugin, options.search),
        ),
    [options],
  );
  const installedIds = useMemo(
    () => new Set(options.installed.map((plugin) => plugin.id)),
    [options.installed],
  );
  const filtered = useMemo(() => {
    const result = options.available.filter(
      (plugin) =>
        !installedIds.has(plugin.id) &&
        (options.source === "mcp" ||
          matchesPluginSearch(plugin, options.search)) &&
        matchesCategories(plugin, options.categories),
    );
    return options.source === "mcp" ? result : sortPluginsByAdded(result);
  }, [installedIds, options]);
  const totalPages = getTotalPages(options, filtered.length);
  const availablePlugins = getAvailablePlugins(options, filtered);
  return {
    installedPlugins,
    availablePlugins,
    totalPages,
    showPagination:
      options.source === "mcp"
        ? options.page > 1 || !!options.mcpNextCursor
        : totalPages > 1,
    isNextPageDisabled:
      options.source === "mcp"
        ? !options.mcpNextCursor
        : options.page === totalPages,
  };
}
