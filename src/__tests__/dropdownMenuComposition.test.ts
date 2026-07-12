import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readPluginMarketComposition,
  readProjectSource,
} from "./helpers/pluginMarketComposition";

const read = readProjectSource;

const readActionSource = (path: string) => {
  if (path !== "src/components/plugin/PluginMarket.tsx") return read(path);
  return readPluginMarketComposition();
};

describe("dropdown menu composition", () => {
  it("uses a local Radix dropdown-menu wrapper", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const wrapperPath = "src/components/ui/dropdown-menu.tsx";

    expect(packageJson.dependencies).toHaveProperty(
      "@radix-ui/react-dropdown-menu",
    );
    expect(existsSync(resolve(process.cwd(), wrapperPath))).toBe(true);

    const wrapper = read(wrapperPath);
    expect(wrapper).toContain('from "@radix-ui/react-dropdown-menu"');
    expect(wrapper).toContain("DropdownMenuContent");
    expect(wrapper).toContain("DropdownMenuItem");
    expect(wrapper).toContain("DropdownMenuCheckboxItem");
    expect(wrapper).toContain("DropdownMenuRadioItem");
    expect(wrapper).toContain("DropdownMenuSeparator");
    expect(wrapper).toContain("DropdownMenuLabel");
    expect(wrapper).toContain("data-[side=bottom]");
    expect(wrapper).toContain("collisionPadding");
    expect(wrapper).toContain('variant?: "default" | "destructive"');
  });

  it("migrates high-priority action menus away from AnchoredPortal menu markup", () => {
    const actionMenuFiles = [
      "src/components/chat/MessageInput.tsx",
      "src/components/chat/MessageItem.tsx",
      "src/components/content/Artifact.tsx",
      "src/components/modals/RemoteFileModal.tsx",
      "src/components/assistant/AssistantHub.tsx",
      "src/components/plugin/PluginMarket.tsx",
      "src/components/layout/Sidebar.tsx",
    ];

    for (const file of actionMenuFiles) {
      const source = readActionSource(file);
      expect(source, file).toContain("components/ui/dropdown-menu");
      expect(source, file).not.toContain('role="menu"');
      expect(source, file).not.toContain('role="menuitem"');
      expect(source, file).not.toContain('role="menuitemcheckbox"');
      expect(source, file).not.toContain('role="menuitemradio"');
    }
  });

  it("keeps the about settings tab removed", () => {
    const panelState = read("src/lib/chat/panelUrlState.ts");
    const settingsPage = read("src/components/settings/SettingsPage.tsx");

    expect(panelState).not.toContain('"about"');
    expect(settingsPage).not.toContain("AboutSettings");
    expect(settingsPage).not.toContain('id: "about"');
    expect(settingsPage).not.toContain("tabAbout");
    expect(
      existsSync(
        resolve(process.cwd(), "src/components/settings/AboutSettings.tsx"),
      ),
    ).toBe(false);
  });
});
