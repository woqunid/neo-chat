import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "../lib/themeInitScript";

function runThemeInit(fontSize: string | null) {
  const root = { classList: { toggle: () => {} }, dataset: {} as DOMStringMap };
  const windowValue = {
    localStorage: {
      getItem: (key: string) =>
        key === "neo-chat-font-size" ? fontSize : null,
    },
    matchMedia: () => ({ matches: false }),
  };
  const documentValue = {
    documentElement: root,
    querySelector: () => null,
  };
  Function("window", "document", THEME_INIT_SCRIPT)(windowValue, documentValue);
  return root.dataset.fontSize;
}

describe("theme initialization script", () => {
  it.each(["small", "medium", "large"])(
    "applies saved %s before hydration",
    (fontSize) => {
      expect(runThemeInit(fontSize)).toBe(fontSize);
    },
  );

  it.each([null, "invalid"])("defaults %s to medium", (fontSize) => {
    expect(runThemeInit(fontSize)).toBe("medium");
  });
});
