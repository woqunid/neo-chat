import { describe, expect, it } from "vitest";
import {
  readPluginMarketComposition,
  readPluginMarketModule,
} from "./helpers/pluginMarketComposition";

describe("PluginMarket MCP composition", () => {
  it("places Plugins and MCP as full-page source tabs above search", () => {
    const pluginMarket = readPluginMarketComposition();

    expect(pluginMarket).toContain('MarketSource = "plugins" | "mcp"');
    expect(pluginMarket).toContain("fetchMcpServerPage");
    expect(pluginMarket).toContain("sourceTabs");
    expect(pluginMarket).toContain("mcpPageCursors");
    expect(pluginMarket).toContain("mcpNextCursor");
    expect(pluginMarket).toContain('t("pageCurrent", { currentPage })');
    expect(pluginMarket).toContain('t("pageOf", { currentPage, totalPages })');
    expect(pluginMarket).toContain("showCustomMcpServerModal");
    expect(pluginMarket).toContain("CustomMcpServerModal");
    expect(pluginMarket).toContain("installCustomMcpServer");
    expect(pluginMarket).toContain('activeSource === "mcp"');
    expect(pluginMarket).toContain('plugin.source === "mcp"');
    expect(pluginMarket).toContain('plugin.source !== "mcp"');
    expect(pluginMarket).toContain('t("mcp")');
    expect(pluginMarket).toContain('t("plugins")');

    const toolbar = readPluginMarketModule("MarketToolbar.tsx");
    const view = readPluginMarketModule("PluginMarketView.tsx");
    const sourceTabsIndex = toolbar.indexOf('aria-label={t("sourceTabsAria")}');
    const searchIndex = toolbar.indexOf('name="plugin-search"');
    const toolbarIndex = view.indexOf("<MarketToolbar");
    const installedSectionIndex = view.indexOf("{/* Installed Section");
    const availableSectionIndex = view.indexOf("{/* Available Section");
    expect(sourceTabsIndex).toBeGreaterThan(-1);
    expect(searchIndex).toBeGreaterThan(-1);
    expect(installedSectionIndex).toBeGreaterThan(-1);
    expect(availableSectionIndex).toBeGreaterThan(-1);
    expect(sourceTabsIndex).toBeLessThan(searchIndex);
    expect(toolbarIndex).toBeGreaterThan(-1);
    expect(toolbarIndex).toBeLessThan(installedSectionIndex);
    expect(toolbarIndex).toBeLessThan(availableSectionIndex);
  });
});
