import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings UI primitives", () => {
  it("uses shadcn-style semantic tokens for select and switch controls", () => {
    const settingsUi = readFileSync(
      resolve(process.cwd(), "src/components/settings/SettingsUI.tsx"),
      "utf8",
    );

    expect(settingsUi).toContain("bg-background");
    expect(settingsUi).toContain("border-input");
    expect(settingsUi).toContain("focus-visible:ring-ring");
    expect(settingsUi).toContain("data-[state=checked]");
  });

  it("exposes memory management as a settings tab", () => {
    const settingsPage = readFileSync(
      resolve(process.cwd(), "src/components/settings/SettingsPage.tsx"),
      "utf8",
    );

    expect(settingsPage).toContain('id: "memory"');
    expect(settingsPage).toContain("tabMemory");
  });

  it("exposes a system switch for role-based message positions", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );

    expect(systemSettings).toContain("enableRoleBasedMessagePosition");
    expect(systemSettings).toContain('t("messagePosition")');
    expect(systemSettings).toContain('t("messagePositionDesc")');
    expect(systemSettings).toContain("SimpleSwitch");
  });
});
