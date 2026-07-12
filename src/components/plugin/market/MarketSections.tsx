import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Filter, Loader2, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PluginMarketController } from "./types";
import { formatCategoryName } from "./utils";
import { AvailablePluginCard, InstalledPluginCard } from "./PluginCards";

export function InstalledSection({
  market,
}: {
  market: PluginMarketController;
}) {
  const t = useTranslations("Plugin");
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase text-gray-500">
          {market.activeSource === "mcp"
            ? t("installedMcpServers")
            : t("installedPlugins")}
        </h2>
        <button
          type="button"
          onClick={() =>
            market.setCustomModal(
              market.activeSource === "mcp" ? "mcp" : "plugin",
            )
          }
          className="flex items-center gap-1 text-xs text-blue-600"
        >
          <Plus size={14} />
          {market.activeSource === "mcp" ? t("customMcp") : t("custom")}
        </button>
      </div>
      {market.installedPlugins.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {market.installedPlugins.map((plugin) => (
            <InstalledPluginCard
              key={plugin.id}
              plugin={plugin}
              active={market.activePluginIds.includes(plugin.id)}
              config={market.pluginConfigs[plugin.id]}
              onToggle={() => market.togglePlugin(plugin.id)}
              onDetails={() => market.setSelectedPlugin(plugin)}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

export function AvailableSection({
  market,
}: {
  market: PluginMarketController;
}) {
  const t = useTranslations("Plugin");
  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase text-gray-500">
          {market.searchTerm ? t("searchResults") : t("explore")}
        </h2>
        <CategoryFilter market={market} />
      </div>
      {market.isLoading ? (
        <div role="status" className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          <div className="grid flex-1 content-start grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {market.availablePlugins.map((plugin) => (
              <AvailablePluginCard
                key={plugin.id}
                plugin={plugin}
                installing={market.installingIds.includes(plugin.id)}
                onInstall={() => void market.install(plugin)}
              />
            ))}
          </div>
          {!market.availablePlugins.length && <EmptyState />}
          {market.showPagination && <Pagination market={market} />}
        </>
      )}
    </section>
  );
}

function CategoryFilter({ market }: { market: PluginMarketController }) {
  const t = useTranslations("Plugin");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-xs">
          <Filter size={12} />
          {market.selectedCategories.length
            ? t("selectedCount", { count: market.selectedCategories.length })
            : t("filter")}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-64 overflow-y-auto"
      >
        {market.selectedCategories.length > 0 && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => market.setSelectedCategories([])}
          >
            {t("clearSelection")}
          </DropdownMenuItem>
        )}
        {market.categories.map((category) => (
          <DropdownMenuCheckboxItem
            key={category}
            checked={market.selectedCategories.includes(category)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => market.toggleCategory(category)}
          >
            {formatCategoryName(category)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Pagination({ market }: { market: PluginMarketController }) {
  const t = useTranslations("Plugin");
  const { activeSource, currentPage, totalPages } = market;
  return (
    <div className="mt-auto flex items-center justify-center gap-4 py-6">
      <button
        type="button"
        aria-label={t("prevPageAria")}
        onClick={market.previousPage}
        disabled={currentPage === 1}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm tabular-nums">
        {activeSource === "mcp"
          ? t("pageCurrent", { currentPage })
          : t("pageOf", { currentPage, totalPages })}
      </span>
      <button
        type="button"
        aria-label={t("nextPageAria")}
        onClick={market.nextPage}
        disabled={market.isNextPageDisabled}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("Plugin");
  return (
    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-400 dark:border-border">
      {t("noPluginsFound")}
    </div>
  );
}
