import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { PluginMarketController } from "./types";
import { CustomMcpServerModal } from "./CustomMcpServerModal";
import { CustomPluginModal } from "./CustomPluginModal";
import { PluginDetailsModal } from "./PluginDetailsModal";
import { AvailableSection, InstalledSection } from "./MarketSections";
import { MarketHeader, MarketToolbar } from "./MarketToolbar";

interface Props {
  market: PluginMarketController;
  onClose(): void;
}

export function PluginMarketView({ market, onClose }: Props) {
  const t = useTranslations("Plugin");
  const showCustomMcpServerModal = market.customModal === "mcp";
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {market.selectedPlugin && (
        <PluginDetailsModal
          plugin={market.selectedPlugin}
          onClose={() => market.setSelectedPlugin(null)}
        />
      )}
      {market.customModal === "plugin" && (
        <CustomPluginModal
          onClose={() => market.setCustomModal(null)}
          onInstall={market.addCustomPlugin}
        />
      )}
      {showCustomMcpServerModal && (
        <CustomMcpServerModal
          onClose={() => market.setCustomModal(null)}
          onInstall={market.addCustomMcp}
        />
      )}
      <MarketHeader market={market} onClose={onClose} />
      {market.error && (
        <div
          role="alert"
          className="mx-6 mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"
        >
          <AlertTriangle size={14} />
          {market.error}
        </div>
      )}
      <MarketToolbar market={market} />
      <main className="flex-1 overflow-y-auto px-6 pb-10">
        <div className="mx-auto flex min-h-full max-w-7xl flex-col">
          {/* Installed Section */}
          <InstalledSection market={market} />
          {/* Available Section */}
          <AvailableSection market={market} />
        </div>
      </main>
      <span className="sr-only">{t("title")}</span>
    </div>
  );
}
