import type { Plugin, PluginConfig } from "@/types";

export type MarketSource = "plugins" | "mcp";

export interface PluginMarketController {
  activeSource: MarketSource;
  setActiveSource(source: MarketSource): void;
  searchTerm: string;
  setSearchTerm(value: string): void;
  selectedCategories: string[];
  setSelectedCategories(value: string[]): void;
  toggleCategory(category: string): void;
  categories: string[];
  installedPlugins: Plugin[];
  availablePlugins: Plugin[];
  activePluginIds: string[];
  pluginConfigs: Record<string, PluginConfig>;
  installingIds: string[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  isNextPageDisabled: boolean;
  selectedPlugin: Plugin | null;
  setSelectedPlugin(plugin: Plugin | null): void;
  customModal: "plugin" | "mcp" | null;
  setCustomModal(value: "plugin" | "mcp" | null): void;
  refresh(): Promise<void>;
  install(plugin: Plugin): Promise<void>;
  addCustomPlugin(plugin: Plugin): void;
  addCustomMcp(plugin: Plugin, bearerToken?: string): Promise<void>;
  togglePlugin(pluginId: string): void;
  previousPage(): void;
  nextPage(): void;
}
