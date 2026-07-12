import { useId } from "react";
import { useTranslations } from "next-intl";
import { Blocks, RefreshCw, Search, X } from "lucide-react";
import type { MarketSource, PluginMarketController } from "./types";

export function MarketHeader({
  market,
  onClose,
}: {
  market: PluginMarketController;
  onClose(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <header className="flex items-center justify-between border-b px-6 py-4 dark:border-border">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Blocks size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold">{t("title")}</h1>
          <p className="text-xs text-gray-500">{t("subtitle")}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label={t("refreshAria")}
          onClick={() => void market.refresh()}
          disabled={market.isRefreshing}
        >
          <RefreshCw
            size={18}
            className={market.isRefreshing ? "animate-spin" : ""}
          />
        </button>
        <button type="button" aria-label={t("closeMarket")} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
    </header>
  );
}

export function MarketToolbar({ market }: { market: PluginMarketController }) {
  const t = useTranslations("Plugin");
  const searchId = useId();
  const sourceTabs: Array<{ value: MarketSource; label: string }> = [
    { value: "plugins", label: t("plugins") },
    { value: "mcp", label: t("mcp") },
  ];
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-5">
      <div
        role="tablist"
        aria-label={t("sourceTabsAria")}
        className="mx-auto mb-4 grid max-w-90 grid-cols-2 rounded-xl border p-1 dark:border-border"
      >
        {sourceTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={market.activeSource === tab.value}
            onClick={() => market.setActiveSource(tab.value)}
            className={`rounded-lg px-5 py-2 text-sm font-semibold ${market.activeSource === tab.value ? "bg-blue-600 text-white" : "text-gray-500"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <label htmlFor={searchId} className="sr-only">
        {t("searchLabel")}
      </label>
      <div className="flex items-center rounded-2xl border bg-white/60 px-4 py-3 dark:border-border dark:bg-muted/60">
        <Search size={20} className="mr-3 text-gray-400" />
        <input
          id={searchId}
          name="plugin-search"
          value={market.searchTerm}
          onChange={(event) => market.setSearchTerm(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
    </div>
  );
}
