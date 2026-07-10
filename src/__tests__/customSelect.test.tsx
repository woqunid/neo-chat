import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomSelect } from "../components/settings/CustomSelect";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "noOptions" ? "No options" : key,
}));

describe("CustomSelect", () => {
  it("renders an explicit disabled state when options are empty", () => {
    const onChange = vi.fn();
    const render = () =>
      renderToStaticMarkup(
        <CustomSelect
          value=""
          onChange={onChange}
          options={[]}
          ariaLabel="Default model"
        />,
      );

    expect(render).not.toThrow();
    expect(render()).toContain("No options");
    expect(render()).toContain('disabled=""');
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resolves the selected label from grouped options", () => {
    const html = renderToStaticMarkup(
      <CustomSelect
        value="provider:model"
        onChange={vi.fn()}
        options={[
          {
            label: "Provider",
            options: [{ value: "provider:model", label: "Model" }],
          },
        ]}
      />,
    );

    expect(html).toContain("Model");
    expect(html).not.toContain('disabled=""');
  });
});
