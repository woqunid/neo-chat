import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GrokModelField, {
  getSelectableGrokModels,
} from "../components/superadmin/GrokModelField";

describe("GrokModelField", () => {
  it("keeps a text input before models are detected", () => {
    const html = renderToStaticMarkup(
      <GrokModelField value="grok-4" models={[]} onChange={vi.fn()} />,
    );

    expect(html).toContain("<input");
    expect(html).not.toContain("<select");
  });

  it("renders detected models as an explicit select", () => {
    const html = renderToStaticMarkup(
      <GrokModelField
        value="grok-4"
        models={["grok-3", "grok-4"]}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('<select aria-label="模型"');
    expect(html).toContain('<option value="grok-3">grok-3</option>');
    expect(html).toContain(
      '<option value="grok-4" selected="">grok-4</option>',
    );
    expect(html).not.toContain("<datalist");
  });

  it("normalizes detected models and preserves the current selection", () => {
    expect(
      getSelectableGrokModels([" grok-4 ", "grok-4", "grok-3"], "grok-custom"),
    ).toEqual(["grok-custom", "grok-4", "grok-3"]);
    expect(getSelectableGrokModels([], "grok-custom")).toEqual([]);
  });
});
